// ═══════════════════════════════════════
// USUARIO/MUSICA.JS — Baixa musica com yt-dlp
// Uso: /musica nome da musica
// ═══════════════════════════════════════

const { exec }  = require('child_process');
const fs        = require('fs');
const path      = require('path');
const { promisify } = require('util');

const execAsync   = promisify(exec);
const UPLOADS_DIR = path.join(__dirname, '../../uploads');

const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : 'https://boreschat-bots-production.up.railway.app';

module.exports = async function musica({ grupoId, args, autorNome, botDados, replyTo, enviarMensagemBot }) {
  if (!args) {
    await enviarMensagemBot(grupoId,
      'Use: /musica nome da musica\nEx: /musica Eminem Lose Yourself',
      botDados, { replyTo }
    );
    return;
  }

  await enviarMensagemBot(grupoId,
    `Buscando "${args}"... aguarde!`,
    botDados, { replyTo }
  );

  const nomeArq  = `musica_${Date.now()}`;
  const filePath = path.join(UPLOADS_DIR, nomeArq);
  const query    = args.trim().replace(/"/g, '');

  try {
    // yt-dlp busca no YouTube e baixa o melhor audio em mp3
    const cmd = `yt-dlp "ytsearch1:${query}" -x --audio-format mp3 --audio-quality 0 --no-playlist -o "${filePath}.%(ext)s" --print title --print thumbnail 2>/dev/null`;

    console.log('[Musica] Baixando:', query);
    const { stdout } = await execAsync(cmd, { timeout: 120000 });

    const lines     = stdout.trim().split('\n').filter(Boolean);
    const titulo    = lines[0] || args;
    const thumbnail = lines[1] || '';

    const mp3Path = `${filePath}.mp3`;

    if (!fs.existsSync(mp3Path)) {
      throw new Error('Arquivo MP3 nao gerado');
    }

    const urlFinal = `${BASE_URL}/uploads/${nomeArq}.mp3`;

    // Manda thumbnail + info
    if (thumbnail && thumbnail.startsWith('http')) {
      await enviarMensagemBot(grupoId,
        `🎵 *${titulo}*\n\nBaixado por ${autorNome}`,
        botDados,
        { fotoUrl: thumbnail }
      );
    } else {
      await enviarMensagemBot(grupoId,
        `🎵 *${titulo}*\n\nBaixado por ${autorNome}`,
        botDados
      );
    }

    // Manda link do audio
    await enviarMensagemBot(grupoId, urlFinal, botDados);

    // Apaga arquivo apos 10 minutos para nao encher o servidor
    setTimeout(() => {
      try { fs.unlinkSync(mp3Path); } catch (_) {}
    }, 10 * 60 * 1000);

  } catch (e) {
    console.error('[Musica] Erro:', e.message);
    await enviarMensagemBot(grupoId,
      `Nao foi possivel baixar "${args}".\nTente outro nome!`,
      botDados, { replyTo }
    );
    // Limpa arquivo parcial se existir
    try { fs.unlinkSync(`${filePath}.mp3`); } catch (_) {}
  }
};