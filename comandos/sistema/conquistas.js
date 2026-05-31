// ═══════════════════════════════════════════════════════════════
// SISTEMA/CONQUISTAS.JS — Sistema de conquistas automáticas
// ═══════════════════════════════════════════════════════════════

const CONQUISTAS = [
  // Mensagens — icon sem emoji, usa cor no canvas
  { id: 'msg_1',    icon: 'MSG',  cor: '#3B82F6', nome: 'Primeiro passo',  desc: 'Envie sua primeira mensagem',   check: (s) => s.mensagens >= 1    },
  { id: 'msg_100',  icon: '100',  cor: '#3B82F6', nome: 'Tagarela',        desc: '100 mensagens enviadas',        check: (s) => s.mensagens >= 100  },
  { id: 'msg_500',  icon: '500',  cor: '#3B82F6', nome: 'Comunicador',     desc: '500 mensagens enviadas',        check: (s) => s.mensagens >= 500  },
  { id: 'msg_1000', icon: '1K',   cor: '#3B82F6', nome: 'Voz do grupo',    desc: '1000 mensagens enviadas',       check: (s) => s.mensagens >= 1000 },
  // Level
  { id: 'lvl_5',    icon: 'LV5',  cor: '#22C55E', nome: 'Subindo',         desc: 'Alcance o level 5',             check: (s) => s.level >= 5  },
  { id: 'lvl_10',   icon: 'LV10', cor: '#22C55E', nome: 'Experiente',      desc: 'Alcance o level 10',            check: (s) => s.level >= 10 },
  { id: 'lvl_20',   icon: 'LV20', cor: '#A855F7', nome: 'Elite',           desc: 'Alcance o level 20',            check: (s) => s.level >= 20 },
  { id: 'lvl_30',   icon: 'LV30', cor: '#FFD700', nome: 'Mestre',          desc: 'Alcance o level 30',            check: (s) => s.level >= 30 },
  // Moedas
  { id: 'rico_1k',  icon: '1K',   cor: '#FFD700', nome: 'Economista',      desc: 'Acumule 1.000 moedas',          check: (s) => (s.moedas || 0) >= 1000   },
  { id: 'rico_10k', icon: '10K',  cor: '#FFD700', nome: 'Milionario',      desc: 'Acumule 10.000 moedas',         check: (s) => (s.moedas || 0) >= 10000  },
  // Wins
  { id: 'win_1',    icon: 'WIN',  cor: '#FF6B00', nome: 'Primeira vitoria',desc: 'Venca qualquer jogo',           check: (s) => (s.wins || 0) >= 1  },
  { id: 'win_10',   icon: 'W10',  cor: '#FF6B00', nome: 'Vencedor serial', desc: '10 vitorias em jogos',          check: (s) => (s.wins || 0) >= 10 },
  { id: 'win_50',   icon: 'W50',  cor: '#FF6B00', nome: 'Campeao',         desc: '50 vitorias em jogos',          check: (s) => (s.wins || 0) >= 50 },
  // Quiz
  { id: 'quiz_1',   icon: 'Q1',   cor: '#14B8A6', nome: 'Curioso',         desc: 'Acerte sua primeira pergunta',  check: (s) => (s.quiz_acertos || 0) >= 1   },
  { id: 'quiz_10',  icon: 'Q10',  cor: '#14B8A6', nome: 'Estudioso',       desc: 'Acerte 10 perguntas do quiz',   check: (s) => (s.quiz_acertos || 0) >= 10  },
  { id: 'quiz_50',  icon: 'Q50',  cor: '#14B8A6', nome: 'Genio',           desc: 'Acerte 50 perguntas do quiz',   check: (s) => (s.quiz_acertos || 0) >= 50  },
  // Daily
  { id: 'daily_7',  icon: 'D7',   cor: '#EF4444', nome: 'Dedicado',        desc: '7 dias seguidos de daily',      check: (s) => (s.streak_daily || 0) >= 7  },
  { id: 'daily_30', icon: 'D30',  cor: '#EF4444', nome: 'Comprometido',    desc: '30 dias seguidos de daily',     check: (s) => (s.streak_daily || 0) >= 30 },
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