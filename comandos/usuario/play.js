// ═══════════════════════════════════════
// USUARIO/PLAY.JS — Músicas via SpiderX API
// Uso: /play nome da musica
// ═══════════════════════════════════════

const https = require('https');
const admin = require('firebase-admin');

const FRASES_MUSICA = [
  '✨ Que esta música ilumine seu dia!',
  '🎶 Deixa a melodia te levar... aproveita cada nota!',
  '🎧 Aumenta o volume e sente a energia!',
  '🚀 Música é a trilha sonora da vida. Play!',
  '🎵 Uma boa música muda tudo. Curte essa vibe!',
  '🎤 A vida fica melhor com música. Diverte-se!',
];

function formatarDuracao(segundos) {
  if (!segundos || isNaN(segundos)) return 'N/A';
  const min = Math.floor(segundos / 60);
  const sec = Math.floor(segundos % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 30000 }, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch (e) { reject(new Error('Resposta inválida da API')); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('TIMEOUT')); });
    req.on('error', reject);
  });
}

module.exports = async function play({ grupoId, args, autorNome, botDados, replyTo, enviarMensagemBot, db }) {
  if (!args || !args.trim()) {
    await enviarMensagemBot(grupoId,
      `🎵 Qual música você quer ouvir, ${autorNome}?\nExemplo: /play nome da musica`,
      botDados, { replyTo }
    );
    return;
  }

  const apiKey = process.env.SPIDER_API_TOKEN;
  if (!apiKey) {
    await enviarMensagemBot(grupoId,
      '🎵 Serviço de música temporariamente indisponível.',
      botDados, { replyTo }
    );
    return;
  }

  await enviarMensagemBot(grupoId,
    `🔎 Buscando: *${args.trim()}*...\nAguarde um instante! 🎶`,
    botDados, { replyTo }
  );

  try {
    const termo = encodeURIComponent(args.trim());
    const url = `https://api.spiderx.com.br/api/downloads/play-audio?search=${termo}&api_key=${apiKey}`;

    const { status, data } = await httpsGet(url);

    if (status === 524) {
      await enviarMensagemBot(grupoId,
        '⏳ A busca demorou demais. Tenta de novo!',
        botDados, { replyTo }
      );
      return;
    }

    const info = data?.data || data;

    if (!info?.url || !info?.title) {
      await enviarMensagemBot(grupoId,
        '😥 Não encontrei essa música. Tenta outro nome ou artista!',
        botDados, { replyTo }
      );
      return;
    }

    const frase = FRASES_MUSICA[Math.floor(Math.random() * FRASES_MUSICA.length)];
    const artista = info.channel?.name || info.channel || 'Desconhecido';
    const duracao = formatarDuracao(info.total_duration_in_seconds || info.duration);

    const infoTexto =
      `🎧 BoresBot Apresenta 🎧\n\n` +
      `✨ Título: ${info.title}\n` +
      `🎤 Canal/Artista: ${artista}\n` +
      `⏳ Duração: ${duracao}\n` +
      `🎶 ${frase}\n` +
      `▶️ Tocando...`;

    const thumbnail = info.thumbnail || info.thumbnails?.[0]?.url || '';
    if (thumbnail && thumbnail.startsWith('http')) {
      await enviarMensagemBot(grupoId, infoTexto, botDados, { fotoUrl: thumbnail, replyTo });
    } else {
      await enviarMensagemBot(grupoId, infoTexto, botDados, { replyTo });
    }

    await db.collection('grupos').doc(grupoId).collection('mensagens').add({
      texto: '',
      tipo: 'audio',
      audioUrl: info.url,
      audioNome: info.title,
      enviado_por: 'BOT_BORES_OFICIAL',
      nome: 'BoresBot',
      foto: 'https://iili.io/C3rRxRf.jpg',
      ehBot: false,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      lido: false,
      entregue: true,
    });

    console.log(`[Play] Música enviada: "${info.title}" no grupo ${grupoId}`);

  } catch (e) {
    console.error('[Play]', e.message);

    let msg = '❌ Não consegui tocar essa música. Tenta outra!';
    if (e.message === 'TIMEOUT') msg = '⏳ A busca demorou demais. Tenta de novo!';
    else if (e.message?.includes('ENOTFOUND') || e.message?.includes('ECONNREFUSED')) {
      msg = '🌐 Sem conexão com o serviço de músicas. Tenta mais tarde!';
    }

    await enviarMensagemBot(grupoId, msg, botDados, { replyTo });
  }
};
