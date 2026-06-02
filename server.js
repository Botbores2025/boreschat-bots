// ═══════════════════════════════════════════════════════════════
// SERVER.JS — Só inicia o bot e listeners
// Toda lógica de comandos fica em /comandos/
// ═══════════════════════════════════════════════════════════════

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const admin    = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const settings    = require('./settings.json');
const { iniciarBotUsuario } = require('./bot-usuario');

// ─── CARREGA TODOS OS MÓDULOS DE COMANDOS ────────────────────────────────────
const { menu, adm, jogos, usuario, sistema } = require('./comandos');

// ─── EXPRESS ─────────────────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.options('*', cors());
app.use(express.json());

// ─── UPLOADS ─────────────────────────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename:    (_req, file, cb) => {
    const ext  = path.extname(file.originalname) || (file.mimetype.includes('audio') ? '.m4a' : '.jpg');
    cb(null, `${Date.now()}_${uuidv4().slice(0,8)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ─── FIREBASE ────────────────────────────────────────────────────────────────
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ─── LISTENERS ATIVOS ────────────────────────────────────────────────────────
const listeners   = {};
const SERVER_START = Date.now();

function getUptime() {
  const ms    = Date.now() - SERVER_START;
  const total = Math.floor(ms / 1000);
  const h     = Math.floor(total / 3600);
  const m     = Math.floor((total % 3600) / 60);
  const s     = total % 60;
  const p     = [];
  if (h > 0) p.push(`${h}h`);
  if (m > 0) p.push(`${m}m`);
  p.push(`${s}s`);
  return p.join(' ');
}

function gerarToken() {
  return 'BORES_' + uuidv4().replace(/-/g,'').substring(0,24).toUpperCase();
}

function urlPublica(req, filename) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host  = req.headers['x-forwarded-host']  || req.get('host');
  return `${proto}://${host}/uploads/${filename}`;
}

// ─── UPLOAD ──────────────────────────────────────────────────────────────────
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo recebido' });
    res.json({ sucesso: true, url: urlPublica(req, req.file.filename) });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ─── ENVIAR MENSAGEM COMO BOT ─────────────────────────────────────────────────
async function enviarMensagemBot(grupoId, texto, botDados, extras = {}) {
  const textoFinal = (texto || '').trim();
  if (!textoFinal && !extras.fotoUrl && !extras.botoes) return;
  try {
    await db.collection('grupos').doc(grupoId).collection('mensagens').add({
      tipo:        extras.fotoUrl ? 'bot_card' : extras.botoes ? 'botoes' : 'texto',
      texto:       textoFinal,
      enviado_por: 'BOT_BORES_OFICIAL',
      nome:        'BoresBot',
      foto:        'https://iili.io/C3rRxRf.jpg',
      ehBot:       false,
      timestamp:   admin.firestore.FieldValue.serverTimestamp(),
      lido:        false,
      entregue:    true,
      ...(extras.replyTo ? { replyTo: extras.replyTo } : {}),
      ...(extras.fotoUrl ? { fotoUrl: extras.fotoUrl } : {}),
      ...(extras.botoes  ? { botoes:  extras.botoes  } : {}),
    });
  } catch (e) { console.error('[Bot] Erro ao enviar:', e.message); }
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

  const replyTo = { id: msgId, texto, nome: autorNome, enviado_por: dado.enviado_por || '', fotoUrl: null };

  // ─── Recarrega dados atualizados do Firestore ─────────────────────────────
  let botDadosAtual  = botDados;
  let comandosAtuais = {};
  let nomeGrupo      = grupoId;
  try {
    const botDoc   = await db.collection('bots').doc(botDados.token).get();
    const grupoDoc = await db.collection('grupos').doc(grupoId).get();
    if (botDoc.exists)   { botDadosAtual = { ...botDados, ...botDoc.data() }; comandosAtuais = botDadosAtual.comandos || {}; }
    if (grupoDoc.exists) nomeGrupo = grupoDoc.data().nome || grupoId;
  } catch (e) {}

  const cmdSemBarra = comando.replace(/^\//, '').toLowerCase();

  // ─── COMANDO CUSTOMIZADO ──────────────────────────────────────────────────
  if (comandosAtuais[cmdSemBarra]) {
    let resposta = comandosAtuais[cmdSemBarra].resposta;
    resposta = resposta
      .replace(/{usuario}/g, autorNome)
      .replace(/{grupo}/g, nomeGrupo)
      .replace(/{args}/g, args || '');
    await enviarMensagemBot(grupoId, resposta, botDadosAtual, { replyTo });
    return;
  }

  // ─── ROTEADOR DE COMANDOS ─────────────────────────────────────────────────
  const ctx = { grupoId, autorNome, autorId: dado.enviado_por, foto: dado.foto || '', args, nomeGrupo, botDados: botDadosAtual, replyTo, enviarMensagemBot, db };

  switch (comando) {

    // ── MENU ─────────────────────────────────────────────────────────────────
    case '/menu':
      await menu.handleMenu(ctx);
      break;

    case '/jogos':
      await menu.handleJogos(ctx);
      break;

    case '/cmds':
      await menu.handleCmds({ ...ctx, comandosCustom: comandosAtuais });
      break;

    // ── PING / INFO ───────────────────────────────────────────────────────────
    case '/ping': {
      const inicio = Date.now();
      await db.collection('bots').doc(botDados.token).get();
      const ms = Date.now() - inicio;
      await enviarMensagemBot(grupoId,
        `*${botDadosAtual.nome}*\n\nPong!\nVelocidade: *${ms}ms*\nUptime: *${getUptime()}*`,
        botDadosAtual, { replyTo }
      );
      break;
    }

    case '/info': {
      const keys = Object.keys(comandosAtuais);
      await enviarMensagemBot(grupoId,
        `*${botDadosAtual.nome}*\n\nComandos: *${keys.length}*\nGrupos: *${(botDadosAtual.grupos||[]).length}*\nUptime: *${getUptime()}*`,
        botDadosAtual, { replyTo }
      );
      break;
    }

    // ── ADM ───────────────────────────────────────────────────────────────────
    case '/limpar':
      await adm.limpar({ ...ctx });
      break;
    case '/banir':
      await adm.banir({ ...ctx });
      break;
    case '/remover':
      await adm.remover({ ...ctx });
      break;
    case '/rename':
      await adm.editarGrupo({ ...ctx });
      break;
    case '/admin':
      await adm.adicionar({ ...ctx });
      break;
    case '/fechar':
      await adm.fecharGrupo.fechar({ ...ctx });
      break;
    case '/abrir':
      await adm.fecharGrupo.abrir({ ...ctx });
      break;

    case '/bemvindo':
      await sistema.boasVindas.configurarBoasVindas({ ...ctx, autorId: dado.enviado_por });
      break;

    // ── JOGOS ─────────────────────────────────────────────────────────────────
    case '/dado':
      await jogos.dado(ctx);
      break;

    case '/quiz':
      await jogos.quiz.iniciarQuiz({ ...ctx, userId: dado.enviado_por });
      break;

    case '/placar':
      await jogos.quiz.mostrarPlacar(ctx);
      break;

    case '/velha': {
      const partida = jogos.tictac.partidas[grupoId];
      if (partida && /^[1-9]$/.test(args)) {
        await jogos.tictac.jogar({ ...ctx, autorId: dado.enviado_por });
      } else {
        await jogos.tictac.iniciarPartida({ ...ctx, autorId: dado.enviado_por });
      }
      break;
    }

    case '/minas': {
      const jogoMinas = jogos.campoMinado.jogos[grupoId];
      if (jogoMinas && args) {
        await jogos.campoMinado.revelar({ ...ctx, autorId: dado.enviado_por, nomeGrupo });
      } else {
        await jogos.campoMinado.iniciarJogo({ ...ctx, autorId: dado.enviado_por, nomeGrupo });
      }
      break;
    }

    case '/paciencia':
      await jogos.paciencia.iniciarJogo({ ...ctx, autorId: dado.enviado_por });
      break;

    case '/pac': {
      const subCmd  = args ? args.split(' ')[0].toLowerCase() : '';
      const subArgs = args ? args.split(' ').slice(1).join(' ') : '';
      if (subCmd === 'comprar') {
        await jogos.paciencia.comprar({ ...ctx, autorId: dado.enviado_por });
      } else if (subCmd === 'mover') {
        await jogos.paciencia.mover({ ...ctx, autorId: dado.enviado_por, args: subArgs });
      } else if (subCmd === 'ver') {
        await jogos.paciencia.verTabuleiro({ ...ctx, autorId: dado.enviado_por });
      } else {
        await enviarMensagemBot(grupoId,
          '/pac comprar\n/pac mover C1 C2\n/pac mover C1 P1\n/pac mover E C1\n/pac ver',
          botDadosAtual, { replyTo }
        );
      }
      break;
    }

    // ── USUARIO ───────────────────────────────────────────────────────────────
    case '/musica':
      await usuario.musica(ctx);
      break;
    case '/ia':
      await usuario.gemini(ctx);
      break;
    case '/clima':
      await usuario.clima(ctx);
      break;

    case '/resumo':
      await usuario.resumo(ctx);
      break;

    case '/enquete':
      await usuario.enquete({ ...ctx, autorId: dado.enviado_por });
      break;

    case '/sorteio':
      await usuario.sorteio(ctx);
      break;

    case '/mencoes':
      await usuario.mencoes({ ...ctx, autorId: dado.enviado_por });
      break;

    // ── SISTEMA ───────────────────────────────────────────────────────────────
    case '/perfil': {
      const targetId = dado.enviado_por;
      try {
        // Tenta gerar imagem canvas
        await sistema.perfil.mostrarPerfil({ ...ctx, userId: targetId });
      } catch (e) {
        console.error('[Perfil] Erro:', e.message);
        // Fallback: busca stats e manda texto
        try {
          const ref   = db.collection('grupos').doc(grupoId).collection('usuarios_stats').doc(targetId);
          const snap  = await ref.get();
          const dados = snap.exists ? snap.data() : { xp:0, moedas:100, mensagens:0, wins:0, conquistas:[] };
          const info  = sistema.xp.calcularLevel(dados.xp || 0);
          const txtStats = 'Perfil de ' + autorNome + ' - Level ' + info.level + ' - XP ' + (dados.xp||0) + ' - Moedas ' + (dados.moedas||100) + ' - Msgs ' + (dados.mensagens||0) + ' - Wins ' + (dados.wins||0);
          await enviarMensagemBot(grupoId, txtStats, botDadosAtual, { replyTo });
        } catch (e2) {
          const txtPerfil = `👤 *Perfil de ${autorNome}*\n\nVoce ainda nao tem dados!\nMande mensagens no grupo para ganhar XP.`;
          await enviarMensagemBot(grupoId, txtPerfil, botDadosAtual, { replyTo });
        }
      }
      break;
    }
    case '/ranking':
      await sistema.ranking.mostrarRanking(ctx);
      break;
    case '/daily':
      await sistema.economia.daily({ ...ctx, userId: dado.enviado_por });
      break;
    case '/trabalhar':
      await sistema.economia.trabalhar({ ...ctx, userId: dado.enviado_por });
      break;
    case '/roubar':
      await sistema.economia.roubar({ ...ctx, userId: dado.enviado_por });
      break;
    case '/loja':
      await sistema.economia.loja({ ...ctx, userId: dado.enviado_por });
      break;
    case '/moedas':
    case '/saldo':
      await sistema.economia.saldo({ ...ctx, userId: dado.enviado_por });
      break;

    default:
      // Comando nao reconhecido — silencioso
      break;
  }
}

// ─── LISTENER DO GRUPO ────────────────────────────────────────────────────────
async function iniciarListenerGrupo(grupoId, botDados) {
  const chave = `${grupoId}_${botDados.token}`;
  if (listeners[chave]) return;
  console.log(`🤖 Bot "${botDados.nome}" ouvindo grupo ${grupoId}`);
  let primeiraExecucao      = true;
  let ultimoMsgIdProcessado = null;

  // ─── Listener de novos membros ──────────────────────────────────────────
  const unsubGrupo = db.collection('grupos').doc(grupoId).onSnapshot(async (snap) => {
    if (!snap.exists) return;
    const dados        = snap.data();
    const membrosAtual = dados.membros || [];
    if (!iniciarListenerGrupo._membrosAnt) iniciarListenerGrupo._membrosAnt = {};
    const antigos = iniciarListenerGrupo._membrosAnt[grupoId] || [];
    const novos   = membrosAtual.filter(id => !antigos.includes(id));
    iniciarListenerGrupo._membrosAnt[grupoId] = membrosAtual;
    if (antigos.length === 0 || novos.length === 0) return;
    for (const userId of novos) {
      try {
        let botAtual = botDados;
        try { const bd = await db.collection('bots').doc(botDados.token).get(); if (bd.exists) botAtual = { ...botDados, ...bd.data() }; } catch (_) {}
        await sistema.boasVindas.enviarBoasVindas({
          grupoId, userId,
          nomeGrupo: dados.nome || grupoId,
          totalMembros: membrosAtual.length,
          botDados: botAtual,
          db, enviarMensagemBot,
        });
      } catch (e) { console.error('[BoasVindas]', e.message); }
    }
  });

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

      if (msgId === ultimoMsgIdProcessado) return;
      if (dado.ehBot) return;

      // Marca imediatamente para evitar loop
      ultimoMsgIdProcessado = msgId;

      // ─── Verifica se grupo esta fechado ──────────────────────────────────
      try {
        const gSnap  = await db.collection('grupos').doc(grupoId).get();
        const gDados = gSnap.data() || {};
        if (gDados.grupofechado) {
          const admins = gDados.admins || [];
          if (!admins.includes(dado.enviado_por) && !dado.ehBot) {
            // Apaga mensagem de nao-ADM
            await db.collection('grupos').doc(grupoId)
              .collection('mensagens').doc(msgId).delete();
            return;
          }
        }
      } catch (_) {}

      // ─── XP automático por mensagem ──────────────────────────────────────
      if (dado.enviado_por && dado.nome) {
        try {
          const refStats  = db.collection('grupos').doc(grupoId).collection('usuarios_stats').doc(dado.enviado_por);
          const snapStats = await refStats.get();
          const ds        = snapStats.exists ? snapStats.data() : {
            userId: dado.enviado_por, nome: dado.nome, foto: dado.foto || '',
            xp: 0, moedas: 100, mensagens: 0, wins: 0,
            conquistas: [], streak_daily: 0, quiz_acertos: 0,
          };
          const xpAntes = ds.xp || 0;
          const novoXP  = xpAntes + 2;
          const lvAntes = sistema.xp.calcularLevel(xpAntes).level;
          const lvNovo  = sistema.xp.calcularLevel(novoXP).level;
          await refStats.set({ ...ds, xp: novoXP, nome: dado.nome, foto: dado.foto||'', mensagens: (ds.mensagens||0)+1 }, { merge: true });

          if (lvNovo > lvAntes) {
            let botAtiv = botDados;
            try { const bd = await db.collection('bots').doc(botDados.token).get(); if (bd.exists) botAtiv = { ...botDados, ...bd.data() }; } catch (_) {}
            await enviarMensagemBot(grupoId, `*${dado.nome}* subiu para o Level ${lvNovo}!\n${sistema.xp.getTitulo(lvNovo)}`, botAtiv);
            const stFull = await sistema.xp.getStats(db, grupoId, dado.enviado_por);
            if (stFull) await sistema.conquistas.verificarConquistas(db, grupoId, dado.enviado_por, stFull, enviarMensagemBot, botAtiv);
          }
        } catch (_) {}
      }

      // ─── Resposta de quiz ou decisão A/B ─────────────────────────────────
      const txtUpper      = (dado.texto || '').trim().replace(/^\//, '').toUpperCase();
      const letraMatch    = txtUpper.match(/\b([ABCD])\b/);
      const letraResposta = letraMatch ? letraMatch[1] : null;
      const temQuiz       = !!jogos.quiz.quizAtivo[grupoId];
      const temDecisao    = !!jogos.quiz.aguardandoDecisao[grupoId];

      if (letraResposta && (temQuiz || temDecisao)) {
        let botAtual = botDados, nomeGrupoQ = grupoId;
        try {
          const bd = await db.collection('bots').doc(botDados.token).get();
          if (bd.exists) botAtual = { ...botDados, ...bd.data() };
          const gd = await db.collection('grupos').doc(grupoId).get();
          if (gd.exists) nomeGrupoQ = gd.data().nome || grupoId;
        } catch (_) {}
        await jogos.quiz.verificarResposta({
          grupoId, texto: letraResposta,
          autorNome: dado.nome || 'Membro',
          userId: dado.enviado_por,
          nomeGrupo: nomeGrupoQ,
          botDados: botAtual,
          enviarMensagemBot,
        });
        return;
      }

      // ─── Detecta menção @BoresBot ─────────────────────────────────────────
      const textoMencao = (dado.texto || '').toLowerCase();
      if (textoMencao.includes('@boresbot') || textoMencao.includes('@bores')) {
        let botAtual = botDados;
        try { const bd = await db.collection('bots').doc(botDados.token).get(); if (bd.exists) botAtual = { ...botDados, ...bd.data() }; } catch (_) {}
        
        const respostasMencao = [
          `Oi ${dado.nome}! Me chama que eu apareço! 😄`,
          `Presente! Como posso ajudar, ${dado.nome}?`,
          `Olá ${dado.nome}! Use /menu para ver o que posso fazer!`,
          `Aqui! O que precisa, ${dado.nome}? 🤖`,
          `Chamou? Estou sempre por aqui! 😊`,
        ];
        const resposta = respostasMencao[Math.floor(Math.random() * respostasMencao.length)];
        
        // Simula digitando
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
        await enviarMensagemBot(grupoId, resposta, botAtual, { replyTo: { id: msgId, texto: dado.texto, nome: dado.nome, enviado_por: dado.enviado_por, fotoUrl: null } });
        return;
      }

      if (!dado.texto?.startsWith('/')) return;

      console.log(`📨 Comando: ${dado.texto} | grupo: ${grupoId}`);
      await processarComando(docSnap, grupoId, botDados);
    });

  listeners[chave] = unsub;
}

function pararListener(grupoId, token) {
  const chave = `${grupoId}_${token}`;
  if (listeners[chave]) { listeners[chave](); delete listeners[chave]; console.log(`🛑 Parado: ${chave}`); }
}

async function carregarBotsAtivos() {
  for (const chave of Object.keys(listeners)) {
    if (listeners[chave]) { listeners[chave](); delete listeners[chave]; }
  }
  const snap = await db.collection('bots').where('ativo', '==', true).get();
  for (const docSnap of snap.docs) {
    const bot = docSnap.data();
    for (const grupoId of (bot.grupos || [])) await iniciarListenerGrupo(grupoId, bot);
  }
  console.log(`✅ ${snap.size} bot(s) carregado(s)`);
}

// ════════════════════════════════════════════════════════════════════════════
// API ROUTES
// ════════════════════════════════════════════════════════════════════════════

app.post('/api/bots/criar', async (req, res) => {
  try {
    const { nome, descricao, donoId } = req.body;
    if (!nome || !donoId) return res.status(400).json({ erro: 'Nome e donoId obrigatorios' });
    const token = gerarToken();
    await db.collection('bots').doc(token).set({
      token, nome, descricao: descricao || '', donoId,
      foto: '', menuFoto: '', comandos: {}, grupos: [], ativo: true,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ sucesso: true, token, nome });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.get('/api/bots/:donoId', async (req, res) => {
  try {
    const snap = await db.collection('bots').where('donoId', '==', req.params.donoId).get();
    res.json({ bots: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.get('/api/bot/:token', async (req, res) => {
  try {
    const docSnap = await db.collection('bots').doc(req.params.token).get();
    if (!docSnap.exists) return res.status(404).json({ erro: 'Bot nao encontrado' });
    res.json({ bot: { id: docSnap.id, ...docSnap.data() } });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.put('/api/bot/:token', async (req, res) => {
  try {
    const { nome, descricao, foto, menuFoto, prefixo } = req.body;
    const updates = {};
    if (nome      !== undefined) updates.nome      = nome;
    if (descricao !== undefined) updates.descricao = descricao;
    if (foto      !== undefined) updates.foto      = foto;
    if (menuFoto  !== undefined) updates.menuFoto  = menuFoto;
    if (prefixo   !== undefined) updates.prefixo   = prefixo;
    await db.collection('bots').doc(req.params.token).update(updates);
    res.json({ sucesso: true });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.post('/api/bot/:token/comando', async (req, res) => {
  try {
    const { comando, resposta, descricao } = req.body;
    if (!comando || !resposta) return res.status(400).json({ erro: 'Comando e resposta obrigatorios' });
    const cmdSemBarra    = comando.replace(/^\//, '').toLowerCase();
    const botDoc         = await db.collection('bots').doc(req.params.token).get();
    if (!botDoc.exists) return res.status(404).json({ erro: 'Bot nao encontrado' });
    const cmds           = botDoc.data()?.comandos || {};
    cmds[cmdSemBarra]    = { resposta, descricao: descricao || '' };
    await db.collection('bots').doc(req.params.token).update({ comandos: cmds });
    res.json({ sucesso: true, comando: `/${cmdSemBarra}` });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.delete('/api/bot/:token/comando/:cmd', async (req, res) => {
  try {
    const cmdSemBarra = req.params.cmd.replace(/^\//, '').toLowerCase();
    const botDoc      = await db.collection('bots').doc(req.params.token).get();
    if (!botDoc.exists) return res.status(404).json({ erro: 'Bot nao encontrado' });
    const cmds = botDoc.data()?.comandos || {};
    delete cmds[cmdSemBarra];
    await db.collection('bots').doc(req.params.token).update({ comandos: cmds });
    res.json({ sucesso: true });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.post('/api/bot/:token/grupo/:grupoId', async (req, res) => {
  try {
    const { token, grupoId } = req.params;
    const botDoc = await db.collection('bots').doc(token).get();
    if (!botDoc.exists) return res.status(404).json({ erro: 'Token invalido' });
    const botDados = botDoc.data();
    await db.collection('bots').doc(token).update({ grupos: admin.firestore.FieldValue.arrayUnion(grupoId) });
    await db.collection('grupos').doc(grupoId).update({ bots: admin.firestore.FieldValue.arrayUnion(token) });
    pararListener(grupoId, botDados.token);
    const fresco = await db.collection('bots').doc(token).get();
    await iniciarListenerGrupo(grupoId, fresco.data());
    await enviarMensagemBot(grupoId, `*${botDados.nome}* entrou no grupo!\n\nDigite /menu para comecar.`, botDados);
    res.json({ sucesso: true, nomBot: botDados.nome });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.delete('/api/bot/:token/grupo/:grupoId', async (req, res) => {
  try {
    const { token, grupoId } = req.params;
    await db.collection('bots').doc(token).update({ grupos: admin.firestore.FieldValue.arrayRemove(grupoId) });
    await db.collection('grupos').doc(grupoId).update({ bots: admin.firestore.FieldValue.arrayRemove(token) });
    pararListener(grupoId, token);
    res.json({ sucesso: true });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.delete('/api/bot/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const botDoc = await db.collection('bots').doc(token).get();
    if (!botDoc.exists) return res.status(404).json({ erro: 'Bot nao encontrado' });
    for (const grupoId of (botDoc.data().grupos || [])) pararListener(grupoId, token);
    await db.collection('bots').doc(token).delete();
    res.json({ sucesso: true });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ─── ROTA GEMINI IA ──────────────────────────────────────────────────────────
app.post('/api/gemini', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'Pergunta obrigatoria' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.json({ text: 'IA indisponivel. Configure GEMINI_API_KEY.' });

    const systemPrompt = `Voce e o BoresBot, assistente oficial do BoresChat.
Fui criado e treinado por Riquefla, desenvolvedor do BoresChat.
Sou um assistente simpatico, divertido e prestativo.
Respondo em portugues brasileiro de forma natural e amigavel.
Quando perguntarem quem me criou, digo: "Fui criado e treinado pelo Riquefla, o desenvolvedor do BoresChat!"
Maximo 3 frases por resposta. Sem markdown.`;

    const https = require('https');
    const body = JSON.stringify({
      contents: [{
        parts: [{ text: `${systemPrompt}

Usuario perguntou: ${question}` }]
      }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
    });

    const resposta = await new Promise((resolve, reject) => {
      const req2 = https.request({
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }, (r) => {
        let raw = '';
        r.on('data', c => raw += c);
        r.on('end', () => {
          try { resolve(JSON.parse(raw)); } catch (_) { resolve(null); }
        });
      });
      req2.on('error', reject);
      req2.write(body);
      req2.end();
    });

    const text = resposta?.candidates?.[0]?.content?.parts?.[0]?.text;
    res.json({ text: text || 'Nao consegui responder agora. Tente novamente!' });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/', (_req, res) => {
  res.json({
    status:    'online',
    bot:       settings.BOT_NAME,
    versao:    settings.BOT_VERSION,
    uptime:    getUptime(),
    listeners: Object.keys(listeners).length,
  });
});

// ─── START ────────────────────────────────────────────────────────────────────
// ─── VIDA PRÓPRIA — Mensagens automáticas nos grupos ─────────────────────────
const MSGS_VIDA_PROPRIA = [
  'Bom dia pessoal! ☀️ Hoje é um ótimo dia pra jogar /quiz!',
  'Oi galera! Não esqueçam de pegar suas moedas do dia com /daily! 💰',
  'Alguém quer jogar /velha comigo? 🎮',
  'Já fizeram o /daily hoje? Moedas não caem do céu! 😄',
  'Boa tarde! Que tal um /quiz pra esquentar o cérebro? 🧠',
  'Lembrando que quem mais mandar mensagem sobe de level mais rápido! 📈',
  'Boa noite! Quem tá no topo do /ranking hoje? 🏆',
  'Passando pra dizer que tô aqui 24h pra ajudar! Me chama com /menu 😊',
];

function iniciarVidaPropria() {
  // Manda mensagem aleatória a cada 2-4 horas
  const intervaloMin = 2 * 60 * 60 * 1000; // 2h
  const intervaloMax = 4 * 60 * 60 * 1000; // 4h

  const agendar = async () => {
    try {
      // Busca todos os bots ativos e seus grupos
      const snap = await db.collection('bots').where('ativo', '==', true).get();
      for (const docSnap of snap.docs) {
        const bot = docSnap.data();
        for (const grupoId of (bot.grupos || [])) {
          try {
            // Só manda se o grupo existir e não estiver fechado
            const grupoDoc = await db.collection('grupos').doc(grupoId).get();
            if (!grupoDoc.exists) continue;
            if (grupoDoc.data()?.grupofechado) continue;

            // 30% de chance de mandar mensagem
            if (Math.random() > 0.3) continue;

            const msg = MSGS_VIDA_PROPRIA[Math.floor(Math.random() * MSGS_VIDA_PROPRIA.length)];
            await enviarMensagemBot(grupoId, msg, bot);
            console.log(`[VidaPropria] Mandou no grupo ${grupoId}: "${msg.substring(0, 40)}"`);
          } catch (e) {}
        }
      }
    } catch (e) { console.error('[VidaPropria] Erro:', e.message); }

    // Agenda próxima execução
    const proximo = intervaloMin + Math.random() * (intervaloMax - intervaloMin);
    setTimeout(agendar, proximo);
  };

  // Primeira execução após 30 minutos
  setTimeout(agendar, 30 * 60 * 1000);
  console.log('✅ Vida própria do bot ativada!');
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 ${settings.BOT_NAME} v${settings.BOT_VERSION} rodando na porta ${PORT}`);
  await carregarBotsAtivos();
  await iniciarBotUsuario(db, admin);
  iniciarVidaPropria();
});