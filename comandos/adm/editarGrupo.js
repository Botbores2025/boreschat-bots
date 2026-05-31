// ADM/EDITARGRUPO.JS
module.exports = async function editarGrupo({ grupoId, args, autorNome, autorId, botDados, replyTo, enviarMensagemBot, db }) {
  const grupoDoc = await db.collection('grupos').doc(grupoId).get();
  const admins   = grupoDoc.data()?.admins || [];
  if (!admins.includes(autorId)) {
    await enviarMensagemBot(grupoId,
      'Atencao! Este comando so pode ser usado por Administradores do grupo.',
      botDados, { replyTo }
    );
    return;
  }

  if (!args) {
    await enviarMensagemBot(grupoId, 'Use: /rename Novo Nome do Grupo', botDados, { replyTo });
    return;
  }

  try {
    await db.collection('grupos').doc(grupoId).update({ nome: args.trim() });
    await enviarMensagemBot(grupoId, `Grupo renomeado para "${args.trim()}" por ${autorNome}!`, botDados);
  } catch (e) {
    await enviarMensagemBot(grupoId, 'Erro ao renomear grupo.', botDados, { replyTo });
  }
};