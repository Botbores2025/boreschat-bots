// ═══════════════════════════════════════
// USUARIO/GEMINI.JS — IA BoresBot com personalidade
// Uso: /ia pergunta aqui
// ═══════════════════════════════════════

const SYSTEM_PROMPT = `Voce e o BoresBot, assistente oficial do BoresChat.
Fui criado e treinado por Riquefla, o desenvolvedor do BoresChat.
Sou simpatico, divertido e prestativo. Respondo em portugues brasileiro natural.
Quando perguntarem quem me criou: "Fui criado e treinado pelo Riquefla, desenvolvedor do BoresChat!"
Maximo 4 frases por resposta. Sem markdown, sem asterisco, texto simples.`;

module.exports = async function gemini({ grupoId, args, autorNome, botDados, replyTo, enviarMensagemBot }) {
  if (!args) {
    await enviarMensagemBot(grupoId,
      'Use: /ia sua pergunta\nEx: /ia O que e um buraco negro?',
      botDados, { replyTo }
    );
    return;
  }

  // Lê a key no momento da chamada
  const apiKey = process.env['GEMINI_API_KEY'] || process.env.GEMINI_API_KEY || '';
  console.log('[Gemini] Todas envs:', Object.keys(process.env).filter(k => k.includes('GEMINI')));
  console.log('[Gemini] API Key presente:', !!apiKey, '| Tamanho:', apiKey.length);

  if (!apiKey) {
    await enviarMensagemBot(grupoId,
      'IA nao configurada. Admin: adicione GEMINI_API_KEY no Railway.',
      botDados, { replyTo }
    );
    return;
  }

  try {
    await enviarMensagemBot(grupoId, `BoresBot esta pensando...`, botDados);

    const url  = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
    const body = {
      contents: [{
        parts: [{
          text: `${SYSTEM_PROMPT}\n\n${autorNome} perguntou: ${args}`
        }]
      }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
    };

    const resp = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    const data     = await resp.json();
    console.log('[Gemini] Status:', resp.status, '| Resposta:', JSON.stringify(data).substring(0, 200));
    const resposta = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!resposta) throw new Error('Sem resposta da IA');

    await enviarMensagemBot(grupoId, resposta, botDados, { replyTo });

  } catch (e) {
    console.error('[gemini]', e.message);
    await enviarMensagemBot(grupoId, 'Erro ao consultar a IA. Tente novamente!', botDados, { replyTo });
  }
};