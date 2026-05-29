require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const admin      = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

// ─── FIREBASE ADMIN ────────────────────────────────────────────────────────
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// ─── LISTENERS ATIVOS ──────────────────────────────────────────────────────
// Guarda os listeners por grupoId para não duplicar
const listeners = {};

// ─── HELPERS ───────────────────────────────────────────────────────────────
function gerarToken() {
  return 'BORES_' + uuidv4().replace(/-/g, '').substring(0, 24).toUpperCase();
}

// ─── PROCESSAR COMANDO ─────────────────────────────────────────────────────
async function processarComando(texto, grupoId, autorNome, botDados) {
  if (!texto || !texto.startsWith('/')) return;

  const partes   = texto.trim().split(' ');
  const comando  = partes[0].toLowerCase();
  const args     = partes.slice(1).join(' ');

  const comandos = botDados.comandos || {};

  // Comando encontrado nas configurações do bot
  if (comandos[comando]) {
    let resposta = comandos[comando].resposta;
    // Substitui variáveis
    resposta = resposta
      .replace('{usuario}', autorNome || 'Membro')
      .replace('{grupo}', grupoId)
      .replace('{args}', args || '');

    await enviarMensagemBot(grupoId, resposta, botDados);
    return;
  }

  // Comandos padrão do sistema
  if (comando === '/ajuda' || comando === '/help') {
    const lista = Object.keys(comandos).length > 0
      ? Object.entries(comandos).map(([cmd, val]) => `${cmd} — ${val.descricao || 'sem descrição'}`).join('\n')
      : 'Nenhum comando configurado ainda.';
    await enviarMensagemBot(grupoId, `🤖 *${botDados.nome}* — Comandos disponíveis:\n\n${lista}`, botDados);
    return;
  }

  if (comando === '/ping') {
    await enviarMensagemBot(grupoId, `🏓 Pong! Bot online — ${botDados.nome}`, botDados);
    return;
  }
}

// ─── ENVIAR MENSAGEM COMO BOT ──────────────────────────────────────────────
async function enviarMensagemBot(grupoId, texto, botDados) {
  try {
    await db.collection('grupos').doc(grupoId).collection('mensagens').add({
      texto,
      tipo: 'texto',
      enviado_por: `bot_${botDados.token}`,
      nome: botDados.nome || 'BoresBot',
      foto: botDados.foto || '',
      ehBot: true,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      lido: false,
      entregue: true,
    });
  } catch (e) {
    console.error('Erro ao enviar mensagem bot:', e);
  }
}

// ─── INICIAR LISTENER DO GRUPO ────────────────────────────────────────────
async function iniciarListenerGrupo(grupoId, botDados) {
  const chave = `${grupoId}_${botDados.token}`;
  if (listeners[chave]) return; // já está ouvindo

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

      const doc  = snap.docs[0];
      const dado = doc.data();

      // Ignora mensagens do próprio bot
      if (dado.ehBot) return;
      if (!dado.texto?.startsWith('/')) return;

      console.log(`📨 Comando recebido: ${dado.texto} em ${grupoId}`);
      await processarComando(dado.texto, grupoId, dado.nome, botDados);
    });

  listeners[chave] = unsub;
}

// ─── PARAR LISTENER ────────────────────────────────────────────────────────
function pararListener(grupoId, token) {
  const chave = `${grupoId}_${token}`;
  if (listeners[chave]) {
    listeners[chave](); // unsubscribe
    delete listeners[chave];
    console.log(`🛑 Listener parado: ${chave}`);
  }
}

// ─── CARREGAR TODOS OS BOTS ATIVOS NA INICIALIZAÇÃO ───────────────────────
async function carregarBotsAtivos() {
  const snap = await db.collection('bots').where('ativo', '==', true).get();
  for (const doc of snap.docs) {
    const bot = doc.data();
    for (const grupoId of (bot.grupos || [])) {
      await iniciarListenerGrupo(grupoId, bot);
    }
  }
  console.log(`✅ ${snap.size} bot(s) carregado(s)`);
}

// ════════════════════════════════════════════════════════════════
// ROTAS DA API
// ════════════════════════════════════════════════════════════════

// ─── CRIAR BOT ─────────────────────────────────────────────────────────────
app.post('/api/bots/criar', async (req, res) => {
  try {
    const { nome, descricao, donoId } = req.body;
    if (!nome || !donoId) return res.status(400).json({ erro: 'Nome e donoId obrigatórios' });

    const token = gerarToken();
    const botRef = db.collection('bots').doc(token);

    await botRef.set({
      token,
      nome,
      descricao: descricao || '',
      donoId,
      foto: '',
      comandos: {},
      grupos: [],
      ativo: true,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ sucesso: true, token, nome });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ─── LISTAR BOTS DO USUÁRIO ────────────────────────────────────────────────
app.get('/api/bots/:donoId', async (req, res) => {
  try {
    const snap = await db.collection('bots').where('donoId', '==', req.params.donoId).get();
    const bots = snap.docs.map(d => ({ id: d.id, ...d.data(), token: d.data().token }));
    res.json({ bots });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ─── BUSCAR BOT PELO TOKEN ────────────────────────────────────────────────
app.get('/api/bot/:token', async (req, res) => {
  try {
    const doc = await db.collection('bots').doc(req.params.token).get();
    if (!doc.exists) return res.status(404).json({ erro: 'Bot não encontrado' });
    res.json({ bot: { id: doc.id, ...doc.data() } });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ─── ATUALIZAR BOT (nome, foto, descricao) ────────────────────────────────
app.put('/api/bot/:token', async (req, res) => {
  try {
    const { nome, descricao, foto } = req.body;
    const updates = {};
    if (nome)      updates.nome      = nome;
    if (descricao) updates.descricao = descricao;
    if (foto)      updates.foto      = foto;

    await db.collection('bots').doc(req.params.token).update(updates);
    res.json({ sucesso: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ─── ADICIONAR COMANDO ────────────────────────────────────────────────────
app.post('/api/bot/:token/comando', async (req, res) => {
  try {
    const { comando, resposta, descricao } = req.body;
    if (!comando || !resposta) return res.status(400).json({ erro: 'Comando e resposta obrigatórios' });

    const cmd = comando.startsWith('/') ? comando.toLowerCase() : `/${comando.toLowerCase()}`;

    await db.collection('bots').doc(req.params.token).update({
      [`comandos.${cmd}`]: { resposta, descricao: descricao || '' }
    });

    res.json({ sucesso: true, comando: cmd });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ─── REMOVER COMANDO ──────────────────────────────────────────────────────
app.delete('/api/bot/:token/comando/:cmd', async (req, res) => {
  try {
    const cmd = req.params.cmd.startsWith('/') ? req.params.cmd : `/${req.params.cmd}`;
    await db.collection('bots').doc(req.params.token).update({
      [`comandos.${cmd}`]: admin.firestore.FieldValue.delete()
    });
    res.json({ sucesso: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ─── ADICIONAR BOT AO GRUPO (via token no app) ────────────────────────────
app.post('/api/bot/:token/grupo/:grupoId', async (req, res) => {
  try {
    const { token, grupoId } = req.params;
    const botDoc = await db.collection('bots').doc(token).get();
    if (!botDoc.exists) return res.status(404).json({ erro: 'Token inválido' });

    const botDados = botDoc.data();

    // Adiciona grupo na lista do bot
    await db.collection('bots').doc(token).update({
      grupos: admin.firestore.FieldValue.arrayUnion(grupoId)
    });

    // Salva referência no grupo
    await db.collection('grupos').doc(grupoId).update({
      bots: admin.firestore.FieldValue.arrayUnion(token)
    });

    // Inicia o listener
    await iniciarListenerGrupo(grupoId, botDados);

    // Bot envia mensagem de boas-vindas
    await enviarMensagemBot(grupoId, `🤖 *${botDados.nome}* foi adicionado ao grupo!\n\nDigite /ajuda para ver os comandos disponíveis.`, botDados);

    res.json({ sucesso: true, nomBot: botDados.nome });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ─── REMOVER BOT DO GRUPO ────────────────────────────────────────────────
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
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ─── DELETAR BOT ─────────────────────────────────────────────────────────
app.delete('/api/bot/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const botDoc = await db.collection('bots').doc(token).get();
    if (!botDoc.exists) return res.status(404).json({ erro: 'Bot não encontrado' });

    const botDados = botDoc.data();
    for (const grupoId of (botDados.grupos || [])) {
      pararListener(grupoId, token);
    }

    await db.collection('bots').doc(token).delete();
    res.json({ sucesso: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    app: 'BoresChat Bot Server',
    versao: '1.0.0',
    listeners: Object.keys(listeners).length,
  });
});

// ─── START ────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 BoresChat Bot Server rodando na porta ${PORT}`);
  await carregarBotsAtivos();
});