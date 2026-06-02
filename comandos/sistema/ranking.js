// ═══════════════════════════════════════════════════════════════
// SISTEMA/RANKING.JS — Ranking visual profissional com canvas
// Uso: /ranking  /ranking moedas  /ranking wins  /ranking conquistas
//      /ranking semana  /ranking ativo  /ranking reacoes (NOVOS)
// ═══════════════════════════════════════════════════════════════

const { createCanvas, loadImage, registerFont } = require('canvas');
const fs   = require('fs');
const path = require('path');
const { getRanking, getTitulo, calcularLevel } = require('./xp');

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

function limparTexto(str) {
  return (str || '').replace(/[^\x00-\x7F]/g, '').trim() || 'Usuario';
}

const TIPOS = {
  xp:         { label: 'XP',         cor: '#FF6B00', campo: 'xp',         icone: 'XP'  },
  moedas:     { label: 'Moedas',     cor: '#FFD700', campo: 'moedas',     icone: '$'   },
  wins:       { label: 'Vitorias',   cor: '#22C55E', campo: 'wins',       icone: 'WIN' },
  conquistas: { label: 'Conquistas', cor: '#A855F7', campo: 'conquistas', icone: 'ACH' },
  semana:     { label: 'Top Semana', cor: '#EC4899', campo: 'msgsSemana', icone: 'WK'  },
  ativo:      { label: 'Mais Ativo', cor: '#06B6D4', campo: 'pontuacaoAtivo', icone: 'TOP' },
  reacoes:    { label: 'Reacoes',    cor: '#F59E0B', campo: 'reacoesRecebidas', icone: 'REA' },
};

// ─── GERA IMAGEM DO RANKING ───────────────────────────────────────────────────
async function gerarImagemRanking(lista, nomeGrupo, tipo) {
  const cfg    = TIPOS[tipo] || TIPOS.xp;
  const W      = 620;
  const HEADER = 110;
  const ITEM_H = 80;
  const PAD    = 14;
  const H      = HEADER + lista.length * ITEM_H + PAD * 2 + 40;

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // ── Fundo ──────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H);

  // ── Faixa top colorida ─────────────────────────────────────────────────────
  const grad = ctx.createLinearGradient(0, 0, W, HEADER);
  grad.addColorStop(0, cfg.cor + 'cc');
  grad.addColorStop(1, '#0a0a0a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, HEADER);

  // ── Icone do tipo (circulo grande) ─────────────────────────────────────────
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.arc(50, 55, 34, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = cfg.cor;
  ctx.lineWidth   = 3;
  ctx.beginPath(); ctx.arc(50, 55, 34, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle    = cfg.cor;
  ctx.font         = FB(16);
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(cfg.icone, 50, 55);

  // ── Titulo ─────────────────────────────────────────────────────────────────
  ctx.fillStyle    = '#ffffff';
  ctx.font         = FB(24);
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`RANKING DE ${cfg.label.toUpperCase()}`, 96, 46);

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font      = FR(13);
  ctx.fillText(nomeGrupo.substring(0, 40), 96, 70);

  // ── Total de jogadores ─────────────────────────────────────────────────────
  ctx.fillStyle = cfg.cor;
  ctx.font      = FR(12);
  ctx.fillText(`${lista.length} jogadores`, 96, 90);

  // ── Linha separadora ───────────────────────────────────────────────────────
  ctx.strokeStyle = cfg.cor + '44';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, HEADER - 2);
  ctx.lineTo(W - PAD, HEADER - 2);
  ctx.stroke();

  // ── Itens do ranking ───────────────────────────────────────────────────────
  const MEDALS     = ['#FFD700', '#C0C0C0', '#CD7F32'];
  const MEDALS_LBL = ['1', '2', '3'];

  for (let i = 0; i < lista.length; i++) {
    const u   = lista[i];
    const y   = HEADER + PAD + i * ITEM_H;
    const cor = MEDALS[i] || '#2a2a2a';
    const corNivel = corLevel(u.level || 1);

    // Card fundo
    ctx.fillStyle = i < 3 ? `${cor}12` : 'rgba(255,255,255,0.02)';
    roundRect(ctx, PAD, y, W - PAD * 2, ITEM_H - 6, 12); ctx.fill();

    // Borda esquerda colorida
    ctx.fillStyle = i < 3 ? cor : '#2a2a2a';
    ctx.fillRect(PAD, y, 4, ITEM_H - 6);

    // ── Posicao ───────────────────────────────────────────────────────────────
    if (i < 3) {
      ctx.fillStyle = cor;
      ctx.beginPath(); ctx.arc(PAD + 26, y + (ITEM_H - 6) / 2, 18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle    = '#000';
      ctx.font         = FB(16);
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(MEDALS_LBL[i], PAD + 26, y + (ITEM_H - 6) / 2);
    } else {
      ctx.fillStyle    = '#444';
      ctx.font         = FB(18);
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${i + 1}`, PAD + 26, y + (ITEM_H - 6) / 2);
    }

    // ── Avatar ────────────────────────────────────────────────────────────────
    const avCX = PAD + 62, avCY = y + (ITEM_H - 6) / 2, avR = 24;
    ctx.strokeStyle = corNivel;
    ctx.lineWidth   = 2.5;
    ctx.beginPath(); ctx.arc(avCX, avCY, avR, 0, Math.PI * 2); ctx.stroke();

    try {
      if (u.foto && u.foto.startsWith('http')) {
        const img = await loadImage(u.foto);
        ctx.save();
        ctx.beginPath(); ctx.arc(avCX, avCY, avR - 2, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(img, avCX - avR + 2, avCY - avR + 2, (avR - 2) * 2, (avR - 2) * 2);
        ctx.restore();
      } else throw new Error('no foto');
    } catch (_) {
      ctx.fillStyle = corNivel + '33';
      ctx.beginPath(); ctx.arc(avCX, avCY, avR - 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle    = corNivel;
      ctx.font         = FB(18);
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((u.nome || 'U')[0].toUpperCase(), avCX, avCY);
    }

    // ── Nome ──────────────────────────────────────────────────────────────────
    const nomeX = PAD + 96;
    ctx.fillStyle    = '#f0f0f0';
    ctx.font         = FB(16);
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(limparTexto(u.nome).substring(0, 18), nomeX, y + 28);

    // ── Level + Titulo ────────────────────────────────────────────────────────
    ctx.fillStyle = corNivel;
    ctx.font      = FB(11);
    ctx.fillText(`LV${u.level || 1}`, nomeX, y + 46);

    const tituloClean = limparTexto(u.titulo || getTitulo(u.level || 1));
    ctx.fillStyle = '#555';
    ctx.font      = FR(11);
    ctx.fillText(tituloClean.substring(0, 14), nomeX + 32, y + 46);

    // ── Mini stats embaixo do nome ────────────────────────────────────────────
    const statsTexto = `XP ${(u.xp||0).toLocaleString()}  |  ${(u.moedas||0).toLocaleString()} moedas  |  ${u.wins||0} wins  |  ${(u.conquistas||[]).length} ACH`;
    ctx.fillStyle = '#333';
    ctx.font      = FR(10);
    ctx.fillText(statsTexto.substring(0, 50), nomeX, y + 62);

    // ── Valor principal (direita) ─────────────────────────────────────────────
    let val;
    if (tipo === 'conquistas') {
      val = (u.conquistas || []).length;
    } else if (tipo === 'semana') {
      val = u.msgsSemana || 0;
    } else if (tipo === 'ativo') {
      val = u.pontuacaoAtivo || 0;
    } else if (tipo === 'reacoes') {
      val = u.reacoesRecebidas || 0;
    } else {
      val = (u[cfg.campo] || 0);
    }
    const valStr = typeof val === 'number' ? val.toLocaleString() : String(val);

    ctx.fillStyle    = i < 3 ? cor : cfg.cor;
    ctx.font         = FB(22);
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(valStr, W - PAD - 12, y + (ITEM_H - 6) / 2);

    ctx.fillStyle = '#444';
    ctx.font      = FR(10);
    ctx.fillText(cfg.label, W - PAD - 12, y + (ITEM_H - 6) / 2 + 18);
  }

  // ── Rodape ────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#111';
  ctx.fillRect(0, H - 36, W, 36);
  ctx.fillStyle    = '#444';
  ctx.font         = FR(11);
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BoresChat Bots  |  /ranking xp moedas wins conquistas semana ativo reacoes', W / 2, H - 18);

  const nome = `ranking_${Date.now()}.png`;
  fs.writeFileSync(path.join(__dirname, '../../uploads', nome), canvas.toBuffer('image/png'));
  return nome;
}

// ─── NOVO: BUSCA MSGS DA SEMANA ──────────────────────────────────────────────
async function buscarMsgsSemana(db, grupoId) {
  const seteDiasAtras = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const contadorMsgs = {};
  const reacoesRecebidas = {};

  try {
    const snap = await db.collection('grupos').doc(grupoId)
      .collection('mensagens')
      .orderBy('timestamp', 'desc')
      .limit(500)
      .get();

    snap.forEach(d => {
      const dado = d.data();
      if (!dado.enviado_por || dado.ehBot) return;
      const ts = dado.timestamp?.toMillis?.() || dado.timestamp?.seconds * 1000 || 0;
      if (ts < seteDiasAtras) return;

      contadorMsgs[dado.enviado_por] = (contadorMsgs[dado.enviado_por] || 0) + 1;

      // Conta reacoes recebidas
      if (dado.reacoes) {
        const totalReacoes = Object.values(dado.reacoes).reduce((a, b) => a + (Array.isArray(b) ? b.length : 0), 0);
        reacoesRecebidas[dado.enviado_por] = (reacoesRecebidas[dado.enviado_por] || 0) + totalReacoes;
      }
    });
  } catch (e) { console.error('[Ranking] msgs semana erro:', e.message); }

  return { contadorMsgs, reacoesRecebidas };
}

// ─── HANDLER ─────────────────────────────────────────────────────────────────
async function mostrarRanking({ grupoId, args, nomeGrupo, botDados, replyTo, enviarMensagemBot, db }) {
  const tiposValidos = ['moedas','wins','conquistas','semana','ativo','reacoes'];
  const tipo = tiposValidos.includes(args?.trim().toLowerCase())
    ? args.trim().toLowerCase() : 'xp';

  let lista = await getRanking(db, grupoId, 10);

  // Busca nome e foto REAL do Firestore /usuarios
  lista = await Promise.all(lista.map(async (u) => {
    try {
      const userDoc = await db.collection('usuarios').doc(u.userId).get();
      if (userDoc.exists) {
        const ud = userDoc.data();
        if (ud.nome)       u.nome = ud.nome;
        if (ud.fotoPerfil) u.foto = ud.fotoPerfil;
      }
    } catch (_) {}
    u.titulo = limparTexto(getTitulo(u.level || 1)) || 'Novato';
    return u;
  }));

  // ─── NOVO: para tipos semana/ativo/reacoes busca dados extras ─────────────
  if (['semana', 'ativo', 'reacoes'].includes(tipo)) {
    const { contadorMsgs, reacoesRecebidas } = await buscarMsgsSemana(db, grupoId);
    lista = lista.map(u => ({
      ...u,
      msgsSemana:       contadorMsgs[u.userId] || 0,
      reacoesRecebidas: reacoesRecebidas[u.userId] || 0,
      // Pontuacao ativo = msgs semana * 2 + reacoes recebidas * 3 + wins * 5
      pontuacaoAtivo:   (contadorMsgs[u.userId] || 0) * 2 + (reacoesRecebidas[u.userId] || 0) * 3 + (u.wins || 0) * 5,
    }));
  }

  // Ordena por tipo
  if (tipo === 'moedas')     lista = lista.sort((a,b) => (b.moedas||0) - (a.moedas||0));
  if (tipo === 'wins')       lista = lista.sort((a,b) => (b.wins||0)   - (a.wins||0));
  if (tipo === 'conquistas') lista = lista.sort((a,b) => (b.conquistas||[]).length - (a.conquistas||[]).length);
  if (tipo === 'semana')     lista = lista.sort((a,b) => (b.msgsSemana||0) - (a.msgsSemana||0));
  if (tipo === 'ativo')      lista = lista.sort((a,b) => (b.pontuacaoAtivo||0) - (a.pontuacaoAtivo||0));
  if (tipo === 'reacoes')    lista = lista.sort((a,b) => (b.reacoesRecebidas||0) - (a.reacoesRecebidas||0));

  // Filtra apenas com dados positivos para semana/ativo/reacoes
  if (['semana', 'ativo', 'reacoes'].includes(tipo)) {
    lista = lista.filter(u => (u[TIPOS[tipo].campo] || 0) > 0);
  }

  if (lista.length === 0) {
    await enviarMensagemBot(grupoId,
      'Nenhum dado ainda! Mande mensagens para aparecer no ranking.',
      botDados, { replyTo }
    );
    return;
  }

  const botoes = [
    { label: 'XP',         comando: '/ranking'            },
    { label: 'Moedas',     comando: '/ranking moedas'     },
    { label: 'Vitorias',   comando: '/ranking wins'       },
    { label: 'Conquistas', comando: '/ranking conquistas' },
    { label: 'Top Semana', comando: '/ranking semana'     },
    { label: 'Mais Ativo', comando: '/ranking ativo'      },
    { label: 'Reacoes',    comando: '/ranking reacoes'    },
  ];

  try {
    const nomeArq = await gerarImagemRanking(lista, nomeGrupo || grupoId, tipo);
    await enviarMensagemBot(grupoId,
      `Ranking de ${TIPOS[tipo].label}`,
      botDados,
      { replyTo, fotoUrl: `${BASE_URL}/uploads/${nomeArq}`, botoes }
    );
  } catch (e) {
    console.error('[Ranking] Erro canvas:', e.message);
    // Fallback texto
    const top = lista.slice(0, 5).map((u, i) =>
      `${i+1}. ${u.nome} — ${u[TIPOS[tipo].campo] || 0} ${TIPOS[tipo].label}`
    ).join('\n');
    await enviarMensagemBot(grupoId, `Ranking ${TIPOS[tipo].label}\n\n${top}`, botDados, { replyTo, botoes });
  }
}

module.exports = { mostrarRanking };