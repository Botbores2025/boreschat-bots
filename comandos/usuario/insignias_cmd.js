// ═══════════════════════════════════════════════════════════════
// USUARIO/INSIGNIAS_CMD.JS — Comando /insignias
// Uso: /insignias   ou   /insignias @usuario
// ═══════════════════════════════════════════════════════════════

const { verificarInsigniasUsuario, INSIGNIAS_INFO } = require('../sistema/insignias');

module.exports = async function insignias_cmd({ grupoId, args, autorNome, autorId, botDados, replyTo, enviarMensagemBot, db }) {
  try {
    let targetId   = autorId;
    let targetNome = autorNome;

    // Se passou @usuario, busca o membro pelo nome
    if (args && args.trim()) {
      const nomeBuscado = args.trim().replace(/^@/, '').toLowerCase();
      try {
        const grupoDoc = await db.collection('grupos').doc(grupoId).get();
        const membros  = grupoDoc.exists ? (grupoDoc.data().membros || []) : [];

        for (const uid of membros) {
          const uDoc = await db.collection('usuarios').doc(uid).get();
          if (!uDoc.exists) continue;
          const nome = (uDoc.data().nome || '').toLowerCase();
          if (nome.includes(nomeBuscado) || uid === nomeBuscado) {
            targetId   = uid;
            targetNome = uDoc.data().nome || uid;
            break;
          }
        }
      } catch (_) {}
    }

    // Atualiza e busca as insígnias do alvo
    const insignias = await verificarInsigniasUsuario(targetId, db);

    if (!insignias || insignias.length === 0) {
      await enviarMensagemBot(grupoId,
        `📭 @${targetNome} ainda não desbloqueou nenhuma insígnia.\nContinue ativo para conquistar suas primeiras!`,
        botDados, { replyTo }
      );
      return;
    }

    const linhas = insignias.map(id => {
      const info = INSIGNIAS_INFO[id] || { emoji: '🏅', nome: id };
      return `${info.emoji} ${info.nome}`;
    });

    const resposta =
      `🏆 INSÍGNIAS DE @${targetNome}\n\n` +
      linhas.join('\n') +
      `\n\nTotal: ${insignias.length} insígnia${insignias.length !== 1 ? 's' : ''}`;

    await enviarMensagemBot(grupoId, resposta, botDados, { replyTo });
  } catch (e) {
    console.log('[Insignias] insignias_cmd erro:', e.message);
    await enviarMensagemBot(grupoId,
      '❌ Erro ao buscar insígnias. Tente novamente!',
      botDados, { replyTo }
    );
  }
};
