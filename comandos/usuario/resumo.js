// ═══════════════════════════════════════
// USUARIO/RESUMO.JS — Resume mensagens do grupo
// Uso: /resumo        → últimas 30 msgs
//      /resumo 50     → últimas 50 msgs
// ═══════════════════════════════════════

const https = require('https');

async function resumirComGemini(texto) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const MODELOS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];

  for (const modelo of MODELOS) {
    try {
      const body = JSON.stringify({
        contents: [{
          parts: [{ text: `Resuma as seguintes mensagens de um grupo de chat em portugues brasileiro. Seja direto, maximo 5 pontos principais. Sem markdown, texto simples:\n\n${texto}` }]
        }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 400 }
      });

      const resposta = await new Promise((resolve) => {
        const req = https.request({
          hostname: 'generativelanguage.googleapis.com',
          path: `/v1beta/models/${modelo}:generateContent?key=${apiKey}`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, (res) => {
          let raw = '';
          res.on('data', c => raw += c);
          res.on('end', () => {
            try { resolve(JSON.parse(raw)?.candidates?.[0]?.content?.parts?.[0]?.text || null); }
            catch (_) { resolve(null); }
          });
        });
        req.on('error', () => resolve(null));
        req.write(body); req.end();
      });

      if (resposta) return resposta;
    } catch (_) {}
  }
  return null;
}

module.exports = async function resumo({ grupoId, args, autorNome, botDados, replyTo, enviarMensagemBot, db }) {
  const limite = Math.min(parseInt(args) || 30, 100);

  await enviarMensagemBot(grupoId, `Analisando as ultimas ${limite} mensagens...`, botDados);

  try {
    const snap = await db.collection('grupos').doc(grupoId)
      .collection('mensagens')
      .orderBy('timestamp', 'desc')
      .limit(limite)
      .get();

    if (snap.empty) {
      await enviarMensagemBot(grupoId, 'Nenhuma mensagem encontrada para resumir.', botDados, { replyTo });
      return;
    }

    // Monta o texto das mensagens
    const msgs = snap.docs.reverse().map(d => {
      const dado = d.data();
      if (dado.ehBot || !dado.texto) return null;
      return `${dado.nome || 'Membro'}: ${dado.texto}`;
    }).filter(Boolean);

    if (msgs.length === 0) {
      await enviarMensagemBot(grupoId, 'Nao ha mensagens de texto para resumir.', botDados, { replyTo });
      return;
    }

    const textoParaResumir = msgs.join('\n');
    const resumo = await resumirComGemini(textoParaResumir);

    if (resumo) {
      await enviarMensagemBot(grupoId,
        `Resumo das ultimas ${msgs.length} mensagens:\n\n${resumo}`,
        botDados, { replyTo }
      );
    } else {
      // Fallback sem Gemini
      const autores = [...new Set(msgs.map(m => m.split(':')[0]))];
      await enviarMensagemBot(grupoId,
        `Ultimas ${msgs.length} mensagens de ${autores.length} pessoa(s):\n${autores.join(', ')}\n\nConfigure GEMINI_API_KEY para resumo inteligente!`,
        botDados, { replyTo }
      );
    }
  } catch (e) {
    console.error('[Resumo]', e.message);
    await enviarMensagemBot(grupoId, 'Erro ao gerar resumo. Tente novamente!', botDados, { replyTo });
  }
};