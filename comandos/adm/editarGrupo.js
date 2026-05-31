// ═══════════════════════════════════════
// ADM/EDITAR-GRUPO.JS — Edita nome do grupo
// Uso: /rename Novo Nome do Grupo
// ═══════════════════════════════════════

module.exports = async function editarGrupo({ grupoId, args, autorNome, botDados, replyTo, enviarMensagemBot, db }) {
  if (!args) {
    await enviarMensagemBot(grupoId, '⚠️ Use: /rename Novo Nome', botDados, { replyTo });
    return;
  }

  try {
    const nomeAntigo = (await db.collection('grupos').doc(grupoId).get()).data()?.nome;
    await db.collection('grupos').doc(grupoId).update({ nome: args.trim() });
    await enviarMensagemBot(grupoId,
      `✏️ Grupo renomeado por *${autorNome}*!\n\n*${nomeAntigo}* → *${args.trim()}*`,
      botDados
    );
  } catch (e) {
    console.error('[editarGrupo]', e.message);
    await enviarMensagemBot(grupoId, '❌ Erro ao renomear grupo.', botDados, { replyTo });
  }
};