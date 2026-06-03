// ═══════════════════════════════════════════════════
// SISTEMA/LIMITES.JS — Verificação de limites diários
// Planos: free, bores_plus, pro, max
// ═══════════════════════════════════════════════════

const LIMITES = {
  free:       { play: 3,        ia: 5,        figurinhas: 2        },
  bores_plus: { play: 10,       ia: 20,       figurinhas: 10       },
  pro:        { play: 30,       ia: 60,       figurinhas: 30       },
  max:        { play: Infinity, ia: Infinity, figurinhas: Infinity },
};

const NOMES_PLANOS = {
  free:       'Gratuito',
  bores_plus: 'Bores Plus',
  pro:        'Pro',
  max:        'Max',
};

function getDataHoje() {
  return new Date().toISOString().split('T')[0];
}

async function getPlanoUsuario(db, userId) {
  try {
    const doc = await db.collection('usuarios').doc(userId).get();
    if (!doc.exists) return 'free';
    const plano = doc.data().plano;
    if (!plano?.tipo) return 'free';
    const expira = plano.expiresAt?.toDate?.() ?? new Date(0);
    if (expira < new Date()) return 'free';
    return plano.tipo;
  } catch {
    return 'free';
  }
}

async function verificarLimite(db, userId, recurso) {
  const plano  = await getPlanoUsuario(db, userId);
  const limite = LIMITES[plano]?.[recurso] ?? LIMITES.free[recurso];

  if (limite === Infinity) return { permitido: true, plano, uso: 0, limite };

  const hoje  = getDataHoje();
  const docId = `${userId}_${hoje}`;
  const doc   = await db.collection('limites_uso').doc(docId).get();
  const uso   = doc.exists ? (doc.data()[recurso] ?? 0) : 0;

  return { permitido: uso < limite, plano, uso, limite };
}

async function incrementarUso(db, userId, recurso) {
  const admin = require('firebase-admin');
  const hoje  = getDataHoje();
  const docId = `${userId}_${hoje}`;
  await db.collection('limites_uso').doc(docId).set(
    { userId, data: hoje, [recurso]: admin.firestore.FieldValue.increment(1) },
    { merge: true }
  );
}

function mensagemLimiteAtingido(recurso, plano, limite) {
  const nomePlano = NOMES_PLANOS[plano] ?? plano;
  const emojis  = { play: '🎵', ia: '🤖', figurinhas: '🖼️' };
  const acoes   = { play: 'músicas', ia: 'perguntas à IA', figurinhas: 'figurinhas' };
  const emoji   = emojis[recurso]  ?? '⚠️';
  const acao    = acoes[recurso]   ?? recurso;

  return (
    `${emoji} Você atingiu o limite de *${limite} ${acao}/dia* do plano *${nomePlano}*.\n\n` +
    `Faça upgrade para continuar usando:\n\n` +
    `💎 *Bores Plus* — R$ 4,90/mês\n` +
    `   🎵 ${LIMITES.bores_plus.play} músicas/dia  •  🤖 ${LIMITES.bores_plus.ia} perguntas/dia\n\n` +
    `🚀 *Pro* — R$ 9,90/mês\n` +
    `   🎵 ${LIMITES.pro.play} músicas/dia  •  🤖 ${LIMITES.pro.ia} perguntas/dia\n\n` +
    `⚡ *Max* — R$ 19,90/mês\n` +
    `   Tudo ilimitado!\n\n` +
    `Use o app BoresChat para fazer upgrade.`
  );
}

module.exports = {
  verificarLimite,
  incrementarUso,
  mensagemLimiteAtingido,
  getPlanoUsuario,
  LIMITES,
  NOMES_PLANOS,
};
