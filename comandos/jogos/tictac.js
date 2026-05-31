// ═══════════════════════════════════════
// JOGOS/TICTAC.JS — Jogo da Velha com imagem PNG
// Uso: /velha @nome  /velha 1-9 (para jogar)
// ═══════════════════════════════════════

const { createCanvas } = require('canvas');
const fs   = require('fs');
const path = require('path');

const partidas = {};

// ─── GERA IMAGEM PNG DO TABULEIRO ────────────────────────────────────────────
function gerarImagem(tabuleiro, vezNome, vezSimbolo, fimJogo = null) {
  const SIZE    = 540;
  const CELL    = 160;
  const PADDING = 30;
  const canvas  = createCanvas(SIZE, SIZE + 80);
  const ctx     = canvas.getContext('2d');

  // Fundo
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, SIZE, SIZE + 80);

  // Título
  ctx.fillStyle = '#FF6B00';
  ctx.font      = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('❌ JOGO DA VELHA ⭕', SIZE / 2, 36);

  // Grade
  ctx.strokeStyle = '#333333';
  ctx.lineWidth   = 3;
  const startX = (SIZE - CELL * 3) / 2;
  const startY = 60;

  // Linhas verticais
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(startX + i * CELL, startY);
    ctx.lineTo(startX + i * CELL, startY + CELL * 3);
    ctx.stroke();
  }
  // Linhas horizontais
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(startX, startY + i * CELL);
    ctx.lineTo(startX + CELL * 3, startY + i * CELL);
    ctx.stroke();
  }

  // Símbolos
  for (let i = 0; i < 9; i++) {
    const col  = i % 3;
    const row  = Math.floor(i / 3);
    const cx   = startX + col * CELL + CELL / 2;
    const cy   = startY + row * CELL + CELL / 2;
    const sym  = tabuleiro[i];

    if (sym === 'X') {
      // Desenha X laranja
      ctx.strokeStyle = '#FF6B00';
      ctx.lineWidth   = 14;
      ctx.lineCap     = 'round';
      const off = 44;
      ctx.beginPath();
      ctx.moveTo(cx - off, cy - off);
      ctx.lineTo(cx + off, cy + off);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + off, cy - off);
      ctx.lineTo(cx - off, cy + off);
      ctx.stroke();
    } else if (sym === 'O') {
      // Desenha O azul
      ctx.strokeStyle = '#3B82F6';
      ctx.lineWidth   = 14;
      ctx.beginPath();
      ctx.arc(cx, cy, 46, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Número da posição
      ctx.fillStyle = '#333';
      ctx.font      = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), cx, cy);
    }
  }

  // Rodapé
  ctx.textBaseline = 'alphabetic';
  ctx.font      = 'bold 18px sans-serif';
  ctx.textAlign = 'center';

  if (fimJogo) {
    ctx.fillStyle = fimJogo === 'empate' ? '#FFC107' : '#22C55E';
    ctx.fillText(fimJogo === 'empate' ? '🤝 EMPATE!' : `🏆 ${fimJogo} VENCEU!`, SIZE / 2, SIZE + 52);
  } else {
    ctx.fillStyle = vezSimbolo === 'X' ? '#FF6B00' : '#3B82F6';
    ctx.fillText(`Vez de ${vezNome} (${vezSimbolo})`, SIZE / 2, SIZE + 52);
  }

  // Salva imagem temporária
  const nomeArq = `velha_${Date.now()}.png`;
  const dirPath  = path.join(__dirname, '../../uploads');
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
  const filePath = path.join(dirPath, nomeArq);
  const buffer   = canvas.toBuffer('image/png');
  fs.writeFileSync(filePath, buffer);
  return nomeArq;
}

function novoTabuleiro() {
  return ['1','2','3','4','5','6','7','8','9'];
}

function verificarVencedor(tab) {
  const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,b,c] of wins) {
    if (tab[a] === tab[b] && tab[b] === tab[c] && (tab[a]==='X'||tab[a]==='O')) return tab[a];
  }
  if (tab.every(c => c==='X'||c==='O')) return 'empate';
  return null;
}

function getUrlBase(req) {
  // Tenta montar URL pública do Railway
  const proto = process.env.RAILWAY_PUBLIC_DOMAIN ? 'https' : 'http';
  const host  = process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost:3000';
  return `${proto}://${host}`;
}

async function iniciarPartida({ grupoId, args, autorNome, autorId, botDados, replyTo, enviarMensagemBot, db }) {
  if (!args) {
    await enviarMensagemBot(grupoId, '⚠️ Use: /velha @nome para desafiar alguém!\nEx: /velha @João', botDados, { replyTo });
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
    await enviarMensagemBot(grupoId, `❌ Usuário *${args}* não encontrado no grupo.`, botDados, { replyTo });
    return;
  }

  const tabuleiro = novoTabuleiro();
  partidas[grupoId] = {
    tabuleiro,
    vezDe: autorId,
    jogadores: { X: autorId, O: oponente.uid },
    nomes: { [autorId]: autorNome, [oponente.uid]: oponente.nome },
  };

  const nomeArq = gerarImagem(tabuleiro, autorNome, 'X');
  const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `https://boreschat-bots-production.up.railway.app`;

  await enviarMensagemBot(grupoId,
    `❌⭕ *${autorNome}* (X) desafiou *${oponente.nome}* (O)!\n\nDigite /velha [1-9] para jogar!`,
    botDados,
    { replyTo, fotoUrl: `${baseUrl}/uploads/${nomeArq}` }
  );
}

async function jogar({ grupoId, args, autorId, autorNome, botDados, replyTo, enviarMensagemBot }) {
  const partida = partidas[grupoId];
  if (!partida) return false;

  const pos = parseInt(args);
  if (isNaN(pos) || pos < 1 || pos > 9) return false;

  if (partida.vezDe !== autorId) {
    await enviarMensagemBot(grupoId, `⚠️ Não é sua vez! Aguarde *${partida.nomes[partida.vezDe]}* jogar.`, botDados, { replyTo });
    return true;
  }

  const idx = pos - 1;
  if (partida.tabuleiro[idx]==='X'||partida.tabuleiro[idx]==='O') {
    await enviarMensagemBot(grupoId, '⚠️ Posição já ocupada! Escolha outra (1-9).', botDados, { replyTo });
    return true;
  }

  const simbolo = partida.jogadores.X === autorId ? 'X' : 'O';
  partida.tabuleiro[idx] = simbolo;

  const resultado = verificarVencedor(partida.tabuleiro);
  const baseUrl   = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `https://boreschat-bots-production.up.railway.app`;

  if (resultado === 'empate') {
    const nomeArq = gerarImagem(partida.tabuleiro, '', '', 'empate');
    delete partidas[grupoId];
    await enviarMensagemBot(grupoId,
      `🤝 *EMPATE!* Boa partida!\n\nUse /velha @nome para jogar de novo.`,
      botDados,
      { fotoUrl: `${baseUrl}/uploads/${nomeArq}` }
    );
    return true;
  }

  if (resultado) {
    const vencedorNome = partida.nomes[autorId];
    const nomeArq = gerarImagem(partida.tabuleiro, '', '', vencedorNome);
    delete partidas[grupoId];
    await enviarMensagemBot(grupoId,
      `🏆 *${vencedorNome} VENCEU!* 🎉\n\nUse /velha @nome para jogar de novo.`,
      botDados,
      { fotoUrl: `${baseUrl}/uploads/${nomeArq}` }
    );
    return true;
  }

  // Troca a vez
  const proximo      = partida.jogadores.X === autorId ? partida.jogadores.O : partida.jogadores.X;
  partida.vezDe      = proximo;
  const proximoNome  = partida.nomes[proximo];
  const proximoSimb  = partida.jogadores.X === proximo ? 'X' : 'O';
  const nomeArq      = gerarImagem(partida.tabuleiro, proximoNome, proximoSimb);

  await enviarMensagemBot(grupoId,
    `🎯 Vez de *${proximoNome}* (${proximoSimb === 'X' ? '❌' : '⭕'})\nDigite /velha [1-9]`,
    botDados,
    { fotoUrl: `${baseUrl}/uploads/${nomeArq}` }
  );
  return true;
}

module.exports = { iniciarPartida, jogar, partidas };