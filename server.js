require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const admin   = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

// ─── MÓDULOS DE COMANDOS ──────────────────────────────────────────────────────
const { adm, jogos, usuario } = require('./comandos');

const app = express();
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.options('*', cors());
app.use(express.json());

// ─── PASTA DE UPLOADS LOCAL (ALTERNATIVA B — GRATUITA E ILIMITADA) ───────────
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Serve a pasta /uploads publicamente
app.use('/uploads', express.static(UPLOADS_DIR));

// Config do multer — salva com nome único
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename:    (_req, file, cb) => {
    const ext  = path.extname(file.originalname) || (file.mimetype.includes('audio') ? '.m4a' : '.jpg');
    const nome = `${Date.now()}_${uuidv4().slice(0, 8)}${ext}`;
    cb(null, nome);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// ─── FIREBASE ADMIN ──────────────────────────────────────────────────────────
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ─── LISTENERS ATIVOS ────────────────────────────────────────────────────────
const listeners = {};

// ─── UPTIME DO SERVIDOR ───────────────────────────────────────────────────────
const SERVER_START = Date.now();

function getUptime() {
  const ms      = Date.now() - SERVER_START;
  const total   = Math.floor(ms / 1000);
  const h       = Math.floor(total / 3600);
  const m       = Math.floor((total % 3600) / 60);
  const s       = total % 60;
  const partes  = [];
  if (h > 0) partes.push(`${h}h`);
  if (m > 0) partes.push(`${m}m`);
  partes.push(`${s}s`);
  return partes.join(' ');
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function gerarToken() {
  return 'BORES_' + uuidv4().replace(/-/g,'').substring(0,24).toUpperCase();
}

// Monta a URL pública do arquivo enviado via multer
function urlPublica(req, filename) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host  = req.headers['x-forwarded-host']  || req.get('host');
  return `${proto}://${host}/uploads/${filename}`;
}

// ─── ROTA DE UPLOAD DE MÍDIA (substitui Cloudinary) ─────────────────────────
// POST /api/upload   — campo: "file" (multipart/form-data)
// Retorna: { url: "https://seuservidor.com/uploads/xxx.jpg" }
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo recebido' });
    const url = urlPublica(req, req.file.filename);
    res.json({ sucesso: true, url });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ─── ENVIAR MENSAGEM COMO BOT ─────────────────────────────────────────────────
async function enviarMensagemBot(grupoId, texto, botDados, extras = {}) {
  const textoFinal = (texto || '').trim();
  if (!textoFinal && !extras.fotoUrl && !extras.botoes) {
    console.warn('[Bot] Tentativa de enviar mensagem vazia ignorada.');
    return;
  }

  try {
    const msg = {
      tipo: extras.fotoUrl ? 'bot_card' : extras.botoes ? 'botoes' : 'texto',
      texto: textoFinal,
      enviado_por: `bot_${botDados.token}`,
      nome: botDados.nome || 'BoresBot',
      foto: botDados.foto || '',
      ehBot: true,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      lido: false,
      entregue: true,
      ...(extras.replyTo ? { replyTo: extras.replyTo } : {}),
      ...(extras.fotoUrl ? { fotoUrl: extras.fotoUrl } : {}),
      ...(extras.botoes  ? { botoes:  extras.botoes  } : {}),
    };

    await db.collection('grupos').doc(grupoId).collection('mensagens').add(msg);
  } catch (e) {
    console.error('Erro ao enviar mensagem bot:', e.message);
  }
}

// ─── PROCESSAR COMANDO ────────────────────────────────────────────────────────
async function processarComando(msgDoc, grupoId, botDados) {
  const dado      = msgDoc.data();
  const texto     = dado.texto || '';
  const msgId     = msgDoc.id;
  const autorNome = dado.nome || 'Membro';

  if (!texto.startsWith('/')) return;

  const partes  = texto.trim().split(' ');
  const comando = partes[0].toLowerCase();
  const args    = partes.slice(1).join(' ');

  const replyTo = {
    id:          msgId,
    texto:       texto,
    nome:        autorNome,
    enviado_por: dado.enviado_por || '',
    fotoUrl:     null,
  };

  // Recarrega TODOS os dados do bot do Firestore (pega menuFoto, nome, etc atualizados)
  let botDadosAtual = botDados;
  let comandosAtuais = {};
  try {
    const botDoc = await db.collection('bots').doc(botDados.token).get();
    if (botDoc.exists) {
      botDadosAtual = { ...botDados, ...botDoc.data() };
      comandosAtuais = botDadosAtual.comandos || {};
    }
  } catch (e) {}

  const cmdSemBarra = comando.replace(/^\//, '').toLowerCase();

  // ─── VERIFICA RESPOSTA DE QUIZ (A, B, C ou D) ────────────────────────────
  const respostaQuiz = await jogos.quiz.verificarResposta({
    grupoId, texto, autorNome, userId: dado.enviado_por, botDados: botDadosAtual, enviarMensagemBot
  });
  if (respostaQuiz) return;

  // ─── COMANDO CUSTOMIZADO ─────────────────────────────────────────────────
  if (comandosAtuais[cmdSemBarra]) {
    let resposta = comandosAtuais[cmdSemBarra].resposta;
    resposta = resposta
      .replace(/{usuario}/g, autorNome)
      .replace(/{grupo}/g, grupoId)
      .replace(/{args}/g, args || '');
    await enviarMensagemBot(grupoId, resposta, botDadosAtual, { replyTo });
    return;
  }

  // ─── COMANDOS PADRÃO ─────────────────────────────────────────────────────

  if (comando === '/ping') {
    const inicio = Date.now();
    // Faz um round-trip no Firestore para medir latência real
    await db.collection('bots').doc(botDados.token).get();
    const ms = Date.now() - inicio;
    const uptime = getUptime();

    const texto = `🤖 *${botDadosAtual.nome}*\n\n🏓 *Pong!*\n📶 Velocidade de resposta: *${ms}ms*\n⏱️ Uptime: *${uptime}*`;
    await enviarMensagemBot(grupoId, texto, botDadosAtual, { replyTo });
    return;
  }

  if (comando === '/menu') {
    const MENU_HEADER_IMAGE_URL = botDadosAtual.menuFoto || botDadosAtual.foto || '';
    console.log(`🖼️ /menu menuFoto="${MENU_HEADER_IMAGE_URL}"`);

    const keys        = Object.keys(comandosAtuais);
    const listaComandos = keys.length > 0
      ? keys.map(cmd => `• /${cmd} — ${comandosAtuais[cmd].descricao || comandosAtuais[cmd].resposta.substring(0, 25)}`).join('\n')
      : '• Nenhum comando criado ainda';

    const textoMenu = `╔══════════════════╗\n🤖  *${botDadosAtual.nome}*\n╚══════════════════╝\n\nOlá, *${autorNome}*! 👋\n\n📋 *COMANDOS DISPONÍVEIS:*\n${listaComandos}\n\n👇 Escolha uma opção:`;

    const botoes = [
      { label: '🎮 Jogos',         comando: '/jogos'   },
      { label: '⚡ Comandos',       comando: '/cmds'    },
      { label: '🏓 Ping',          comando: '/ping'    },
    ];

    await enviarMensagemBot(
      grupoId,
      textoMenu,
      botDadosAtual,
      {
        replyTo,
        ...(MENU_HEADER_IMAGE_URL ? { fotoUrl: MENU_HEADER_IMAGE_URL } : {}),
        botoes,
      }
    );
    return;
  }

  if (comando === '/jogos') {
    const botoes = [
      { label: '🎲 Dado',        comando: '/dado'   },
      { label: '🧠 Quiz',        comando: '/quiz'   },
      { label: '❌⭕ Velha',      comando: '/velha'  },
      { label: '💣 Campo Minado', comando: '/minas'  },
      { label: '🏆 Placar',      comando: '/placar' },
    ];
    await enviarMensagemBot(grupoId,
      `🎮 *Jogos do ${botDadosAtual.nome}*

Escolha um jogo ou digite o comando!`,
      botDadosAtual, { replyTo, botoes }
    );
    return;
  }

  if (comando === '/cmds') {
    const keys = Object.keys(comandosAtuais);
    const lista = keys.length > 0
      ? keys.map(cmd => `• /${cmd} — ${comandosAtuais[cmd].descricao || comandosAtuais[cmd].resposta.substring(0, 30)}`).join('\n')
      : 'Nenhum comando criado ainda.\n\nAcesse o painel web para adicionar!';

    const textoResp = `📋 *${botDadosAtual.nome}* — Comandos\n\n${lista}\n\n📌 *Padrão:*\n• /ping — Status do bot\n• /menu — Menu interativo\n• /cmds — Lista de comandos\n• /limpar — Limpar chat\n• /info — Informações`;
    await enviarMensagemBot(grupoId, textoResp, botDadosAtual, { replyTo });
    return;
  }



  // ─── ADM ──────────────────────────────────────────────────────────────────
  if (comando === '/limpar') {
    await adm.limpar({ grupoId, autorNome, botDados: botDadosAtual, replyTo, enviarMensagemBot, db });
    return;
  }
  if (comando === '/banir') {
    await adm.banir({ grupoId, args, autorNome, botDados: botDadosAtual, replyTo, enviarMensagemBot, db });
    return;
  }
  if (comando === '/remover') {
    await adm.remover({ grupoId, args, autorNome, botDados: botDadosAtual, replyTo, enviarMensagemBot, db });
    return;
  }
  if (comando === '/rename') {
    await adm.editarGrupo({ grupoId, args, autorNome, botDados: botDadosAtual, replyTo, enviarMensagemBot, db });
    return;
  }
  if (comando === '/admin') {
    await adm.adicionar({ grupoId, args, autorNome, botDados: botDadosAtual, replyTo, enviarMensagemBot, db });
    return;
  }

  // ─── JOGOS ────────────────────────────────────────────────────────────────
  if (comando === '/dado') {
    await jogos.dado({ grupoId, autorNome, botDados: botDadosAtual, replyTo, enviarMensagemBot });
    return;
  }
  if (comando === '/quiz') {
    await jogos.quiz.iniciarQuiz({ grupoId, autorNome, botDados: botDadosAtual, replyTo, enviarMensagemBot });
    return;
  }
  if (comando === '/placar') {
    await jogos.quiz.mostrarPlacar({ grupoId, botDados: botDadosAtual, replyTo, enviarMensagemBot });
    return;
  }
  if (comando === '/velha') {
    const partida = jogos.tictac.partidas[grupoId];
    if (partida && /^[1-9]$/.test(args)) {
      await jogos.tictac.jogar({ grupoId, args, autorId: dado.enviado_por, autorNome, botDados: botDadosAtual, replyTo, enviarMensagemBot });
    } else {
      await jogos.tictac.iniciarPartida({ grupoId, args, autorNome, autorId: dado.enviado_por, botDados: botDadosAtual, replyTo, enviarMensagemBot, db });
    }
    return;
  }
  if (comando === '/minas') {
    const jogoMinas = jogos.campoMinado.jogos[grupoId];
    if (jogoMinas && args) {
      await jogos.campoMinado.revelar({ grupoId, args, autorId: dado.enviado_por, autorNome, botDados: botDadosAtual, replyTo, enviarMensagemBot });
    } else {
      await jogos.campoMinado.iniciarJogo({ grupoId, autorId: dado.enviado_por, autorNome, botDados: botDadosAtual, replyTo, enviarMensagemBot });
    }
    return;
  }

  // ─── USUÁRIO ──────────────────────────────────────────────────────────────
  if (comando === '/musica') {
    await usuario.musica({ grupoId, args, autorNome, botDados: botDadosAtual, replyTo, enviarMensagemBot });
    return;
  }
  if (comando === '/ia') {
    await usuario.gemini({ grupoId, args, autorNome, botDados: botDadosAtual, replyTo, enviarMensagemBot });
    return;
  }

  if (comando === '/info') {
    const keys   = Object.keys(comandosAtuais);
    const uptime = getUptime();
    const textoInfo = `ℹ️ *${botDadosAtual.nome}*\n\n📋 Comandos: *${keys.length}*\n👥 Grupos: *${(botDadosAtual.grupos || []).length}*\n⏱️ Uptime: *${uptime}*`;
    await enviarMensagemBot(grupoId, textoInfo, botDadosAtual, { replyTo });
    return;
  }
}

// ─── INICIAR LISTENER DO GRUPO ────────────────────────────────────────────────
async function iniciarListenerGrupo(grupoId, botDados) {
  const chave = `${grupoId}_${botDados.token}`;
  if (listeners[chave]) return;

  console.log(`🤖 Bot "${botDados.nome}" ouvindo grupo ${grupoId}`);
  let primeiraExecucao = true;
  let ultimoMsgIdProcessado = null; // evita processar a mesma mensagem 2x

  const unsub = db
    .collection('grupos').doc(grupoId)
    .collection('mensagens')
    .orderBy('timestamp', 'desc')
    .limit(1)
    .onSnapshot(async (snap) => {
      if (primeiraExecucao) { primeiraExecucao = false; return; }
      if (snap.empty) return;

      const docSnap = snap.docs[0];
      const dado    = docSnap.data();
      const msgId   = docSnap.id;

      // Ignora se já processou essa mensagem
      if (msgId === ultimoMsgIdProcessado) return;

      // Ignora mensagens do bot
      if (dado.ehBot) return;
      if (!dado.texto?.startsWith('/')) return;

      // Marca como processada ANTES de executar (evita duplo disparo)
      ultimoMsgIdProcessado = msgId;

      console.log(`📨 Comando: ${dado.texto} em ${grupoId} id:${msgId}`);
      await processarComando(docSnap, grupoId, botDados);
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
  // Limpa todos os listeners antes de recarregar para evitar duplicatas
  for (const chave of Object.keys(listeners)) {
    if (listeners[chave]) { listeners[chave](); delete listeners[chave]; }
  }
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
      foto: '', menuFoto: '', comandos: {}, grupos: [], ativo: true,
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
    const { nome, descricao, foto, menuFoto } = req.body;
    const updates = {};
    if (nome)     updates.nome     = nome;
    if (descricao) updates.descricao = descricao;
    if (foto)      updates.foto      = foto;
    if (menuFoto)  updates.menuFoto  = menuFoto;
    await db.collection('bots').doc(req.params.token).update(updates);
    res.json({ sucesso: true });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ─── ADICIONAR COMANDO ───────────────────────────────────────────────────────
app.post('/api/bot/:token/comando', async (req, res) => {
  try {
    const { comando, resposta, descricao } = req.body;
    if (!comando || !resposta) return res.status(400).json({ erro: 'Comando e resposta obrigatórios' });

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

    // Para listener antigo se existir e recria com dados frescos
    pararListener(grupoId, botDados.token);
    const botDocFresco = await db.collection('bots').doc(token).get();
    await iniciarListenerGrupo(grupoId, botDocFresco.data());
    await enviarMensagemBot(
      grupoId,
      `🤖 *${botDados.nome}* entrou no grupo!\n\nDigite /menu para o menu interativo.`,
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
    versao: '2.1.0',
    listeners: Object.keys(listeners).length,
    uptime: getUptime(),
    features: [
      'upload local gratuito (multer)',
      'reply automático nos comandos',
      'menu bot_card com imagem + botões',
      'validação de mensagem vazia',
      'comandos customizados',
      '/menu', '/cmds', '/ping', '/info', '/limpar',
    ],
  });
});

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 BoresChat Bot Server v2.1.0 rodando na porta ${PORT}`);
  await carregarBotsAtivos();
});