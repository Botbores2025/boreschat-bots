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
    cor:   '#A855F7',
    cmds:  [
      { cmd: '/dado',      desc: 'Joga um dado'              },
      { cmd: '/quiz',      desc: 'Quiz com perguntas'        },
      { cmd: '/placar',    desc: 'Placar do quiz'            },
      { cmd: '/velha',     desc: 'Jogo da velha @nome'       },
      { cmd: '/minas',     desc: 'Campo minado'              },
      { cmd: '/paciencia', desc: 'Jogo de paciencia'        },
    ],
  },
  sistema: {
    label: 'Sistema',
    cor:   '#FF6B00',
    cmds:  [
      { cmd: '/perfil',    desc: 'Seu perfil com stats'      },
      { cmd: '/ranking',   desc: 'Top 10 do grupo'           },
      { cmd: '/daily',     desc: 'Moedas diarias'            },
      { cmd: '/trabalhar', desc: 'Ganhar moedas (1h)'        },
      { cmd: '/roubar',    desc: 'Roubar @nome'              },
      { cmd: '/loja',      desc: 'Comprar itens'             },
      { cmd: '/moedas',    desc: 'Ver seu saldo'             },
    ],
  },
  adm: {
    label: 'Admin',
    cor:   '#EF4444',
    cmds:  [
      { cmd: '/limpar',    desc: 'Limpa o chat todo'         },
      { cmd: '/banir',     desc: 'Bane @nome do grupo'       },
      { cmd: '/remover',   desc: 'Remove @nome do grupo'     },
      { cmd: '/admin',     desc: 'Promove @nome a admin'     },
      { cmd: '/rename',    desc: 'Renomeia o grupo'          },
    ],
  },
  usuario: {
    label: 'Usuario',
    cor:   '#22C55E',
    cmds:  [
      { cmd: '/ping',      desc: 'Status e uptime do bot'    },
      { cmd: '/info',      desc: 'Info do bot'               },
      { cmd: '/cmds',      desc: 'Lista todos os comandos'   },
      { cmd: '/ia',        desc: 'Perguntar pra IA Gemini'   },
      { cmd: '/musica',    desc: 'Buscar musica'             },
    ],
  },
};

// ─── GERA IMAGEM DO MENU ─────────────────────────────────────────────────────
async function gerarImagemMenu({ autorNome, nomeGrupo, fotoBot, menuFoto }) {
  const W = 600;
  const H = 720;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // ── Fundo ──────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H);

  // ── Imagem de cabecalho (menuFoto) ─────────────────────────────────────────
  let headerH = 0;
  if (menuFoto && menuFoto.startsWith('http')) {
    try {
      const img = await loadImage(menuFoto);
      headerH = 180;
      ctx.save();
      ctx.beginPath();
      roundRect(ctx, 0, 0, W, headerH, 0, false, false);
      ctx.clip();
      ctx.drawImage(img, 0, 0, W, headerH);
      // overlay escuro para legibilidade
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, W, headerH);
      ctx.restore();
    } catch (_) { headerH = 0; }
  }

  // ── Header sem imagem ──────────────────────────────────────────────────────
  if (headerH === 0) {
    const grad = ctx.createLinearGradient(0, 0, W, 80);
    grad.addColorStop(0, '#FF6B00');
    grad.addColorStop(1, '#7C2D00');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, 80);
    headerH = 80;
  }

  // ── Logo / Avatar do bot ───────────────────────────────────────────────────
  const avX = 24, avY = headerH - 36, avR = 36;
  ctx.strokeStyle = '#FF6B00';
  ctx.lineWidth   = 3;
  ctx.beginPath(); ctx.arc(avX + avR, avY + avR, avR, 0, Math.PI * 2); ctx.stroke();

  try {
    if (fotoBot && fotoBot.startsWith('http')) {
      const img = await loadImage(fotoBot);
      ctx.save();
      ctx.beginPath(); ctx.arc(avX + avR, avY + avR, avR - 2, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(img, avX + 2, avY + 2, (avR-2)*2, (avR-2)*2);
      ctx.restore();
    } else throw new Error('no foto');
  } catch (_) {
    ctx.fillStyle = '#FF6B00';
    ctx.beginPath(); ctx.arc(avX + avR, avY + avR, avR - 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle    = '#fff';
    ctx.font         = FB(22);
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('B', avX + avR, avY + avR);
  }

  // ── Nome do bot + versao ───────────────────────────────────────────────────
  const infoX = avX + avR * 2 + 14;
  const { data, hora } = getDataHora();

  ctx.fillStyle    = '#fff';
  ctx.font         = FB(20);
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(settings.BOT_NAME || 'BoresBot', infoX, avY + 26);

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font      = FR(12);
  ctx.fillText(`v${settings.BOT_VERSION || '2.1.0'}  |  ${data}  ${hora}`, infoX, avY + 46);

  ctx.fillStyle = '#FF6B00';
  ctx.font      = FR(12);
  ctx.fillText(nomeGrupo.substring(0, 35), infoX, avY + 64);

  // ── Saudacao ao usuario ────────────────────────────────────────────────────
  const saudY = headerH + avR + 20;
  ctx.fillStyle = '#fff';
  ctx.font      = FB(16);
  ctx.textAlign = 'left';
  ctx.fillText(`${getSaudacao()}, ${autorNome.substring(0, 22)}!`, 24, saudY);

  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font      = FR(12);
  ctx.fillText(settings.BOT_DESC || 'Bot oficial do BoresChat', 24, saudY + 20);

  // ── Linha divisoria ────────────────────────────────────────────────────────
  ctx.strokeStyle = '#1f1f1f';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(24, saudY + 34);
  ctx.lineTo(W - 24, saudY + 34);
  ctx.stroke();

  // ── Cards de categorias ────────────────────────────────────────────────────
  const cardY    = saudY + 46;
  const cats     = Object.values(CATEGORIAS);
  const cardW    = (W - 48 - 12) / 2;
  const cardPadX = 24;

  cats.forEach((cat, i) => {
    const col  = i % 2;
    const row  = Math.floor(i / 2);
    const x    = cardPadX + col * (cardW + 12);
    const y    = cardY + row * (cat.cmds.length * 22 + 54 + 12);

    // Card fundo
    ctx.fillStyle = '#141414';
    roundRect(ctx, x, y, cardW, cat.cmds.length * 22 + 54, 12);
    // Barra colorida top
    ctx.fillStyle = cat.cor;
    roundRect(ctx, x, y, cardW, 6, 12);
    ctx.fillRect(x, y + 4, cardW, 2);

    // Titulo categoria
    ctx.fillStyle    = cat.cor;
    ctx.font         = FB(13);
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(cat.label.toUpperCase(), x + 12, y + 26);

    // Total cmds
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font      = FR(11);
    ctx.textAlign = 'right';
    ctx.fillText(`${cat.cmds.length} cmds`, x + cardW - 10, y + 26);

    // Linha
    ctx.strokeStyle = '#1f1f1f';
    ctx.lineWidth   = 0.5;
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 34);
    ctx.lineTo(x + cardW - 10, y + 34);
    ctx.stroke();

    // Lista de comandos
    cat.cmds.forEach((c, ci) => {
      const cy = y + 44 + ci * 22;
      // Comando em laranja/cor
      ctx.fillStyle = cat.cor;
      ctx.font      = FB(11);
      ctx.textAlign = 'left';
      ctx.fillText(c.cmd, x + 12, cy + 12);
      // Descricao em cinza
      const cmdW = ctx.measureText(c.cmd).width;
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font      = FR(11);
      ctx.fillText(` — ${c.desc}`.substring(0, 26), x + 12 + cmdW, cy + 12);
    });
  });

  // ── Rodape ────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#111';
  ctx.fillRect(0, H - 36, W, 36);
  ctx.fillStyle    = '#444';
  ctx.font         = FR(11);
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${settings.BOT_NAME} v${settings.BOT_VERSION} | BoresChat`, W / 2, H - 18);

  const nome = `menu_${Date.now()}.png`;
  fs.writeFileSync(
    path.join(__dirname, '../../uploads', nome),
    canvas.toBuffer('image/png')
  );
  return nome;
}

// ─── HANDLER DO /menu ─────────────────────────────────────────────────────────
async function handleMenu({ grupoId, autorNome, nomeGrupo, botDados, replyTo, enviarMensagemBot }) {
  const fotoBot  = botDados.foto     || '';
  const menuFoto = botDados.menuFoto || '';

  const botoes = [
    { label: 'Jogos',    comando: '/jogos'    },
    { label: 'Perfil',   comando: '/perfil'   },
    { label: 'Economia', comando: '/daily'    },
    { label: 'Ranking',  comando: '/ranking'  },
    { label: 'Ping',     comando: '/ping'     },
  ];

  try {
    const nomeArq = await gerarImagemMenu({ autorNome, nomeGrupo, fotoBot, menuFoto });
    // Manda SÓ a imagem + botões, sem texto
    await enviarMensagemBot(grupoId, '', botDados, {
      replyTo,
      fotoUrl: `${BASE_URL}/uploads/${nomeArq}`,
      botoes,
    });
  } catch (e) {
    console.error('[Menu] Erro canvas:', e.message);
    // Fallback só com botoes e texto minimo
    await enviarMensagemBot(grupoId, `${getSaudacao()}, ${autorNome}! Escolha:`, botDados, { replyTo, botoes });
  }
}

// ─── HANDLER DO /jogos ────────────────────────────────────────────────────────
async function handleJogos({ grupoId, botDados, replyTo, enviarMensagemBot }) {
  const cat    = CATEGORIAS.jogos;
  const lista  = cat.cmds.map(c => `${c.cmd} — ${c.desc}`).join('\n');
  const botoes = cat.cmds.map(c => ({ label: c.cmd, comando: c.cmd }));

  await enviarMensagemBot(grupoId,
    `JOGOS DO ${settings.BOT_NAME}\n\n${lista}`,
    botDados,
    { replyTo, botoes }
  );
}

// ─── HANDLER DO /cmds ─────────────────────────────────────────────────────────
async function handleCmds({ grupoId, comandosCustom, botDados, replyTo, enviarMensagemBot }) {
  const cats   = Object.values(CATEGORIAS);
  const total  = cats.reduce((acc, c) => acc + c.cmds.length, 0);
  const keysC  = Object.keys(comandosCustom || {});

  let texto = `COMANDOS DO ${settings.BOT_NAME} (${total} total)\n\n`;
  cats.forEach(cat => {
    texto += `${cat.label.toUpperCase()}:\n`;
    texto += cat.cmds.map(c => `${c.cmd} — ${c.desc}`).join('\n');
    texto += '\n\n';
  });

  if (keysC.length > 0) {
    texto += `CUSTOMIZADOS (${keysC.length}):\n`;
    texto += keysC.map(k => `/${k} — ${comandosCustom[k].descricao || 'sem desc'}`).join('\n');
  }

  await enviarMensagemBot(grupoId, texto.trim(), botDados, { replyTo });
}

module.exports = { handleMenu, handleJogos, handleCmds, CATEGORIAS };