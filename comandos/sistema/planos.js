// ═══════════════════════════════════════════════════
// SISTEMA/PLANOS.JS — Gestão de planos e limites diários
// ═══════════════════════════════════════════════════

const PLANOS_PRECOS = {
  bores_plus: { nome: 'Bores+', preco: 4.90  },
  pro:        { nome: 'Pro',    preco: 9.90  },
  max:        { nome: 'Max',    preco: 19.90 },
};

const LIMITES_FREE = {
  play_dia:        5,
  ia_dia:         20,
  figurinhas_dia: 10,
};

const TOLERANCIA_MS = 3 * 24 * 60 * 60 * 1000; // 3 dias

function getDataHoje() {
  return new Date().toISOString().split('T')[0];
}

async function getPlanoUsuario(userId, db) {
  try {
    const doc = await db.collection('usuarios').doc(userId).get();
    if (!doc.exists) return { id: 'free', venceEm: null, ehFree: true };

    const dados = doc.data();
    const planoAtual = dados.planoAtual;

    if (!planoAtual || planoAtual === 'free') {
      return { id: 'free', venceEm: null, ehFree: true };
    }

    const venceEm  = dados.planoVenceEm?.toMillis?.() ?? 0;
    const vencido  = venceEm + TOLERANCIA_MS < Date.now();

    if (vencido) {
      // Marca como free sem await para não bloquear
      db.collection('usuarios').doc(userId).update({
        planoAtual:    'free',
        planoVencidoEm: require('firebase-admin').firestore.FieldValue.serverTimestamp(),
      }).catch(e => console.log('[Planos] Erro ao marcar vencido:', e.message));

      return { id: 'free', venceEm: null, ehFree: true };
    }

    return { id: planoAtual, venceEm: new Date(venceEm), ehFree: false };
  } catch (e) {
    console.log('[Planos] getPlanoUsuario erro:', e.message);
    return { id: 'free', venceEm: null, ehFree: true };
  }
}

async function ativarPlano(userId, planoId, db) {
  try {
    const admin = require('firebase-admin');
    const agora  = new Date();
    const vence  = new Date(agora.getTime() + 30 * 24 * 60 * 60 * 1000);

    await db.collection('usuarios').doc(userId).set({
      planoAtual:      planoId,
      planoIniciadoEm: admin.firestore.Timestamp.fromDate(agora),
      planoVenceEm:    admin.firestore.Timestamp.fromDate(vence),
    }, { merge: true });

    // Histórico de planos
    await db.collection('usuarios').doc(userId)
      .collection('historicoPlanos').add({
        planoId,
        iniciadoEm: admin.firestore.Timestamp.fromDate(agora),
        venceEm:    admin.firestore.Timestamp.fromDate(vence),
      });

    console.log(`[Planos] Plano ${planoId} ativado para ${userId}`);
  } catch (e) {
    console.error('[Planos] ativarPlano erro:', e.message);
    throw e;
  }
}

async function verificarLimite(userId, tipo, db) {
  try {
    const plano = await getPlanoUsuario(userId, db);

    if (!plano.ehFree) {
      return { permitido: true, ilimitado: true };
    }

    const limite = LIMITES_FREE[tipo + '_dia'] ?? 0;
    const hoje   = getDataHoje();
    const docRef = db.collection('uso_diario').doc(userId)
                     .collection('dias').doc(hoje);
    const doc    = await docRef.get();
    const usados = doc.exists ? (doc.data()[tipo] ?? 0) : 0;

    return { permitido: usados < limite, usados, limite };
  } catch (e) {
    console.log('[Planos] verificarLimite erro:', e.message);
    return { permitido: true, ilimitado: true }; // Falha aberta: não bloqueia por erro técnico
  }
}

async function incrementarUso(userId, tipo, db) {
  try {
    const admin  = require('firebase-admin');
    const hoje   = getDataHoje();
    const docRef = db.collection('uso_diario').doc(userId)
                     .collection('dias').doc(hoje);

    await docRef.set(
      { [tipo]: admin.firestore.FieldValue.increment(1) },
      { merge: true }
    );
  } catch (e) {
    console.log('[Planos] incrementarUso erro:', e.message);
  }
}

module.exports = {
  getPlanoUsuario,
  ativarPlano,
  verificarLimite,
  incrementarUso,
  PLANOS_PRECOS,
  LIMITES_FREE,
};
