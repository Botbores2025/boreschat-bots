// ═══════════════════════════════════════
// JOGOS/QUIZ.JS — Quiz com placar
// Uso: /quiz  /placar
// ═══════════════════════════════════════

const PERGUNTAS = [
  { p: 'Qual é a capital do Brasil?',              ops: ['A) São Paulo','B) Brasília','C) Rio de Janeiro','D) Salvador'],      r: 'B', e: 'Brasília é capital desde 1960!' },
  { p: 'Quantos lados tem um hexágono?',           ops: ['A) 5','B) 7','C) 6','D) 8'],                                         r: 'C', e: 'Hexa = 6 em grego!' },
  { p: 'Maior planeta do sistema solar?',          ops: ['A) Saturno','B) Netuno','C) Urano','D) Júpiter'],                    r: 'D', e: 'Júpiter cabe 1300 Terras!' },
  { p: 'Em que ano o Brasil foi descoberto?',      ops: ['A) 1492','B) 1500','C) 1510','D) 1498'],                             r: 'B', e: 'Cabral chegou em 1500!' },
  { p: 'Animal mais rápido do mundo?',             ops: ['A) Leão','B) Guepardo','C) Águia','D) Cavalo'],                      r: 'B', e: 'Guepardo chega a 120km/h!' },
  { p: 'Quantos continentes existem?',             ops: ['A) 5','B) 6','C) 7','D) 8'],                                         r: 'C', e: 'São 7 continentes!' },
  { p: 'Símbolo químico do ouro?',                 ops: ['A) Go','B) Or','C) Gd','D) Au'],                                     r: 'D', e: 'Au vem do latim Aurum!' },
  { p: 'Quantos ossos tem o corpo adulto?',        ops: ['A) 206','B) 180','C) 250','D) 300'],                                  r: 'A', e: 'Adultos têm 206 ossos!' },
  { p: 'Linguagem de programação mais usada?',     ops: ['A) Java','B) C++','C) Python','D) JavaScript'],                      r: 'D', e: 'JavaScript domina a web!' },
  { p: 'O que significa HTTP?',                    ops: ['A) HyperText Transfer Protocol','B) High Tech Protocol','C) Home Text Protocol','D) Hyper Terminal Protocol'], r: 'A', e: 'Protocolo da web!' },
  { p: 'Qual país tem mais habitantes?',           ops: ['A) Índia','B) EUA','C) China','D) Brasil'],                          r: 'A', e: 'Índia ultrapassou a China em 2023!' },
  { p: 'Quem pintou a Mona Lisa?',                 ops: ['A) Michelangelo','B) Rafael','C) Da Vinci','D) Picasso'],             r: 'C', e: 'Leonardo da Vinci!' },
  { p: 'Qual o menor país do mundo?',              ops: ['A) Mônaco','B) San Marino','C) Vaticano','D) Liechtenstein'],        r: 'C', e: 'Vaticano com apenas 0.44 km²!' },
  { p: 'Quantas xícaras tem 1 litro?',             ops: ['A) 4','B) 5','C) 6','D) 3'],                                         r: 'B', e: '1 litro = 5 xícaras de 200ml!' },
  { p: 'Qual o osso mais longo do corpo?',         ops: ['A) Úmero','B) Tíbia','C) Fêmur','D) Fíbula'],                        r: 'C', e: 'Fêmur é o osso mais longo!' },
];

// Estado em memória
const quizAtivo = {};
const placar    = {};

function aleatorio(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function addPonto(grupoId, userId, nome) {
  if (!placar[grupoId]) placar[grupoId] = {};
  if (!placar[grupoId][userId]) placar[grupoId][userId] = { nome, pontos: 0 };
  placar[grupoId][userId].pontos++;
  placar[grupoId][userId].nome = nome;
}

function formatarPlacar(grupoId) {
  const p     = placar[grupoId] || {};
  const lista = Object.values(p).sort((a, b) => b.pontos - a.pontos);
  if (lista.length === 0) return 'Nenhum ponto ainda! Use /quiz para jogar.';
  const medals = ['🥇','🥈','🥉'];
  return lista.slice(0, 10).map((u, i) =>
    `${medals[i] || `${i+1}.`} *${u.nome}* — ${u.pontos} pt${u.pontos !== 1 ? 's' : ''}`
  ).join('\n');
}

async function iniciarQuiz({ grupoId, autorNome, botDados, replyTo, enviarMensagemBot }) {
  if (quizAtivo[grupoId]) {
    const q = quizAtivo[grupoId];
    await enviarMensagemBot(grupoId,
      `⚠️ Já tem um quiz ativo!\n\n❓ *${q.pergunta.p}*\n\n${q.pergunta.ops.join('\n')}\n\n_Responda: A, B, C ou D_`,
      botDados, { replyTo }
    );
    return;
  }
  const pergunta = aleatorio(PERGUNTAS);
  quizAtivo[grupoId] = { pergunta, autorNome };
  await enviarMensagemBot(grupoId,
    `🧠 *QUIZ TIME!*\n\n❓ *${pergunta.p}*\n\n${pergunta.ops.join('\n')}\n\n_Digite A, B, C ou D para responder!_`,
    botDados, { replyTo }
  );
}

async function verificarResposta({ grupoId, texto, autorNome, userId, botDados, enviarMensagemBot }) {
  const quiz = quizAtivo[grupoId];
  if (!quiz) return false;
  const r = texto.trim().toUpperCase();
  if (!['A','B','C','D'].includes(r)) return false;
  delete quizAtivo[grupoId];
  if (r === quiz.pergunta.r) {
    addPonto(grupoId, userId, autorNome);
    const pts = placar[grupoId][userId].pontos;
    await enviarMensagemBot(grupoId,
      `✅ *${autorNome}* acertou!\n\n🎉 Resposta: *${quiz.pergunta.r}*\n💡 ${quiz.pergunta.e}\n\n🏆 ${autorNome} tem *${pts} pt${pts !== 1 ? 's' : ''}*!`,
      botDados
    );
  } else {
    await enviarMensagemBot(grupoId,
      `❌ *${autorNome}* errou!\n\nResposta correta: *${quiz.pergunta.r}*\n💡 ${quiz.pergunta.e}`,
      botDados
    );
  }
  return true;
}

async function mostrarPlacar({ grupoId, botDados, replyTo, enviarMensagemBot }) {
  await enviarMensagemBot(grupoId,
    `🏆 *PLACAR DO GRUPO*\n\n${formatarPlacar(grupoId)}\n\n_Use /quiz para ganhar pontos!_`,
    botDados, { replyTo }
  );
}

module.exports = { iniciarQuiz, verificarResposta, mostrarPlacar, quizAtivo };