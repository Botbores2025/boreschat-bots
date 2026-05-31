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
const settings = require('./settings.json');

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
      enviado_por: `bot_${botDados.token}`,
      nome:        botDados.nome || 'BoresBot',
      foto:        botDados.foto || '',
      ehBot:       true,
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
    case '/menu': {
      const menuFotoUrl = botDadosAtual.menuFoto || botDadosAtual.foto || '';
      const keysMenu    = Object.keys(comandosAtuais);
      const listaCustom = keysMenu.length > 0
        ? keysMenu.map(k => `• /${k} — ${comandosAtuais[k].descricao || ''}`).join('\n')
        : '• Nenhum comando customizado';
      const textoMenuPrincipal = `╔══════════════════╗\n🤖  *${botDadosAtual.nome}*\n╚══════════════════╝\n\nOla, *${autorNome}*! 👋\n\n📋 *COMANDOS:*\n${listaCustom}\n\n👇 Escolha uma opcao:`;
      const botoesMenu = [
        { label: 'Jogos',    comando: '/jogos'    },
        { label: 'Perfil',   comando: '/perfil'   },
        { label: 'Economia', comando: '/daily'    },
        { label: 'Ranking',  comando: '/ranking'  },
        { label: 'Ping',     comando: '/ping'     },
      ];
      await enviarMensagemBot(grupoId, textoMenuPrincipal, botDadosAtual, {
        replyTo,
        ...(menuFotoUrl ? { fotoUrl: menuFotoUrl } : {}),
        botoes: botoesMenu,
      });
      break;
    }

    case '/jogos': {
      const botoesJogos = [
        { label: 'Dado',        comando: '/dado'      },
        { label: 'Quiz',        comando: '/quiz'      },
        { label: 'Velha',       comando: '/velha'     },
        { label: 'Campo Minado',comando: '/minas'     },
        { label: 'Paciencia',   comando: '/paciencia' },
        { label: 'Placar',      comando: '/placar'    },
      ];
      await enviarMensagemBot(grupoId,
        `🎮 *Jogos do ${botDadosAtual.nome}*\n\nEscolha um jogo:`,
        botDadosAtual, { replyTo, botoes: botoesJogos }
      );
      break;
    }

    case '/cmds': {
      const keysCmd = Object.keys(comandosAtuais);
      const listaCmd = keysCmd.length > 0
        ? keysCmd.map(k => `• /${k} — ${comandosAtuais[k].descricao || comandosAtuais[k].resposta?.substring(0,30)}`).join('\n')
        : 'Nenhum comando customizado.\nAcesse o painel web para adicionar!';
      const textoCmds = `📋 *${botDadosAtual.nome}* — Comandos\n\n${listaCmd}\n\n📌 *Padrao:*\n• /ping • /menu • /jogos • /perfil\n• /daily • /trabalhar • /roubar • /loja\n• /ranking • /quiz • /dado • /velha\n• /minas • /paciencia • /limpar • /info`;
      await enviarMensagemBot(grupoId, textoCmds, botDadosAtual, { replyTo });
      break;
    }

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
        await jogos.campoMinado.revelar({ ...ctx, autorId: dado.enviado_por });
      } else {
        await jogos.campoMinado.iniciarJogo({ ...ctx, autorId: dado.enviado_por });
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
          const texto = `👤 *Perfil de ${autorNome}*\n\n⭐ Level: *${info.level}*\n✨ XP: *${dados.xp || 0}*\n💰 Moedas: *${dados.moedas || 100}*\n💬 Mensagens: *${dados.mensagens || 0}*\n🏆 Vitorias: *${dados.wins || 0}*\n🎖️ Conquistas: *${(dados.conquistas||[]).length}*`;
          await enviarMensagemBot(grupoId, texto, botDadosAtual, { replyTo });
        } catch (e2) {
          await enviarMensagemBot(grupoId, `Perfil de ${autorNome} ainda nao tem dados. Mande mensagens para ganhar XP!`, botDadosAtual, { replyTo });
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
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 ${settings.BOT_NAME} v${settings.BOT_VERSION} rodando na porta ${PORT}`);
  await carregarBotsAtivos();
});