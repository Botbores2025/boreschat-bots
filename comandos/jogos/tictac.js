// ═══════════════════════════════════════
// JOGOS/TICTAC.JS — Jogo da Velha com imagem PNG
// Uso: /velha @nome  /velha 1-9
// ═══════════════════════════════════════

const { createCanvas } = require('canvas');
const fs   = require('fs');
const path = require('path');

const partidas = {};

const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : 'https://boreschat-bots-production.up.railway.app';

// ─── GERA IMAGEM PNG ─────────────────────────────────────────────────────────
function gerarImagem(tabuleiro, vezNome, vezSimbolo, fimJogo = null) {
  const W      = 540;
  const H      = 620;
  const CELL   = 160;
  const startX = (W - CELL * 3) / 2;  // 30
  const startY = 40;

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // ── Fundo ──────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, W, H);

  // ── Borda laranja no tabuleiro ─────────────────────────────────────────────
  ctx.strokeStyle = '#FF6B00';
  ctx.lineWidth   = 3;
  ctx.strokeRect(startX - 2, startY - 2, CELL * 3 + 4, CELL * 3 + 4);

  // ── Grade interna ──────────────────────────────────────────────────────────
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth   = 4;
  for (let i = 1; i < 3; i++) {
    // Vertical
    ctx.beginPath();
    ctx.moveTo(startX + i * CELL, startY);
    ctx.lineTo(startX + i * CELL, startY + CELL * 3);
    ctx.stroke();
    // Horizontal
    ctx.beginPath();
    ctx.moveTo(startX, startY + i * CELL);
    ctx.lineTo(startX + CELL * 3, startY + i * CELL);
    ctx.stroke();
  }

  // ── Peças ──────────────────────────────────────────────────────────────────
  for (let i = 0; i < 9; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cx  = startX + col * CELL + CELL / 2;
    const cy  = startY + row * CELL + CELL / 2;
    const sym = tabuleiro[i];

    if (sym === 'X') {
      // X laranja com linhas arredondadas
      ctx.strokeStyle = '#FF6B00';
      ctx.lineWidth   = 16;
      ctx.lineCap     = 'round';
      const off = 46;
      ctx.beginPath(); ctx.moveTo(cx-off, cy-off); ctx.lineTo(cx+off, cy+off); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx+off, cy-off); ctx.lineTo(cx-off, cy+off); ctx.stroke();
    } else if (sym === 'O') {
      // O azul
      ctx.strokeStyle = '#3B82F6';
      ctx.lineWidth   = 16;
      ctx.lineCap     = 'butt';
      ctx.beginPath();
      ctx.arc(cx, cy, 48, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Número da posição
      ctx.fillStyle    = '#333';
      ctx.font         = 'bold 32px Arial';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), cx, cy);
    }
  }

  // ── Rodapé ─────────────────────────────────────────────────────────────────
  const rodapeY = startY + CELL * 3 + 30;

  // Linha divisória
  ctx.strokeStyle = '#222';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(20, rodapeY - 10);
  ctx.lineTo(W - 20, rodapeY - 10);
  ctx.stroke();

  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  if (fimJogo) {
    if (fimJogo === 'empate') {
      ctx.fillStyle = '#FFC107';
      ctx.font      = 'bold 28px Arial';
      ctx.fillText('EMPATE!', W / 2, rodapeY + 20);
    } else {
      ctx.fillStyle = '#22C55E';
      ctx.font      = 'bold 26px Arial';
      // Limita nome a 20 chars para não quebrar
      const nome = fimJogo.substring(0, 20);
      ctx.fillText(`${nome} VENCEU!`, W / 2, rodapeY + 20);
    }
  } else {
    // Indicador de vez com quadrado colorido
    const corVez = vezSimbolo === 'X' ? '#FF6B00' : '#3B82F6';
    ctx.fillStyle = corVez;
    ctx.fillRect(W / 2 - 110, rodapeY + 6, 18, 18);

    ctx.fillStyle    = '#fff';
    ctx.font         = 'bold 20px Arial';
    ctx.textAlign    = 'left';
    const nomeExibir = (vezNome || '').substring(0, 18);
    ctx.fillText(`Vez de ${nomeExibir} (${vezSimbolo})`, W / 2 - 86, rodapeY + 16);
  }

  // Salva
  const nomeArq  = `velha_${Date.now()}.png`;
  const filePath = path.join(__dirname, '../../uploads', nomeArq);
  fs.writeFileSync(filePath, canvas.toBuffer('image/png'));
  return nomeArq;
}

function novoTabuleiro() { return ['1','2','3','4','5','6','7','8','9']; }

function verificarVencedor(tab) {
  const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,b,c] of wins) {
    if (tab[a]===tab[b] && tab[b]===tab[c] && (tab[a]==='X'||tab[a]==='O')) return tab[a];
  }
  if (tab.every(c => c==='X'||c==='O')) return 'empate';
  return null;
}

// ─── INICIAR PARTIDA ─────────────────────────────────────────────────────────
async function iniciarPartida({ grupoId, args, autorNome, autorId, botDados, replyTo, enviarMensagemBot, db }) {
  if (!args) {
    await enviarMensagemBot(grupoId, '⚠️ Use: /velha @nome\nEx: /velha @Joao', botDados, { replyTo });
    return;
  }

  const busca    = args.replace('@','').toLowerCase().trim();
  const grupoDoc = await db.collection('grupos').doc(grupoId).get();
  const membros  = grupoDoc.data()?.membros || [];

  let oponente = null;
  for (const uid of membros) {
    if (uid === autorId) continue;
    const u = await db.collection('usuarios').doc(uid).get();
    if (u.exists && u.data().nome?.toLowerCase().includes(busca)) {
      oponente = { uid, nome: u.data().nome };
      break;
    }
  }

  if (!oponente) {
    await enviarMensagemBot(grupoId, `❌ Usuario "${args}" nao encontrado.`, botDados, { replyTo });
    return;
  }

  const tab = novoTabuleiro();
  partidas[grupoId] = {
    tabuleiro:  tab,
    vezDe:      autorId,
    jogadores:  { X: autorId, O: oponente.uid },
    nomes:      { [autorId]: autorNome, [oponente.uid]: oponente.nome },
  };

  const nomeArq = gerarImagem(tab, autorNome, 'X');
  await enviarMensagemBot(grupoId,
    `${autorNome} (X) vs ${oponente.nome} (O)\nDigite /velha [1-9] para jogar!`,
    botDados,
    { replyTo, fotoUrl: `${BASE_URL}/uploads/${nomeArq}` }
  );
}

// ─── JOGAR ───────────────────────────────────────────────────────────────────
async function jogar({ grupoId, args, autorId, autorNome, botDados, replyTo, enviarMensagemBot }) {
  const partida = partidas[grupoId];
  if (!partida) return false;

  const pos = parseInt(args);
  if (isNaN(pos) || pos < 1 || pos > 9) return false;

  if (partida.vezDe !== autorId) {
    const nomeVez = partida.nomes[partida.vezDe];
    await enviarMensagemBot(grupoId, `Nao e sua vez! Aguarde ${nomeVez} jogar.`, botDados, { replyTo });
    return true;
  }

  const idx = pos - 1;
  if (partida.tabuleiro[idx]==='X'||partida.tabuleiro[idx]==='O') {
    await enviarMensagemBot(grupoId, 'Posicao ja ocupada! Escolha outra (1-9).', botDados, { replyTo });
    return true;
  }

  const simbolo = partida.jogadores.X === autorId ? 'X' : 'O';
  partida.tabuleiro[idx] = simbolo;

  const resultado = verificarVencedor(partida.tabuleiro);

  if (resultado === 'empate') {
    const nomeArq = gerarImagem(partida.tabuleiro, '', '', 'empate');
    delete partidas[grupoId];
    await enviarMensagemBot(grupoId,
      'Empate! Boa partida!\nUse /velha @nome para jogar de novo.',
      botDados,
      { fotoUrl: `${BASE_URL}/uploads/${nomeArq}` }
    );
    return true;
  }

  if (resultado) {
    const vencedorNome = partida.nomes[autorId];
    const nomeArq = gerarImagem(partida.tabuleiro, '', '', vencedorNome);
    delete partidas[grupoId];
    await enviarMensagemBot(grupoId,
      `${vencedorNome} VENCEU!\nUse /velha @nome para jogar de novo.`,
      botDados,
      { fotoUrl: `${BASE_URL}/uploads/${nomeArq}` }
    );
    return true;
  }

  const proximo     = partida.jogadores.X === autorId ? partida.jogadores.O : partida.jogadores.X;
  partida.vezDe     = proximo;
  const proximoNome = partida.nomes[proximo];
  const proximoSimb = partida.jogadores.X === proximo ? 'X' : 'O';
  const nomeArq     = gerarImagem(partida.tabuleiro, proximoNome, proximoSimb);

  await enviarMensagemBot(grupoId,
    `Vez de ${proximoNome} (${proximoSimb})\nDigite /velha [1-9]`,
    botDados,
    { fotoUrl: `${BASE_URL}/uploads/${nomeArq}` }
  );
  return true;
}

module.exports = { iniciarPartida, jogar, partidas };