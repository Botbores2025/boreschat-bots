// ADM/REMOVER.JS
module.exports = async function remover({ grupoId, args, autorNome, autorId, botDados, replyTo, enviarMensagemBot, db }) {
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
    await enviarMensagemBot(grupoId, 'Use: /remover @nome', botDados, { replyTo });
    return;
  }

  try {
    const busca   = args.replace('@','').toLowerCase().trim();
    const membros = grupoDoc.data()?.membros || [];
    let removidoId = null, removidoNome = null;

    for (const uid of membros) {
      const u = await db.collection('usuarios').doc(uid).get();
      if (u.exists && u.data().nome?.toLowerCase().includes(busca)) {
        removidoId   = uid;
        removidoNome = u.data().nome;
        break;
      }
    }

    if (!removidoId) {
      await enviarMensagemBot(grupoId, `Usuario "${args}" nao encontrado!`, botDados, { replyTo });
      return;
    }

    if (admins.includes(removidoId)) {
      await enviarMensagemBot(grupoId, `Nao posso remover ${removidoNome} pois ele(a) e administrador!`, botDados, { replyTo });
      return;
    }

    await db.collection('grupos').doc(grupoId).update({
      membros: membros.filter(id => id !== removidoId),
    });

    await enviarMensagemBot(grupoId, `${removidoNome} foi removido(a) por ${autorNome}!`, botDados);
  } catch (e) {
    console.error('[Remover]', e.message);
    await enviarMensagemBot(grupoId, 'Erro ao remover usuario.', botDados, { replyTo });
  }
};