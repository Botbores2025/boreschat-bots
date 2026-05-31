// ═══════════════════════════════════════
// JOGOS/CAMPOMINADO.JS — Campo Minado 5x5
// Uso: /minas  /minas A1 (para revelar)
// ═══════════════════════════════════════

const jogos = {}; // grupoId -> { tabuleiro, revelado, minas, jogadorId, jogadorNome }

const COLS = ['A','B','C','D','E'];

function gerarMinas(excluir) {
  const minas = new Set();
  while (minas.size < 5) {
    const pos = Math.floor(Math.random() * 25);
    if (pos !== excluir) minas.add(pos);
  }
  return minas;
}

function posParaIdx(pos) {
  const col = pos[0].toUpperCase();
  const row = parseInt(pos[1]) - 1;
  const c   = COLS.indexOf(col);
  if (c === -1 || isNaN(row) || row < 0 || row > 4) return -1;
  return row * 5 + c;
}

function contarVizinhos(minas, idx) {
  const row = Math.floor(idx / 5);
  const col = idx % 5;
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr, c = col + dc;
      if (r >= 0 && r < 5 && c >= 0 && c < 5) {
        if (minas.has(r * 5 + c)) count++;
      }
    }
  }
  return count;
}

function renderizar(revelado, minas, gameOver = false) {
  let board = '    A   B   C   D   E\n';
  for (let r = 0; r < 5; r++) {
    board += `${r+1} `;
    for (let c = 0; c < 5; c++) {
      const idx = r * 5 + c;
      if (gameOver && minas.has(idx)) { board += ' 💣'; }
      else if (revelado.has(idx)) {
        const v = contarVizinhos(minas, idx);
        board += v === 0 ? ' ·' : ` ${v}`;
      } else { board += ' ▪'; }
    }
    board += '\n';
  }
  return board;
}

async function iniciarJogo({ grupoId, autorId, autorNome, botDados, replyTo, enviarMensagemBot }) {
  jogos[grupoId] = {
    tabuleiro: null,
    revelado:  new Set(),
    minas:     null,
    jogadorId: autorId,
    jogadorNome: autorNome,
    seguro:    true, // primeira jogada sempre segura
  };

  const board = renderizar(new Set(), new Set());
  await enviarMensagemBot(grupoId,
    `💣 *CAMPO MINADO* — 5x5 (5 minas)\n\n\`\`\`\n${board}\`\`\`\n🎯 *${autorNome}*, revele uma célula:\nEx: /minas A1, /minas C3\n\n_Boa sorte!_ 🍀`,
    botDados, { replyTo }
  );
}

async function revelar({ grupoId, args, autorId, autorNome, botDados, replyTo, enviarMensagemBot }) {
  const jogo = jogos[grupoId];
  if (!jogo) return false;
  if (!args || args.length < 2) return false;

  const idx = posParaIdx(args.trim());
  if (idx === -1) {
    await enviarMensagemBot(grupoId, '⚠️ Posição inválida! Use A1 até E5.', botDados, { replyTo });
    return true;
  }

  if (jogo.revelado.has(idx)) {
    await enviarMensagemBot(grupoId, '⚠️ Célula já revelada!', botDados, { replyTo });
    return true;
  }

  // Gera minas na primeira jogada (garante que não cai em mina)
  if (!jogo.minas) {
    jogo.minas = gerarMinas(idx);
  }

  // Pisou em mina!
  if (jogo.minas.has(idx)) {
    const board = renderizar(jogo.revelado, jogo.minas, true);
    delete jogos[grupoId];
    await enviarMensagemBot(grupoId,
      `💥 *BOOM!* *${autorNome}* pisou em uma mina!\n\n\`\`\`\n${board}\`\`\`\n_Game over! Use /minas para jogar de novo._`,
      botDados
    );
    return true;
  }

  // Revela célula
  jogo.revelado.add(idx);

  // Verifica vitória (revelou todas sem minas = 20 células)
  if (jogo.revelado.size >= 20) {
    const board = renderizar(jogo.revelado, jogo.minas, true);
    delete jogos[grupoId];
    await enviarMensagemBot(grupoId,
      `🎉 *${autorNome} VENCEU!*\n\n\`\`\`\n${board}\`\`\`\n_Todas as células seguras reveladas!_`,
      botDados
    );
    return true;
  }

  const board = renderizar(jogo.revelado, jogo.minas);
  const vizinhos = contarVizinhos(jogo.minas, idx);
  const cel = COLS[idx % 5] + (Math.floor(idx / 5) + 1);
  await enviarMensagemBot(grupoId,
    `💣 *Campo Minado* — ${jogo.revelado.size}/20 reveladas\n\n\`\`\`\n${board}\`\`\`\n✅ ${cel}: ${vizinhos === 0 ? 'Seguro!' : `${vizinhos} mina(s) próxima(s)`}\n\n_Continue: /minas A1_`,
    botDados
  );
  return true;
}

module.exports = { iniciarJogo, revelar, jogos };