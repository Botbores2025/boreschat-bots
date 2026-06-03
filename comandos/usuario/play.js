// ═══════════════════════════════════════
// USUARIO/PLAY.JS — Músicas via SpiderX API
// Uso: /play nome da musica
// ═══════════════════════════════════════

const admin = require('firebase-admin');
const { verificarLimite, incrementarUso } = require('../sistema/planos');

const FRASES_MUSICA = [
  '✨ Que esta música ilumine seu dia!',
  '🎶 Deixa a melodia te levar... aproveita cada nota!',
  '🧉 Aumenta o volume e sente a energia!',
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

module.exports = async function play({ grupoId, args, autorId, autorNome, botDados, replyTo, enviarMensagemBot, db }) {
  if (!args || !args.trim()) {
    await enviarMensagemBot(grupoId,
      `🎵 Qual música você quer ouvir, ${autorNome}?\nExemplo: /play nome da musica`,
      botDados, { replyTo }
    );
    return;
  }

  // Verificação de limite diário
  if (autorId) {
    const check = await verificarLimite(autorId, 'play', db);
    if (!check.permitido) {
      await enviarMensagemBot(grupoId,
        `🎵 Você atingiu o limite de ${check.limite} músicas hoje!\n\nFaça upgrade pro Bores+ e tenha músicas ILIMITADAS!\nAcesse o app → Perfil → Premium`,
        botDados, { replyTo });
      return;
    }
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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let resp;
    try {
      resp = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    const rawText = await resp.text();
    console.log('[Play] status:', resp.status, '| resposta:', rawText.substring(0, 400));

    if (resp.status === 524 || resp.status === 408) {
      await enviarMensagemBot(grupoId, '⏳ A busca demorou demais. Tenta de novo!', botDados, { replyTo });
      return;
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (_) {
      console.error('[Play] API não retornou JSON. Status:', resp.status);
      await enviarMensagemBot(grupoId, '😥 Não encontrei essa música. Tenta outro nome ou artista!', botDados, { replyTo });
      return;
    }

    const info = data?.data || data?.result || data;

    if (!info?.url || !info?.title) {
      console.log('[Play] Campos ausentes. data:', JSON.stringify(data).substring(0, 300));
      await enviarMensagemBot(grupoId, '😥 Não encontrei essa música. Tenta outro nome ou artista!', botDados, { replyTo });
      return;
    }

    const frase   = FRASES_MUSICA[Math.floor(Math.random() * FRASES_MUSICA.length)];
    const artista = info.channel?.name || info.channel || info.artist || 'Desconhecido';
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
      texto:       '',
      tipo:        'audio',
      audioUrl:    info.url,
      audioNome:   info.title,
      enviado_por: 'BOT_BORES_OFICIAL',
      nome:        'BoresBot',
      foto:        'https://iili.io/C3rRxRf.jpg',
      ehBot:       false,
      timestamp:   admin.firestore.FieldValue.serverTimestamp(),
      lido:        false,
      entregue:    true,
    });

    // Incrementa uso somente após entrega bem-sucedida
    if (autorId) await incrementarUso(autorId, 'play', db);

    console.log(`[Play] Música enviada: "${info.title}" no grupo ${grupoId}`);

  } catch (e) {
    console.error('[Play]', e.message);

    let msg = '❌ Não consegui tocar essa música. Tenta outra!';
    if (e.name === 'AbortError' || e.message === 'TIMEOUT') {
      msg = '⏳ A busca demorou demais. Tenta de novo!';
    } else if (e.message?.includes('ENOTFOUND') || e.message?.includes('ECONNREFUSED')) {
      msg = '🌐 Sem conexão com o serviço de músicas. Tenta mais tarde!';
    }

    await enviarMensagemBot(grupoId, msg, botDados, { replyTo });
  }
};
