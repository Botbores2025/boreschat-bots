// ═══════════════════════════════════════════════════════════════
// SISTEMA/RANKING.JS — Ranking visual com canvas
// Uso: /ranking  /ranking moedas  /ranking wins
// ═══════════════════════════════════════════════════════════════

const { createCanvas, registerFont } = require('canvas');
const fs   = require('fs');
const path = require('path');
const { getRanking, getTitulo } = require('./xp');

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

async function gerarImagemRanking(lista, nomeGrupo, tipo) {
  const W     = 600;
  const H     = Math.max(300, 110 + lista.length * 58 + 20);
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  const TIPOS = {
    xp:     { label: 'XP',      icon: '⭐', cor: '#FF6B00', campo: 'xp'     },
    moedas: { label: 'Moedas',  icon: '💰', cor: '#FFD700', campo: 'moedas' },
    wins:   { label: 'Vitorias',icon: '🏆', cor: '#22C55E', campo: 'wins'   },
  };
  const cfg = TIPOS[tipo] || TIPOS.xp;

  // Fundo
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = cfg.cor;
  ctx.fillRect(0, 0, W, 5);

  // Header
  ctx.fillStyle = '#161616';
  ctx.fillRect(0, 5, W, 50);
  ctx.fillStyle    = cfg.cor;
  ctx.font         = FB(18);
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`RANKING DE ${cfg.label.toUpperCase()}`, W/2, 24);
  ctx.fillStyle = '#555';
  ctx.font      = FR(12);
  ctx.fillText(nomeGrupo.substring(0,40), W/2, 44);

  if (lista.length === 0) {
    ctx.fillStyle    = '#555';
    ctx.font         = FR(16);
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Nenhum dado ainda! Envie mensagens para aparecer.', W/2, H/2);
  } else {
    const medals = ['#FFD700','#C0C0C0','#CD7F32'];
    lista.forEach((u, i) => {
      const y   = 68 + i * 58;
      const cor = medals[i] || '#374151';

      // Card
      ctx.fillStyle = i < 3 ? `${cor}15` : 'rgba(255,255,255,0.02)';
      roundRect(ctx, 14, y, W-28, 48, 10); ctx.fill();
      if (i < 3) {
        ctx.strokeStyle = `${cor}44`;
        ctx.lineWidth   = 1;
        roundRect(ctx, 14, y, W-28, 48, 10); ctx.stroke();
      }

      // Posicao
      ctx.fillStyle    = i < 3 ? cor : '#444';
      ctx.font         = FB(22);
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${i+1}`, 42, y+24);

      // Nome
      ctx.fillStyle    = '#f0f0f0';
      ctx.font         = FB(15);
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText((u.nome || 'Usuario').substring(0,20), 62, y+16);

      // Titulo/Level
      ctx.fillStyle = '#666';
      ctx.font      = FR(11);
      ctx.fillText(`${u.titulo || 'Novato'} • LVL ${u.level}`, 62, y+34);

      // Valor
      ctx.fillStyle    = cfg.cor;
      ctx.font         = FB(18);
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'middle';
      const valor = (u[cfg.campo] || 0).toLocaleString();
      ctx.fillText(valor, W-20, y+24);
    });
  }

  const nome = `ranking_${Date.now()}.png`;
  fs.writeFileSync(path.join(__dirname, '../../uploads', nome), canvas.toBuffer('image/png'));
  return nome;
}

async function mostrarRanking({ grupoId, args, nomeGrupo, botDados, replyTo, enviarMensagemBot, db }) {
  const tipo  = ['moedas','wins'].includes(args?.trim().toLowerCase()) ? args.trim().toLowerCase() : 'xp';
  let lista   = await getRanking(db, grupoId, 10);

  // Ordena por tipo
  if (tipo === 'moedas') lista = lista.sort((a,b) => (b.moedas||0) - (a.moedas||0));
  if (tipo === 'wins')   lista = lista.sort((a,b) => (b.wins||0)   - (a.wins||0));

  const nomeArq = await gerarImagemRanking(lista, nomeGrupo, tipo);
  const botoes  = [
    { label: '⭐ XP',      comando: '/ranking'        },
    { label: '💰 Moedas',  comando: '/ranking moedas' },
    { label: '🏆 Vitorias', comando: '/ranking wins'  },
  ];
  await enviarMensagemBot(grupoId,
    `Ranking de ${tipo === 'xp' ? 'XP' : tipo === 'moedas' ? 'Moedas' : 'Vitorias'}`,
    botDados,
    { replyTo, fotoUrl: `${BASE_URL}/uploads/${nomeArq}`, botoes }
  );
}

module.exports = { mostrarRanking };