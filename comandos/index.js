// ═══════════════════════════════════════════════════════════════
// COMANDOS/INDEX.JS — Registra todos os módulos
// ═══════════════════════════════════════════════════════════════

// ─── MENU ────────────────────────────────────────────────────
const menu       = require('./menu/menu');

// ─── ADM ─────────────────────────────────────────────────────
const limpar     = require('./adm/limpar');
const fecharGrupo = require('./adm/fecharGrupo');
const banir      = require('./adm/banir');
const remover    = require('./adm/remover');
const editarGrupo = require('./adm/editarGrupo');
const adicionar  = require('./adm/adicionar');

// ─── JOGOS ───────────────────────────────────────────────────
const dado       = require('./jogos/dado');
const quiz       = require('./jogos/quiz');
const tictac     = require('./jogos/tictac');
const campoMinado = require('./jogos/campoMinado');
const paciencia  = require('./jogos/paciencia');

// ─── USUARIO ─────────────────────────────────────────────────
const musica     = require('./usuario/musica');
const gemini     = require('./usuario/gemini');
const clima      = require('./usuario/clima');
const resumo     = require('./usuario/resumo');
const enquete    = require('./usuario/enquete');
const sorteio    = require('./usuario/sorteio');
const mencoes    = require('./usuario/mencoes');

// ─── SISTEMA ─────────────────────────────────────────────────
const xp         = require('./sistema/xp');
const boasVindas = require('./sistema/boasVindas');
const conquistas = require('./sistema/conquistas');
const economia   = require('./sistema/economia');
const perfil     = require('./sistema/perfil');
const ranking    = require('./sistema/ranking');

module.exports = {
  menu,
  adm:     { limpar, banir, remover, editarGrupo, adicionar, fecharGrupo },
  jogos:   { dado, quiz, tictac, campoMinado, paciencia },
  usuario: { musica, gemini, clima, resumo, enquete, sorteio, mencoes },
  sistema: { xp, conquistas, economia, perfil, ranking, boasVindas },
};