// ═══════════════════════════════════════
// USUARIO/MENCOES.JS — Mostra quem te mencionou
// Uso: /mencoes
// ═══════════════════════════════════════

module.exports = async function mencoes({ grupoId, args, autorNome, autorId, botDados, replyTo, enviarMensagemBot, db }) {
  try {
    await enviarMensagemBot(grupoId, 'Buscando suas mencoes...', botDados);

    // Busca mensagens das ultimas 24h que mencionam o usuario
    const snap = await db.collection('grupos').doc(grupoId)
      .collection('mensagens')
      .orderBy('timestamp', 'desc')
      .limit(200)
      .get();

    const agora   = Date.now();
    const limite  = 24 * 60 * 60 * 1000; // 24h
    const mencoes = [];

    snap.docs.forEach(d => {
      const dado = d.data();
      if (!dado.texto || !dado.timestamp) return;

      const ts = dado.timestamp.toMillis?.() || dado.timestamp.seconds * 1000 || 0;
      if (agora - ts > limite) return;

      // Busca mencao ao nome do usuario
      const textoLower = dado.texto.toLowerCase();
      const nomeLower  = autorNome.toLowerCase();

      if (
        textoLower.includes(`@${nomeLower}`) ||
        (dado.mencoes && dado.mencoes.includes(autorId))
      ) {
        mencoes.push({
          nome: dado.nome || 'Membro',
          texto: dado.texto.substring(0, 80),
          hora: new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        });
      }
    });

    if (mencoes.length === 0) {
      await enviarMensagemBot(grupoId,
        `Nenhuma mencao a @${autorNome} nas ultimas 24h neste grupo!`,
        botDados, { replyTo }
      );
      return;
    }

    const lista = mencoes.slice(0, 10).map(m =>
      `[${m.hora}] ${m.nome}: ${m.texto}`
    ).join('\n\n');

    await enviarMensagemBot(grupoId,
      `Mencoes a @${autorNome} nas ultimas 24h (${mencoes.length} total):\n\n${lista}`,
      botDados, { replyTo }
    );

  } catch (e) {
    console.error('[Mencoes]', e.message);
    await enviarMensagemBot(grupoId, 'Erro ao buscar mencoes. Tente novamente!', botDados, { replyTo });
  }
};