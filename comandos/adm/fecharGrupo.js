// ═══════════════════════════════════════════════════════════════
// ADM/FECHARGRUPO.JS — Abre e fecha o grupo com cronometro
// Uso: /fechar         → fecha ate ADM abrir
//      /fechar 30m     → fecha por 30 minutos
//      /fechar 2h      → fecha por 2 horas
//      /fechar 1h30m   → fecha por 1h30m
//      /abrir          → abre o grupo
// ═══════════════════════════════════════════════════════════════

const timers = {}; // grupoId -> timer de reabertura

function parseTempo(args) {
  if (!args) return null;
  args = args.trim().toLowerCase();

  let totalMs = 0;

  // Extrai horas
  const hMatch = args.match(/(\d+)\s*h/);
  if (hMatch) totalMs += parseInt(hMatch[1]) * 60 * 60 * 1000;

  // Extrai minutos
  const mMatch = args.match(/(\d+)\s*m(?!s)/);
  if (mMatch) totalMs += parseInt(mMatch[1]) * 60 * 1000;

  return totalMs > 0 ? totalMs : null;
}

function formatarTempo(ms) {
  const totalSeg = Math.floor(ms / 1000);
  const h        = Math.floor(totalSeg / 3600);
  const m        = Math.floor((totalSeg % 3600) / 60);
  const partes   = [];
  if (h > 0) partes.push(`${h}h`);
  if (m > 0) partes.push(`${m}m`);
  return partes.length > 0 ? partes.join(' e ') : 'tempo indefinido';
}

async function fechar({ grupoId, args, autorNome, autorId, botDados, replyTo, enviarMensagemBot, db }) {
  // Verifica ADM
  const grupoDoc = await db.collection('grupos').doc(grupoId).get();
  const admins   = grupoDoc.data()?.admins || [];
  if (!admins.includes(autorId)) {
    await enviarMensagemBot(grupoId,
      'Atencao! Este comando so pode ser usado por Administradores.',
      botDados, { replyTo }
    );
    return;
  }

  const tempoMs   = parseTempo(args);
  const tempoTexto = tempoMs ? formatarTempo(tempoMs) : 'ate ser aberto manualmente';

  // Salva estado fechado no Firestore
  await db.collection('grupos').doc(grupoId).update({
    grupofechado:      true,
    grupofechadoPor:   autorNome,
    grupofechadoAte:   tempoMs ? new Date(Date.now() + tempoMs).toISOString() : null,
  });

  // Avisa o grupo
  await enviarMensagemBot(grupoId,
    `Grupo FECHADO por ${autorNome}!\n\nSo administradores podem enviar mensagens.\nDuracao: ${tempoTexto}\n\nUse /abrir para abrir manualmente.`,
    botDados
  );

  // Cancela timer anterior se existir
  if (timers[grupoId]) { clearTimeout(timers[grupoId]); delete timers[grupoId]; }

  // Agenda reabertura automatica
  if (tempoMs) {
    timers[grupoId] = setTimeout(async () => {
      try {
        await db.collection('grupos').doc(grupoId).update({
          grupofechado:    false,
          grupofechadoPor: null,
          grupofechadoAte: null,
        });
        await enviarMensagemBot(grupoId,
          `Grupo ABERTO automaticamente!\n\nTodos podem enviar mensagens novamente.`,
          botDados
        );
        delete timers[grupoId];
      } catch (e) { console.error('[Grupo] Erro ao abrir:', e.message); }
    }, tempoMs);
  }
}

async function abrir({ grupoId, args, autorNome, autorId, botDados, replyTo, enviarMensagemBot, db }) {
  // Verifica ADM
  const grupoDoc = await db.collection('grupos').doc(grupoId).get();
  const admins   = grupoDoc.data()?.admins || [];
  if (!admins.includes(autorId)) {
    await enviarMensagemBot(grupoId,
      'Atencao! Este comando so pode ser usado por Administradores.',
      botDados, { replyTo }
    );
    return;
  }

  if (!grupoDoc.data()?.grupofechado) {
    await enviarMensagemBot(grupoId, 'O grupo ja esta aberto!', botDados, { replyTo });
    return;
  }

  // Cancela timer se existir
  if (timers[grupoId]) { clearTimeout(timers[grupoId]); delete timers[grupoId]; }

  await db.collection('grupos').doc(grupoId).update({
    grupofechado:    false,
    grupofechadoPor: null,
    grupofechadoAte: null,
  });

  await enviarMensagemBot(grupoId,
    `Grupo ABERTO por ${autorNome}!\n\nTodos podem enviar mensagens novamente.`,
    botDados
  );
}

module.exports = { fechar, abrir, timers };