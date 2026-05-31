// ═══════════════════════════════════════════════════════════════
// SISTEMA/PERFIL.JS — Perfil visual com canvas
// Uso: /perfil  /perfil @nome
// ═══════════════════════════════════════════════════════════════

const { createCanvas, loadImage, registerFont } = require('canvas');
const fs   = require('fs');
const path = require('path');
const { getStats, calcularLevel, getTitulo } = require('./xp');
const { listarConquistas }                   = require('./conquistas');

const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : 'https://boreschat-bots-production.up.railway.app';

// ─── FONTES ──────────────────────────────────────────────────────────────────
try {
  const fd = path.join(__dirname, '../../fonts');
  registerFont(path.join(fd, 'Regular.ttf'), { family: 'BF', weight: 'normal' });
  registerFont(path.join(fd, 'Bold.ttf'),    { family: 'BF', weight: 'bold'   });
} catch (_) {}

const FB = (s) => `bold ${s}px BF, Arial, sans-serif`;
const FR = (s) => `${s}px BF, Arial, sans-serif`;

// ─── HELPERS ─────────────────────────────────────────────────────────────────
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

// ─── GERA IMAGEM DO PERFIL ────────────────────────────────────────────────────
async function gerarImagemPerfil(stats, nomeGrupo) {
  const W   = 600;
  const H   = 440;
  const cor = corLevel(stats.level);

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // ── Fundo ──────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, W, H);

  // ── Faixa lateral colorida ─────────────────────────────────────────────────
  ctx.fillStyle = cor;
  ctx.fillRect(0, 0, 5, H);

  // ── Header ────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#161616';
  roundRect(ctx, 10, 10, W-20, 100, 12); ctx.fill();

  // ── Avatar ────────────────────────────────────────────────────────────────
  const avX = 28, avY = 22, avR = 38;
  ctx.strokeStyle = cor;
  ctx.lineWidth   = 3;
  ctx.beginPath(); ctx.arc(avX+avR, avY+avR, avR, 0, Math.PI*2); ctx.stroke();

  // Carrega foto real do usuario
  try {
    if (stats.foto && stats.foto.startsWith('http')) {
      const img = await loadImage(stats.foto);
      ctx.save();
      ctx.beginPath(); ctx.arc(avX+avR, avY+avR, avR-2, 0, Math.PI*2); ctx.clip();
      ctx.drawImage(img, avX+2, avY+2, (avR-2)*2, (avR-2)*2);
      ctx.restore();
    } else throw new Error('sem foto');
  } catch (_) {
    // Placeholder com letra
    ctx.fillStyle = cor + '33';
    ctx.beginPath(); ctx.arc(avX+avR, avY+avR, avR-2, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle    = cor;
    ctx.font         = FB(30);
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((stats.nome || 'U')[0].toUpperCase(), avX+avR, avY+avR);
  }

  // ── Nome do usuario ────────────────────────────────────────────────────────
  ctx.fillStyle    = '#ffffff';
  ctx.font         = FB(20);
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText((stats.nome || 'Usuario').substring(0, 22), 114, 50);

  // ── Titulo (sem emoji — texto simples para evitar hex) ────────────────────
  const tituloTexto = stats.titulo || getTitulo(stats.level) || 'Novato';
  // Remove emojis para evitar quadradinhos
  const tituloSemEmoji = tituloTexto.replace(/[\u{1F300}-\u{1FFFF}]/gu, '').trim();
  ctx.fillStyle = cor;
  ctx.font      = FR(14);
  ctx.fillText(tituloSemEmoji, 114, 72);

  // ── VIP badge ─────────────────────────────────────────────────────────────
  if (stats.vip) {
    ctx.fillStyle = '#FFD700';
    ctx.font      = FB(12);
    ctx.fillText('VIP', 114, 92);
  }

  // ── Badge de level ────────────────────────────────────────────────────────
  ctx.fillStyle = cor;
  roundRect(ctx, W-100, 30, 82, 36, 8); ctx.fill();
  ctx.fillStyle    = '#000';
  ctx.font         = FB(18);
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`LV ${stats.level}`, W-59, 48);

  // ── Nome do grupo ──────────────────────────────────────────────────────────
  ctx.fillStyle    = '#444';
  ctx.font         = FR(11);
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(nomeGrupo.substring(0, 30), W-14, 96);

  // ── Barra de XP ───────────────────────────────────────────────────────────
  const barX = 14, barY = 122, barW = W-28, barH = 20;
  ctx.fillStyle = '#1a1a1a';
  roundRect(ctx, barX, barY, barW, barH, 10); ctx.fill();

  const pct = Math.min((stats.xpAtual || 0) / (stats.xpNecessario || 100), 1);
  if (pct > 0) {
    ctx.fillStyle = cor;
    roundRect(ctx, barX, barY, Math.max(barW * pct, 20), barH, 10); ctx.fill();
  }

  ctx.fillStyle    = '#fff';
  ctx.font         = FB(11);
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${stats.xpAtual || 0} / ${stats.xpNecessario || 100} XP`, W/2, barY+barH/2);

  // ── Stats cards ───────────────────────────────────────────────────────────
  const statsData = [
    { label: 'XP Total',  valor: (stats.xp || 0).toLocaleString()        },
    { label: 'Moedas',    valor: (stats.moedas || 0).toLocaleString()     },
    { label: 'Mensagens', valor: (stats.mensagens || 0).toLocaleString()  },
    { label: 'Vitorias',  valor: (stats.wins || 0).toLocaleString()       },
  ];

  const cardW = (W - 28 - 12) / 4;
  statsData.forEach((s, i) => {
    const x = 14 + i * (cardW + 4);
    const y = 154;
    ctx.fillStyle = '#161616';
    roundRect(ctx, x, y, cardW, 68, 10); ctx.fill();

    ctx.fillStyle    = '#666';
    ctx.font         = FR(11);
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(s.label, x+cardW/2, y+22);

    ctx.fillStyle = cor;
    ctx.font      = FB(17);
    ctx.fillText(s.valor, x+cardW/2, y+50);
  });

  // ── Conquistas ────────────────────────────────────────────────────────────
  ctx.fillStyle    = '#fff';
  ctx.font         = FB(13);
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Conquistas', 14, 248);

  const todas     = listarConquistas(stats.conquistas || []);
  const desbloq   = todas.filter(c => c.desbloqueada).slice(0, 9);
  const bloqueadas = todas.filter(c => !c.desbloqueada).slice(0, 4);

  ctx.fillStyle    = '#555';
  ctx.font         = FR(11);
  ctx.textAlign    = 'right';
  ctx.fillText(`${desbloq.length}/${todas.length}`, W-14, 248);

  let cx = 14;
  const iconY = 258;

  desbloq.forEach((c) => {
    if (cx > W - 60) return;
    ctx.fillStyle = (c.cor || '#FF6B00') + '22';
    roundRect(ctx, cx, iconY, 46, 46, 8); ctx.fill();
    ctx.strokeStyle = (c.cor || '#FF6B00') + '88';
    ctx.lineWidth   = 1.5;
    roundRect(ctx, cx, iconY, 46, 46, 8); ctx.stroke();
    ctx.fillStyle    = c.cor || '#FF6B00';
    ctx.font         = FB(10);
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.icon || '?', cx+23, iconY+23);
    cx += 52;
  });

  bloqueadas.forEach((c) => {
    if (cx > W - 60) return;
    ctx.fillStyle = '#111';
    roundRect(ctx, cx, iconY, 46, 46, 8); ctx.fill();
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth   = 1;
    roundRect(ctx, cx, iconY, 46, 46, 8); ctx.stroke();
    ctx.fillStyle    = '#333';
    ctx.font         = FB(10);
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('???', cx+23, iconY+23);
    cx += 52;
  });

  // ── Rodape ────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#111';
  ctx.fillRect(0, H-36, W, 36);
  ctx.fillStyle    = '#444';
  ctx.font         = FR(11);
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BoresChat Bots | Use /ranking para ver o top do grupo', W/2, H-18);

  const nome = `perfil_${Date.now()}.png`;
  fs.writeFileSync(path.join(__dirname, '../../uploads', nome), canvas.toBuffer('image/png'));
  return nome;
}

// ─── HANDLER /perfil ──────────────────────────────────────────────────────────
async function mostrarPerfil({ grupoId, userId, autorId, autorNome, foto, args, nomeGrupo, botDados, replyTo, enviarMensagemBot, db }) {
  let targetId   = autorId;
  let targetNome = autorNome;
  let targetFoto = foto || '';

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
        targetFoto = u.data().fotoPerfil || '';
        break;
      }
    }
  }

  // ─── Busca nome e foto REAL do Firestore /usuarios ────────────────────────
  // Garante que o nome nao seja "Membro" mas o nome real do usuario
  try {
    const userDoc = await db.collection('usuarios').doc(targetId).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      if (userData.nome)       targetNome = userData.nome;
      if (userData.fotoPerfil) targetFoto = userData.fotoPerfil;
    }
  } catch (_) {}

  // Busca ou cria stats
  let stats = await getStats(db, grupoId, targetId);

  if (!stats) {
    const ref = db.collection('grupos').doc(grupoId)
      .collection('usuarios_stats').doc(targetId);
    await ref.set({
      userId: targetId, nome: targetNome, foto: targetFoto,
      xp: 0, moedas: 100, mensagens: 0, wins: 0,
      conquistas: [], streak_daily: 0, quiz_acertos: 0,
      criadoEm: new Date().toISOString(),
    });
    stats = await getStats(db, grupoId, targetId);
  }

  // Atualiza nome e foto nos stats com dados reais
  if (stats) {
    stats.nome  = targetNome;
    stats.foto  = targetFoto;
    stats.titulo = getTitulo(stats.level);
  }

  if (!stats) {
    await enviarMensagemBot(grupoId, `Erro ao carregar perfil de ${targetNome}.`, botDados, { replyTo });
    return;
  }

  try {
    const nomeArq = await gerarImagemPerfil(stats, nomeGrupo || grupoId);
    await enviarMensagemBot(grupoId, `Perfil de ${targetNome}`, botDados, {
      replyTo,
      fotoUrl: `${BASE_URL}/uploads/${nomeArq}`,
    });
  } catch (e) {
    console.error('[Perfil] Erro canvas:', e.message);
    const info    = calcularLevel(stats.xp || 0);
    const titulo  = getTitulo(info.level).replace(/[\u{1F300}-\u{1FFFF}]/gu, '').trim();
    await enviarMensagemBot(grupoId,
      `Perfil de ${targetNome}\nLevel ${info.level} ${titulo}\nXP ${stats.xp||0} | Moedas ${stats.moedas||100} | Msgs ${stats.mensagens||0}`,
      botDados, { replyTo }
    );
  }
}

module.exports = { mostrarPerfil };