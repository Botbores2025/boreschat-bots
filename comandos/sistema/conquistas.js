// ═══════════════════════════════════════════════════════════════
// SISTEMA/CONQUISTAS.JS — Sistema de conquistas automáticas
// ═══════════════════════════════════════════════════════════════

const CONQUISTAS = [
  // Mensagens
  { id: 'msg_1',    icon: '💬', nome: 'Primeiro passo',     desc: 'Envie sua primeira mensagem',     check: (s) => s.mensagens >= 1    },
  { id: 'msg_100',  icon: '🗣️', nome: 'Tagarela',           desc: '100 mensagens enviadas',          check: (s) => s.mensagens >= 100  },
  { id: 'msg_500',  icon: '📢', nome: 'Comunicador',        desc: '500 mensagens enviadas',          check: (s) => s.mensagens >= 500  },
  { id: 'msg_1000', icon: '🎙️', nome: 'Voz do grupo',       desc: '1000 mensagens enviadas',         check: (s) => s.mensagens >= 1000 },
  // Level
  { id: 'lvl_5',    icon: '⭐', nome: 'Subindo de nivel',   desc: 'Alcance o level 5',               check: (s) => s.level >= 5  },
  { id: 'lvl_10',   icon: '🌟', nome: 'Experiente',         desc: 'Alcance o level 10',              check: (s) => s.level >= 10 },
  { id: 'lvl_20',   icon: '💫', nome: 'Elite',              desc: 'Alcance o level 20',              check: (s) => s.level >= 20 },
  { id: 'lvl_30',   icon: '🏆', nome: 'Mestre',             desc: 'Alcance o level 30',              check: (s) => s.level >= 30 },
  // Moedas
  { id: 'rico_1k',  icon: '💰', nome: 'Economista',         desc: 'Acumule 1.000 moedas',            check: (s) => (s.moedas || 0) >= 1000   },
  { id: 'rico_10k', icon: '💎', nome: 'Milionario',         desc: 'Acumule 10.000 moedas',           check: (s) => (s.moedas || 0) >= 10000  },
  // Wins
  { id: 'win_1',    icon: '🥇', nome: 'Primeira vitoria',   desc: 'Venca qualquer jogo',             check: (s) => (s.wins || 0) >= 1  },
  { id: 'win_10',   icon: '🏅', nome: 'Vencedor serial',    desc: '10 vitorias em jogos',            check: (s) => (s.wins || 0) >= 10 },
  { id: 'win_50',   icon: '👑', nome: 'Campeao',            desc: '50 vitorias em jogos',            check: (s) => (s.wins || 0) >= 50 },
  // Quiz
  { id: 'quiz_1',   icon: '🧠', nome: 'Curioso',            desc: 'Acerte sua primeira pergunta',    check: (s) => (s.quiz_acertos || 0) >= 1   },
  { id: 'quiz_10',  icon: '📚', nome: 'Estudioso',          desc: 'Acerte 10 perguntas do quiz',     check: (s) => (s.quiz_acertos || 0) >= 10  },
  { id: 'quiz_50',  icon: '🎓', nome: 'Genio',              desc: 'Acerte 50 perguntas do quiz',     check: (s) => (s.quiz_acertos || 0) >= 50  },
  // Daily
  { id: 'daily_7',  icon: '📅', nome: 'Dedicado',           desc: '7 dias seguidos de daily',        check: (s) => (s.streak_daily || 0) >= 7  },
  { id: 'daily_30', icon: '🔥', nome: 'Comprometido',       desc: '30 dias seguidos de daily',       check: (s) => (s.streak_daily || 0) >= 30 },
];

async function verificarConquistas(db, grupoId, userId, stats, enviarMensagemBot, botDados) {
  try {
    const conquistasAtuais = stats.conquistas || [];
    const novas = [];

    for (const c of CONQUISTAS) {
      if (conquistasAtuais.includes(c.id)) continue;
      if (c.check(stats)) novas.push(c);
    }

    if (novas.length === 0) return;

    // Salva novas conquistas
    const todasConquistas = [...conquistasAtuais, ...novas.map(c => c.id)];
    await db.collection('grupos').doc(grupoId)
      .collection('usuarios_stats').doc(userId)
      .update({ conquistas: todasConquistas });

    // Anuncia cada conquista nova
    for (const c of novas) {
      await enviarMensagemBot(grupoId,
        `${c.icon} *${stats.nome}* desbloqueou uma conquista!\n\n*${c.nome}*\n${c.desc}`,
        botDados
      );
      await new Promise(r => setTimeout(r, 1000));
    }
  } catch (e) {
    console.error('[Conquistas]', e.message);
  }
}

function listarConquistas(conquistasIds) {
  return CONQUISTAS.map(c => ({
    ...c,
    desbloqueada: conquistasIds.includes(c.id),
  }));
}

module.exports = { verificarConquistas, listarConquistas, CONQUISTAS };