// ═══════════════════════════════════════
// USUARIO/GEMINI.JS — IA BoresBot com personalidade
// Uso: /ia pergunta aqui
// ═══════════════════════════════════════

const SYSTEM_PROMPT = `Voce é o BoresBot, assistente oficial do BoresChat.
Fui criado e treinado por Riquefla, o desenvolvedor do BoresChat.
Sou simpático, divertido e prestativo. Respondo em português brasileiro natural.
Quando perguntarem quem me criou: "Fui criado e treinado pelo Riquefla, desenvolvedor do BoresChat!"
Máximo 4 frases por resposta. Sem markdown, sem asterisco, texto simples.`;

// Helper para sanitizar resposta
function sanitizarResposta(texto) {
  if (!texto) return '';
  
  return texto
    // Remove códigos hex problemáticos
    .replace(/\\x[0-9a-fA-F]{2}/g, '')
    // Remove caracteres de controle Unicode problemáticos
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Remove múltiplos espaços
    .replace(/  +/g, ' ')
    // Remove quebras múltiplas
    .replace(/\n\n+/g, '\n')
    // Trim final
    .trim();
}

module.exports = async function gemini({ grupoId, args, autorNome, botDados, replyTo, enviarMensagemBot }) {
  if (!args) {
    await enviarMensagemBot(grupoId,
      'Use: /ia sua pergunta\nEx: /ia O que é um buraco negro?',
      botDados, { replyTo }
    );
    return;
  }

  // Lê a key no momento da chamada
  const apiKey = process.env['GEMINI_API_KEY'] || process.env.GEMINI_API_KEY || '';
  console.log('[Gemini] API Key presente:', !!apiKey, '| Tamanho:', apiKey.length);

  if (!apiKey) {
    await enviarMensagemBot(grupoId,
      'IA não configurada. Admin: adicione GEMINI_API_KEY no Railway.',
      botDados, { replyTo }
    );
    return;
  }

  try {
    await enviarMensagemBot(grupoId, `🤖 BoresBot está pensando...`, botDados);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const body = {
      contents: [{
        parts: [{
          text: `${SYSTEM_PROMPT}\n\n${autorNome} perguntou: ${args}`
        }]
      }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await resp.json();
    console.log('[Gemini] Status:', resp.status);
    
    let resposta = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!resposta) {
      throw new Error(`Sem resposta da IA. Status: ${resp.status}`);
    }

    // Sanitiza a resposta
    resposta = sanitizarResposta(resposta);

    if (!resposta) {
      throw new Error('Resposta vazia após sanitização');
    }

    console.log('[Gemini] Resposta limpa:', resposta.substring(0, 150));
    await enviarMensagemBot(grupoId, resposta, botDados, { replyTo });

  } catch (e) {
    console.error('[Gemini] Erro:', e.message);
    await enviarMensagemBot(
      grupoId,
      '❌ Erro ao consultar a IA. Tente novamente em alguns segundos!',
      botDados,
      { replyTo }
    );
  }
};