// ═══════════════════════════════════════
// USUARIO/CLIMA.JS — Clima atual de qualquer cidade
// Uso: /clima Florianopolis
// ═══════════════════════════════════════

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
    const resp   = await fetch(url);

    if (!resp.ok) {
      await enviarMensagemBot(grupoId, `Cidade "${args}" nao encontrada!`, botDados, { replyTo });
      return;
    }

    const data = await resp.json();
    const loc  = data.location;
    const cur  = data.current;

    // Icone baseado na condicao
    const temp   = cur.temp_c;
    const sensTerm = cur.feelslike_c;
    const umidade  = cur.humidity;
    const vento    = cur.wind_kph;
    const cond     = cur.condition.text;
    const isDay    = cur.is_day;

    // Escolhe emoji baseado na temperatura
    let emoji = '🌡️';
    if (temp >= 35) emoji = '🔥';
    else if (temp >= 25) emoji = '☀️';
    else if (temp >= 15) emoji = '⛅';
    else if (temp >= 5) emoji = '🌧️';
    else emoji = '❄️';

    const texto =
      `${emoji} *Clima em ${loc.name}, ${loc.country}*\n\n` +
      `🌡️ Temperatura: *${temp}°C*\n` +
      `🤔 Sensacao: *${sensTerm}°C*\n` +
      `💧 Umidade: *${umidade}%*\n` +
      `💨 Vento: *${vento} km/h*\n` +
      `☁️ Condicao: *${cond}*\n` +
      `🕐 Hora local: *${loc.localtime.split(' ')[1]}*`;

    await enviarMensagemBot(grupoId, texto, botDados, { replyTo });

  } catch (e) {
    console.error('[Clima]', e.message);
    await enviarMensagemBot(grupoId, 'Erro ao buscar clima. Tente novamente!', botDados, { replyTo });
  }
};