// ═══════════════════════════════════════
// ADM/BANIR.JS — Bane (remove) um membro do grupo
// Uso: /banir @nome ou /banir teste
// ═══════════════════════════════════════
const admin = require('firebase-admin');

module.exports = async function banir({ grupoId, args, autorNome, botDados, replyTo, enviarMensagemBot, db }) {
  if (!args) {
    await enviarMensagemBot(grupoId, '⚠️ Use: /banir @nome ou /banir nome', botDados, { replyTo });
    return;
  }

  try {
    const busca = args.replace('@', '').toLowerCase().trim();

    // Busca membros do grupo
    const grupoDoc = await db.collection('grupos').doc(grupoId).get();
    const membros  = grupoDoc.data()?.membros || [];

    // Busca usuário pelo nome
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

    // Remove dos membros e admins
    await db.collection('grupos').doc(grupoId).update({
      membros: admin.firestore.FieldValue.arrayRemove(encontrado.uid),
      admins:  admin.firestore.FieldValue.arrayRemove(encontrado.uid),
    });

    await enviarMensagemBot(grupoId,
      `🔨 *${encontrado.nome}* foi banido do grupo por *${autorNome}*!`,
      botDados
    );
  } catch (e) {
    console.error('[banir]', e.message);
    await enviarMensagemBot(grupoId, '❌ Erro ao banir usuário.', botDados, { replyTo });
  }
};