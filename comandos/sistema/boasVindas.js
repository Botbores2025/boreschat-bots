// ═══════════════════════════════════════════════════════════════
// SISTEMA/BOASVINDAS.JS — Boas vindas com canvas profissional
// Disparado automaticamente quando alguem entra no grupo
// ═══════════════════════════════════════════════════════════════

const { createCanvas, loadImage, registerFont } = require('canvas');
const fs   = require('fs');
const path = require('path');

const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : 'https://boreschat-bots-production.up.railway.app';

try {
  const fd = path.join(__dirname, '../../fonts');
  registerFont(path.join(fd, 'Regular.ttf'), { family: 'BF', weight: 'normal' });
  registerFont(path.join(fd, 'Bold.ttf'),    { family: 'BF', weight: 'bold'   });
} catch (_) {}

const FB = (s) => `bold ${s}px BF, Arial, sans-serif`;
const FR = (s) => `${s}px BF, Arial, sans-serif`;

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

async function gerarImagemBoasVindas({ nome, foto, nomeGrupo, totalMembros }) {
  const W = 800;
  const H = 400;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // ── Fundo com gradiente ───────────────────────────────────────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#0a0a0a');
  bgGrad.addColorStop(0.5, '#111111');
  bgGrad.addColorStop(1, '#0a0a0a');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // ── Efeito de grade no fundo ──────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(255,107,0,0.04)';
  ctx.lineWidth   = 1;
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // ── Barra lateral esquerda laranja ────────────────────────────────────────
  const barGrad = ctx.createLinearGradient(0, 0, 0, H);
  barGrad.addColorStop(0, '#FF6B00');
  barGrad.addColorStop(0.5, '#FF8C00');
  barGrad.addColorStop(1, '#FF6B00');
  ctx.fillStyle = barGrad;
  ctx.fillRect(0, 0, 6, H);

  // ── Circulo de fundo do avatar (glow) ─────────────────────────────────────
  const avCX = 160, avCY = H / 2, avR = 110;

  // Glow externo
  const glowGrad = ctx.createRadialGradient(avCX, avCY, avR - 20, avCX, avCY, avR + 40);
  glowGrad.addColorStop(0, 'rgba(255,107,0,0.3)');
  glowGrad.addColorStop(1, 'rgba(255,107,0,0)');
  ctx.fillStyle = glowGrad;
  ctx.beginPath(); ctx.arc(avCX, avCY, avR + 40, 0, Math.PI * 2); ctx.fill();

  // Anel externo decorativo
  ctx.strokeStyle = 'rgba(255,107,0,0.3)';
  ctx.lineWidth   = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath(); ctx.arc(avCX, avCY, avR + 16, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);

  // Anel principal
  ctx.strokeStyle = '#FF6B00';
  ctx.lineWidth   = 4;
  ctx.beginPath(); ctx.arc(avCX, avCY, avR + 4, 0, Math.PI * 2); ctx.stroke();

  // Avatar
  try {
    if (foto && foto.startsWith('http')) {
      const img = await loadImage(foto);
      ctx.save();
      ctx.beginPath(); ctx.arc(avCX, avCY, avR, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(img, avCX - avR, avCY - avR, avR * 2, avR * 2);
      ctx.restore();
    } else throw new Error('sem foto');
  } catch (_) {
    // Placeholder
    const placeholderGrad = ctx.createRadialGradient(avCX, avCY, 0, avCX, avCY, avR);
    placeholderGrad.addColorStop(0, '#2a1a0a');
    placeholderGrad.addColorStop(1, '#1a0a00');
    ctx.fillStyle = placeholderGrad;
    ctx.beginPath(); ctx.arc(avCX, avCY, avR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle    = '#FF6B00';
    ctx.font         = FB(72);
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((nome || 'U')[0].toUpperCase(), avCX, avCY);
  }

  // ── Conteudo direito ──────────────────────────────────────────────────────
  const textX = 310;

  // Bem-vindo tag
  ctx.fillStyle = 'rgba(255,107,0,0.15)';
  roundRect(ctx, textX, 60, 200, 32, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(255,107,0,0.4)';
  ctx.lineWidth   = 1;
  roundRect(ctx, textX, 60, 200, 32, 8); ctx.stroke();
  ctx.fillStyle    = '#FF6B00';
  ctx.font         = FB(13);
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BEM-VINDO AO GRUPO', textX + 100, 76);

  // Nome do usuario
  ctx.fillStyle    = '#ffffff';
  ctx.font         = FB(38);
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';
  const nomeExib   = nome.length > 16 ? nome.substring(0, 16) + '...' : nome;
  ctx.fillText(nomeExib, textX, 150);

  // Linha decorativa abaixo do nome
  const nomeWidth = ctx.measureText(nomeExib).width;
  const lineGrad  = ctx.createLinearGradient(textX, 0, textX + nomeWidth, 0);
  lineGrad.addColorStop(0, '#FF6B00');
  lineGrad.addColorStop(1, 'rgba(255,107,0,0)');
  ctx.fillStyle = lineGrad;
  ctx.fillRect(textX, 158, nomeWidth, 3);

  // Nome do grupo
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font      = FR(16);
  ctx.fillText(nomeGrupo.substring(0, 35), textX, 190);

  // Cards de info
  const cards = [
    { label: 'Membro', valor: '#' + totalMembros },
    { label: 'Grupo',  valor: nomeGrupo.substring(0, 12) },
  ];

  cards.forEach((card, i) => {
    const cx = textX + i * 180;
    const cy = 220;
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    roundRect(ctx, cx, cy, 160, 70, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(255,107,0,0.2)';
    ctx.lineWidth   = 1;
    roundRect(ctx, cx, cy, 160, 70, 10); ctx.stroke();

    ctx.fillStyle    = '#FF6B00';
    ctx.font         = FB(22);
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(card.valor, cx + 14, cy + 36);

    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font      = FR(12);
    ctx.fillText(card.label.toUpperCase(), cx + 14, cy + 56);
  });

  // Mensagem de boas vindas
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.font      = FR(14);
  ctx.textAlign = 'left';
  ctx.fillText('Seja bem-vindo(a)! Use /menu para comecar.', textX, 330);

  // ── Rodape ────────────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, H - 36, W, 36);

  // Linha divisoria rodape
  ctx.strokeStyle = 'rgba(255,107,0,0.2)';
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.moveTo(0, H - 36); ctx.lineTo(W, H - 36); ctx.stroke();

  ctx.fillStyle    = 'rgba(255,255,255,0.2)';
  ctx.font         = FR(12);
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BoresChat  |  Powered by BoresBot', W / 2, H - 18);

  const nomeArq = `welcome_${Date.now()}.png`;
  fs.writeFileSync(path.join(__dirname, '../../uploads', nomeArq), canvas.toBuffer('image/png'));
  return nomeArq;
}

// ─── HANDLER ─────────────────────────────────────────────────────────────────
async function enviarBoasVindas({ grupoId, userId, nomeGrupo, totalMembros, botDados, db, enviarMensagemBot }) {
  try {
    // Busca dados reais do usuario no Firestore
    let nome = 'Membro';
    let foto = '';
    try {
      const userDoc = await db.collection('usuarios').doc(userId).get();
      if (userDoc.exists) {
        const ud = userDoc.data();
        nome = ud.nome       || 'Membro';
        foto = ud.fotoPerfil || '';
      }
    } catch (_) {}

    const nomeArq = await gerarImagemBoasVindas({ nome, foto, nomeGrupo, totalMembros });

    await enviarMensagemBot(grupoId,
      `Bem-vindo(a) ao grupo, ${nome}! Use /menu para ver os comandos.`,
      botDados,
      { fotoUrl: `${BASE_URL}/uploads/${nomeArq}` }
    );

    // Apaga apos 5 minutos
    setTimeout(() => {
      try { fs.unlinkSync(path.join(__dirname, '../../uploads', nomeArq)); } catch (_) {}
    }, 300000);

  } catch (e) {
    console.error('[BoasVindas] Erro:', e.message);
    // Fallback texto
    await enviarMensagemBot(grupoId,
      `Bem-vindo(a) ao grupo! Use /menu para ver os comandos.`,
      botDados
    );
  }
}

module.exports = { enviarBoasVindas };