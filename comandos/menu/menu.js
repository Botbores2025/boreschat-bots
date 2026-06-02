// ═══════════════════════════════════════════════════════════════
// MENU/MENU.JS — Menu principal do BoresBot
// Uso: /menu
// ═══════════════════════════════════════════════════════════════

const { createCanvas, loadImage, registerFont } = require('canvas');
const fs      = require('fs');
const path    = require('path');
const settings = require('../../settings.json');

const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : 'https://boreschat-bots-production.up.railway.app';

// ─── REGISTRA FONTES ─────────────────────────────────────────────────────────
try {
  const fontsDir = path.join(__dirname, '../../fonts');
  registerFont(path.join(fontsDir, 'Regular.ttf'), { family: 'BoresFont', weight: 'normal' });
  registerFont(path.join(fontsDir, 'Bold.ttf'),    { family: 'BoresFont', weight: 'bold'   });
} catch (e) {}

const FB = (s) => `bold ${s}px BoresFont, Arial, sans-serif`;
const FR = (s) => `${s}px BoresFont, Arial, sans-serif`;

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r, fill = true, stroke = false) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);
  ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);
  ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
  if (fill)   ctx.fill();
  if (stroke) ctx.stroke();
}

function getSaudacao() {
  const h = new Date().getHours();
  if (h >= 0  && h < 5)  return 'Boa madrugada';
  if (h >= 5  && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function getDataHora() {
  const agora = new Date();
  const data  = agora.toLocaleDateString('pt-BR',  { timeZone: 'America/Sao_Paulo' });
  const hora  = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  return { data, hora };
}

// ─── CATEGORIAS DE COMANDOS ───────────────────────────────────────────────────
const CATEGORIAS = {
  jogos: {
    label: 'Jogos',
    emoji: '🎮',
    cor: '#A855F7',
    bg: 'rgba(168, 85, 247, 0.1)',
    cmds: [
      { cmd: '/dado', desc: 'Joga um dado', emoji: '🎲' },
      { cmd: '/quiz', desc: 'Quiz com perguntas', emoji: '🧠' },
      { cmd: '/placar', desc: 'Placar do quiz', emoji: '📊' },
      { cmd: '/velha', desc: 'Jogo da velha', emoji: '⭕' },
      { cmd: '/minas', desc: 'Campo minado', emoji: '💣' },
      { cmd: '/paciencia', desc: 'Paciência', emoji: '♠️' },
    ],
  },
  sistema: {
    label: 'Economia',
    emoji: '💰',
    cor: '#FF6B00',
    bg: 'rgba(255, 107, 0, 0.1)',
    cmds: [
      { cmd: '/perfil', desc: 'Seu perfil', emoji: '👤' },
      { cmd: '/ranking', desc: 'Top 10 do grupo', emoji: '🏆' },
      { cmd: '/daily', desc: 'Moedas diárias', emoji: '💸' },
      { cmd: '/trabalhar', desc: 'Ganhar moedas', emoji: '💼' },
      { cmd: '/roubar', desc: 'Roubar alguém', emoji: '🤏' },
      { cmd: '/loja', desc: 'Comprar itens', emoji: '🛍️' },
      { cmd: '/moedas', desc: 'Ver saldo', emoji: '💵' },
    ],
  },
  adm: {
    label: 'Administração',
    emoji: '⚙️',
    cor: '#EF4444',
    bg: 'rgba(239, 68, 68, 0.1)',
    cmds: [
      { cmd: '/limpar', desc: 'Limpa o chat', emoji: '🧹' },
      { cmd: '/banir', desc: 'Bane membro', emoji: '🚫' },
      { cmd: '/remover', desc: 'Remove membro', emoji: '❌' },
      { cmd: '/admin', desc: 'Promove admin', emoji: '👑' },
      { cmd: '/rename', desc: 'Renomeia grupo', emoji: '✏️' },
      { cmd: '/bemvindo', desc: 'Config boas-vindas', emoji: '📢' },
      { cmd: '/fechar', desc: 'Fecha/Abre grupo', emoji: '🔐' },
    ],
  },
  usuario: {
    label: 'Utilitários',
    emoji: '⚡',
    cor: '#22C55E',
    bg: 'rgba(34, 197, 94, 0.1)',
    cmds: [
      { cmd: '/ping', desc: 'Status do bot', emoji: '📡' },
      { cmd: '/info', desc: 'Info do bot', emoji: 'ℹ️' },
      { cmd: '/cmds', desc: 'Todos os comandos', emoji: '📋' },
      { cmd: '/ia', desc: 'IA Gemini', emoji: '🤖' },
      { cmd: '/musica', desc: 'Buscar música', emoji: '🎵' },
      { cmd: '/clima', desc: 'Previsão do tempo', emoji: '🌤️' },
      { cmd: '/mencoes', desc: 'Menciona alguém', emoji: '🔗' },
      { cmd: '/enquete', desc: 'Criar enquete', emoji: '📋' },
      { cmd: '/sorteio', desc: 'Sortear prêmio', emoji: '🎁' },
    ],
  },
};

// ─── GERA IMAGEM DO MENU (UPGRADE) ────────────────────────────────────────────
async function gerarImagemMenu({ autorNome, nomeGrupo, fotoBot, menuFoto }) {
  const W = 650;
  const H = 900;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // ── Fundo com gradiente ────────────────────────────────────────────────────
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#0a0a0a');
  grad.addColorStop(0.5, '#1a1a1a');
  grad.addColorStop(1, '#0h0f0f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // ── Padrão de grade sutil ──────────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  for (let i = 0; i < W; i += 50) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, H);
    ctx.stroke();
  }

  // ── Imagem de cabeçalho (menuFoto) ─────────────────────────────────────────
  let headerH = 0;
  if (menuFoto && menuFoto.startsWith('http')) {
    try {
      const img = await loadImage(menuFoto);
      headerH = 200;
      ctx.save();
      ctx.beginPath();
      roundRect(ctx, 15, 15, W - 30, headerH - 10, 16, false, false);
      ctx.clip();
      ctx.drawImage(img, 15, 15, W - 30, headerH - 10);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(15, 15, W - 30, headerH - 10);
      ctx.restore();
    } catch (_) {
      headerH = 0;
    }
  }

  // ── Header gradiente (se sem imagem) ───────────────────────────────────────
  if (headerH === 0) {
    const gradH = ctx.createLinearGradient(0, 15, W, 130);
    gradH.addColorStop(0, '#FF6B00');
    gradH.addColorStop(0.5, '#FF9F1A');
    gradH.addColorStop(1, '#FF6B00');
    ctx.fillStyle = gradH;
    roundRect(ctx, 15, 15, W - 30, 115, 16);
    headerH = 130;
  }

  // ── Avatar com borda animada ──────────────────────────────────────────────
  const avX = 35;
  const avY = headerH - 45;
  const avR = 40;
  
  // Borda externa
  ctx.strokeStyle = '#FF6B00';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(avX + avR, avY + avR, avR + 3, 0, Math.PI * 2);
  ctx.stroke();
  
  // Borda interna
  ctx.strokeStyle = 'rgba(255, 107, 0, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(avX + avR, avY + avR, avR + 6, 0, Math.PI * 2);
  ctx.stroke();

  try {
    if (fotoBot && fotoBot.startsWith('http')) {
      const img = await loadImage(fotoBot);
      ctx.save();
      ctx.beginPath();
      ctx.arc(avX + avR, avY + avR, avR - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, avX + 2, avY + 2, (avR - 2) * 2, (avR - 2) * 2);
      ctx.restore();
    } else throw new Error('sem foto');
  } catch (_) {
    ctx.fillStyle = '#FF6B00';
    ctx.beginPath();
    ctx.arc(avX + avR, avY + avR, avR - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = FB(28);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('B', avX + avR, avY + avR);
  }

  // ── Informações do bot ─────────────────────────────────────────────────────
  const infoX = avX + avR * 2 + 24;
  const { data, hora } = getDataHora();

  ctx.fillStyle = '#fff';
  ctx.font = FB(22);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${settings.BOT_NAME} 🤖`, infoX, avY + 28);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.font = FR(13);
  ctx.fillText(`v${settings.BOT_VERSION || '2.1.0'}  •  ${data}`, infoX, avY + 46);

  ctx.fillStyle = '#FF6B00';
  ctx.font = FR(13);
  ctx.fillText(`${nomeGrupo.substring(0, 40)}`, infoX, avY + 62);

  // ── Saudação personalizada ─────────────────────────────────────────────────
  const saudY = headerH + avR + 12;
  ctx.fillStyle = '#fff';
  ctx.font = FB(18);
  ctx.textAlign = 'left';
  ctx.fillText(`${getSaudacao()}, ${autorNome.substring(0, 25)}! 👋`, 25, saudY);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.font = FR(12);
  ctx.fillText(settings.BOT_DESC || 'Bot oficial do BoresChat', 25, saudY + 22);

  // ── Linha divisória decorativa ─────────────────────────────────────────────
  const lineY = saudY + 36;
  const grad2 = ctx.createLinearGradient(25, lineY, W - 25, lineY);
  grad2.addColorStop(0, 'rgba(255, 107, 0, 0)');
  grad2.addColorStop(0.5, 'rgba(255, 107, 0, 0.8)');
  grad2.addColorStop(1, 'rgba(255, 107, 0, 0)');
  ctx.strokeStyle = grad2;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(25, lineY);
  ctx.lineTo(W - 25, lineY);
  ctx.stroke();

  // ── Cards de categorias melhorados ─────────────────────────────────────────
  const cardStartY = lineY + 24;
  const cats = Object.values(CATEGORIAS);
  const colsPerRow = 2;
  const cardW = (W - 60) / colsPerRow;
  const cardH = 140;
  const cardGapX = 15;
  const cardGapY = 16;

  cats.forEach((cat, i) => {
    const col = i % colsPerRow;
    const row = Math.floor(i / colsPerRow);
    const x = 25 + col * (cardW + cardGapX);
    const y = cardStartY + row * (cardH + cardGapY);

    // Fundo do card com gradiente sutil
    const cardGrad = ctx.createLinearGradient(x, y, x, y + cardH);
    cardGrad.addColorStop(0, 'rgba(30, 30, 30, 1)');
    cardGrad.addColorStop(1, 'rgba(20, 20, 20, 1)');
    ctx.fillStyle = cardGrad;
    roundRect(ctx, x, y, cardW, cardH, 12);

    // Barra colorida top
    ctx.fillStyle = cat.cor;
    roundRect(ctx, x, y, cardW, 5, 12);

    // Shadow interno
    ctx.strokeStyle = cat.cor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.2;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Emoji + Título
    ctx.fillStyle = cat.cor;
    ctx.font = FB(13);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${cat.emoji} ${cat.label.toUpperCase()}`, x + 12, y + 14);

    // Contador de comandos
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.font = FR(11);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`${cat.cmds.length} cmds`, x + cardW - 10, y + 14);

    // Linha divisória
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 38);
    ctx.lineTo(x + cardW - 10, y + 38);
    ctx.stroke();

    // Lista dos 2 primeiros comandos (com emoji)
    cat.cmds.slice(0, 2).forEach((c, ci) => {
      const cy = y + 50 + ci * 22;
      ctx.fillStyle = cat.cor;
      ctx.font = FR(10);
      ctx.textAlign = 'left';
      ctx.fillText(`${c.emoji} ${c.cmd}`, x + 12, cy);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = FR(9);
      ctx.fillText(c.desc.substring(0, 18), x + 12, cy + 12);
    });

    // Ver mais
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.font = FR(10);
    ctx.textAlign = 'right';
    ctx.fillText(`+${Math.max(0, cat.cmds.length - 2)} mais`, x + cardW - 12, y + 115);
  });

  // ── Rodapé com informações ─────────────────────────────────────────────────
  const footerY = H - 48;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, footerY, W, 48);

  ctx.fillStyle = '#FF6B00';
  ctx.font = FB(12);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${settings.BOT_NAME} v${settings.BOT_VERSION}`, W / 2, footerY + 14);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.font = FR(10);
  ctx.fillText('Use /jogos, /cmds e /ranking para explorar!', W / 2, footerY + 30);

  const nome = `menu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
  fs.writeFileSync(
    path.join(__dirname, '../../uploads', nome),
    canvas.toBuffer('image/png')
  );
  return nome;
}

// ─── HANDLER DO /menu (UPGRADE) ──────────────────────────────────────────────
async function handleMenu({ grupoId, autorNome, nomeGrupo, botDados, replyTo, enviarMensagemBot }) {
  const fotoBot = botDados.foto || '';
  const menuFoto = botDados.menuFoto || '';

  // Botões principais organizados por categoria
  const botoes = [
    { label: '🎮 Jogos', comando: '/jogos' },
    { label: '💰 Economia', comando: '/daily' },
    { label: '📊 Comandos', comando: '/cmds' },
    { label: '👑 Ranking', comando: '/ranking' },
    { label: '👤 Perfil', comando: '/perfil' },
    { label: '📡 Status', comando: '/ping' },
  ];

  try {
    const nomeArq = await gerarImagemMenu({ autorNome, nomeGrupo, fotoBot, menuFoto });
    console.log(`[Menu] Imagem gerada: ${nomeArq}`);
    
    await enviarMensagemBot(grupoId, '', botDados, {
      replyTo,
      fotoUrl: `${BASE_URL}/uploads/${nomeArq}`,
      botoes,
    });
  } catch (e) {
    console.error('[Menu] Erro ao gerar canvas:', e.message);
    // Fallback com texto formatado
    const saudacao = getSaudacao();
    const fallbackText = `${saudacao}, ${autorNome}! 👋

Bem-vindo ao ${settings.BOT_NAME}!

Clique nos botões abaixo para explorar:
🎮 /jogos — Dizerte!
💰 /daily — Ganhe moedas
👑 /ranking — Veja o top
👤 /perfil — Seus stats
📋 /cmds — Todos os comandos`;

    await enviarMensagemBot(grupoId, fallbackText, botDados, { replyTo, botoes });
  }
}

// ─── HANDLER DO /jogos (UPGRADE) ─────────────────────────────────────────────
async function handleJogos({ grupoId, botDados, replyTo, enviarMensagemBot }) {
  const cat = CATEGORIAS.jogos;
  const lista = cat.cmds
    .map((c, i) => `${i + 1}️⃣ ${c.emoji} ${c.cmd.padEnd(12)} — ${c.desc}`)
    .join('\n');

  const botoes = cat.cmds.map(c => ({ label: `${c.emoji} ${c.cmd}`, comando: c.cmd }));

  const texto = `🎮 JOGOS DO ${settings.BOT_NAME}

${lista}

Digite o comando do jogo que quer jogar!`;

  await enviarMensagemBot(grupoId, texto, botDados, { replyTo, botoes });
}

// ─── HANDLER DO /cmds (UPGRADE) ──────────────────────────────────────────────
async function handleCmds({ grupoId, comandosCustom, botDados, replyTo, enviarMensagemBot }) {
  const cats = Object.values(CATEGORIAS);
  const total = cats.reduce((acc, c) => acc + c.cmds.length, 0);
  const keysC = Object.keys(comandosCustom || {});

  let texto = `📋 TODOS OS COMANDOS DO ${settings.BOT_NAME} (${total} total)\n\n`;

  cats.forEach(cat => {
    texto += `${cat.emoji} ${cat.label.toUpperCase()} (${cat.cmds.length}):\n`;
    texto += cat.cmds
      .map(c => `   ${c.emoji} ${c.cmd.padEnd(12)} — ${c.desc}`)
      .join('\n');
    texto += '\n\n';
  });

  if (keysC.length > 0) {
    texto += `🌟 COMANDOS CUSTOMIZADOS (${keysC.length}):\n`;
    texto += keysC
      .map(k => `   ⭐ /${k.padEnd(12)} — ${comandosCustom[k].descricao || 'sem descrição'}`)
      .join('\n');
  } else {
    texto += `Nenhum comando customizado neste grupo ainda!\nAdmins podem adicionar com /admin comando`;
  }

  await enviarMensagemBot(grupoId, texto.trim(), botDados, { replyTo });
}

module.exports = { handleMenu, handleJogos, handleCmds, CATEGORIAS };