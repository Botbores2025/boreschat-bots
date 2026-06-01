// ADM/LIMPAR.JS
module.exports = async function limpar({ grupoId, autorNome, autorId, botDados, replyTo, enviarMensagemBot, db }) {
  // Verifica se o autor eh ADM
  const grupoDoc = await db.collection('grupos').doc(grupoId).get();
  const admins   = grupoDoc.data()?.admins || [];
  if (!admins.includes(autorId)) {
    await enviarMensagemBot(grupoId,
      'Atencao! Este comando so pode ser usado por Administradores do grupo.',
      botDados, { replyTo }
    );
    return;
  }

  // Verifica se o bot eh ADM
  if (!admins.includes('BOT_BORES_OFICIAL')) {
    await enviarMensagemBot(grupoId,
      'Preciso ser Administrador para executar este comando! Peca para um ADM me promover.',
      botDados, { replyTo }
    );
    return;
  }

  try {
    const snap = await db.collection('grupos').doc(grupoId).collection('mensagens').get();
    const total = snap.docs.length;
    let deletadas = 0;
    const lote = db.batch();
    snap.docs.forEach(d => { lote.delete(d.ref); deletadas++; });
    await lote.commit();
    await enviarMensagemBot(grupoId,
      `Chat limpo por ${autorNome}! ${deletadas} mensagens removidas.`,
      botDados
    );
  } catch (e) {
    console.error('[Limpar]', e.message);
    await enviarMensagemBot(grupoId, 'Erro ao limpar o chat.', botDados, { replyTo });
  }
};