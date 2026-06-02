// ═══════════════════════════════════════════════════════════════
// SERVER.JS — Servidor principal do BoresBot
// Inicia listeners e gerencia API
// Toda lógica de comandos fica em /comandos/
// ═══════════════════════════════════════════════════════════════

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const https = require('https');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const settings = require('./settings.json');
const { iniciarBotUsuario } = require('./bot-usuario');

// ─── CARREGA TODOS OS MÓDULOS DE COMANDOS ───────────────────────────────────
const { menu, adm, jogos, usuario, sistema } = require('./comandos');

// ─── EXPRESS ─────────────────────────────────────────────────────────────────
const app = express();
const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

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
const listeners = {};
const SERVER_START = Date.now();
const botDataCache = new Map(); // Cache para dados do bot
const spamMap = new Map(); // Map para anti-spam melhorado
const membrosAntigos = new Map(); // Map para rastrear novos membros
const CACHE_TTL = 60000; // 1 minuto

// Limpa spam map a cada 5 minutos para evitar memory leak
setInterval(() => {
  const agora = Date.now();
  for (const [chave, timestamps] of spamMap.entries()) {
    const vivos = timestamps.filter(t => agora - t < 5000);
    if (vivos.length === 0) {
      spamMap.delete(chave);
    } else {
      spamMap.set(chave, vivos);
    }
  }
}, 5 * 60 * 1000);

function getUptime() {
  const ms = Date.now() - SERVER_START;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

function gerarToken() {
  return 'BORES_' + uuidv4().replace(/-/g, '').substring(0, 24).toUpperCase();
}

function urlPublica(req, filename) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}/uploads/${filename}`;
}

// Busca dados do bot com cache
async function obterBotAtualizado(token) {
  const agora = Date.now();
  const cache = botDataCache.get(token);
  if (cache && agora - cache.tempo < CACHE_TTL) {
    return cache.dados;
  }
  try {
    const botDoc = await db.collection('bots').doc(token).get();
    if (botDoc.exists) {
      const dados = botDoc.data();
      botDataCache.set(token, { dados, tempo: agora });
      return dados;
    }
  } catch (e) {
    console.error(`[Cache] Erro ao buscar bot ${token}:`, e.message);
  }
  return null;
}

// ─── UPLOAD ──────────────────────────────────────────────────────────────────
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ erro: 'Nenhum arquivo recebido' });
    }
    res.json({ sucesso: true, url: urlPublica(req, req.file.filename) });
  } catch (erro) {
    console.error('[Upload] Erro:', erro.message);
    res.status(500).json({ erro: erro.message });
  }
});

// ─── ENVIAR MENSAGEM COMO BOT ─────────────────────────────────────────────────
async function enviarMensagemBot(grupoId, texto, botDados, extras = {}) {
  const textoFinal = (texto || '').trim();
  if (!textoFinal && !extras.fotoUrl && !extras.botoes) return;
  
  try {
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const msgData = {
      tipo: extras.fotoUrl ? 'bot_card' : extras.botoes ? 'botoes' : 'texto',
      texto: textoFinal,
      enviado_por: 'BOT_BORES_OFICIAL',
      nome: 'BoresBot',
      foto: 'https://iili.io/C3rRxRf.jpg',
      ehBot: false,
      timestamp,
      lido: false,
      entregue: true,
    };
    
    if (extras.replyTo) msgData.replyTo = extras.replyTo;
    if (extras.fotoUrl) msgData.fotoUrl = extras.fotoUrl;
    if (extras.botoes) msgData.botoes = extras.botoes;
    
    await db.collection('grupos').doc(grupoId).collection('mensagens').add(msgData);
  } catch (erro) {
    console.error('[Bot] Erro ao enviar mensagem:', erro.message);
  }
}

// ─── RECARREGAR DADOS DO BOT E GRUPO ───────────────────────────────────────
async function recarregarDadosBot(botDados, grupoId) {
  let botAtualizado = botDados;
  let nomeGrupo = grupoId;
  let comandos = {};
  
  try {
    const botAtual = await obterBotAtualizado(botDados.token);
    if (botAtual) {
      botAtualizado = botAtual;
      comandos = botAtual.comandos || {};
    }
    
    const grupoDoc = await db.collection('grupos').doc(grupoId).get();
    if (grupoDoc.exists) {
      nomeGrupo = grupoDoc.data().nome || grupoId;
    }
  } catch (erro) {
    console.error('[RecarregarDados] Erro:', erro.message);
  }
  
  return { botAtualizado, nomeGrupo, comandos };
}

// ─── PROCESSAR COMANDO ────────────────────────────────────────────────────────
async function processarComando(msgDoc, grupoId, botDados) {
  const dado = msgDoc.data();
  const texto = dado.texto || '';
  const msgId = msgDoc.id;
  const autorNome = dado.nome || 'Membro';

  if (!texto.startsWith('/')) return;

  const partes = texto.trim().split(' ');
  const comando = partes[0].toLowerCase();

  if (comando === '/voz') {
    console.log('[Voz] DEBUG dado completo:', JSON.stringify(dado, null, 2));
  }
  const args = partes.slice(1).join(' ');

  const replyTo = {
    id: msgId,
    texto,
    nome: autorNome,
    enviado_por: dado.enviado_por || '',
    fotoUrl: null
  };

  // Recarrega dados atualizados
  const { botAtualizado, nomeGrupo, comandos } = await recarregarDadosBot(botDados, grupoId);
  const cmdSemBarra = comando.replace(/^\//, '').toLowerCase();

  // ─── COMANDO CUSTOMIZADO ──────────────────────────────────────────────────
  if (comandos[cmdSemBarra]) {
    let resposta = comandos[cmdSemBarra].resposta;
    resposta = resposta
      .replace(/{usuario}/g, autorNome)
      .replace(/{grupo}/g, nomeGrupo)
      .replace(/{args}/g, args || '');
    await enviarMensagemBot(grupoId, resposta, botAtualizado, { replyTo });
    return;
  }

  // ─── ROTEADOR DE COMANDOS ─────────────────────────────────────────────────
  const ctx = {
    grupoId,
    autorNome,
    autorId: dado.enviado_por,
    foto: dado.foto || '',
    args,
    nomeGrupo,
    botDados: botAtualizado,
    replyTo,
    enviarMensagemBot,
    db
  };

  switch (comando) {

    // ── MENU ─────────────────────────────────────────────────────────────────
    case '/menu':
      await menu.handleMenu(ctx);
      break;

    case '/jogos':
      await menu.handleJogos(ctx);
      break;

    case '/cmds':
      await menu.handleCmds({ ...ctx, comandosCustom: comandos });
      break;

    // ── PING / INFO ───────────────────────────────────────────────────────────
    case '/ping': {
      const inicio = Date.now();
      await db.collection('bots').doc(botAtualizado.token).get();
      const ms = Date.now() - inicio;
      await enviarMensagemBot(grupoId,
        `*${botAtualizado.nome}*\n\nPong!\nVelocidade: *${ms}ms*\nUptime: *${getUptime()}*`,
        botAtualizado, { replyTo }
      );
      break;
    }

    case '/info': {
      const keys = Object.keys(comandos);
      await enviarMensagemBot(grupoId,
        `*${botAtualizado.nome}*\n\nComandos: *${keys.length}*\nGrupos: *${(botAtualizado.grupos || []).length}*\nUptime: *${getUptime()}*`,
        botAtualizado, { replyTo }
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

    case '/voz':
      await usuario.voz(ctx);
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
  let primeiraExecucao = true;
  let ultimoMsgIdProcessado = null;

  // ─── Listener de novos membros ──────────────────────────────────────────
  const unsubGrupo = db.collection('grupos').doc(grupoId).onSnapshot(async (snap) => {
    if (!snap.exists) return;
    const dados = snap.data();
    const membrosAtual = dados.membros || [];
    const antigos = membrosAntigos.get(grupoId) || [];
    const novos = membrosAtual.filter(id => !antigos.includes(id));
    membrosAntigos.set(grupoId, membrosAtual);
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

      // ─── Anti-spam ────────────────────────────────────────────────────────
      if (dado.enviado_por && dado.texto) {
        try {
          const spamKey = `spam_${grupoId}_${dado.enviado_por}`;
          if (!iniciarListenerGrupo._spamMap) iniciarListenerGrupo._spamMap = {};
          if (!iniciarListenerGrupo._spamMap[spamKey]) iniciarListenerGrupo._spamMap[spamKey] = [];

          const agora = Date.now();
          const historico = iniciarListenerGrupo._spamMap[spamKey];

          // Remove msgs antigas (fora da janela de 5s)
          iniciarListenerGrupo._spamMap[spamKey] = historico.filter(t => agora - t < 5000);
          iniciarListenerGrupo._spamMap[spamKey].push(agora);

          const countRecente = iniciarListenerGrupo._spamMap[spamKey].length;

          // Spam: mais de 5 msgs em 5 segundos
          if (countRecente > 5) {
            console.log(`[AntiSpam] Spam detectado de ${dado.nome} no grupo ${grupoId}`);

            // Apaga a mensagem
            await db.collection('grupos').doc(grupoId)
              .collection('mensagens').doc(msgId).delete();

            // Silencia por 5 minutos se for reincidente
            if (countRecente > 8) {
              const gSnap2  = await db.collection('grupos').doc(grupoId).get();
              const silenciados = gSnap2.data()?.silenciados || {};
              silenciados[dado.enviado_por] = {
                ate: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
                horas: 0,
                motivo: 'spam',
              };
              await db.collection('grupos').doc(grupoId).update({ silenciados });

              let botAtual = botDados;
              try { const bd = await db.collection('bots').doc(botDados.token).get(); if (bd.exists) botAtual = { ...botDados, ...bd.data() }; } catch (_) {}

              await enviarMensagemBot(grupoId,
                `${dado.nome} foi silenciado por 5 minutos por spam!`,
                botAtual
              );
            }
            return;
          }
        } catch (e) { console.error('[AntiSpam]', e.message); }
      }

      // ─── Detecta menção @BoresBot ─────────────────────────────────────────
      const textoMencao = (dado.texto || '').toLowerCase();
      if (textoMencao.includes('@boresbot') || textoMencao.includes('@bores')) {
        let botAtual = botDados;
        try {
          const bd = await db.collection('bots').doc(botDados.token).get();
          if (bd.exists) botAtual = { ...botDados, ...bd.data() };
        } catch (_) {}
        
        const respostasMencao = [
          `Oi ${dado.nome}! Me chama que eu apareço! 😄`,
          `Presente! Como posso ajudar, ${dado.nome}?`,
          `Olá ${dado.nome}! Use /menu para ver o que posso fazer!`,
          `Aqui! O que precisa, ${dado.nome}? 🤖`,
          `Chamou? Estou sempre por aqui! 😊`,
        ];
        const resposta = respostasMencao[Math.floor(Math.random() * respostasMencao.length)];
        
        await enviarMensagemBot(grupoId, resposta, botAtual, {
          replyTo: {
            id: msgId,
            texto: dado.texto,
            nome: dado.nome,
            enviado_por: dado.enviado_por,
            fotoUrl: null
          }
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
    
    if (!nome?.trim() || !donoId?.trim()) {
      return res.status(400).json({ erro: 'Nome e donoId obrigatórios' });
    }
    
    const token = gerarToken();
    const botData = {
      token,
      nome: nome.trim(),
      descricao: (descricao || '').trim(),
      donoId: donoId.trim(),
      foto: '',
      menuFoto: '',
      comandos: {},
      grupos: [],
      ativo: true,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    await db.collection('bots').doc(token).set(botData);
    console.log(`[Bot] Novo bot criado: ${nome} (${token})`);
    res.json({ sucesso: true, token, nome });
  } catch (erro) {
    console.error('[Criar Bot]', erro.message);
    res.status(500).json({ erro: erro.message });
  }
});

app.get('/api/bots/:donoId', async (req, res) => {
  try {
    const { donoId } = req.params;
    if (!donoId?.trim()) {
      return res.status(400).json({ erro: 'donoId obrigatório' });
    }
    
    const snap = await db.collection('bots')
      .where('donoId', '==', donoId.trim())
      .get();
    
    res.json({
      bots: snap.docs.map(d => ({ id: d.id, ...d.data() })),
      total: snap.size
    });
  } catch (erro) {
    console.error('[Listar Bots]', erro.message);
    res.status(500).json({ erro: erro.message });
  }
});

app.get('/api/bot/:token', async (req, res) => {
  try {
    const { token } = req.params;
    if (!token?.trim()) {
      return res.status(400).json({ erro: 'token obrigatório' });
    }
    
    const docSnap = await db.collection('bots').doc(token.trim()).get();
    if (!docSnap.exists) {
      return res.status(404).json({ erro: 'Bot não encontrado' });
    }
    
    res.json({ bot: { id: docSnap.id, ...docSnap.data() } });
  } catch (erro) {
    console.error('[Obter Bot]', erro.message);
    res.status(500).json({ erro: erro.message });
  }
});

app.put('/api/bot/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { nome, descricao, foto, menuFoto, prefixo } = req.body;
    
    if (!token?.trim()) {
      return res.status(400).json({ erro: 'token obrigatório' });
    }
    
    const updates = {};
    if (nome !== undefined) updates.nome = nome.trim();
    if (descricao !== undefined) updates.descricao = descricao.trim();
    if (foto !== undefined) updates.foto = foto;
    if (menuFoto !== undefined) updates.menuFoto = menuFoto;
    if (prefixo !== undefined) updates.prefixo = prefixo;
    
    await db.collection('bots').doc(token.trim()).update(updates);
    botDataCache.delete(token.trim()); // Limpa cache
    
    console.log(`[Bot] Atualizado: ${token}`);
    res.json({ sucesso: true });
  } catch (erro) {
    console.error('[Atualizar Bot]', erro.message);
    res.status(500).json({ erro: erro.message });
  }
});

app.post('/api/bot/:token/comando', async (req, res) => {
  try {
    const { token } = req.params;
    const { comando, resposta, descricao } = req.body;
    
    if (!token?.trim()) {
      return res.status(400).json({ erro: 'token obrigatório' });
    }
    
    if (!comando?.trim() || !resposta?.trim()) {
      return res.status(400).json({ erro: 'Comando e resposta obrigatórios' });
    }
    
    const cmdSemBarra = comando.replace(/^\//, '').toLowerCase().trim();
    const botDoc = await db.collection('bots').doc(token.trim()).get();
    
    if (!botDoc.exists) {
      return res.status(404).json({ erro: 'Bot não encontrado' });
    }
    
    const cmds = botDoc.data()?.comandos || {};
    cmds[cmdSemBarra] = {
      resposta: resposta.trim(),
      descricao: (descricao || '').trim()
    };
    
    await db.collection('bots').doc(token.trim()).update({ comandos: cmds });
    botDataCache.delete(token.trim()); // Limpa cache
    
    console.log(`[Comando] Adicionado: /${cmdSemBarra}`);
    res.json({ sucesso: true, comando: `/${cmdSemBarra}` });
  } catch (erro) {
    console.error('[Adicionar Comando]', erro.message);
    res.status(500).json({ erro: erro.message });
  }
});

app.delete('/api/bot/:token/comando/:cmd', async (req, res) => {
  try {
    const { token, cmd } = req.params;
    
    if (!token?.trim() || !cmd?.trim()) {
      return res.status(400).json({ erro: 'token e cmd obrigatórios' });
    }
    
    const cmdSemBarra = cmd.replace(/^\//, '').toLowerCase().trim();
    const botDoc = await db.collection('bots').doc(token.trim()).get();
    
    if (!botDoc.exists) {
      return res.status(404).json({ erro: 'Bot não encontrado' });
    }
    
    const cmds = botDoc.data()?.comandos || {};
    if (!cmds[cmdSemBarra]) {
      return res.status(404).json({ erro: 'Comando não encontrado' });
    }
    
    delete cmds[cmdSemBarra];
    await db.collection('bots').doc(token.trim()).update({ comandos: cmds });
    botDataCache.delete(token.trim()); // Limpa cache
    
    console.log(`[Comando] Removido: /${cmdSemBarra}`);
    res.json({ sucesso: true });
  } catch (erro) {
    console.error('[Remover Comando]', erro.message);
    res.status(500).json({ erro: erro.message });
  }
});

app.post('/api/bot/:token/grupo/:grupoId', async (req, res) => {
  try {
    const { token, grupoId } = req.params;
    
    if (!token?.trim() || !grupoId?.trim()) {
      return res.status(400).json({ erro: 'token e grupoId obrigatórios' });
    }
    
    const tokenTrim = token.trim();
    const grupoIdTrim = grupoId.trim();
    const botDoc = await db.collection('bots').doc(tokenTrim).get();
    
    if (!botDoc.exists) {
      return res.status(404).json({ erro: 'Bot não encontrado' });
    }
    
    const botDados = botDoc.data();
    
    // Adiciona grupo ao bot e bot ao grupo
    await db.collection('bots').doc(tokenTrim)
      .update({ grupos: admin.firestore.FieldValue.arrayUnion(grupoIdTrim) });
    await db.collection('grupos').doc(grupoIdTrim)
      .update({ bots: admin.firestore.FieldValue.arrayUnion(tokenTrim) });
    
    // Para listener antigo e inicia novo
    pararListener(grupoIdTrim, botDados.token);
    const botFresco = await db.collection('bots').doc(tokenTrim).get();
    if (botFresco.exists) {
      await iniciarListenerGrupo(grupoIdTrim, botFresco.data());
    }
    
    // Envia mensagem de boas-vindas
    await enviarMensagemBot(
      grupoIdTrim,
      `*${botDados.nome}* entrou no grupo!\n\nDigite /menu para começar.`,
      botDados
    );
    
    console.log(`[Grupo] Bot ${botDados.nome} adicionado ao grupo ${grupoIdTrim}`);
    res.json({ sucesso: true, nomBot: botDados.nome });
  } catch (erro) {
    console.error('[Adicionar Bot Grupo]', erro.message);
    res.status(500).json({ erro: erro.message });
  }
});

app.delete('/api/bot/:token/grupo/:grupoId', async (req, res) => {
  try {
    const { token, grupoId } = req.params;
    
    if (!token?.trim() || !grupoId?.trim()) {
      return res.status(400).json({ erro: 'token e grupoId obrigatórios' });
    }
    
    const tokenTrim = token.trim();
    const grupoIdTrim = grupoId.trim();
    
    // Remove grupo do bot e bot do grupo
    await db.collection('bots').doc(tokenTrim)
      .update({ grupos: admin.firestore.FieldValue.arrayRemove(grupoIdTrim) });
    await db.collection('grupos').doc(grupoIdTrim)
      .update({ bots: admin.firestore.FieldValue.arrayRemove(tokenTrim) });
    
    // Para listener
    pararListener(grupoIdTrim, tokenTrim);
    
    console.log(`[Grupo] Bot removido do grupo ${grupoIdTrim}`);
    res.json({ sucesso: true });
  } catch (erro) {
    console.error('[Remover Bot Grupo]', erro.message);
    res.status(500).json({ erro: erro.message });
  }
});

app.delete('/api/bot/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    if (!token?.trim()) {
      return res.status(400).json({ erro: 'token obrigatório' });
    }
    
    const tokenTrim = token.trim();
    const botDoc = await db.collection('bots').doc(tokenTrim).get();
    
    if (!botDoc.exists) {
      return res.status(404).json({ erro: 'Bot não encontrado' });
    }
    
    // Para todos os listeners
    const grupos = botDoc.data().grupos || [];
    for (const grupoId of grupos) {
      pararListener(grupoId, tokenTrim);
    }
    
    // Deleta o bot
    await db.collection('bots').doc(tokenTrim).delete();
    botDataCache.delete(tokenTrim); // Limpa cache
    
    console.log(`[Bot] Deletado: ${tokenTrim}`);
    res.json({ sucesso: true });
  } catch (erro) {
    console.error('[Deletar Bot]', erro.message);
    res.status(500).json({ erro: erro.message });
  }
});

// ─── ROTA GEMINI IA ──────────────────────────────────────────────────────────
app.post('/api/gemini', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'Pergunta obrigatória' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'IA indisponível. Configure GEMINI_API_KEY.' });
    }

    const systemPrompt = `Você é o BoresBot, assistente oficial do BoresChat.
Fui criado e treinado por Riquefla, desenvolvedor do BoresChat.
Sou um assistente simpático, divertido e prestativo.
Respondo em português brasileiro de forma natural e amigável.
Quando perguntarem quem me criou, digo: "Fui criado e treinado pelo Riquefla, o desenvolvedor do BoresChat!"
Máximo 3 frases por resposta. Sem markdown.`;

    const requestBody = JSON.stringify({
      contents: [{
        parts: [{
          text: `${systemPrompt}\n\nUsuário perguntou: ${question}`
        }]
      }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
    });

    const resposta = await new Promise((resolve, reject) => {
      const req2 = https.request({
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody),
        },
      }, (r) => {
        let raw = '';
        r.on('data', chunk => {
          raw += chunk;
        });
        r.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (erro) {
            console.error('[Gemini] Erro ao parsear resposta:', erro.message);
            resolve(null);
          }
        });
      });

      req2.on('error', (erro) => {
        console.error('[Gemini] Erro na requisição:', erro.message);
        reject(erro);
      });

      req2.write(requestBody);
      req2.end();
    });

    const text = resposta?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.warn('[Gemini] Resposta vazia ou inválida');
      return res.json({ text: 'Não consegui responder agora. Tente novamente!' });
    }

    res.json({ text });

  } catch (erro) {
    console.error('[Gemini]', erro.message);
    res.status(500).json({ error: erro.message });
  }
});

app.get('/', (_req, res) => {
  res.json({
    status: 'online',
    bot: settings.BOT_NAME,
    versao: settings.BOT_VERSION,
    uptime: getUptime(),
    listeners: Object.keys(listeners).length,
    timestamp: new Date().toISOString(),
    cacheBots: botDataCache.size,
  });
});

// ─── MIDDLEWARE: Rota 404 ─────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ erro: 'Rota não encontrada' });
});

// ─── MIDDLEWARE: Error handler global ──────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[Error]', err);
  res.status(err.status || 500).json({
    erro: process.env.NODE_ENV === 'production'
      ? 'Erro interno do servidor'
      : err.message,
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
const server = app.listen(PORT, async () => {
  try {
    console.log(`🚀 ${settings.BOT_NAME} v${settings.BOT_VERSION} rodando na porta ${PORT}`);
    console.log(`🔗 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    
    await carregarBotsAtivos();
    await iniciarBotUsuario(db, admin);
    iniciarVidaPropria();
    
    console.log('✅ Servidor iniciado com sucesso!');
  } catch (erro) {
    console.error('❌ Erro ao iniciar servidor:', erro.message);
    process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📭 SIGTERM recebido, encerrando servidor...');
  server.close(() => {
    console.log('✅ Servidor encerrado');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('📭 SIGINT recebido, encerrando servidor...');
  process.exit(0);
});