// ═══════════════════════════════════════
// USUARIO/ENQUETE.JS — Cria enquete no grupo
// Uso: /enquete Pergunta | Opcao1 | Opcao2 | Opcao3
// ═══════════════════════════════════════

const EMOJIS = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];

module.exports = async function enquete({ grupoId, args, autorNome, autorId, botDados, replyTo, enviarMensagemBot, db }) {
  if (!args || !args.includes('|')) {
    await enviarMensagemBot(grupoId,
      'Use: /enquete Pergunta | Opcao1 | Opcao2 | Opcao3\n\nEx: /enquete Qual melhor jogo? | Futebol | Basquete | Tenis',
      botDados, { replyTo }
    );
    return;
  }

  const partes  = args.split('|').map(p => p.trim()).filter(Boolean);
  const pergunta = partes[0];
  const opcoes   = partes.slice(1);

  if (opcoes.length < 2) {
    await enviarMensagemBot(grupoId, 'Coloque pelo menos 2 opcoes separadas por |', botDados, { replyTo });
    return;
  }

  if (opcoes.length > 10) {
    await enviarMensagemBot(grupoId, 'Maximo de 10 opcoes por enquete!', botDados, { replyTo });
    return;
  }

  const linhasOpcoes = opcoes.map((op, i) => `${EMOJIS[i]} ${op}`).join('\n');
  const texto = `ENQUETE criada por ${autorNome}\n\n${pergunta}\n\n${linhasOpcoes}\n\nVote respondendo o numero da opcao!`;

  // Salva enquete no Firestore
  const enqueteId = `enquete_${Date.now()}`;
  try {
    await db.collection('grupos').doc(grupoId).collection('enquetes').doc(enqueteId).set({
      pergunta,
      opcoes,
      criadoPor: autorId,
      criadoPorNome: autorNome,
      votos: {},
      ativa: true,
      criadoEm: new Date().toISOString(),
    });
  } catch (_) {}

  await enviarMensagemBot(grupoId, texto, botDados);
};