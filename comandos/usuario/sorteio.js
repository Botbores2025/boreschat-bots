// ═══════════════════════════════════════
// USUARIO/SORTEIO.JS — Sorteia membro do grupo
// Uso: /sorteio              → sorteia qualquer membro
//      /sorteio @user1 @user2 → sorteia entre mencionados
// ═══════════════════════════════════════

module.exports = async function sorteio({ grupoId, args, autorNome, botDados, replyTo, enviarMensagemBot, db }) {
  try {
    await enviarMensagemBot(grupoId, 'Girando a roleta...', botDados);
    await new Promise(r => setTimeout(r, 1500));

    const grupoDoc = await db.collection('grupos').doc(grupoId).get();
    const membros  = grupoDoc.data()?.membros || [];

    let candidatos = [];

    if (args && args.includes('@')) {
      // Sorteia entre mencionados
      const nomes = args.match(/@(\S+)/g)?.map(n => n.replace('@', '').toLowerCase()) || [];
      for (const uid of membros) {
        try {
          const u = await db.collection('usuarios').doc(uid).get();
          if (u.exists) {
            const nome = u.data().nome || '';
            if (nomes.some(n => nome.toLowerCase().includes(n))) {
              candidatos.push({ id: uid, nome });
            }
          }
        } catch (_) {}
      }
    } else {
      // Sorteia entre todos os membros
      for (const uid of membros) {
        try {
          const u = await db.collection('usuarios').doc(uid).get();
          if (u.exists && uid !== 'BOT_BORES_OFICIAL') {
            candidatos.push({ id: uid, nome: u.data().nome || 'Membro' });
          }
        } catch (_) {}
      }
    }

    if (candidatos.length === 0) {
      await enviarMensagemBot(grupoId, 'Nenhum candidato encontrado para o sorteio!', botDados, { replyTo });
      return;
    }

    if (candidatos.length === 1) {
      await enviarMensagemBot(grupoId, `So tem um candidato: ${candidatos[0].nome}. Sorteio nao necessario!`, botDados, { replyTo });
      return;
    }

    const vencedor = candidatos[Math.floor(Math.random() * candidatos.length)];

    const EMOJIS_FESTA = ['🎉', '🏆', '🎊', '⭐', '🔥'];
    const emoji = EMOJIS_FESTA[Math.floor(Math.random() * EMOJIS_FESTA.length)];

    await enviarMensagemBot(grupoId,
      `${emoji} RESULTADO DO SORTEIO ${emoji}\n\nO grande vencedor e:\n\n@${vencedor.nome}\n\nParabens! Entre ${candidatos.length} participantes.`,
      botDados, { replyTo }
    );

  } catch (e) {
    console.error('[Sorteio]', e.message);
    await enviarMensagemBot(grupoId, 'Erro ao realizar sorteio. Tente novamente!', botDados, { replyTo });
  }
};