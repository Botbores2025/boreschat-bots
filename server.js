require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const admin   = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

// ─── MÓDULOS DE COMANDOS ──────────────────────────────────────────────────────
const { adm, jogos, usuario, sistema } = require('./comandos');

const app = express();
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.options('*', cors());
app.use(express.json());

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename:    (_req, file, cb) => {
    const ext  = path.extname(file.originalname) || (file.mimetype.includes('audio') ? '.m4a' : '.jpg');
    const nome = `${Date.now()}_${uuidv4().slice(0, 8)}${ext}`;
    cb(null, nome);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const listeners = {};
const SERVER_START = Date.now();

function getUptime() {
  const ms    = Date.now() - SERVER_START;
  const total = Math.floor(ms / 1000);
  const h     = Math.floor(total / 3600);
  const m     = Math.floor((total % 3600) / 60);
  const s     = total % 60;
  const partes = [];
  if (h > 0) partes.push(`${h}h`);
  if (m > 0) partes.push(`${m}m`);
  partes.push(`${s}s`);
  return partes.join(' ');
}

function gerarToken() {
  return 'BORES_' + uuidv4().replace(/-/g,'').substring(0,24).toUpperCase();
}

function urlPublica(req, filename) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host  = req.headers['x-forwarded-host']  || req.get('host');
  return `${proto}://${host}/uploads/${filename}`;
}

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

  let botDadosAtual  = botDados;
  let comandosAtuais = {};
  let nomeGrupo      = grupoId;
  try {
    const botDoc   = await db.collection('bots').doc(botDados.token).get();
    const grupoDoc = await db.collection('grupos').doc(grupoId).get();
    if (botDoc.exists) {
      botDadosAtual  = { ...botDados, ...botDoc.data() };
      comandosAtuais = botDadosAtual.comandos || {};
    }
    if (grupoDoc.exists) nomeGrupo = grupoDoc.data().nome || grupoId;
  } catch (e) {}

  const cmdSemBarra = comando.replace(/^\//, '').toLowerCase();

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

  // ─── PING ────────────────────────────────────────────────────────────────
  if (comando === '/ping') {
    const inicio = Date.now();
    await db.collection('bots').doc(botDados.token).get();
    const ms     = Date.now() - inicio;
    const uptime = getUptime();
    await enviarMensagemBot(grupoId,
      `🤖 *${botDadosAtual.nome}*\n\n🏓 *Pong!*\n📶 Velocidade de resposta: *${ms}ms*\n⏱️ Uptime: *${uptime}*`,
      botDadosAtual, { replyTo }
    );
    return;
  }

  // ─── MENU ────────────────────────────────────────────────────────────────
  if (comando === '/menu') {
    const MENU_HEADER_IMAGE_URL = botDadosAtual.menuFoto || botDadosAtual.foto || '';
    const keys          = Object.keys(comandosAtuais);
    const listaComandos = keys.length > 0
      ? keys.map(cmd => `• /${cmd} — ${comandosAtuais[cmd].descricao || comandosAtuais[cmd].resposta.substring(0, 25)}`).join('\n')
      : '• Nenhum comando criado ainda';
    const textoMenu = `╔══════════════════╗\n🤖  *${botDadosAtual.nome}*\n╚══════════════════╝\n\nOla, *${autorNome}*! 👋\n\n📋 *COMANDOS DISPONÍVEIS:*\n${listaComandos}\n\n👇 Escolha uma opção:`;
    const botoes = [
      { label: '🎮 Jogos',    comando: '/jogos'   },
      { label: '👤 Perfil',   comando: '/perfil'  },
      { label: '💰 Economia', comando: '/daily'   },
      { label: '🏆 Ranking',  comando: '/ranking' },
    ];
    await enviarMensagemBot(grupoId, textoMenu, botDadosAtual, {
      replyTo,
      ...(MENU_HEADER_IMAGE_URL ? { fotoUrl: MENU_HEADER_IMAGE_URL } : {}),
      botoes,
    });
    return;
  }

  // ─── JOGOS MENU ──────────────────────────────────────────────────────────
  if (comando === '/jogos') {
    const botoes = [
      { label: '🎲 Dado',         comando: '/dado'      },
      { label: '🧠 Quiz',         comando: '/quiz'      },
      { label: '❌⭕ Velha',       comando: '/velha'     },
      { label: '💣 Campo Minado',  comando: '/minas'     },
      { label: '🃏 Paciencia',     comando: '/paciencia' },
      { label: '🏆 Placar',        comando: '/placar'    },
    ];
    await enviarMensagemBot(grupoId,
      `🎮 *Jogos do ${botDadosAtual.nome}*\n\nEscolha um jogo ou digite o comando!`,
      botDadosAtual, { replyTo, botoes }
    );
    return;
  }

  // ─── CMDS ────────────────────────────────────────────────────────────────
  if (comando === '/cmds') {
    const keys  = Object.keys(comandosAtuais);
    const lista = keys.length > 0
      ? keys.map(cmd => `• /${cmd} — ${comandosAtuais[cmd].descricao || comandosAtuais[cmd].resposta.substring(0, 30)}`).join('\n')
      : 'Nenhum comando criado ainda.\n\nAcesse o painel web para adicionar!';
    await enviarMensagemBot(grupoId,
      `📋 *${botDadosAtual.nome}* — Comandos\n\n${lista}\n\n📌 *Padrao:*\n• /ping — Status do bot\n• /menu — Menu interativo\n• /cmds — Lista de comandos\n• /limpar — Limpar chat\n• /info — Informacoes`,
      botDadosAtual, { replyTo }
    );
    return;
  }

  // ─── ADM ─────────────────────────────────────────────────────────────────
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

  // ─── JOGOS ───────────────────────────────────────────────────────────────
  if (comando === '/dado') {
    await jogos.dado({ grupoId, autorNome, botDados: botDadosAtual, replyTo, enviarMensagemBot });
    return;
  }
  if (comando === '/quiz') {
    await jogos.quiz.iniciarQuiz({ grupoId, autorNome, autorId: dado.enviado_por, nomeGrupo, botDados: botDadosAtual, replyTo, enviarMensagemBot });
    return;
  }
  if (comando === '/placar') {
    await jogos.quiz.mostrarPlacar({ grupoId, nomeGrupo, botDados: botDadosAtual, replyTo, enviarMensagemBot });
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
  if (comando === '/paciencia') {
    await jogos.paciencia.iniciarJogo({ grupoId, autorId: dado.enviado_por, autorNome, nomeGrupo, botDados: botDadosAtual, replyTo, enviarMensagemBot });
    return;
  }
  if (comando === '/pac') {
    const subCmd  = args ? args.split(' ')[0].toLowerCase() : '';
    const subArgs = args ? args.split(' ').slice(1).join(' ') : '';
    if (subCmd === 'comprar') {
      await jogos.paciencia.comprar({ grupoId, autorId: dado.enviado_por, autorNome, nomeGrupo, botDados: botDadosAtual, replyTo, enviarMensagemBot });
    } else if (subCmd === 'mover') {
      await jogos.paciencia.mover({ grupoId, autorId: dado.enviado_por, autorNome, nomeGrupo, args: subArgs, botDados: botDadosAtual, replyTo, enviarMensagemBot });
    } else if (subCmd === 'ver') {
      await jogos.paciencia.verTabuleiro({ grupoId, autorId: dado.enviado_por, autorNome, nomeGrupo, botDados: botDadosAtual, replyTo, enviarMensagemBot });
    } else {
      await enviarMensagemBot(grupoId,
        '/pac comprar — compra carta\n/pac mover C1 C2 — move coluna\n/pac mover C1 P1 — move para pilha\n/pac mover E C1 — move carta comprada\n/pac ver — mostra tabuleiro',
        botDadosAtual, { replyTo }
      );
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

  // ─── SISTEMA ─────────────────────────────────────────────────────────────
  if (comando === '/perfil') {
    await sistema.perfil.mostrarPerfil({ grupoId, userId: dado.enviado_por, autorId: dado.enviado_por, autorNome, foto: dado.foto || '', args, nomeGrupo, botDados: botDadosAtual, replyTo, enviarMensagemBot, db });
    return;
  }
  if (comando === '/ranking') {
    await sistema.ranking.mostrarRanking({ grupoId, args, nomeGrupo, botDados: botDadosAtual, replyTo, enviarMensagemBot, db });
    return;
  }
  if (comando === '/daily') {
    await sistema.economia.daily({ grupoId, userId: dado.enviado_por, autorNome, foto: dado.foto || '', botDados: botDadosAtual, replyTo, enviarMensagemBot, db });
    return;
  }
  if (comando === '/trabalhar') {
    await sistema.economia.trabalhar({ grupoId, userId: dado.enviado_por, autorNome, foto: dado.foto || '', botDados: botDadosAtual, replyTo, enviarMensagemBot, db });
    return;
  }
  if (comando === '/roubar') {
    await sistema.economia.roubar({ grupoId, userId: dado.enviado_por, autorNome, foto: dado.foto || '', args, botDados: botDadosAtual, replyTo, enviarMensagemBot, db });
    return;
  }
  if (comando === '/loja') {
    await sistema.economia.loja({ grupoId, userId: dado.enviado_por, autorNome, foto: dado.foto || '', args, botDados: botDadosAtual, replyTo, enviarMensagemBot, db });
    return;
  }
  if (comando === '/moedas' || comando === '/saldo') {
    await sistema.economia.saldo({ grupoId, userId: dado.enviado_por, autorNome, foto: dado.foto || '', botDados: botDadosAtual, replyTo, enviarMensagemBot, db });
    return;
  }

  // ─── INFO ────────────────────────────────────────────────────────────────
  if (comando === '/info') {
    const keys   = Object.keys(comandosAtuais);
    const uptime = getUptime();
    await enviarMensagemBot(grupoId,
      `ℹ️ *${botDadosAtual.nome}*\n\n📋 Comandos: *${keys.length}*\n👥 Grupos: *${(botDadosAtual.grupos || []).length}*\n⏱️ Uptime: *${uptime}*`,
      botDadosAtual, { replyTo }
    );
    return;
  }
}

// ─── LISTENER ────────────────────────────────────────────────────────────────
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

      // ─── Ignora mensagem ja processada ou do bot ──────────────────────────
      if (msgId === ultimoMsgIdProcessado) return;
      if (dado.ehBot) return;

      // Marca como processada imediatamente para evitar duplo disparo
      ultimoMsgIdProcessado = msgId;

      // ─── XP AUTOMATICO POR MENSAGEM (sem anuncio de level up inline) ──────
      // Usa flag separada para nao chamar enviarMensagemBot dentro do listener
      // e evitar loop: msg -> XP -> bot envia -> listener pega -> XP...
      if (dado.enviado_por && dado.nome) {
        try {
          const refStats = db.collection('grupos').doc(grupoId)
            .collection('usuarios_stats').doc(dado.enviado_por);
          const snapStats = await refStats.get();
          const dadosStats = snapStats.exists ? snapStats.data() : {
            userId: dado.enviado_por, nome: dado.nome, foto: dado.foto || '',
            xp: 0, moedas: 100, mensagens: 0, wins: 0,
            conquistas: [], streak_daily: 0, quiz_acertos: 0,
          };
          const xpAntes  = dadosStats.xp || 0;
          const novoXP   = xpAntes + 2;
          const lvAntes  = sistema.xp.calcularLevel(xpAntes).level;
          const lvNovo   = sistema.xp.calcularLevel(novoXP).level;
          await refStats.set({
            ...dadosStats,
            xp: novoXP,
            nome: dado.nome,
            foto: dado.foto || '',
            mensagens: (dadosStats.mensagens || 0) + 1,
          }, { merge: true });

          // So anuncia level up (1 msg do bot, nao gera XP pq ehBot=true)
          if (lvNovo > lvAntes) {
            let botAtivXP = botDados;
            try {
              const bdXP = await db.collection('bots').doc(botDados.token).get();
              if (bdXP.exists) botAtivXP = { ...botDados, ...bdXP.data() };
            } catch (_) {}
            const titulo = sistema.xp.getTitulo(lvNovo);
            await enviarMensagemBot(grupoId,
              `*${dado.nome}* subiu para o Level ${lvNovo}!
${titulo}`,
              botAtivXP
            );
            // Verifica conquistas de level
            const stFull = await sistema.xp.getStats(db, grupoId, dado.enviado_por);
            if (stFull) await sistema.conquistas.verificarConquistas(db, grupoId, dado.enviado_por, stFull, enviarMensagemBot, botAtivXP);
          }
        } catch (_) {}
      }

      // ─── Verifica resposta de quiz ou decisao A/B ─────────────────────────
      const txtUpper      = (dado.texto || '').trim().replace(/^\//, '').toUpperCase();
      const letraMatch    = txtUpper.match(/\b([ABCD])\b/);
      const letraResposta = letraMatch ? letraMatch[1] : null;
      const temQuiz       = !!jogos.quiz.quizAtivo[grupoId];
      const temDecisao    = !!jogos.quiz.aguardandoDecisao[grupoId];

      if (letraResposta && (temQuiz || temDecisao)) {
        let botAtualizado = botDados;
        let nomeGrupoQuiz = grupoId;
        try {
          const bd = await db.collection('bots').doc(botDados.token).get();
          if (bd.exists) botAtualizado = { ...botDados, ...bd.data() };
          const gd = await db.collection('grupos').doc(grupoId).get();
          if (gd.exists) nomeGrupoQuiz = gd.data().nome || grupoId;
        } catch (_) {}
        await jogos.quiz.verificarResposta({
          grupoId,
          texto:     letraResposta,
          autorNome: dado.nome || 'Membro',
          userId:    dado.enviado_por,
          nomeGrupo: nomeGrupoQuiz,
          botDados:  botAtualizado,
          enviarMensagemBot,
        });
        return;
      }

      if (!dado.texto?.startsWith('/')) return;

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
    const { nome, descricao, foto, menuFoto } = req.body;
    const updates = {};
    if (nome)      updates.nome      = nome;
    if (descricao) updates.descricao = descricao;
    if (foto)      updates.foto      = foto;
    if (menuFoto)  updates.menuFoto  = menuFoto;
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
    const comandosAtuais = botDoc.data()?.comandos || {};
    comandosAtuais[cmdSemBarra] = { resposta, descricao: descricao || '' };
    await db.collection('bots').doc(req.params.token).update({ comandos: comandosAtuais });
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
    const botDocFresco = await db.collection('bots').doc(token).get();
    await iniciarListenerGrupo(grupoId, botDocFresco.data());
    await enviarMensagemBot(grupoId, `🤖 *${botDados.nome}* entrou no grupo!\n\nDigite /menu para o menu interativo.`, botDados);
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

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    app: 'BoresChat Bot Server',
    versao: '2.1.0',
    listeners: Object.keys(listeners).length,
    uptime: getUptime(),
    features: ['upload local', 'bot_card', 'quiz canvas', 'paciencia', 'tictac', 'campo minado'],
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 BoresChat Bot Server v2.1.0 rodando na porta ${PORT}`);
  await carregarBotsAtivos();
});