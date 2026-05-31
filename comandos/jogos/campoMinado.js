// ═══════════════════════════════════════
// JOGOS/CAMPOMINADO.JS — Campo Minado 5x5 com Canvas
// Uso: /minas  /minas A1 (para revelar)
// ═══════════════════════════════════════

const { createCanvas, registerFont } = require('canvas');
const fs   = require('fs');
const path = require('path');

const jogos = {};
const COLS  = ['A','B','C','D','E'];

const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : 'https://boreschat-bots-production.up.railway.app';

try {
  const fd = path.join(__dirname, '../../fonts');
  registerFont(path.join(fd, 'Regular.ttf'), { family: 'BF', weight: 'normal' });
  registerFont(path.join(fd, 'Bold.ttf'),    { family: 'BF', weight: 'bold'   });
} catch (_) {}

// ─── LOGICA ──────────────────────────────────────────────────────────────────
function gerarMinas(excluir) {
  const minas = new Set();
  while (minas.size < 5) {
    const pos = Math.floor(Math.random() * 25);
    if (pos !== excluir) minas.add(pos);
  }
  return minas;
}

function posParaIdx(pos) {
  const col = pos[0].toUpperCase();
  const row = parseInt(pos[1]) - 1;
  const c   = COLS.indexOf(col);
  if (c === -1 || isNaN(row) || row < 0 || row > 4) return -1;
  return row * 5 + c;
}

function contarVizinhos(minas, idx) {
  const row = Math.floor(idx / 5);
  const col = idx % 5;
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr, c = col + dc;
      if (r >= 0 && r < 5 && c >= 0 && c < 5 && minas.has(r * 5 + c)) count++;
    }
  }
  return count;
}

// ─── CANVAS ──────────────────────────────────────────────────────────────────
function gerarImagem(revelado, minas, jogadorNome, nomeGrupo, gameOver = false, ganhou = false) {
  const PAD    = 20;
  const CELL   = 72;
  const TOP    = 90;
  const W      = PAD * 2 + CELL * 5;
  const H      = TOP + PAD * 2 + CELL * 5 + 50;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // Fundo
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, W, H);

  // Header
  ctx.fillStyle = gameOver ? (ganhou ? '#22C55E' : '#EF4444') : '#FF6B00';
  ctx.fillRect(0, 0, W, 6);
  ctx.fillStyle = '#161616';
  ctx.fillRect(0, 6, W, TOP - 6);

  // Titulo
  ctx.fillStyle    = gameOver ? (ganhou ? '#22C55E' : '#EF4444') : '#FF6B00';
  ctx.font         = `bold 18px BF, Arial`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CAMPO MINADO 5x5', W / 2, 28);

  // Info
  ctx.fillStyle = '#888';
  ctx.font      = `12px BF, Arial`;
  ctx.fillText(`${nomeGrupo} | ${jogadorNome} | ${revelado.size}/20 celulas`, W / 2, 52);

  // Status
  const statusTxt = gameOver
    ? (ganhou ? 'VOCE VENCEU!' : 'BOOM! GAME OVER!')
    : `5 minas escondidas — Boa sorte!`;
  ctx.fillStyle = gameOver ? (ganhou ? '#22C55E' : '#EF4444') : '#555';
  ctx.font      = `bold 13px BF, Arial`;
  ctx.fillText(statusTxt, W / 2, 74);

  // Labels colunas
  ctx.fillStyle = '#444';
  ctx.font      = `bold 13px BF, Arial`;
  COLS.forEach((c, i) => {
    ctx.fillText(c, PAD + i * CELL + CELL / 2, TOP - 8);
  });

  // Celulas
  for (let r = 0; r < 5; r++) {
    // Label linha
    ctx.fillStyle    = '#444';
    ctx.font         = `bold 13px BF, Arial`;
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(r + 1), PAD - 6, TOP + r * CELL + CELL / 2);

    for (let c = 0; c < 5; c++) {
      const idx = r * 5 + c;
      const x   = PAD + c * CELL;
      const y   = TOP + r * CELL;
      const cx  = x + CELL / 2;
      const cy  = y + CELL / 2;

      // Fundo da celula
      const eMina     = minas && minas.has(idx);
      const eRevelada = revelado.has(idx);

      if (gameOver && eMina) {
        // Mina explodida — fundo vermelho
        ctx.fillStyle = ganhou ? '#1a3a1a' : '#3a1a1a';
        ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
        ctx.strokeStyle = '#EF4444';
        ctx.lineWidth   = 1;
        ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
        // Desenha mina (circulo com espinhos)
        ctx.fillStyle = '#EF4444';
        ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#EF4444';
        ctx.lineWidth   = 3;
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(ang) * 13, cy + Math.sin(ang) * 13);
          ctx.lineTo(cx + Math.cos(ang) * 20, cy + Math.sin(ang) * 20);
          ctx.stroke();
        }
      } else if (eRevelada) {
        // Celula revelada
        const viz = minas ? contarVizinhos(minas, idx) : 0;
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
        ctx.strokeStyle = '#2a2a2a';
        ctx.lineWidth   = 1;
        ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
        if (viz > 0) {
          const cores = ['','#3B82F6','#22C55E','#EF4444','#A855F7','#F59E0B','#14B8A6','#EC4899','#FF6B00'];
          ctx.fillStyle    = cores[viz] || '#fff';
          ctx.font         = `bold 22px BF, Arial`;
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(viz), cx, cy);
        } else {
          // Ponto para celula vazia
          ctx.fillStyle = '#333';
          ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        // Celula fechada
        ctx.fillStyle = '#1f1f1f';
        ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
        ctx.strokeStyle = '#333';
        ctx.lineWidth   = 1;
        ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
        // Quadrado interno
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(x + 8, y + 8, CELL - 16, CELL - 16);
      }
    }
  }

  // Rodape
  ctx.fillStyle    = '#222';
  ctx.fillRect(0, H - 40, W, 40);
  ctx.fillStyle    = '#555';
  ctx.font         = `12px BF, Arial`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  if (!gameOver) {
    ctx.fillText('Use /minas [LETRA][NUMERO] para revelar — Ex: /minas B3', W / 2, H - 20);
  } else {
    ctx.fillText(ganhou ? 'Parabens! Use /minas para jogar de novo.' : 'Use /minas para jogar de novo.', W / 2, H - 20);
  }

  const nome = `minas_${Date.now()}.png`;
  fs.writeFileSync(path.join(__dirname, '../../uploads', nome), canvas.toBuffer('image/png'));
  return nome;
}

// ─── HANDLERS ────────────────────────────────────────────────────────────────
async function iniciarJogo({ grupoId, autorId, autorNome, nomeGrupo, botDados, replyTo, enviarMensagemBot }) {
  jogos[grupoId] = {
    revelado:    new Set(),
    minas:       null,
    jogadorId:   autorId,
    jogadorNome: autorNome,
  };

  const nomeArq = gerarImagem(new Set(), new Set(), autorNome, nomeGrupo || grupoId);
  await enviarMensagemBot(grupoId,
    `${autorNome} iniciou o Campo Minado!`,
    botDados,
    { replyTo, fotoUrl: `${BASE_URL}/uploads/${nomeArq}` }
  );
}

async function revelar({ grupoId, args, autorId, autorNome, nomeGrupo, botDados, replyTo, enviarMensagemBot }) {
  const jogo = jogos[grupoId];
  if (!jogo) return false;
  if (!args || args.length < 2) return false;

  const idx = posParaIdx(args.trim());
  if (idx === -1) {
    await enviarMensagemBot(grupoId, 'Posicao invalida! Use A1 ate E5. Ex: /minas B3', botDados, { replyTo });
    return true;
  }

  if (jogo.revelado.has(idx)) {
    await enviarMensagemBot(grupoId, 'Celula ja revelada! Escolha outra.', botDados, { replyTo });
    return true;
  }

  if (!jogo.minas) jogo.minas = gerarMinas(idx);

  if (jogo.minas.has(idx)) {
    const nomeArq = gerarImagem(jogo.revelado, jogo.minas, jogo.jogadorNome, nomeGrupo || grupoId, true, false);
    delete jogos[grupoId];
    await enviarMensagemBot(grupoId,
      `BOOM! ${autorNome} pisou em uma mina! Game over!`,
      botDados,
      { fotoUrl: `${BASE_URL}/uploads/${nomeArq}` }
    );
    return true;
  }

  jogo.revelado.add(idx);

  if (jogo.revelado.size >= 20) {
    const nomeArq = gerarImagem(jogo.revelado, jogo.minas, jogo.jogadorNome, nomeGrupo || grupoId, true, true);
    delete jogos[grupoId];
    await enviarMensagemBot(grupoId,
      `${autorNome} VENCEU o Campo Minado!`,
      botDados,
      { fotoUrl: `${BASE_URL}/uploads/${nomeArq}` }
    );
    return true;
  }

  const nomeArq = gerarImagem(jogo.revelado, jogo.minas, jogo.jogadorNome, nomeGrupo || grupoId);
  const viz     = contarVizinhos(jogo.minas, idx);
  const cel     = COLS[idx % 5] + (Math.floor(idx / 5) + 1);
  await enviarMensagemBot(grupoId,
    `${cel}: ${viz === 0 ? 'Seguro!' : viz + ' mina(s) proxima(s)'} | ${jogo.revelado.size}/20`,
    botDados,
    { fotoUrl: `${BASE_URL}/uploads/${nomeArq}` }
  );
  return true;
}

module.exports = { iniciarJogo, revelar, jogos };