// ═══════════════════════════════════════
// USUARIO/GEMINI.JS — IA do Google Gemini
// Uso: /ia pergunta aqui
// ═══════════════════════════════════════

module.exports = async function gemini({ grupoId, args, autorNome, botDados, replyTo, enviarMensagemBot }) {
  if (!args) {
    await enviarMensagemBot(grupoId, '⚠️ Use: /ia sua pergunta\nEx: /ia O que é buraco negro?', botDados, { replyTo });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY || '';

  if (!apiKey) {
    await enviarMensagemBot(grupoId,
      '⚠️ Gemini não configurado.\n\nAdministrador: adicione GEMINI_API_KEY nas variáveis do Railway.',
      botDados, { replyTo }
    );
    return;
  }

  try {
    await enviarMensagemBot(grupoId, `🤖 *${botDados.nome}* está pensando... ⏳`, botDados);

    const url  = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
    const body = {
      contents: [{
        parts: [{
          text: `Você é um assistente de grupo de chat chamado ${botDados.nome}. Responda de forma curta e direta em português. Pergunta de ${autorNome}: ${args}`
        }]
      }]
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data     = await resp.json();
    const resposta = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!resposta) throw new Error('Sem resposta da IA');

    await enviarMensagemBot(grupoId,
      `🤖 *${botDados.nome}*\n\n${resposta}`,
      botDados, { replyTo }
    );
  } catch (e) {
    console.error('[gemini]', e.message);
    await enviarMensagemBot(grupoId, '❌ Erro ao consultar a IA.', botDados, { replyTo });
  }
};