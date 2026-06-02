// ═══════════════════════════════════════
// USUARIO/GEMINI.JS — IA BoresBot com fallback 3 modelos
// Uso: /ia pergunta aqui
// ═══════════════════════════════════════

const SYSTEM_PROMPT = `Voce é o BoresBot, assistente oficial do BoresChat.
Fui criado e treinado por Riquefla, o desenvolvedor do BoresChat.
Sou simpático, divertido e prestativo. Respondo em português brasileiro natural.
Quando perguntarem quem me criou: "Fui criado e treinado pelo Riquefla, desenvolvedor do BoresChat!"
Máximo 4 frases por resposta. Sem markdown, sem asterisco, texto simples.`;

const MODELOS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];

function sanitizarResposta(texto) {
  if (!texto) return '';
  return texto
    .replace(/\\x[0-9a-fA-F]{2}/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/  +/g, ' ')
    .replace(/\n\n+/g, '\n')
    .trim();
}

async function tentarModelo(modelo, apiKey, prompt) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
    };
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    console.log(`[Gemini] ${modelo} status: ${resp.status}`);

    const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!texto) {
      console.log(`[Gemini] ${modelo} sem resposta. finishReason: ${data?.candidates?.[0]?.finishReason || 'desconhecido'}`);
      return null;
    }
    return sanitizarResposta(texto);
  } catch (e) {
    console.log(`[Gemini] ${modelo} erro:`, e.message);
    return null;
  }
}

module.exports = async function gemini({ grupoId, args, autorNome, botDados, replyTo, enviarMensagemBot }) {
  if (!args) {
    await enviarMensagemBot(grupoId,
      'Use: /ia sua pergunta\nEx: /ia O que é um buraco negro?',
      botDados, { replyTo }
    );
    return;
  }

  const apiKey = process.env['GEMINI_API_KEY'] || process.env.GEMINI_API_KEY || '';
  console.log('[Gemini] API Key presente:', !!apiKey, '| Tamanho:', apiKey.length);

  if (!apiKey) {
    await enviarMensagemBot(grupoId,
      'IA não configurada. Admin: adicione GEMINI_API_KEY no Railway.',
      botDados, { replyTo }
    );
    return;
  }

  await enviarMensagemBot(grupoId, `🤖 BoresBot está pensando...`, botDados);

  const prompt = `${SYSTEM_PROMPT}\n\n${autorNome} perguntou: ${args}`;

  // Tenta cada modelo até um responder
  for (const modelo of MODELOS) {
    const resposta = await tentarModelo(modelo, apiKey, prompt);
    if (resposta) {
      console.log(`[Gemini] Respondeu com ${modelo}:`, resposta.substring(0, 100));
      await enviarMensagemBot(grupoId, resposta, botDados, { replyTo });
      return;
    }
  }

  // Nenhum modelo respondeu
  console.error('[Gemini] Todos os modelos falharam');
  await enviarMensagemBot(
    grupoId,
    '❌ Erro ao consultar a IA. Tente novamente em alguns segundos!',
    botDados,
    { replyTo }
  );
};