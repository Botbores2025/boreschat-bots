// ═══════════════════════════════════════
// ADM/REMOVER.JS — Remove membro sem banir
// Uso: /remover @nome
// ═══════════════════════════════════════
const admin = require('firebase-admin');

module.exports = async function remover({ grupoId, args, autorNome, botDados, replyTo, enviarMensagemBot, db }) {
  if (!args) {
    await enviarMensagemBot(grupoId, '⚠️ Use: /remover @nome', botDados, { replyTo });
    return;
  }

  try {
    const busca    = args.replace('@', '').toLowerCase().trim();
    const grupoDoc = await db.collection('grupos').doc(grupoId).get();
    const membros  = grupoDoc.data()?.membros || [];

    let encontrado = null;
    for (const uid of membros) {
      const u = await db.collection('usuarios').doc(uid).get();
      if (u.exists && u.data().nome?.toLowerCase().includes(busca)) {
        encontrado = { uid, nome: u.data().nome };
        break;
      }
    }

    if (!encontrado) {
      await enviarMensagemBot(grupoId, `❌ Usuário *${args}* não encontrado no grupo.`, botDados, { replyTo });
      return;
    }

    await db.collection('grupos').doc(grupoId).update({
      membros: admin.firestore.FieldValue.arrayRemove(encontrado.uid),
      admins:  admin.firestore.FieldValue.arrayRemove(encontrado.uid),
    });

    await enviarMensagemBot(grupoId,
      `👋 *${encontrado.nome}* foi removido do grupo por *${autorNome}*.`,
      botDados
    );
  } catch (e) {
    console.error('[remover]', e.message);
    await enviarMensagemBot(grupoId, '❌ Erro ao remover usuário.', botDados, { replyTo });
  }
};