// ═══════════════════════════════════════
// JOGOS/TICTAC.JS — Jogo da Velha
// Uso: /velha @nome  /velha A1  (para jogar)
// ═══════════════════════════════════════

const partidas = {}; // grupoId -> { tabuleiro, vezDe, jogadores: {X, O}, nomes }

function novoTabuleiro() {
  return ['1','2','3','4','5','6','7','8','9'];
}

function renderizar(tab) {
  return `${tab[0]} │ ${tab[1]} │ ${tab[2]}\n──┼───┼──\n${tab[3]} │ ${tab[4]} │ ${tab[5]}\n──┼───┼──\n${tab[6]} │ ${tab[7]} │ ${tab[8]}`;
}

function verificarVencedor(tab) {
  const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,b,c] of wins) {
    if (tab[a] === tab[b] && tab[b] === tab[c] && (tab[a] === 'X' || tab[a] === 'O')) return tab[a];
  }
  if (tab.every(c => c === 'X' || c === 'O')) return 'empate';
  return null;
}

async function iniciarPartida({ grupoId, args, autorNome, autorId, botDados, replyTo, enviarMensagemBot, db }) {
  if (!args) {
    await enviarMensagemBot(grupoId, '⚠️ Use: /velha @nome para desafiar alguém!', botDados, { replyTo });
    return;
  }

  const busca    = args.replace('@','').toLowerCase().trim();
  const grupoDoc = await db.collection('grupos').doc(grupoId).get();
  const membros  = grupoDoc.data()?.membros || [];

  let oponente = null;
  for (const uid of membros) {
    if (uid === autorId) continue;
    const u = await db.collection('usuarios').doc(uid).get();
    if (u.exists && u.data().nome?.toLowerCase().includes(busca)) {
      oponente = { uid, nome: u.data().nome };
      break;
    }
  }

  if (!oponente) {
    await enviarMensagemBot(grupoId, `❌ Usuário *${args}* não encontrado.`, botDados, { replyTo });
    return;
  }

  partidas[grupoId] = {
    tabuleiro: novoTabuleiro(),
    vezDe: autorId,
    jogadores: { X: autorId, O: oponente.uid },
    nomes: { [autorId]: autorNome, [oponente.uid]: oponente.nome },
  };

  const tab = renderizar(partidas[grupoId].tabuleiro);
  await enviarMensagemBot(grupoId,
    `❌⭕ *JOGO DA VELHA*\n\n*${autorNome}* (X) vs *${oponente.nome}* (O)\n\n\`\`\`\n${tab}\n\`\`\`\n\n🎯 Vez de *${autorNome}* (X)\nDigite /velha [1-9] para jogar!`,
    botDados
  );
}

async function jogar({ grupoId, args, autorId, autorNome, botDados, replyTo, enviarMensagemBot }) {
  const partida = partidas[grupoId];
  if (!partida) return false;

  const pos = parseInt(args);
  if (isNaN(pos) || pos < 1 || pos > 9) return false;

  if (partida.vezDe !== autorId) return true; // ignora se não é a vez dele

  const idx = pos - 1;
  if (partida.tabuleiro[idx] === 'X' || partida.tabuleiro[idx] === 'O') {
    await enviarMensagemBot(grupoId, '⚠️ Posição já ocupada! Escolha outra.', botDados, { replyTo });
    return true;
  }

  const simbolo = partida.jogadores.X === autorId ? 'X' : 'O';
  partida.tabuleiro[idx] = simbolo;

  const resultado = verificarVencedor(partida.tabuleiro);
  const tab = renderizar(partida.tabuleiro);

  if (resultado === 'empate') {
    delete partidas[grupoId];
    await enviarMensagemBot(grupoId, `❌⭕ *EMPATE!*\n\n\`\`\`\n${tab}\n\`\`\`\n\nBoa partida! Use /velha @nome para jogar de novo.`, botDados);
    return true;
  }

  if (resultado) {
    const vencedorNome = partida.nomes[autorId];
    delete partidas[grupoId];
    await enviarMensagemBot(grupoId, `❌⭕ *${vencedorNome} VENCEU!* 🎉\n\n\`\`\`\n${tab}\n\`\`\``, botDados);
    return true;
  }

  // Troca a vez
  const proximo = partida.jogadores.X === autorId ? partida.jogadores.O : partida.jogadores.X;
  partida.vezDe = proximo;
  const proximoNome = partida.nomes[proximo];
  const proximoSimb = partida.jogadores.X === proximo ? 'X' : 'O';

  await enviarMensagemBot(grupoId,
    `❌⭕ *Jogo da Velha*\n\n\`\`\`\n${tab}\n\`\`\`\n\n🎯 Vez de *${proximoNome}* (${proximoSimb})\nDigite /velha [1-9]`,
    botDados
  );
  return true;
}

module.exports = { iniciarPartida, jogar, partidas };