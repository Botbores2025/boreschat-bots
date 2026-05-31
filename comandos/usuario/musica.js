// ═══════════════════════════════════════
// USUARIO/MUSICA.JS — Baixa musica com ytdl-core
// Uso: /musica nome da musica
// ═══════════════════════════════════════

const ytdl  = require('ytdl-core');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
const BASE_URL    = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : 'https://boreschat-bots-production.up.railway.app';

// Busca video no YouTube sem API key
function buscarVideo(query) {
  return new Promise((resolve, reject) => {
    const q = encodeURIComponent(query);
    const options = {
      hostname: 'www.youtube.com',
      path:     `/results?search_query=${q}`,
      headers:  { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    };
    https.get(options, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        const match = raw.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
        if (!match) return reject(new Error('Nenhum video encontrado'));
        const videoId = match[1];
        const titleMatch = raw.match(/"title":{"runs":\[{"text":"([^"]+)"}/);
        const title = titleMatch ? titleMatch[1] : query;
        const thumbMatch = raw.match(/"thumbnails":\[{"url":"(https:\/\/i\.ytimg\.com[^"]+)"/);
        const thumbnail = thumbMatch ? thumbMatch[1].replace(/\\u0026/g, '&') : '';
        resolve({ videoId, title, thumbnail });
      });
    }).on('error', reject);
  });
}

module.exports = async function musica({ grupoId, args, autorNome, botDados, replyTo, enviarMensagemBot }) {
  if (!args) {
    await enviarMensagemBot(grupoId,
      'Use: /musica nome da musica\nEx: /musica Marilia Mendonca Infiel',
      botDados, { replyTo }
    );
    return;
  }

  await enviarMensagemBot(grupoId, `Buscando "${args}"... aguarde!`, botDados, { replyTo });

  try {
    // 1. Busca o video
    const video    = await buscarVideo(args.trim());
    const url      = `https://www.youtube.com/watch?v=${video.videoId}`;
    const nomeArq  = `musica_${Date.now()}.mp3`;
    const filePath = path.join(UPLOADS_DIR, nomeArq);

    console.log('[Musica] Baixando:', video.title, url);

    // 2. Baixa audio com ytdl-core
    await new Promise((resolve, reject) => {
      const stream = ytdl(url, {
        quality:       'highestaudio',
        filter:        'audioonly',
        requestOptions: {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        }
      });
      const file = fs.createWriteStream(filePath);
      stream.pipe(file);
      stream.on('error', reject);
      file.on('finish', resolve);
      file.on('error', reject);
    });

    if (!fs.existsSync(filePath)) throw new Error('Arquivo nao gerado');

    const urlFinal = `${BASE_URL}/uploads/${nomeArq}`;

    // 3. Manda thumbnail + info
    if (video.thumbnail) {
      await enviarMensagemBot(grupoId,
        `🎵 *${video.title}*\nBaixado por ${autorNome}`,
        botDados, { fotoUrl: video.thumbnail }
      );
    } else {
      await enviarMensagemBot(grupoId,
        `🎵 *${video.title}*\nBaixado por ${autorNome}`,
        botDados
      );
    }

    // 4. Manda link do audio
    await enviarMensagemBot(grupoId, urlFinal, botDados);

    // 5. Apaga apos 10 minutos
    setTimeout(() => { try { fs.unlinkSync(filePath); } catch (_) {} }, 600000);

  } catch (e) {
    console.error('[Musica] Erro:', e.message);
    await enviarMensagemBot(grupoId,
      `Nao consegui baixar "${args}".\nTente outro nome!`,
      botDados, { replyTo }
    );
  }
};