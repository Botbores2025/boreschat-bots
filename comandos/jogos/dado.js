// ═══════════════════════════════════════
// JOGOS/DADO.JS — Joga um dado
// Uso: /dado
// ═══════════════════════════════════════

module.exports = async function dado({ grupoId, autorNome, botDados, replyTo, enviarMensagemBot }) {
  const resultado = Math.floor(Math.random() * 6) + 1;
  const emojis    = ['⚀','⚁','⚂','⚃','⚄','⚅'];
  const emoji     = emojis[resultado - 1];
  const msg = resultado === 6
    ? `🎲 *${autorNome}* jogou o dado!\n\n${emoji} *${resultado}* — MÁXIMO! 🔥`
    : resultado === 1
    ? `🎲 *${autorNome}* jogou o dado!\n\n${emoji} *${resultado}* — Que azar! 😅`
    : `🎲 *${autorNome}* jogou o dado!\n\n${emoji} *${resultado}*`;
  await enviarMensagemBot(grupoId, msg, botDados, { replyTo });
};