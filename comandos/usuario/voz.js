// ═══════════════════════════════════════
// USUARIO/VOZ.JS — Transcrição de áudio com Gemini
// Uso: /voz (respondendo uma mensagem de áudio)
// ═══════════════════════════════════════

const MODELOS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];

const PROMPT_TRANSCRICAO = 'Transcreva o seguinte áudio em português brasileiro e depois responda de forma natural ao que foi dito. Máximo 4 frases. Sem markdown.';

async function tentarTranscricao(modelo, apiKey, audioBase64, mimeType) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
    const body = {
      contents: [{
        parts: [
          { text: PROMPT_TRANSCRICAO },
          { inline_data: { mime_type: mimeType, data: audioBase64 } }
        ]
      }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
    };
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    console.log(`[Voz] ${modelo} status: ${resp.status}`);

    const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!texto) {
      console.log(`[Voz] ${modelo} sem resposta. finishReason: ${data?.candidates?.[0]?.finishReason || 'desconhecido'}`);
      return null;
    }
    return texto.trim();
  } catch (e) {
    console.log(`[Voz] ${modelo} erro:`, e.message);
    return null;
  }
}

module.exports = async function voz({ grupoId, args, autorNome, replyTo, dadoReplyTo, botDados, enviarMensagemBot, db }) {
  // Verifica se a mensagem respondida é um áudio
  if (!dadoReplyTo || dadoReplyTo.tipo !== 'audio') {
    await enviarMensagemBot(grupoId,
      'Responda uma mensagem de áudio com /voz para eu transcrever!',
      botDados, { replyTo }
    );
    return;
  }

  const apiKey = process.env['GEMINI_API_KEY'] || process.env.GEMINI_API_KEY || '';
  console.log('[Voz] API Key presente:', !!apiKey, '| Tamanho:', apiKey.length);

  if (!apiKey) {
    await enviarMensagemBot(grupoId,
      '❌ IA não configurada. Admin: adicione GEMINI_API_KEY no Railway.',
      botDados, { replyTo }
    );
    return;
  }

  await enviarMensagemBot(grupoId, '🎤 Transcrevendo áudio...', botDados);

  try {
    // Busca a mensagem de áudio no Firestore pelo ID
    console.log('[Voz] Buscando mensagem de áudio ID:', dadoReplyTo.id);
    const audioDoc = await db.collection('grupos').doc(grupoId).collection('mensagens').doc(dadoReplyTo.id).get();
    if (!audioDoc.exists) {
      throw new Error('Mensagem de áudio não encontrada no Firestore');
    }
    const audioData = audioDoc.data();
    console.log('[Voz] Campos da mensagem de áudio:', Object.keys(audioData));

    const audioUrl = audioData.url || audioData.audioUrl || audioData.mediaUrl || '';
    if (!audioUrl) {
      throw new Error('URL do áudio não encontrada na mensagem');
    }

    console.log('[Voz] Baixando áudio de:', audioUrl);
    const audioResp = await fetch(audioUrl);
    if (!audioResp.ok) {
      throw new Error(`Falha ao baixar áudio: ${audioResp.status}`);
    }
    const audioBuffer = await audioResp.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');
    console.log('[Voz] Áudio baixado, tamanho base64:', audioBase64.length);

    const contentType = audioResp.headers.get('content-type') || '';
    const mimeType = contentType.includes('mp4') ? 'audio/mp4' : 'audio/m4a';
    console.log('[Voz] MIME type:', mimeType);

    for (const modelo of MODELOS) {
      const resposta = await tentarTranscricao(modelo, apiKey, audioBase64, mimeType);
      if (resposta) {
        console.log(`[Voz] Respondeu com ${modelo}:`, resposta.substring(0, 100));

        const partes = resposta.split('\n\n');
        const transcricao = partes[0] || resposta;
        const respostaTexto = partes.slice(1).join('\n\n') || '';

        const mensagem = respostaTexto
          ? `🎤 Transcrição: ${transcricao}\n\n🤖 Resposta: ${respostaTexto}`
          : `🎤 Transcrição: ${transcricao}`;

        await enviarMensagemBot(grupoId, mensagem, botDados, { replyTo });
        return;
      }
    }

    console.error('[Voz] Todos os modelos falharam');
    await enviarMensagemBot(grupoId,
      '❌ Não consegui transcrever o áudio. Tente novamente!',
      botDados, { replyTo }
    );
  } catch (e) {
    console.error('[Voz] Erro geral:', e.message);
    await enviarMensagemBot(grupoId,
      '❌ Erro ao processar o áudio. Tente novamente!',
      botDados, { replyTo }
    );
  }
};