// ═══════════════════════════════════════════════════════════════
// SISTEMA/INSIGNIAS.JS — Verificação automática de insígnias
// ═══════════════════════════════════════════════════════════════

const INSIGNIAS_INFO = {
  desenvolvedor:         { nome: 'Desenvolvedor',          emoji: '🛠️' },
  desenvolvedor_ativo:   { nome: 'Desenvolvedor Ativo',    emoji: '⚡' },
  desenvolvedor_destaque:{ nome: 'Desenvolvedor Destaque', emoji: '🌟' },
  pioneiro:              { nome: 'Pioneiro',               emoji: '🚀' },
  active_moderator:      { nome: 'Moderador Ativo',        emoji: '🛡️' },
  official_partner:      { nome: 'Parceiro Oficial',       emoji: '🤝' },
  bug_hunter:            { nome: 'Bug Hunter',             emoji: '🐛' },
  bug_hunter_elite:      { nome: 'Bug Hunter Elite',       emoji: '💀' },
  apoiador_inicial:      { nome: 'Apoiador Inicial',       emoji: '💎' },
  criador_comunidade:    { nome: 'Criador de Comunidade',  emoji: '👑' },
  verificado:            { nome: 'Verificado',             emoji: '✅' },
};

async function contarBotsAtivos(donoId, db) {
  try {
    const botsSnap = await db.collection('bots').where('donoId', '==', donoId).limit(20).get();
    let max30 = 0, max15 = 0;
    const agora = Date.now();
    for (const b of botsSnap.docs) {
      const dados = b.data();
      const ultimosComandos = dados.ultimosComandos || [];
      const cmds30 = ultimosComandos.filter(t => agora - t < 30 * 24 * 60 * 60 * 1000).length;
      const cmds15 = ultimosComandos.filter(t => agora - t < 15 * 24 * 60 * 60 * 1000).length;
      max30 = Math.max(max30, cmds30);
      max15 = Math.max(max15, cmds15);
    }
    return { total30dias: max30, total15dias: max15 };
  } catch (e) {
    console.log('[Insignias] contarBotsAtivos erro:', e.message);
    return { total30dias: 0, total15dias: 0 };
  }
}

async function contarMensagensGrupo(grupoId, db, diasAtras) {
  try {
    const desde = new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000);
    const snap = await db.collection('grupos').doc(grupoId)
      .collection('mensagens')
      .where('timestamp', '>=', desde)
      .limit(2000)
      .get();
    return snap.size;
  } catch (e) {
    console.log('[Insignias] contarMensagensGrupo erro:', e.message);
    return 0;
  }
}

async function contarGruposDoDono(userId, db) {
  try {
    const gruposSnap = await db.collection('grupos').where('criadoPor', '==', userId).limit(20).get();
    let maiorGrupo = 0;
    let totalMembros = 0;
    for (const g of gruposSnap.docs) {
      const membros = (g.data().membros || []).length;
      totalMembros += membros;
      if (membros > maiorGrupo) maiorGrupo = membros;
    }
    return { maiorGrupo, totalMembros, docs: gruposSnap.docs };
  } catch (e) {
    console.log('[Insignias] contarGruposDoDono erro:', e.message);
    return { maiorGrupo: 0, totalMembros: 0, docs: [] };
  }
}

async function verificarInsigniasUsuario(userId, db) {
  try {
    const userDoc = await db.collection('usuarios').doc(userId).get();
    const usuario = userDoc.exists ? userDoc.data() : {};

    const insignias = [];

    // ── Verificado ─────────────────────────────────────────────────
    if (usuario.verificado === true) insignias.push('verificado');

    // ── Staff/Moderador ────────────────────────────────────────────
    if (usuario.staff === true) insignias.push('active_moderator');

    // ── Apoiador inicial ───────────────────────────────────────────
    if (usuario.apoiadorInicial === true) insignias.push('apoiador_inicial');

    // ── Bug Hunter ─────────────────────────────────────────────────
    if ((usuario.bugsReportados || 0) >= 1) insignias.push('bug_hunter');
    if ((usuario.bugsCriticos || 0) >= 5) insignias.push('bug_hunter_elite');

    // ── Parceiro Oficial ───────────────────────────────────────────
    if (usuario.parceiroOficial === true) insignias.push('official_partner');

    // ── Pioneiro ───────────────────────────────────────────────────
    if (usuario.criadoEm) {
      const dataLimite = new Date('2027-01-01');
      const criadoEm = usuario.criadoEm?.toDate?.() || new Date(usuario.criadoEm);
      if (criadoEm < dataLimite) insignias.push('pioneiro');
    }

    // ── Bots (desenvolvedor) ───────────────────────────────────────
    const { total30dias, total15dias } = await contarBotsAtivos(userId, db);
    if (total30dias >= 100) insignias.push('desenvolvedor');
    if (total15dias >= 1000) insignias.push('desenvolvedor_ativo');
    if (total30dias >= 10000) insignias.push('desenvolvedor_destaque');

    // ── Grupos do dono ─────────────────────────────────────────────
    const { maiorGrupo, docs: gruposDocs } = await contarGruposDoDono(userId, db);

    if (maiorGrupo >= 50) insignias.push('criador_comunidade');

    // ── Parceiro Oficial por grupo ─────────────────────────────────
    if (!insignias.includes('official_partner')) {
      for (const g of gruposDocs) {
        const membros = (g.data().membros || []).length;
        if (membros >= 100) {
          const msgsCount = await contarMensagensGrupo(g.id, db, 30);
          if (msgsCount >= 1000) {
            insignias.push('official_partner');
            break;
          }
        }
      }
    }

    // ── Atualiza no Firestore apenas se mudou ──────────────────────
    const insigniasAntigas = usuario.insignias || [];
    const mudou = insignias.length !== insigniasAntigas.length ||
      insignias.some(i => !insigniasAntigas.includes(i));

    if (mudou) {
      await db.collection('usuarios').doc(userId).set(
        { insignias },
        { merge: true }
      );
      const novas = insignias.filter(i => !insigniasAntigas.includes(i));
      if (novas.length > 0) {
        console.log(`[Insignias] ${userId} conquistou: ${novas.join(', ')}`);
      }
    }

    return insignias;
  } catch (e) {
    console.log('[Insignias] verificarInsigniasUsuario erro:', e.message);
    return [];
  }
}

async function verificarInsigniasGrupo(grupoId, db) {
  try {
    const grupoDoc = await db.collection('grupos').doc(grupoId).get();
    if (!grupoDoc.exists) return;
    const membros = (grupoDoc.data().membros || []).slice(0, 10);
    for (const userId of membros) {
      await verificarInsigniasUsuario(userId, db);
      await new Promise(r => setTimeout(r, 300));
    }
  } catch (e) {
    console.log('[Insignias] verificarInsigniasGrupo erro:', e.message);
  }
}

module.exports = {
  verificarInsigniasUsuario,
  verificarInsigniasGrupo,
  INSIGNIAS_INFO,
};
