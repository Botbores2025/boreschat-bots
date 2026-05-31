// ADM/ADICIONAR.JS
module.exports = async function adicionar({ grupoId, args, autorNome, autorId, botDados, replyTo, enviarMensagemBot, db }) {
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
    await enviarMensagemBot(grupoId, 'Use: /admin @nome', botDados, { replyTo });
    return;
  }

  try {
    const busca   = args.replace('@','').toLowerCase().trim();
    const membros = grupoDoc.data()?.membros || [];
    let alvoId = null, alvoNome = null;

    for (const uid of membros) {
      const u = await db.collection('usuarios').doc(uid).get();
      if (u.exists && u.data().nome?.toLowerCase().includes(busca)) {
        alvoId   = uid;
        alvoNome = u.data().nome;
        break;
      }
    }

    if (!alvoId) {
      await enviarMensagemBot(grupoId, `Usuario "${args}" nao encontrado!`, botDados, { replyTo });
      return;
    }

    if (admins.includes(alvoId)) {
      await enviarMensagemBot(grupoId, `${alvoNome} ja e administrador!`, botDados, { replyTo });
      return;
    }

    await db.collection('grupos').doc(grupoId).update({
      admins: [...admins, alvoId],
    });

    await enviarMensagemBot(grupoId, `${alvoNome} foi promovido(a) a Administrador por ${autorNome}!`, botDados);
  } catch (e) {
    console.error('[Admin]', e.message);
    await enviarMensagemBot(grupoId, 'Erro ao promover usuario.', botDados, { replyTo });
  }
};