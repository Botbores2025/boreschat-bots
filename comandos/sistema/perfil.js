// ═══════════════════════════════════════════════════════════════
// SISTEMA/PERFIL.JS — Perfil visual com canvas
// Uso: /perfil  /perfil @nome
// ═══════════════════════════════════════════════════════════════

const { createCanvas, loadImage, registerFont } = require('canvas');
const fs   = require('fs');
const path = require('path');
const { getStats }           = require('./xp');
const { listarConquistas }   = require('./conquistas');

const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : 'https://boreschat-bots-production.up.railway.app';

try {
  const fontsDir = path.join(__dirname, '../../fonts');
  registerFont(path.join(fontsDir, 'Regular.ttf'), { family: 'Quiz', weight: 'normal' });
  registerFont(path.join(fontsDir, 'Bold.ttf'),    { family: 'Quiz', weight: 'bold'   });
} catch (e) {}

const FB = (s) => `bold ${s}px Quiz, Arial, sans-serif`;
const FR = (s) => `${s}px Quiz, Arial, sans-serif`;

function corLevel(level) {
  if (level >= 50) return '#FFD700';
  if (level >= 30) return '#A855F7';
  if (level >= 20) return '#3B82F6';
  if (level >= 10) return '#22C55E';
  return '#FF6B00';
}

function roundRect(ctx, x, y, w, h, r) {
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
}

async function gerarImagemPerfil(stats, nomeGrupo) {
  const W = 600, H = 420;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');
  const cor    = corLevel(stats.level);

  // Fundo
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, W, H);

  // Faixa lateral colorida
  ctx.fillStyle = cor;
  ctx.fillRect(0, 0, 6, H);

  // Header escuro
  ctx.fillStyle = '#161616';
  roundRect(ctx, 10, 10, W-20, 90, 12);
  ctx.fill();

  // Avatar (circulo)
  const avatarX = 30, avatarY = 22, avatarR = 33;
  ctx.strokeStyle = cor;
  ctx.lineWidth   = 3;
  ctx.beginPath(); ctx.arc(avatarX + avatarR, avatarY + avatarR, avatarR, 0, Math.PI*2); ctx.stroke();

  // Tenta carregar foto do usuario
  try {
    if (stats.foto && stats.foto.startsWith('http')) {
      const img = await loadImage(stats.foto);
      ctx.save();
      ctx.beginPath(); ctx.arc(avatarX + avatarR, avatarY + avatarR, avatarR - 2, 0, Math.PI*2);
      ctx.clip();
      ctx.drawImage(img, avatarX + 2, avatarY + 2, (avatarR-2)*2, (avatarR-2)*2);
      ctx.restore();
    } else { throw new Error('no foto'); }
  } catch (_) {
    // Placeholder letra
    ctx.fillStyle = cor + '33';
    ctx.beginPath(); ctx.arc(avatarX + avatarR, avatarY + avatarR, avatarR - 2, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle    = cor;
    ctx.font         = FB(28);
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((stats.nome || '?')[0].toUpperCase(), avatarX + avatarR, avatarY + avatarR);
  }

  // Nome e titulo
  ctx.fillStyle    = '#fff';
  ctx.font         = FB(20);
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText((stats.nome || 'Usuario').substring(0,22), 100, 42);

  ctx.fillStyle = cor;
  ctx.font      = FR(13);
  ctx.fillText(stats.titulo || 'Novato', 100, 62);

  // VIP badge
  if (stats.vip) {
    ctx.fillStyle = '#FFD700';
    ctx.font      = FB(12);
    ctx.fillText('👑 VIP', 100, 82);
  }

  // Level badge
  ctx.fillStyle = cor;
  roundRect(ctx, W-90, 22, 72, 32, 8); ctx.fill();
  ctx.fillStyle    = '#000';
  ctx.font         = FB(16);
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`LVL ${stats.level}`, W-54, 38);

  // Nome do grupo
  ctx.fillStyle    = '#555';
  ctx.font         = FR(11);
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(nomeGrupo.substring(0,30), W-14, 90);

  // ── BARRA DE XP ──────────────────────────────────────────────────────────
  const barX = 14, barY = 112, barW = W-28, barH = 18;
  ctx.fillStyle = '#1a1a1a';
  roundRect(ctx, barX, barY, barW, barH, 9); ctx.fill();

  const pct = Math.min(stats.xpAtual / stats.xpNecessario, 1);
  if (pct > 0) {
    ctx.fillStyle = cor;
    roundRect(ctx, barX, barY, Math.max(barW * pct, 18), barH, 9); ctx.fill();
  }

  ctx.fillStyle    = '#fff';
  ctx.font         = FB(11);
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${stats.xpAtual} / ${stats.xpNecessario} XP`, W/2, barY + barH/2);

  // ── STATS CARDS ──────────────────────────────────────────────────────────
  const statsCards = [
    { icon: '⭐', label: 'XP Total',   valor: stats.xp || 0 },
    { icon: '💰', label: 'Moedas',     valor: stats.moedas || 0 },
    { icon: '💬', label: 'Mensagens',  valor: stats.mensagens || 0 },
    { icon: '🏆', label: 'Vitorias',   valor: stats.wins || 0 },
  ];

  const cardW = (W - 28 - 12) / 4;
  statsCards.forEach((s, i) => {
    const x = 14 + i * (cardW + 4);
    const y = 142;
    ctx.fillStyle = '#161616';
    roundRect(ctx, x, y, cardW, 70, 10); ctx.fill();

    ctx.fillStyle    = '#777';
    ctx.font         = FR(11);
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(s.label, x + cardW/2, y + 20);

    ctx.fillStyle = cor;
    ctx.font      = FB(18);
    ctx.fillText(s.valor.toLocaleString(), x + cardW/2, y + 48);
  });

  // ── CONQUISTAS ────────────────────────────────────────────────────────────
  ctx.fillStyle    = '#fff';
  ctx.font         = FB(13);
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Conquistas', 14, 238);

  const todas    = listarConquistas(stats.conquistas || []);
  const desbloq  = todas.filter(c => c.desbloqueada).slice(0, 10);
  const bloqueadas = todas.filter(c => !c.desbloqueada).slice(0, 5);

  let cx = 14;
  const iconY = 248;

  desbloq.forEach((c) => {
    // Fundo colorido com cor da conquista
    ctx.fillStyle = (c.cor || '#FF6B00') + '22';
    roundRect(ctx, cx, iconY, 44, 44, 8); ctx.fill();
    ctx.strokeStyle = (c.cor || '#FF6B00') + '88';
    ctx.lineWidth   = 1.5;
    roundRect(ctx, cx, iconY, 44, 44, 8); ctx.stroke();
    // Texto do icone (ex: MSG, LV5, WIN)
    ctx.fillStyle    = c.cor || '#FF6B00';
    ctx.font         = FB(10);
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.icon || '?', cx + 22, iconY + 22);
    cx += 50;
    if (cx > W - 60) return;
  });

  bloqueadas.forEach((c) => {
    ctx.fillStyle = '#1a1a1a';
    roundRect(ctx, cx, iconY, 44, 44, 8); ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth   = 1;
    roundRect(ctx, cx, iconY, 44, 44, 8); ctx.stroke();
    ctx.fillStyle    = '#444';
    ctx.font         = FB(10);
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('???', cx + 22, iconY + 22);
    cx += 50;
    if (cx > W - 60) return;
  });

  const totalDesbloq = desbloq.length;
  const totalConq    = todas.length;
  ctx.fillStyle    = '#555';
  ctx.font         = FR(11);
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${totalDesbloq}/${totalConq}`, W-14, 238);

  // ── RODAPE ────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#111';
  ctx.fillRect(0, H-40, W, 40);
  ctx.fillStyle    = '#444';
  ctx.font         = FR(11);
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BoresChat Bots | Use /ranking para ver o top do grupo', W/2, H-20);

  const nome = `perfil_${Date.now()}.png`;
  fs.writeFileSync(path.join(__dirname, '../../uploads', nome), canvas.toBuffer('image/png'));
  return nome;
}

async function mostrarPerfil({ grupoId, userId, autorId, autorNome, foto, args, nomeGrupo, botDados, replyTo, enviarMensagemBot, db }) {
  let targetId   = autorId;
  let targetNome = autorNome;

  // Se passou @nome busca outro usuario
  if (args) {
    const busca    = args.replace('@','').toLowerCase().trim();
    const grupoDoc = await db.collection('grupos').doc(grupoId).get();
    const membros  = grupoDoc.data()?.membros || [];
    for (const uid of membros) {
      const u = await db.collection('usuarios').doc(uid).get();
      if (u.exists && u.data().nome?.toLowerCase().includes(busca)) {
        targetId   = uid;
        targetNome = u.data().nome;
        break;
      }
    }
  }

  const stats = await getStats(db, grupoId, targetId);
  if (!stats) {
    await enviarMensagemBot(grupoId,
      `${targetNome} ainda nao tem perfil! Envie mensagens no grupo para ganhar XP.`,
      botDados, { replyTo }
    );
    return;
  }

  const nomeArq = await gerarImagemPerfil(stats, nomeGrupo);
  await enviarMensagemBot(grupoId,
    `Perfil de ${targetNome}`,
    botDados,
    { replyTo, fotoUrl: `${BASE_URL}/uploads/${nomeArq}` }
  );
}

module.exports = { mostrarPerfil };