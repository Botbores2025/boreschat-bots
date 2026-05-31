// ═══════════════════════════════════════════════════════════════
// COMANDOS/INDEX.JS — Exporta todos os módulos
// ═══════════════════════════════════════════════════════════════

// ─── ADM ─────────────────────────────────────────────────────
const limpar      = require('./adm/limpar');
const banir       = require('./adm/banir');
const remover     = require('./adm/remover');
const editarGrupo = require('./adm/editarGrupo');
const adicionar   = require('./adm/adicionar');

// ─── JOGOS ───────────────────────────────────────────────────
const dado        = require('./jogos/dado');
const quiz        = require('./jogos/quiz');
const tictac      = require('./jogos/tictac');
const campoMinado = require('./jogos/campoMinado');
const paciencia   = require('./jogos/paciencia');

// ─── USUARIO ─────────────────────────────────────────────────
const musica      = require('./usuario/musica');
const gemini      = require('./usuario/gemini');

// ─── SISTEMA ─────────────────────────────────────────────────
const xp          = require('./sistema/xp');
const conquistas  = require('./sistema/conquistas');
const economia    = require('./sistema/economia');
const perfil      = require('./sistema/perfil');
const ranking     = require('./sistema/ranking');

module.exports = {
  adm:     { limpar, banir, remover, editarGrupo, adicionar },
  jogos:   { dado, quiz, tictac, campoMinado, paciencia },
  usuario: { musica, gemini },
  sistema: { xp, conquistas, economia, perfil, ranking },
};