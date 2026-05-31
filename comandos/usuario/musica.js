// ═══════════════════════════════════════
// USUARIO/MUSICA.JS — Baixa musica com yt-dlp
// Uso: /musica nome da musica
// ═══════════════════════════════════════

const { execFile } = require('child_process');
const fs           = require('fs');
const path         = require('path');
const which        = require('child_process').execSync;

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
const BASE_URL    = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : 'https://boreschat-bots-production.up.railway.app';

// Acha o yt-dlp instalado
function getYtdlp() {
  try { which('which yt-dlp', { stdio: 'pipe' }); return 'yt-dlp'; } catch (_) {}
  try { which('which yt_dlp', { stdio: 'pipe' }); return 'yt_dlp'; } catch (_) {}
  // Instalado via pip no home
  const home = process.env.HOME || '/root';
  const paths = [
    `${home}/.local/bin/yt-dlp`,
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return 'yt-dlp';
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

  const nomeArq  = `musica_${Date.now()}`;
  const filePath = path.join(UPLOADS_DIR, nomeArq);
  const ytdlp    = getYtdlp();
  const query    = args.trim().replace(/"/g, '').replace(/'/g, '');

  console.log('[Musica] yt-dlp path:', ytdlp);
  console.log('[Musica] Baixando:', query);

  const cmdArgs = [
    `ytsearch1:${query}`,
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '0',
    '--no-playlist',
    '-o', `${filePath}.%(ext)s`,
    '--print', 'title',
    '--print', 'thumbnail',
    '--no-warnings',
  ];

  await new Promise((resolve, reject) => {
    execFile(ytdlp, cmdArgs, { timeout: 120000 }, async (err, stdout, stderr) => {
      try {
        if (err) {
          console.error('[Musica] stderr:', stderr);
          throw new Error(err.message);
        }

        const lines     = stdout.trim().split('\n').filter(Boolean);
        const titulo    = lines[0] || args;
        const thumbnail = lines[1] || '';
        const mp3Path   = `${filePath}.mp3`;

        if (!fs.existsSync(mp3Path)) throw new Error('MP3 nao gerado');

        const urlFinal = `${BASE_URL}/uploads/${nomeArq}.mp3`;

        if (thumbnail.startsWith('http')) {
          await enviarMensagemBot(grupoId,
            `🎵 *${titulo}*\nBaixado por ${autorNome}`,
            botDados, { fotoUrl: thumbnail }
          );
        } else {
          await enviarMensagemBot(grupoId,
            `🎵 *${titulo}*\nBaixado por ${autorNome}`,
            botDados
          );
        }

        await enviarMensagemBot(grupoId, urlFinal, botDados);

        setTimeout(() => { try { fs.unlinkSync(mp3Path); } catch (_) {} }, 600000);
        resolve();
      } catch (e) {
        console.error('[Musica] Erro:', e.message);
        await enviarMensagemBot(grupoId,
          `Nao consegui baixar "${args}". Tente outro nome!`,
          botDados, { replyTo }
        );
        resolve();
      }
    });
  });
};