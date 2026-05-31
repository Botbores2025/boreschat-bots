// ═══════════════════════════════════════
// USUARIO/MUSICA.JS — Info de música via Last.fm
// Uso: /musica Nome da Música
// ═══════════════════════════════════════

module.exports = async function musica({ grupoId, args, autorNome, botDados, replyTo, enviarMensagemBot }) {
  if (!args) {
    await enviarMensagemBot(grupoId, '⚠️ Use: /musica Nome da Música\nEx: /musica Bohemian Rhapsody', botDados, { replyTo });
    return;
  }

  try {
    const query    = encodeURIComponent(args.trim());
    const apiKey   = process.env.LASTFM_API_KEY || '';

    if (!apiKey) {
      // Sem API key, retorna mensagem simples
      await enviarMensagemBot(grupoId,
        `🎵 *${args}*\n\n_Pesquise no Spotify ou YouTube!_\nhttps://open.spotify.com/search/${query}`,
        botDados, { replyTo }
      );
      return;
    }

    const url  = `https://ws.audioscrobbler.com/2.0/?method=track.search&track=${query}&api_key=${apiKey}&format=json&limit=1`;
    const resp = await fetch(url);
    const data = await resp.json();
    const track = data?.results?.trackmatches?.track?.[0];

    if (!track) {
      await enviarMensagemBot(grupoId, `❌ Música "*${args}*" não encontrada.`, botDados, { replyTo });
      return;
    }

    await enviarMensagemBot(grupoId,
      `🎵 *${track.name}*\n👤 ${track.artist}\n▶️ ${track.url}`,
      botDados, { replyTo }
    );
  } catch (e) {
    console.error('[musica]', e.message);
    await enviarMensagemBot(grupoId, '❌ Erro ao buscar música.', botDados, { replyTo });
  }
};