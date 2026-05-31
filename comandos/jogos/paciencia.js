// ═══════════════════════════════════════════════════════════════
// JOGOS/PACIENCIA.JS — Jogo da Paciência (Klondike)
// Uso: /paciencia          → inicia jogo
//      /pac comprar        → compra carta do estoque
//      /pac mover C1 C2    → move topo da coluna 1 para coluna 2
//      /pac mover C1 P1    → move topo da coluna 1 para pilha 1
//      /pac mover E C1     → move carta comprada para coluna 1
//      /pac mover E P1     → move carta comprada para pilha 1
// ═══════════════════════════════════════════════════════════════

const { createCanvas, loadImage } = require('canvas');
const fs   = require('fs');
const path = require('path');

// ─── PATHS ───────────────────────────────────────────────────────────────────
const CARTAS_DIR = path.join(__dirname, '../../assets/cartas');
const UPLOADS_DIR = path.join(__dirname, '../../uploads');

const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : 'https://boreschat-bots-production.up.railway.app';

// ─── ESTADO DOS JOGOS ─────────────────────────────────────────────────────────
const jogos = {}; // grupoId_userId -> estado do jogo

// ─── CONSTANTES DO BARALHO ───────────────────────────────────────────────────
const NAIPES  = ['hearts', 'diamonds', 'clubs', 'spades'];
const VALORES = ['A', '02', '03', '04', '05', '06', '07', '08', '09', '10', 'J', 'Q', 'K'];

// Naipes vermelhos: hearts, diamonds
function ehVermelho(naipe) { return naipe === 'hearts' || naipe === 'diamonds'; }

// Valor numerico da carta (A=1, 2-10, J=11, Q=12, K=13)
function valorNum(valor) {
  if (valor === 'A')  return 1;
  if (valor === 'J')  return 11;
  if (valor === 'Q')  return 12;
  if (valor === 'K')  return 13;
  return parseInt(valor);
}

// Nome do arquivo da carta — usa exatamente os nomes existentes
function nomeArquivo(naipe, valor) {
  return `card_${naipe}_${valor}.png`;
}

// ─── CRIA BARALHO EMBARALHADO ─────────────────────────────────────────────────
function criarBaralho() {
  const baralho = [];
  for (const naipe of NAIPES) {
    for (const valor of VALORES) {
      baralho.push({ naipe, valor, virada: false });
    }
  }
  // Fisher-Yates shuffle
  for (let i = baralho.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [baralho[i], baralho[j]] = [baralho[j], baralho[i]];
  }
  return baralho;
}

// ─── INICIA JOGO ─────────────────────────────────────────────────────────────
function iniciarEstado() {
  const baralho = criarBaralho();
  let idx = 0;

  // 7 colunas — coluna i tem i+1 cartas, ultima virada
  const colunas = [];
  for (let i = 0; i < 7; i++) {
    const col = [];
    for (let j = 0; j <= i; j++) {
      const carta = { ...baralho[idx++] };
      carta.virada = (j === i); // só a ultima fica virada
      col.push(carta);
    }
    colunas.push(col);
  }

  // Estoque: restante do baralho (virado para baixo)
  const estoque = baralho.slice(idx).map(c => ({ ...c, virada: false }));

  return {
    colunas,          // 7 colunas
    pilhas: [[], [], [], []], // 4 pilhas de naipe (hearts, diamonds, clubs, spades)
    estoque,          // cartas restantes
    cartaComprada: null, // carta atual do estoque (virada para cima)
    movimentos: 0,
    inicio: Date.now(),
  };
}

// ─── VERIFICA SE PODE MOVER PARA COLUNA ──────────────────────────────────────
// Regras: cor alternada, valor decrescente, K em coluna vazia
function podeMoverParaColuna(carta, coluna) {
  if (coluna.length === 0) {
    return valorNum(carta.valor) === 13; // só K em coluna vazia
  }
  const topo = coluna[coluna.length - 1];
  if (!topo.virada) return false;
  const corDiferente = ehVermelho(carta.naipe) !== ehVermelho(topo.naipe);
  const valorCerto   = valorNum(carta.valor) === valorNum(topo.valor) - 1;
  return corDiferente && valorCerto;
}

// ─── VERIFICA SE PODE MOVER PARA PILHA ───────────────────────────────────────
// Regras: mesmo naipe, valor crescente, A primeiro
function podeMoverParaPilha(carta, pilha) {
  if (pilha.length === 0) {
    return valorNum(carta.valor) === 1; // só A em pilha vazia
  }
  const topo = pilha[pilha.length - 1];
  return carta.naipe === topo.naipe && valorNum(carta.valor) === valorNum(topo.valor) + 1;
}

// ─── VERIFICA VITORIA ─────────────────────────────────────────────────────────
function verificarVitoria(estado) {
  return estado.pilhas.every(p => p.length === 13);
}

// ═══════════════════════════════════════════════════════════════
// RENDERIZACAO COM CANVAS
// ═══════════════════════════════════════════════════════════════

// Dimensoes das cartas medium do Kenney
const CARD_W  = 70;
const CARD_H  = 100;
const PAD     = 10;
const OFFSET_VIRADA   = 28; // offset de carta virada (mostra valor)
const OFFSET_FECHADA  = 10; // offset de carta fechada

async function carregarCarta(naipe, valor) {
  const arquivo = path.join(CARTAS_DIR, nomeArquivo(naipe, valor));
  try { return await loadImage(arquivo); }
  catch (e) { return null; }
}

async function carregarVerso() {
  try { return await loadImage(path.join(CARTAS_DIR, 'card_back.png')); }
  catch (e) { return null; }
}

async function carregarVazia() {
  try { return await loadImage(path.join(CARTAS_DIR, 'card_empty.png')); }
  catch (e) { return null; }
}

async function gerarImagem(estado, nomeUsuario, nomeGrupo, mensagem = '') {
  // Calcula altura necessaria baseada nas colunas
  const maxCartas = Math.max(...estado.colunas.map(c => c.length), 1);
  const alturaCol = CARD_H + (maxCartas - 1) * OFFSET_VIRADA + 40;
  const W = PAD + 7 * (CARD_W + PAD);
  const H = Math.max(500, 60 + CARD_H + 20 + alturaCol + (mensagem ? 40 : 0) + 20);

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // Fundo
  ctx.fillStyle = '#076324'; // verde mesa de cartas
  ctx.fillRect(0, 0, W, H);

  // Header
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(0, 0, W, 44);
  ctx.fillStyle = '#fff';
  ctx.font      = 'bold 13px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${nomeGrupo.substring(0,30)} | ${nomeUsuario.substring(0,20)} | ${estado.movimentos} mov`, W / 2, 22);

  const imgVerso = await carregarVerso();
  const imgVazia = await carregarVazia();

  // ── LINHA SUPERIOR: estoque, carta comprada, pilhas ─────────────────────
  const topoY = 54;

  // Estoque (clique = /pac comprar)
  const estoqueX = PAD;
  if (estado.estoque.length > 0) {
    if (imgVerso) ctx.drawImage(imgVerso, estoqueX, topoY, CARD_W, CARD_H);
    else {
      ctx.fillStyle = '#1a5c8a';
      ctx.fillRect(estoqueX, topoY, CARD_W, CARD_H);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(estoqueX, topoY + CARD_H - 20, CARD_W, 20);
    ctx.fillStyle = '#fff';
    ctx.font      = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${estado.estoque.length}`, estoqueX + CARD_W / 2, topoY + CARD_H - 8);
  } else {
    // Estoque vazio
    if (imgVazia) ctx.drawImage(imgVazia, estoqueX, topoY, CARD_W, CARD_H);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font      = '11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('vazio', estoqueX + CARD_W / 2, topoY + CARD_H / 2);
  }
  // Label E
  ctx.fillStyle = '#fff';
  ctx.font      = 'bold 11px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('[E]', estoqueX + CARD_W / 2, topoY - 6);

  // Carta comprada
  const compradaX = PAD + CARD_W + PAD;
  if (estado.cartaComprada) {
    const img = await carregarCarta(estado.cartaComprada.naipe, estado.cartaComprada.valor);
    if (img) ctx.drawImage(img, compradaX, topoY, CARD_W, CARD_H);
  } else {
    if (imgVazia) ctx.drawImage(imgVazia, compradaX, topoY, CARD_W, CARD_H);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font      = '10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('compra', compradaX + CARD_W / 2, topoY + CARD_H / 2);
  }

  // Pilhas de naipe (P1=hearts P2=diamonds P3=clubs P4=spades)
  const NAIPES_PILHA = ['hearts', 'diamonds', 'clubs', 'spades'];
  for (let i = 0; i < 4; i++) {
    const px    = PAD + (3 + i) * (CARD_W + PAD);
    const pilha = estado.pilhas[i];
    if (pilha.length > 0) {
      const topo = pilha[pilha.length - 1];
      const img  = await carregarCarta(topo.naipe, topo.valor);
      if (img) ctx.drawImage(img, px, topoY, CARD_W, CARD_H);
    } else {
      if (imgVazia) ctx.drawImage(imgVazia, px, topoY, CARD_W, CARD_H);
      // Mostra naipe
      const suit = path.join(CARTAS_DIR, `card_${NAIPES_PILHA[i]}_suit.png`);
      try {
        const imgSuit = await loadImage(suit);
        ctx.globalAlpha = 0.4;
        ctx.drawImage(imgSuit, px + 15, topoY + 25, 40, 50);
        ctx.globalAlpha = 1;
      } catch (_) {}
    }
    ctx.fillStyle = '#fff';
    ctx.font      = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`[P${i+1}]`, px + CARD_W / 2, topoY - 6);
  }

  // ── COLUNAS ───────────────────────────────────────────────────────────────
  const colY = topoY + CARD_H + 20;

  for (let c = 0; c < 7; c++) {
    const cx     = PAD + c * (CARD_W + PAD);
    const coluna = estado.colunas[c];

    // Label coluna
    ctx.fillStyle = '#fff';
    ctx.font      = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`[C${c+1}]`, cx + CARD_W / 2, colY - 6);

    if (coluna.length === 0) {
      if (imgVazia) ctx.drawImage(imgVazia, cx, colY, CARD_W, CARD_H);
    } else {
      for (let i = 0; i < coluna.length; i++) {
        const carta  = coluna[i];
        const offset = i === 0 ? 0 : coluna[i-1].virada ? OFFSET_VIRADA : OFFSET_FECHADA;
        const cy     = colY + (i === 0 ? 0 : coluna.slice(0, i).reduce((acc, cc, idx) =>
          acc + (idx === 0 ? 0 : cc.virada ? OFFSET_VIRADA : OFFSET_FECHADA), OFFSET_VIRADA));

        if (carta.virada) {
          const img = await carregarCarta(carta.naipe, carta.valor);
          if (img) ctx.drawImage(img, cx, cy, CARD_W, CARD_H);
          else {
            ctx.fillStyle = '#fff';
            ctx.fillRect(cx, cy, CARD_W, CARD_H);
            ctx.fillStyle = ehVermelho(carta.naipe) ? '#c00' : '#000';
            ctx.font      = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`${carta.valor}`, cx + CARD_W/2, cy + CARD_H/2);
          }
        } else {
          if (imgVerso) ctx.drawImage(imgVerso, cx, cy, CARD_W, CARD_H);
          else {
            ctx.fillStyle = '#1a5c8a';
            ctx.fillRect(cx, cy, CARD_W, CARD_H);
          }
        }
      }
    }
  }

  // Mensagem de status
  if (mensagem) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, H - 36, W, 36);
    ctx.fillStyle = '#fff';
    ctx.font      = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(mensagem.substring(0, 60), W / 2, H - 18);
  }

  const nome = `pac_${Date.now()}.png`;
  fs.writeFileSync(path.join(UPLOADS_DIR, nome), canvas.toBuffer('image/png'));
  return nome;
}

// ═══════════════════════════════════════════════════════════════
// HANDLERS DOS COMANDOS
// ═══════════════════════════════════════════════════════════════

function chave(grupoId, userId) { return `${grupoId}_${userId}`; }

async function iniciarJogo({ grupoId, autorId, autorNome, nomeGrupo, botDados, replyTo, enviarMensagemBot }) {
  const key    = chave(grupoId, autorId);
  jogos[key]   = iniciarEstado();
  const estado = jogos[key];

  const nomeArq = await gerarImagem(estado, autorNome, nomeGrupo, 'Jogo iniciado! Use /pac comprar ou /pac mover C1 C2');
  await enviarMensagemBot(grupoId,
    `${autorNome} iniciou Paciencia!\n/pac comprar — compra carta\n/pac mover C1 C2 — move coluna\n/pac mover C1 P1 — move para pilha\n/pac mover E C1 — move carta comprada`,
    botDados,
    { replyTo, fotoUrl: `${BASE_URL}/uploads/${nomeArq}` }
  );
}

async function comprar({ grupoId, autorId, autorNome, nomeGrupo, botDados, replyTo, enviarMensagemBot }) {
  const key    = chave(grupoId, autorId);
  const estado = jogos[key];
  if (!estado) {
    await enviarMensagemBot(grupoId, 'Voce nao tem jogo ativo! Use /paciencia para iniciar.', botDados, { replyTo });
    return;
  }

  if (estado.estoque.length === 0) {
    // Reembaralha descarte se tiver carta comprada
    if (estado.cartaComprada) {
      estado.estoque = [estado.cartaComprada];
      estado.cartaComprada = null;
      const nomeArq = await gerarImagem(estado, autorNome, nomeGrupo, 'Estoque reembaralhado!');
      await enviarMensagemBot(grupoId, 'Estoque vazio! Reembaralhando...', botDados, { fotoUrl: `${BASE_URL}/uploads/${nomeArq}` });
    } else {
      await enviarMensagemBot(grupoId, 'Estoque vazio e sem cartas para reembaralhar!', botDados, { replyTo });
    }
    return;
  }

  // Descarta carta atual se tiver
  if (estado.cartaComprada) {
    estado.estoque.unshift(estado.cartaComprada);
  }

  // Compra nova carta
  estado.cartaComprada = { ...estado.estoque.pop(), virada: true };
  estado.movimentos++;

  const c = estado.cartaComprada;
  const nomeArq = await gerarImagem(estado, autorNome, nomeGrupo, `Comprou: ${c.valor} de ${c.naipe}`);
  await enviarMensagemBot(grupoId,
    `Carta comprada: ${c.valor} de ${c.naipe}`,
    botDados,
    { fotoUrl: `${BASE_URL}/uploads/${nomeArq}` }
  );
}

async function mover({ grupoId, autorId, autorNome, nomeGrupo, args, botDados, replyTo, enviarMensagemBot }) {
  const key    = chave(grupoId, autorId);
  const estado = jogos[key];
  if (!estado) {
    await enviarMensagemBot(grupoId, 'Voce nao tem jogo ativo! Use /paciencia para iniciar.', botDados, { replyTo });
    return;
  }

  if (!args) {
    await enviarMensagemBot(grupoId, 'Use: /pac mover C1 C2 ou /pac mover E P1', botDados, { replyTo });
    return;
  }

  const partes = args.toUpperCase().trim().split(/\s+/);
  if (partes.length < 2) {
    await enviarMensagemBot(grupoId, 'Use: /pac mover ORIGEM DESTINO\nEx: /pac mover C1 C3', botDados, { replyTo });
    return;
  }

  const origem  = partes[0]; // E, C1-C7
  const destino = partes[1]; // C1-C7, P1-P4

  let carta = null;
  let removida = false;

  // ─── PEGA CARTA DA ORIGEM ─────────────────────────────────────────────────
  if (origem === 'E') {
    // Carta comprada do estoque
    if (!estado.cartaComprada) {
      await enviarMensagemBot(grupoId, 'Nao ha carta comprada! Use /pac comprar primeiro.', botDados, { replyTo });
      return;
    }
    carta = estado.cartaComprada;
  } else if (origem.startsWith('C')) {
    const numCol = parseInt(origem.slice(1)) - 1;
    if (isNaN(numCol) || numCol < 0 || numCol > 6) {
      await enviarMensagemBot(grupoId, 'Coluna invalida! Use C1 ate C7.', botDados, { replyTo });
      return;
    }
    const col = estado.colunas[numCol];
    if (col.length === 0 || !col[col.length-1].virada) {
      await enviarMensagemBot(grupoId, `Coluna C${numCol+1} esta vazia ou sem carta virada.`, botDados, { replyTo });
      return;
    }
    carta = col[col.length - 1];
  } else {
    await enviarMensagemBot(grupoId, 'Origem invalida! Use E (estoque) ou C1-C7 (colunas).', botDados, { replyTo });
    return;
  }

  // ─── MOVE PARA DESTINO ────────────────────────────────────────────────────
  if (destino.startsWith('C')) {
    const numCol = parseInt(destino.slice(1)) - 1;
    if (isNaN(numCol) || numCol < 0 || numCol > 6) {
      await enviarMensagemBot(grupoId, 'Coluna invalida! Use C1 ate C7.', botDados, { replyTo });
      return;
    }
    const colDest = estado.colunas[numCol];
    if (!podeMoverParaColuna(carta, colDest)) {
      await enviarMensagemBot(grupoId, `Movimento invalido! ${carta.valor} de ${carta.naipe} nao pode ir para C${numCol+1}.`, botDados, { replyTo });
      return;
    }
    // Remove da origem
    if (origem === 'E') {
      estado.cartaComprada = null;
    } else {
      const numOrig = parseInt(origem.slice(1)) - 1;
      estado.colunas[numOrig].pop();
      // Vira a proxima carta se existir
      const colOrig = estado.colunas[numOrig];
      if (colOrig.length > 0 && !colOrig[colOrig.length-1].virada) {
        colOrig[colOrig.length-1].virada = true;
      }
    }
    colDest.push({ ...carta, virada: true });
    removida = true;

  } else if (destino.startsWith('P')) {
    const numPilha = parseInt(destino.slice(1)) - 1;
    if (isNaN(numPilha) || numPilha < 0 || numPilha > 3) {
      await enviarMensagemBot(grupoId, 'Pilha invalida! Use P1 ate P4.', botDados, { replyTo });
      return;
    }
    const pilha = estado.pilhas[numPilha];
    if (!podeMoverParaPilha(carta, pilha)) {
      await enviarMensagemBot(grupoId, `Movimento invalido! ${carta.valor} de ${carta.naipe} nao pode ir para P${numPilha+1}.`, botDados, { replyTo });
      return;
    }
    // Remove da origem
    if (origem === 'E') {
      estado.cartaComprada = null;
    } else {
      const numOrig = parseInt(origem.slice(1)) - 1;
      estado.colunas[numOrig].pop();
      const colOrig = estado.colunas[numOrig];
      if (colOrig.length > 0 && !colOrig[colOrig.length-1].virada) {
        colOrig[colOrig.length-1].virada = true;
      }
    }
    pilha.push({ ...carta, virada: true });
    removida = true;

  } else {
    await enviarMensagemBot(grupoId, 'Destino invalido! Use C1-C7 ou P1-P4.', botDados, { replyTo });
    return;
  }

  estado.movimentos++;

  // Verifica vitoria
  if (verificarVitoria(estado)) {
    const tempo = Math.floor((Date.now() - estado.inicio) / 1000);
    const nomeArq = await gerarImagem(estado, autorNome, nomeGrupo, `VOCE VENCEU em ${estado.movimentos} movimentos e ${tempo}s!`);
    delete jogos[key];
    await enviarMensagemBot(grupoId,
      `${autorNome} GANHOU a Paciencia em ${estado.movimentos} movimentos e ${tempo} segundos!`,
      botDados,
      { fotoUrl: `${BASE_URL}/uploads/${nomeArq}` }
    );
    return;
  }

  const nomeArq = await gerarImagem(estado, autorNome, nomeGrupo, `${carta.valor} de ${carta.naipe}: ${origem} -> ${destino}`);
  await enviarMensagemBot(grupoId,
    `Movimento: ${origem} -> ${destino}`,
    botDados,
    { fotoUrl: `${BASE_URL}/uploads/${nomeArq}` }
  );
}

async function verTabuleiro({ grupoId, autorId, autorNome, nomeGrupo, botDados, replyTo, enviarMensagemBot }) {
  const key    = chave(grupoId, autorId);
  const estado = jogos[key];
  if (!estado) {
    await enviarMensagemBot(grupoId, 'Voce nao tem jogo ativo! Use /paciencia para iniciar.', botDados, { replyTo });
    return;
  }
  const nomeArq = await gerarImagem(estado, autorNome, nomeGrupo, `${estado.movimentos} movimentos realizados`);
  await enviarMensagemBot(grupoId, 'Tabuleiro atual:', botDados, { replyTo, fotoUrl: `${BASE_URL}/uploads/${nomeArq}` });
}

module.exports = { iniciarJogo, comprar, mover, verTabuleiro, jogos };