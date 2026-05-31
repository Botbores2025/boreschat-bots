// ═══════════════════════════════════════
// USUARIO/CLIMA.JS — Clima atual de qualquer cidade
// Uso: /clima Florianopolis
// ═══════════════════════════════════════

const https = require('https');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (res.statusCode !== 200) reject(new Error(json.error?.message || 'Erro'));
          else resolve(json);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

module.exports = async function clima({ grupoId, args, autorNome, botDados, replyTo, enviarMensagemBot }) {
  if (!args) {
    await enviarMensagemBot(grupoId,
      'Use: /clima [cidade]\nEx: /clima Florianopolis',
      botDados, { replyTo }
    );
    return;
  }

  const apiKey = process.env.WEATHER_API_KEY || 'af52b528c9ab403fa0c90206263105';

  try {
    const cidade = encodeURIComponent(args.trim());
    const url    = `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${cidade}&lang=pt`;
    console.log('[Clima] Buscando:', url);
    const data   = await httpGet(url);
    console.log('[Clima] Resposta OK:', data.location?.name);

    const loc = data.location;
    const cur = data.current;

    const temp     = cur.temp_c;
    const sensacao = cur.feelslike_c;
    const umidade  = cur.humidity;
    const vento    = cur.wind_kph;
    const cond     = cur.condition.text;

    let emoji = 'Temperatura';
    if (temp >= 35)      emoji = 'Muito quente';
    else if (temp >= 25) emoji = 'Quente';
    else if (temp >= 15) emoji = 'Agradavel';
    else if (temp >= 5)  emoji = 'Frio';
    else                 emoji = 'Muito frio';

    const texto =
      `*Clima em ${loc.name}, ${loc.country}*\n\n` +
      `Temperatura: *${temp}C* (${emoji})\n` +
      `Sensacao: *${sensacao}C*\n` +
      `Umidade: *${umidade}%*\n` +
      `Vento: *${vento} km/h*\n` +
      `Condicao: *${cond}*\n` +
      `Hora local: *${loc.localtime.split(' ')[1]}*`;

    await enviarMensagemBot(grupoId, texto, botDados, { replyTo });

  } catch (e) {
    console.error('[Clima] ERRO DETALHADO:', e.message, e.stack);
    await enviarMensagemBot(grupoId,
      `Cidade "${args}" nao encontrada! Verifique o nome e tente novamente.`,
      botDados, { replyTo }
    );
  }
};