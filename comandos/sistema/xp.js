// ═══════════════════════════════════════════════════════════════
// SISTEMA/XP.JS — Sistema de XP e Level
// Chamado automaticamente a cada mensagem no grupo
// ═══════════════════════════════════════════════════════════════

// XP necessário por level (cresce progressivamente)
function xpParaLevel(level) {
  return Math.floor(100 * Math.pow(1.4, level - 1));
}

// Level baseado no XP total
function calcularLevel(xpTotal) {
  let level = 1;
  let xpAcumulado = 0;
  while (true) {
    const necessario = xpParaLevel(level);
    if (xpAcumulado + necessario > xpTotal) break;
    xpAcumulado += necessario;
    level++;
  }
  return { level, xpAtual: xpTotal - calcularXpAcumulado(level), xpNecessario: xpParaLevel(level) };
}

function calcularXpAcumulado(level) {
  let total = 0;
  for (let i = 1; i < level; i++) total += xpParaLevel(i);
  return total;
}

// Titulos por level
function getTitulo(level) {
  if (level >= 50) return '👑 Lendario';
  if (level >= 40) return '💎 Diamante';
  if (level >= 30) return '🏆 Mestre';
  if (level >= 20) return '⚡ Elite';
  if (level >= 15) return '🔥 Veterano';
  if (level >= 10) return '⭐ Experiente';
  if (level >= 5)  return '🌱 Iniciante';
  return '🐣 Novato';
}

// XP ganho por acao
const XP_ACOES = {
  mensagem:     2,
  quiz_acerto:  50,
  quiz_erro:    5,
  velha_win:    30,
  dado:         5,
  daily:        20,
  trabalhar:    15,
};

async function adicionarXP(db, grupoId, userId, nome, foto, acao, enviarMensagemBot, botDados) {
  const xpGanho = XP_ACOES[acao] || 2;
  const ref     = db.collection('grupos').doc(grupoId).collection('usuarios_stats').doc(userId);

  try {
    const snap = await ref.get();
    const dados = snap.exists ? snap.data() : {
      userId, nome, foto: foto || '',
      xp: 0, moedas: 100, level: 1,
      conquistas: [], wins: 0, mensagens: 0,
      ultimoDaily: null, ultimoTrabalho: null,
      criadoEm: new Date().toISOString(),
    };

    const xpAntes  = dados.xp || 0;
    const novoXP   = xpAntes + xpGanho;
    const levelAntes = calcularLevel(xpAntes).level;
    const levelNovo  = calcularLevel(novoXP).level;

    const update = {
      userId, nome, foto: foto || '',
      xp: novoXP,
      mensagens: (dados.mensagens || 0) + (acao === 'mensagem' ? 1 : 0),
    };

    await ref.set({ ...dados, ...update }, { merge: true });

    // Anuncia level up!
    if (levelNovo > levelAntes) {
      const titulo = getTitulo(levelNovo);
      await enviarMensagemBot(grupoId,
        `🎉 *${nome}* subiu para o *Level ${levelNovo}*!\n\n${titulo}\n\n+${xpGanho} XP ganhos!`,
        botDados
      );
    }

    return { xpGanho, novoXP, level: levelNovo, levelUp: levelNovo > levelAntes };
  } catch (e) {
    console.error('[XP]', e.message);
    return { xpGanho, novoXP: xpGanho, level: 1, levelUp: false };
  }
}

async function getStats(db, grupoId, userId) {
  try {
    const snap = await db.collection('grupos').doc(grupoId).collection('usuarios_stats').doc(userId).get();
    if (!snap.exists) return null;
    const dados  = snap.data();
    const info   = calcularLevel(dados.xp || 0);
    return { ...dados, ...info, titulo: getTitulo(info.level) };
  } catch (e) { return null; }
}

async function getRanking(db, grupoId, limit = 10) {
  try {
    const snap = await db.collection('grupos').doc(grupoId)
      .collection('usuarios_stats')
      .orderBy('xp', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map(d => {
      const dados = d.data();
      const info  = calcularLevel(dados.xp || 0);
      return { ...dados, ...info, titulo: getTitulo(info.level) };
    });
  } catch (e) { return []; }
}

module.exports = { adicionarXP, getStats, getRanking, calcularLevel, getTitulo, xpParaLevel, XP_ACOES };