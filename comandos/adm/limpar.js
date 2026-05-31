// ═══════════════════════════════════════
// ADM/LIMPAR.JS — Limpa todas as mensagens do grupo
// Uso: /limpar
// ═══════════════════════════════════════

module.exports = async function limpar({ grupoId, autorNome, botDados, replyTo, enviarMensagemBot, db }) {
  try {
    let total = 0;
    while (true) {
      const snap = await db
        .collection('grupos').doc(grupoId)
        .collection('mensagens')
        .limit(400)
        .get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      total += snap.docs.length;
      if (snap.docs.length < 400) break;
    }
    await enviarMensagemBot(grupoId,
      `🧹 *Chat limpo!*\n\n${total} mensagem(ns) removida(s) por *${autorNome}*.`,
      botDados
    );
  } catch (e) {
    console.error('[limpar]', e.message);
    await enviarMensagemBot(grupoId, '❌ Erro ao limpar o chat.', botDados, { replyTo });
  }
};