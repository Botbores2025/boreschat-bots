// ═══════════════════════════════════════════════════════════════
// JOGOS/QUIZ.JS — Quiz completo com canvas
// Uso: /quiz  /placar
// ═══════════════════════════════════════════════════════════════

const { createCanvas, registerFont } = require('canvas');
const fs    = require('fs');
const path  = require('path');
const PERGS = require('./perguntas.json');

// ─── BASE URL ────────────────────────────────────────────────────────────────
const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : 'https://boreschat-bots-production.up.railway.app';

// ─── REGISTRA FONTES ─────────────────────────────────────────────────────────
// BUG FIX: Railway nao tem fontes — registra Montserrat local
try {
  const fontsDir = path.join(__dirname, '../../fonts');
  registerFont(path.join(fontsDir, 'Regular.ttf'), { family: 'Quiz', weight: 'normal' });
  registerFont(path.join(fontsDir, 'Bold.ttf'),    { family: 'Quiz', weight: 'bold'   });
  console.log('Fontes Quiz registradas!');
} catch (e) {
  console.warn('Fontes nao encontradas, usando fallback:', e.message);
}

// Atalhos de fonte
const F_BOLD = (size) => `bold ${size}px Quiz, Arial, sans-serif`;
const F_REG  = (size) => `${size}px Quiz, Arial, sans-serif`;

// ─── ESTADO ──────────────────────────────────────────────────────────────────
const quizAtivo      = {}; // grupoId -> { pergunta, timer, ... }
const aguardandoDecisao = {}; // grupoId -> { userId, nome } aguardando A ou B apos erro
const placar         = {};

function aleatorio(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ─── HELPERS PLACAR ───────────────────────────────────────────────────────────
function getPlacar(grupoId)              { return placar[grupoId] || {}; }
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

// ─── LIMPA TEXTO (remove acentos e chars especiais para o canvas) ─────────────
// BUG FIX 1: canvas no servidor nao tem fontes com suporte a UTF-8 completo
// Solucao: normaliza o texto removendo acentos antes de desenhar
function limparTexto(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^\x00-\x7F]/g, '?');  // substitui qualquer char nao-ASCII por ?
}

// ─── HELPER: TEXTO COM QUEBRA DE LINHA ───────────────────────────────────────
function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = limparTexto(text).split(' ');
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
  return ly; // retorna Y final
}

// ─── HELPER: ROUNDRECT ───────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r, fill = true, stroke = false) {
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
  if (fill)   ctx.fill();
  if (stroke) ctx.stroke();
}

// ─── SALVA PNG ────────────────────────────────────────────────────────────────
function salvar(canvas, prefixo) {
  const nome     = `${prefixo}_${Date.now()}.png`;
  const filePath = path.join(__dirname, '../../uploads', nome);
  fs.writeFileSync(filePath, canvas.toBuffer('image/png'));
  return nome;
}

// ═══════════════════════════════════════════════════════════════
// IMAGEM DA PERGUNTA
// ═══════════════════════════════════════════════════════════════
function gerarImagemPergunta({ pergunta, nomeUsuario, nomeGrupo, segundos }) {
  // BUG FIX 2: dimensoes fixas e bem calculadas
  const W       = 600;
  const PADDING = 24;
  const canvas  = createCanvas(W, 440);
  const ctx     = canvas.getContext('2d');

  // ── Fundo ──────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, W, 440);

  // ── Faixa superior laranja ─────────────────────────────────────────────────
  ctx.fillStyle = '#FF6B00';
  ctx.fillRect(0, 0, W, 6);

  // ── Header: nome do grupo ──────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,107,0,0.1)';
  ctx.fillRect(0, 6, W, 40);
  ctx.fillStyle    = '#FF6B00';
  ctx.font = F_BOLD(15);
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(limparTexto(nomeGrupo).substring(0, 42), W / 2, 26);

  // ── Badge usuario ──────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,107,0,0.15)';
  roundRect(ctx, PADDING, 56, 180, 28, 7);
  ctx.fillStyle    = '#FF6B00';
  ctx.font = F_BOLD(13);
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(limparTexto(nomeUsuario).substring(0, 20), PADDING + 10, 70);

  // ── Cronometro (circulo) ───────────────────────────────────────────────────
  const timerX = W - 50;
  const timerY = 70;
  const raio   = 22;
  const pct    = segundos / 20;
  const corTimer = segundos > 10 ? '#22C55E' : segundos > 5 ? '#FFC107' : '#EF4444';

  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth   = 5;
  ctx.beginPath(); ctx.arc(timerX, timerY, raio, 0, Math.PI * 2); ctx.stroke();

  ctx.strokeStyle = corTimer;
  ctx.lineWidth   = 5;
  ctx.beginPath();
  ctx.arc(timerX, timerY, raio, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle    = '#fff';
  ctx.font = F_BOLD(16);
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(segundos), timerX, timerY);

  // ── Linha divisoria ────────────────────────────────────────────────────────
  ctx.strokeStyle = '#222';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(PADDING, 100); ctx.lineTo(W - PADDING, 100); ctx.stroke();

  // ── Pergunta ───────────────────────────────────────────────────────────────
  ctx.fillStyle    = '#f0f0f0';
  ctx.font = F_BOLD(18);
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  wrapText(ctx, pergunta.p, W / 2, 130, W - PADDING * 2, 26);

  // ── Opcoes (2x2 grid) ─────────────────────────────────────────────────────
  const CORES  = { A: '#3B82F6', B: '#22C55E', C: '#F59E0B', D: '#EF4444' };
  const LETRAS = ['A', 'B', 'C', 'D'];
  const colW   = (W - PADDING * 2 - 12) / 2;
  const rowH   = 52;

  pergunta.ops.forEach((op, i) => {
    const col  = i % 2;
    const row  = Math.floor(i / 2);
    const x    = PADDING + col * (colW + 12);
    const y    = 200 + row * (rowH + 10);
    const cor  = CORES[LETRAS[i]];
    const letra = LETRAS[i];

    // Fundo da opcao
    ctx.fillStyle = `${cor}18`;
    roundRect(ctx, x, y, colW, rowH, 10);
    ctx.strokeStyle = `${cor}55`;
    ctx.lineWidth   = 1.5;
    roundRect(ctx, x, y, colW, rowH, 10, false, true);

    // Badge da letra
    ctx.fillStyle = cor;
    roundRect(ctx, x + 8, y + 12, 28, 28, 6);
    ctx.fillStyle    = '#fff';
    ctx.font = F_BOLD(14);
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letra, x + 22, y + 26);

    // Texto da opcao (sem a letra prefix)
    const textoOp = limparTexto(op.replace(/^[A-D]\)\s*/, '')).substring(0, 26);
    ctx.fillStyle    = '#e0e0e0';
    ctx.font = F_REG(13);
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(textoOp, x + 44, y + 26);
  });

  // ── Instrucao ──────────────────────────────────────────────────────────────
  ctx.fillStyle    = '#555';
  ctx.font = F_REG(12);
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Digite A, B, C ou D para responder', W / 2, 428);

  return salvar(canvas, 'quiz_perg');
}

// ═══════════════════════════════════════════════════════════════
// IMAGEM DE RESULTADO
// ═══════════════════════════════════════════════════════════════
function gerarImagemResultado({ correto, nomeUsuario, nomeGrupo, explicacao, respostaCorreta, placarAtual }) {
  const W      = 600;
  const H      = 360;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');
  const cor    = correto ? '#22C55E' : '#EF4444';

  // Fundo
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = cor;
  ctx.fillRect(0, 0, W, 6);

  // Header grupo
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(0, 6, W, 38);
  ctx.fillStyle    = '#888';
  ctx.font = F_REG(13);
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(limparTexto(nomeGrupo).substring(0, 42), W / 2, 25);

  // Circulo resultado
  ctx.strokeStyle = cor;
  ctx.lineWidth   = 4;
  ctx.beginPath(); ctx.arc(W / 2, 95, 34, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle    = cor;
  ctx.font = F_BOLD(30);
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(correto ? '+1' : '-1', W / 2, 95);

  // Titulo
  ctx.fillStyle    = cor;
  ctx.font = F_BOLD(24);
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(correto ? 'CORRETO!' : 'ERROU!', W / 2, 152);

  // Nome usuario
  ctx.fillStyle = '#999';
  ctx.font = F_REG(14);
  ctx.fillText(limparTexto(nomeUsuario).substring(0, 30), W / 2, 174);

  // Resposta correta
  ctx.fillStyle = '#ddd';
  ctx.font = F_BOLD(14);
  ctx.fillText(`Resposta correta: ${respostaCorreta}`, W / 2, 200);

  // Explicacao
  ctx.fillStyle    = '#777';
  ctx.font = F_REG(13);
  ctx.textBaseline = 'alphabetic';
  wrapText(ctx, explicacao, W / 2, 225, W - 80, 20);

  // Placar mini
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  roundRect(ctx, 24, 268, W - 48, 72, 12);

  ctx.fillStyle    = '#FF6B00';
  ctx.font = F_BOLD(12);
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PLACAR', W / 2, 284);

  const top = Object.values(placarAtual)
    .sort((a, b) => (b.acertos - b.erros) - (a.acertos - a.erros))
    .slice(0, 4);

  const itemW = (W - 48) / Math.max(top.length, 1);
  top.forEach((u, i) => {
    const cx = 24 + i * itemW + itemW / 2;
    ctx.fillStyle    = '#ddd';
    ctx.font = F_BOLD(12);
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(limparTexto(u.nome).substring(0, 10), cx, 305);
    const pts = u.acertos - u.erros;
    ctx.fillStyle = pts >= 0 ? '#22C55E' : '#EF4444';
    ctx.font = F_BOLD(14);
    ctx.fillText(`${pts > 0 ? '+' : ''}${pts}`, cx, 323);
  });

  return salvar(canvas, 'quiz_res');
}

// ═══════════════════════════════════════════════════════════════
// IMAGEM DO PLACAR COMPLETO
// ═══════════════════════════════════════════════════════════════
function gerarImagemPlacar({ placarAtual, nomeGrupo }) {
  const lista = Object.values(placarAtual)
    .sort((a, b) => (b.acertos - b.erros) - (a.acertos - a.erros))
    .slice(0, 8);

  const W      = 600;
  const H      = Math.max(300, 120 + lista.length * 58 + 20);
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#FF6B00';
  ctx.fillRect(0, 0, W, 6);

  // Header
  ctx.fillStyle = 'rgba(255,107,0,0.1)';
  ctx.fillRect(0, 6, W, 48);
  ctx.fillStyle    = '#FF6B00';
  ctx.font = F_BOLD(18);
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PLACAR DO QUIZ', W / 2, 24);
  ctx.fillStyle = '#777';
  ctx.font = F_REG(13);
  ctx.fillText(limparTexto(nomeGrupo).substring(0, 42), W / 2, 44);

  if (lista.length === 0) {
    ctx.fillStyle    = '#555';
    ctx.font = F_REG(16);
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Nenhum ponto ainda! Use /quiz', W / 2, H / 2);
  } else {
    const medals   = ['#FFD700', '#C0C0C0', '#CD7F32'];
    const PADDING  = 20;
    lista.forEach((u, i) => {
      const y   = 72 + i * 58;
      const cor = medals[i] || '#374151';

      ctx.fillStyle = i < 3 ? `${cor}18` : 'rgba(255,255,255,0.03)';
      roundRect(ctx, PADDING, y, W - PADDING * 2, 48, 10);

      // Posicao
      ctx.fillStyle    = i < 3 ? cor : '#555';
      ctx.font = F_BOLD(20);
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${i + 1}`, PADDING + 24, y + 24);

      // Nome
      ctx.fillStyle    = '#f0f0f0';
      ctx.font = F_BOLD(15);
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(limparTexto(u.nome).substring(0, 20), PADDING + 52, y + 16);

      // Acertos e erros
      ctx.fillStyle = '#777';
      ctx.font = F_REG(12);
      ctx.fillText(`${u.acertos} acertos   ${u.erros} erros`, PADDING + 52, y + 34);

      // Pontos
      const pts = u.acertos - u.erros;
      ctx.fillStyle    = pts >= 0 ? '#22C55E' : '#EF4444';
      ctx.font = F_BOLD(18);
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${pts >= 0 ? '+' : ''}${pts} pts`, W - PADDING - 10, y + 24);
    });
  }

  return salvar(canvas, 'placar');
}

// ═══════════════════════════════════════════════════════════════
// LOGICA DO QUIZ
// ═══════════════════════════════════════════════════════════════

async function iniciarQuiz({ grupoId, autorNome, autorId, nomeGrupo, botDados, replyTo, enviarMensagemBot }) {
  if (quizAtivo[grupoId]) {
    const q       = quizAtivo[grupoId];
    const nomeArq = gerarImagemPergunta({ pergunta: q.pergunta, nomeUsuario: q.iniciadorNome, nomeGrupo, segundos: 20 });
    await enviarMensagemBot(grupoId,
      'Quiz ja ativo! Responda A, B, C ou D',
      botDados,
      { replyTo, fotoUrl: `${BASE_URL}/uploads/${nomeArq}` }
    );
    return;
  }

  const pergunta = aleatorio(PERGS);

  // Cronometro 20s — se ninguem responder, expira
  const timer = setTimeout(async () => {
    if (!quizAtivo[grupoId]) return;
    const q = quizAtivo[grupoId];
    delete quizAtivo[grupoId];
    await enviarMensagemBot(grupoId,
      `Tempo esgotado! A resposta era ${q.pergunta.r} — ${q.pergunta.e}`,
      botDados
    );
  }, 20000);

  quizAtivo[grupoId] = { pergunta, timer, iniciadorId: autorId, iniciadorNome: autorNome };

  const nomeArq = gerarImagemPergunta({ pergunta, nomeUsuario: autorNome, nomeGrupo, segundos: 20 });
  await enviarMensagemBot(grupoId,
    `${autorNome} iniciou um quiz! Responda A, B, C ou D (20s)`,
    botDados,
    { replyTo, fotoUrl: `${BASE_URL}/uploads/${nomeArq}` }
  );
}

async function verificarResposta({ grupoId, texto, autorNome, userId, nomeGrupo, botDados, enviarMensagemBot }) {
  // ─── Se esta aguardando decisao apos erro (A=continuar B=nova partida) ───
  if (aguardandoDecisao[grupoId]) {
    const decisaoMatch = texto.trim().toUpperCase().match(/\b([AB])\b/);
    if (!decisaoMatch) return false;
    const decisao = decisaoMatch[1];
    const info    = aguardandoDecisao[grupoId];
    delete aguardandoDecisao[grupoId];

    if (decisao === 'A') {
      // Continua de onde parou
      const pergunta = aleatorio(PERGS);
      const timer = setTimeout(async () => {
        if (!quizAtivo[grupoId]) return;
        const q = quizAtivo[grupoId];
        delete quizAtivo[grupoId];
        await enviarMensagemBot(grupoId,
          `Tempo esgotado! A resposta era ${q.pergunta.r} — ${q.pergunta.e}`,
          botDados
        );
      }, 20000);
      quizAtivo[grupoId] = { pergunta, timer, iniciadorId: info.userId, iniciadorNome: info.nome };
      const nomeArq = gerarImagemPergunta({ pergunta, nomeUsuario: info.nome, nomeGrupo, segundos: 20 });
      await enviarMensagemBot(grupoId,
        `Continuando! Responda A, B, C ou D (20s)`,
        botDados,
        { fotoUrl: `${BASE_URL}/uploads/${nomeArq}` }
      );
    } else {
      // Nova partida — zera placar do grupo
      delete placar[grupoId];
      await enviarMensagemBot(grupoId,
        `Nova partida iniciada! Use /quiz para comecar.`,
        botDados
      );
    }
    return true;
  }

  // ─── Resposta normal do quiz ─────────────────────────────────────────────
  const quiz = quizAtivo[grupoId];
  if (!quiz) return false;

  const letraMatch = texto.trim().toUpperCase().match(/\b([ABCD])\b/);
  if (!letraMatch) return false;

  const resposta = letraMatch[1];
  clearTimeout(quiz.timer);
  delete quizAtivo[grupoId];

  const correto = resposta === quiz.pergunta.r;
  if (correto) addAcerto(grupoId, userId, autorNome);
  else         addErro(grupoId, userId, autorNome);

  const nomeArq = gerarImagemResultado({
    correto,
    nomeUsuario:     autorNome,
    nomeGrupo,
    explicacao:      quiz.pergunta.e,
    respostaCorreta: quiz.pergunta.r,
    placarAtual:     getPlacar(grupoId),
  });

  await enviarMensagemBot(grupoId,
    correto
      ? `${autorNome} acertou! +1 ponto`
      : `${autorNome} errou! -1 ponto. Era ${quiz.pergunta.r}`,
    botDados,
    { fotoUrl: `${BASE_URL}/uploads/${nomeArq}` }
  );

  if (correto) {
    // Acertou — envia proxima pergunta automaticamente apos 2s
    await new Promise(r => setTimeout(r, 2000));
    const proxima = aleatorio(PERGS);
    const timer = setTimeout(async () => {
      if (!quizAtivo[grupoId]) return;
      const q = quizAtivo[grupoId];
      delete quizAtivo[grupoId];
      await enviarMensagemBot(grupoId,
        `Tempo esgotado! A resposta era ${q.pergunta.r} — ${q.pergunta.e}`,
        botDados
      );
    }, 20000);
    quizAtivo[grupoId] = { pergunta: proxima, timer, iniciadorId: userId, iniciadorNome: autorNome };
    const nomeProx = gerarImagemPergunta({ pergunta: proxima, nomeUsuario: autorNome, nomeGrupo, segundos: 20 });
    await enviarMensagemBot(grupoId,
      `Proxima pergunta! Responda A, B, C ou D (20s)`,
      botDados,
      { fotoUrl: `${BASE_URL}/uploads/${nomeProx}` }
    );
  } else {
    // Errou — pergunta se quer continuar ou nova partida com botoes
    aguardandoDecisao[grupoId] = { userId, nome: autorNome };
    const botoes = [
      { label: 'A) Continuar',     comando: 'A' },
      { label: 'B) Nova Partida',  comando: 'B' },
    ];
    await enviarMensagemBot(grupoId,
      `O que deseja fazer?`,
      botDados,
      { botoes }
    );
  }

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