// ADM/BANIR.JS
module.exports = async function banir({ grupoId, args, autorNome, autorId, botDados, replyTo, enviarMensagemBot, db }) {
  // Verifica se eh ADM
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
    await enviarMensagemBot(grupoId, 'Use: /banir @nome', botDados, { replyTo });
    return;
  }

  try {
    const busca    = args.replace('@','').toLowerCase().trim();
    const membros  = grupoDoc.data()?.membros || [];
    let banidoId   = null, banidoNome = null;

    for (const uid of membros) {
      const u = await db.collection('usuarios').doc(uid).get();
      if (u.exists && u.data().nome?.toLowerCase().includes(busca)) {
        banidoId   = uid;
        banidoNome = u.data().nome;
        break;
      }
    }

    if (!banidoId) {
      await enviarMensagemBot(grupoId, `Usuario "${args}" nao encontrado!`, botDados, { replyTo });
      return;
    }

    if (admins.includes(banidoId)) {
      await enviarMensagemBot(grupoId, `Nao posso banir ${banidoNome} pois ele(a) e administrador!`, botDados, { replyTo });
      return;
    }

    await db.collection('grupos').doc(grupoId).update({
      membros: membros.filter(id => id !== banidoId),
      banidos: [...(grupoDoc.data()?.banidos || []), banidoId],
    });

    await enviarMensagemBot(grupoId, `${banidoNome} foi banido(a) por ${autorNome}!`, botDados);
  } catch (e) {
    console.error('[Banir]', e.message);
    await enviarMensagemBot(grupoId, 'Erro ao banir usuario.', botDados, { replyTo });
  }
};