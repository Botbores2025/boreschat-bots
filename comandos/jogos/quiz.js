// ═══════════════════════════════════════════════════════════════
// JOGOS/QUIZ.JS — Quiz completo com canvas + cronometro
// Uso: /quiz  /placar
// ═══════════════════════════════════════════════════════════════

const { createCanvas } = require('canvas');
const fs      = require('fs');
const path    = require('path');
const PERGS   = require('./perguntas.json');

// ─── ESTADO ──────────────────────────────────────────────────────────────────
const quizAtivo = {}; // grupoId -> { pergunta, timer, iniciador, nomeGrupo }
const placar    = {}; // grupoId -> { userId: { nome, acertos, erros } }

const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : 'https://boreschat-bots-production.up.railway.app';

function aleatorio(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ─── GERA IMAGEM DA PERGUNTA ─────────────────────────────────────────────────
function gerarImagemPergunta({ pergunta, nomeUsuario, nomeGrupo, numero, total, segundos }) {
  const W = 600, H = 420;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // Fundo gradiente
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0a0a0a');
  grad.addColorStop(1, '#111827');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Borda superior laranja
  ctx.fillStyle = '#FF6B00';
  ctx.fillRect(0, 0, W, 5);

  // Header: nome do grupo
  ctx.fillStyle = 'rgba(255,107,0,0.12)';
  ctx.fillRect(0, 5, W, 44);
  ctx.fillStyle = '#FF6B00';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(nomeGrupo.substring(0, 40), W / 2, 27);

  // Badge pergunta X/Y
  ctx.fillStyle = '#1f2937';
  roundRect(ctx, 20, 60, 110, 30, 8);
  ctx.fillStyle = '#9ca3af';
  ctx.font = '13px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`Pergunta ${numero}/${total}`, 75, 75);

  // Badge usuario
  ctx.fillStyle = 'rgba(255,107,0,0.15)';
  roundRect(ctx, W - 180, 60, 160, 30, 8);
  ctx.fillStyle = '#FF6B00';
  ctx.font = 'bold 13px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(nomeUsuario.substring(0, 18), W - 100, 75);

  // Cronometro
  const raio   = 28;
  const cx     = W / 2;
  const timerY = 115;
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth   = 6;
  ctx.beginPath(); ctx.arc(cx, timerY, raio, 0, Math.PI * 2); ctx.stroke();
  const pct = segundos / 20;
  const cor  = segundos > 10 ? '#22C55E' : segundos > 5 ? '#FFC107' : '#EF4444';
  ctx.strokeStyle = cor;
  ctx.lineWidth   = 6;
  ctx.beginPath();
  ctx.arc(cx, timerY, raio, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle    = '#fff';
  ctx.font         = 'bold 20px Arial';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(segundos), cx, timerY);

  // Pergunta
  ctx.fillStyle = '#f9fafb';
  ctx.font      = 'bold 20px Arial';
  ctx.textAlign = 'center';
  wrapText(ctx, pergunta.p, W / 2, 165, W - 60, 28);

  // Opcoes
  const cores = { A: '#3B82F6', B: '#22C55E', C: '#F59E0B', D: '#EF4444' };
  const letras = ['A', 'B', 'C', 'D'];
  const colW = (W - 60) / 2;
  pergunta.ops.forEach((op, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x   = 30 + col * (colW + 10);
    const y   = 260 + row * 65;
    const cor = cores[letras[i]];

    ctx.fillStyle = `${cor}22`;
    roundRect(ctx, x, y, colW, 50, 10);
    ctx.strokeStyle = `${cor}88`;
    ctx.lineWidth   = 1.5;
    roundRectStroke(ctx, x, y, colW, 50, 10);

    // Letra badge
    ctx.fillStyle = cor;
    roundRect(ctx, x + 10, y + 12, 28, 28, 6);
    ctx.fillStyle    = '#fff';
    ctx.font         = 'bold 15px Arial';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letras[i], x + 24, y + 26);

    // Texto opcao
    ctx.fillStyle    = '#e5e7eb';
    ctx.font         = '14px Arial';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    const texto = op.replace(/^[A-D]\)\s*/, '').substring(0, 28);
    ctx.fillText(texto, x + 46, y + 26);
  });

  // Salva
  const nome = `quiz_${Date.now()}.png`;
  fs.writeFileSync(path.join(__dirname, '../../uploads', nome), canvas.toBuffer('image/png'));
  return nome;
}

// ─── GERA IMAGEM DE RESULTADO ────────────────────────────────────────────────
function gerarImagemResultado({ correto, nomeUsuario, nomeGrupo, explicacao, resposta, placarAtual }) {
  const W = 600, H = 380;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  const corPrincipal = correto ? '#22C55E' : '#EF4444';

  // Fundo
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = corPrincipal;
  ctx.fillRect(0, 0, W, 5);

  // Header grupo
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(0, 5, W, 44);
  ctx.fillStyle = '#9ca3af';
  ctx.font      = '15px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(nomeGrupo.substring(0, 40), W / 2, 27);

  // Icone resultado (circulo)
  ctx.strokeStyle = corPrincipal;
  ctx.lineWidth   = 4;
  ctx.beginPath(); ctx.arc(W / 2, 105, 36, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle    = corPrincipal;
  ctx.font         = 'bold 32px Arial';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(correto ? '+' : '-', W / 2, 105);

  // Titulo
  ctx.fillStyle    = corPrincipal;
  ctx.font         = 'bold 26px Arial';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(correto ? 'CORRETO!' : 'ERROU!', W / 2, 165);

  // Nome usuario
  ctx.fillStyle = '#9ca3af';
  ctx.font      = '15px Arial';
  ctx.fillText(nomeUsuario.substring(0, 30), W / 2, 192);

  // Resposta correta
  ctx.fillStyle = '#f3f4f6';
  ctx.font      = 'bold 15px Arial';
  ctx.fillText(`Resposta: ${resposta}`, W / 2, 225);

  // Explicacao
  ctx.fillStyle = '#6b7280';
  ctx.font      = '13px Arial';
  wrapText(ctx, explicacao, W / 2, 250, W - 80, 20);

  // Placar
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  roundRect(ctx, 30, 300, W - 60, 58, 12);
  ctx.fillStyle    = '#FF6B00';
  ctx.font         = 'bold 13px Arial';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PLACAR', W / 2, 316);

  const top = Object.values(placarAtual)
    .sort((a, b) => b.acertos - a.acertos)
    .slice(0, 3);
  const placarTexto = top.map((u, i) =>
    `${['1o','2o','3o'][i]} ${u.nome.substring(0,10)} ${u.acertos}ac ${u.erros}er`
  ).join('   ');
  ctx.fillStyle = '#d1d5db';
  ctx.font      = '12px Arial';
  ctx.fillText(placarTexto || 'Sem pontos ainda', W / 2, 338);

  const nome = `quiz_res_${Date.now()}.png`;
  fs.writeFileSync(path.join(__dirname, '../../uploads', nome), canvas.toBuffer('image/png'));
  return nome;
}

// ─── GERA IMAGEM DE PLACAR ────────────────────────────────────────────────────
function gerarImagemPlacar({ placarAtual, nomeGrupo }) {
  const W = 600;
  const lista = Object.values(placarAtual).sort((a, b) => b.acertos - a.acertos).slice(0, 8);
  const H = Math.max(300, 130 + lista.length * 60 + 20);
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#FF6B00';
  ctx.fillRect(0, 0, W, 5);

  // Header
  ctx.fillStyle = 'rgba(255,107,0,0.1)';
  ctx.fillRect(0, 5, W, 50);
  ctx.fillStyle    = '#FF6B00';
  ctx.font         = 'bold 20px Arial';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PLACAR DO QUIZ', W / 2, 30);
  ctx.fillStyle = '#6b7280';
  ctx.font      = '13px Arial';
  ctx.fillText(nomeGrupo.substring(0, 40), W / 2, 48);

  if (lista.length === 0) {
    ctx.fillStyle    = '#6b7280';
    ctx.font         = '18px Arial';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Nenhum ponto ainda! Use /quiz', W / 2, H / 2);
  } else {
    const medals = ['#FFD700', '#C0C0C0', '#CD7F32'];
    lista.forEach((u, i) => {
      const y   = 80 + i * 60;
      const cor = medals[i] || '#374151';

      ctx.fillStyle = i < 3 ? `${cor}22` : 'rgba(255,255,255,0.03)';
      roundRect(ctx, 20, y, W - 40, 50, 10);

      // Posicao
      ctx.fillStyle    = i < 3 ? cor : '#6b7280';
      ctx.font         = 'bold 20px Arial';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${i + 1}`, 52, y + 25);

      // Nome
      ctx.fillStyle = '#f9fafb';
      ctx.font      = 'bold 16px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(u.nome.substring(0, 20), 80, y + 18);

      // Stats
      ctx.fillStyle = '#6b7280';
      ctx.font      = '13px Arial';
      ctx.fillText(`${u.acertos} acertos  ${u.erros} erros`, 80, y + 38);

      // Pontos
      const pts = u.acertos - u.erros;
      ctx.fillStyle    = pts >= 0 ? '#22C55E' : '#EF4444';
      ctx.font         = 'bold 18px Arial';
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${pts > 0 ? '+' : ''}${pts} pts`, W - 30, y + 25);
    });
  }

  const nome = `placar_${Date.now()}.png`;
  fs.writeFileSync(path.join(__dirname, '../../uploads', nome), canvas.toBuffer('image/png'));
  return nome;
}

// ─── HELPERS CANVAS ───────────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function roundRectStroke(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.stroke();
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  let ly   = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, ly);
      line = word;
      ly  += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, ly);
}

// ─── LOGICA DO QUIZ ───────────────────────────────────────────────────────────
function getPlacar(grupoId) { return placar[grupoId] || {}; }

function addAcerto(grupoId, userId, nome) {
  if (!placar[grupoId]) placar[grupoId] = {};
  if (!placar[grupoId][userId]) placar[grupoId][userId] = { nome, acertos: 0, erros: 0 };
  placar[grupoId][userId].acertos++;
  placar[grupoId][userId].nome = nome;
}

function addErro(grupoId, userId, nome) {
  if (!placar[grupoId]) placar[grupoId] = {};
  if (!placar[grupoId][userId]) placar[grupoId][userId] = { nome, acertos: 0, erros: 0 };
  placar[grupoId][userId].erros++;
  placar[grupoId][userId].nome = nome;
}

async function enviarPergunta(grupoId, pergunta, nomeUsuario, nomeGrupo, botDados, enviarMensagemBot, segundos = 20) {
  const nomeArq = gerarImagemPergunta({ pergunta, nomeUsuario, nomeGrupo, numero: 1, total: PERGS.length, segundos });
  await enviarMensagemBot(grupoId,
    `${nomeUsuario} iniciou um quiz!\nResponda: A, B, C ou D (${segundos}s)`,
    botDados,
    { fotoUrl: `${BASE_URL}/uploads/${nomeArq}` }
  );
}

async function iniciarQuiz({ grupoId, autorNome, autorId, nomeGrupo, botDados, replyTo, enviarMensagemBot }) {
  if (quizAtivo[grupoId]) {
    const q = quizAtivo[grupoId];
    const nomeArq = gerarImagemPergunta({ pergunta: q.pergunta, nomeUsuario: q.iniciadorNome, nomeGrupo, numero: 1, total: PERGS.length, segundos: 20 });
    await enviarMensagemBot(grupoId,
      'Quiz ja ativo! Responda: A, B, C ou D',
      botDados,
      { replyTo, fotoUrl: `${BASE_URL}/uploads/${nomeArq}` }
    );
    return;
  }

  const pergunta = aleatorio(PERGS);

  // Cronometro de 20s
  const timer = setTimeout(async () => {
    if (!quizAtivo[grupoId]) return;
    const q = quizAtivo[grupoId];
    delete quizAtivo[grupoId];
    await enviarMensagemBot(grupoId,
      `Tempo esgotado! A resposta era ${q.pergunta.r}\n${q.pergunta.e}`,
      botDados
    );
  }, 20000);

  quizAtivo[grupoId] = { pergunta, timer, iniciadorId: autorId, iniciadorNome: autorNome };

  const nomeArq = gerarImagemPergunta({ pergunta, nomeUsuario: autorNome, nomeGrupo, numero: 1, total: PERGS.length, segundos: 20 });
  await enviarMensagemBot(grupoId,
    `${autorNome} iniciou um quiz!\nResponda: A, B, C ou D (20s)`,
    botDados,
    { replyTo, fotoUrl: `${BASE_URL}/uploads/${nomeArq}` }
  );
}

async function verificarResposta({ grupoId, texto, autorNome, userId, nomeGrupo, botDados, enviarMensagemBot }) {
  const quiz = quizAtivo[grupoId];
  if (!quiz) return false;

  const letraMatch = texto.trim().toUpperCase().match(/\b([ABCD])\b/);
  if (!letraMatch) return false;

  const resposta = letraMatch[1];

  // Cancela cronometro
  clearTimeout(quiz.timer);
  delete quizAtivo[grupoId];

  const correto = resposta === quiz.pergunta.r;
  if (correto) addAcerto(grupoId, userId, autorNome);
  else         addErro(grupoId, userId, autorNome);

  const nomeArq = gerarImagemResultado({
    correto,
    nomeUsuario:  autorNome,
    nomeGrupo,
    explicacao:   quiz.pergunta.e,
    resposta:     quiz.pergunta.r,
    placarAtual:  getPlacar(grupoId),
  });

  await enviarMensagemBot(grupoId,
    correto
      ? `${autorNome} acertou! +1 ponto`
      : `${autorNome} errou! -1 ponto. Era ${quiz.pergunta.r}`,
    botDados,
    { fotoUrl: `${BASE_URL}/uploads/${nomeArq}` }
  );
  return true;
}

async function mostrarPlacar({ grupoId, nomeGrupo, botDados, replyTo, enviarMensagemBot }) {
  const nomeArq = gerarImagemPlacar({ placarAtual: getPlacar(grupoId), nomeGrupo });
  await enviarMensagemBot(grupoId,
    'Placar do grupo:',
    botDados,
    { replyTo, fotoUrl: `${BASE_URL}/uploads/${nomeArq}` }
  );
}

module.exports = { iniciarQuiz, verificarResposta, mostrarPlacar, quizAtivo };