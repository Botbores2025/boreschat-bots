require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const admin   = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.options('*', cors());
app.use(express.json());

// ─── FIREBASE ADMIN ──────────────────────────────────────────────────────────
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ─── LISTENERS ATIVOS ────────────────────────────────────────────────────────
const listeners = {};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function gerarToken() {
  return 'BORES_' + uuidv4().replace(/-/g,'').substring(0,24).toUpperCase();
}

// ─── ENVIAR MENSAGEM COMO BOT ─────────────────────────────────────────────────
async function enviarMensagemBot(grupoId, texto, botDados, botoes = null) {
  try {
    const msg = {
      texto,
      tipo: botoes ? 'botoes' : 'texto',
      enviado_por: `bot_${botDados.token}`,
      nome: botDados.nome || 'BoresBot',
      foto: botDados.foto || '',
      ehBot: true,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      lido: false,
      entregue: true,
    };
    if (botoes) msg.botoes = botoes;
    await db.collection('grupos').doc(grupoId).collection('mensagens').add(msg);
  } catch (e) {
    console.error('Erro ao enviar mensagem bot:', e.message);
  }
}

// ─── PROCESSAR COMANDO ────────────────────────────────────────────────────────
async function processarComando(texto, grupoId, autorNome, botDados) {
  if (!texto || !texto.startsWith('/')) return;

  const partes  = texto.trim().split(' ');
  const comando = partes[0].toLowerCase();
  const args    = partes.slice(1).join(' ');

  // Recarrega comandos do Firestore sempre (pega atualizações em tempo real)
  let comandosAtuais = {};
  try {
    const botDoc = await db.collection('bots').doc(botDados.token).get();
    comandosAtuais = botDoc.data()?.comandos || {};
  } catch (e) {}

  // Remove a barra para buscar no mapa
  const cmdSemBarra = comando.replace(/^\//, '').toLowerCase();

  // Comando customizado encontrado
  if (comandosAtuais[cmdSemBarra]) {
    let resposta = comandosAtuais[cmdSemBarra].resposta;
    resposta = resposta
      .replace(/{usuario}/g, autorNome || 'Membro')
      .replace(/{grupo}/g, grupoId)
      .replace(/{args}/g, args || '');
    await enviarMensagemBot(grupoId, resposta, botDados);
    return;
  }

  // ─── COMANDOS PADRÃO ─────────────────────────────────────────────────────
  if (comando === '/ajuda' || comando === '/help') {
    const keys = Object.keys(comandosAtuais);
    const lista = keys.length > 0
      ? keys.map(cmd => `/${cmd} — ${comandosAtuais[cmd].descricao || comandosAtuais[cmd].resposta.substring(0, 30)}`).join('\n')
      : 'Nenhum comando customizado ainda.';

    const texto = `🤖 *${botDados.nome}*\n\n⚡ COMANDOS DISPONÍVEIS:\n\n${lista}\n\n📌 PADRÃO:\n/ajuda — Este menu\n/ping — Testar bot\n/menu — Menu com botões`;
    await enviarMensagemBot(grupoId, texto, botDados);
    return;
  }

  if (comando === '/ping') {
    await enviarMensagemBot(grupoId, `🏓 Pong! *${botDados.nome}* está online! ✅`, botDados);
    return;
  }

  if (comando === '/menu') {
    const botoes = [
      { label: '⚡ Comandos', comando: '/ajuda' },
      { label: '🏓 Ping', comando: '/ping' },
      { label: 'ℹ️ Info', comando: '/info' },
    ];
    await enviarMensagemBot(grupoId, `🤖 *${botDados.nome}* — Olá ${autorNome}! Escolha uma opção:`, botDados, botoes);
    return;
  }

  if (comando === '/info') {
    const keys = Object.keys(comandosAtuais);
    await enviarMensagemBot(grupoId, `ℹ️ *${botDados.nome}*\n\nComandos configurados: ${keys.length}\nGrupos ativos: ${(botDados.grupos || []).length}\n\nConfigurado em: botbores2025.github.io/boreschat-bots`, botDados);
    return;
  }
}

// ─── INICIAR LISTENER DO GRUPO ────────────────────────────────────────────────
async function iniciarListenerGrupo(grupoId, botDados) {
  const chave = `${grupoId}_${botDados.token}`;
  if (listeners[chave]) return;

  console.log(`🤖 Bot "${botDados.nome}" ouvindo grupo ${grupoId}`);
  let primeiraExecucao = true;

  const unsub = db
    .collection('grupos').doc(grupoId)
    .collection('mensagens')
    .orderBy('timestamp', 'desc')
    .limit(1)
    .onSnapshot(async (snap) => {
      if (primeiraExecucao) { primeiraExecucao = false; return; }
      if (snap.empty) return;

      const dado = snap.docs[0].data();
      console.log(`📩 Msg: "${dado.texto}" ehBot:${dado.ehBot}`);

      if (dado.ehBot) return;
      if (!dado.texto?.startsWith('/')) return;

      console.log(`📨 Comando: ${dado.texto} em ${grupoId}`);
      await processarComando(dado.texto, grupoId, dado.nome, botDados);
    });

  listeners[chave] = unsub;
}

function pararListener(grupoId, token) {
  const chave = `${grupoId}_${token}`;
  if (listeners[chave]) {
    listeners[chave]();
    delete listeners[chave];
    console.log(`🛑 Listener parado: ${chave}`);
  }
}

async function carregarBotsAtivos() {
  const snap = await db.collection('bots').where('ativo', '==', true).get();
  for (const docSnap of snap.docs) {
    const bot = docSnap.data();
    for (const grupoId of (bot.grupos || [])) {
      await iniciarListenerGrupo(grupoId, bot);
    }
  }
  console.log(`✅ ${snap.size} bot(s) carregado(s)`);
}

// ════════════════════════════════════════════════════════════════════════════
// ROTAS DA API
// ════════════════════════════════════════════════════════════════════════════

// ─── CRIAR BOT ───────────────────────────────────────────────────────────────
app.post('/api/bots/criar', async (req, res) => {
  try {
    const { nome, descricao, donoId } = req.body;
    if (!nome || !donoId) return res.status(400).json({ erro: 'Nome e donoId obrigatórios' });

    const token = gerarToken();
    await db.collection('bots').doc(token).set({
      token, nome, descricao: descricao || '', donoId,
      foto: '', comandos: {}, grupos: [], ativo: true,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ sucesso: true, token, nome });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ─── LISTAR BOTS DO USUÁRIO ──────────────────────────────────────────────────
app.get('/api/bots/:donoId', async (req, res) => {
  try {
    const snap = await db.collection('bots').where('donoId', '==', req.params.donoId).get();
    const bots = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ bots });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ─── BUSCAR BOT PELO TOKEN ───────────────────────────────────────────────────
app.get('/api/bot/:token', async (req, res) => {
  try {
    const docSnap = await db.collection('bots').doc(req.params.token).get();
    if (!docSnap.exists) return res.status(404).json({ erro: 'Bot não encontrado' });
    res.json({ bot: { id: docSnap.id, ...docSnap.data() } });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ─── ATUALIZAR BOT ───────────────────────────────────────────────────────────
app.put('/api/bot/:token', async (req, res) => {
  try {
    const { nome, descricao, foto } = req.body;
    const updates = {};
    if (nome)      updates.nome      = nome;
    if (descricao) updates.descricao = descricao;
    if (foto)      updates.foto      = foto;
    await db.collection('bots').doc(req.params.token).update(updates);
    res.json({ sucesso: true });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ─── ADICIONAR COMANDO ───────────────────────────────────────────────────────
app.post('/api/bot/:token/comando', async (req, res) => {
  try {
    const { comando, resposta, descricao } = req.body;
    if (!comando || !resposta) return res.status(400).json({ erro: 'Comando e resposta obrigatórios' });

    // Remove a barra para salvar no Firestore
    const cmdSemBarra = comando.replace(/^\//, '').toLowerCase();

    const botDoc = await db.collection('bots').doc(req.params.token).get();
    if (!botDoc.exists) return res.status(404).json({ erro: 'Bot não encontrado' });

    const comandosAtuais = botDoc.data()?.comandos || {};
    comandosAtuais[cmdSemBarra] = { resposta, descricao: descricao || '' };

    await db.collection('bots').doc(req.params.token).update({ comandos: comandosAtuais });
    res.json({ sucesso: true, comando: `/${cmdSemBarra}` });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ─── REMOVER COMANDO ─────────────────────────────────────────────────────────
app.delete('/api/bot/:token/comando/:cmd', async (req, res) => {
  try {
    const cmdSemBarra = req.params.cmd.replace(/^\//, '').toLowerCase();
    const botDoc = await db.collection('bots').doc(req.params.token).get();
    if (!botDoc.exists) return res.status(404).json({ erro: 'Bot não encontrado' });

    const cmds = botDoc.data()?.comandos || {};
    delete cmds[cmdSemBarra];
    await db.collection('bots').doc(req.params.token).update({ comandos: cmds });
    res.json({ sucesso: true });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ─── ADICIONAR BOT AO GRUPO ──────────────────────────────────────────────────
app.post('/api/bot/:token/grupo/:grupoId', async (req, res) => {
  try {
    const { token, grupoId } = req.params;
    const botDoc = await db.collection('bots').doc(token).get();
    if (!botDoc.exists) return res.status(404).json({ erro: 'Token inválido' });

    const botDados = botDoc.data();

    await db.collection('bots').doc(token).update({
      grupos: admin.firestore.FieldValue.arrayUnion(grupoId)
    });
    await db.collection('grupos').doc(grupoId).update({
      bots: admin.firestore.FieldValue.arrayUnion(token)
    });

    await iniciarListenerGrupo(grupoId, botDados);
    await enviarMensagemBot(grupoId,
      `🤖 *${botDados.nome}* entrou no grupo!\n\nDigite /ajuda para ver os comandos ou /menu para o menu interativo.`,
      botDados
    );

    res.json({ sucesso: true, nomBot: botDados.nome });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ─── REMOVER BOT DO GRUPO ────────────────────────────────────────────────────
app.delete('/api/bot/:token/grupo/:grupoId', async (req, res) => {
  try {
    const { token, grupoId } = req.params;
    await db.collection('bots').doc(token).update({
      grupos: admin.firestore.FieldValue.arrayRemove(grupoId)
    });
    await db.collection('grupos').doc(grupoId).update({
      bots: admin.firestore.FieldValue.arrayRemove(token)
    });
    pararListener(grupoId, token);
    res.json({ sucesso: true });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ─── DELETAR BOT ─────────────────────────────────────────────────────────────
app.delete('/api/bot/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const botDoc = await db.collection('bots').doc(token).get();
    if (!botDoc.exists) return res.status(404).json({ erro: 'Bot não encontrado' });

    for (const grupoId of (botDoc.data().grupos || [])) {
      pararListener(grupoId, token);
    }
    await db.collection('bots').doc(token).delete();
    res.json({ sucesso: true });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    app: 'BoresChat Bot Server',
    versao: '1.1.0',
    listeners: Object.keys(listeners).length,
    features: ['comandos customizados', 'botoes interativos', '/menu', '/ajuda', '/ping', '/info'],
  });
});

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 BoresChat Bot Server v1.1.0 rodando na porta ${PORT}`);
  await carregarBotsAtivos();
});