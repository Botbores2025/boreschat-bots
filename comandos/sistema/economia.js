// ═══════════════════════════════════════════════════════════════
// SISTEMA/ECONOMIA.JS — Economia virtual do grupo
// /daily /trabalhar /roubar /loja /banco /moedas
// ═══════════════════════════════════════════════════════════════

const { adicionarXP, getStats } = require('./xp');
const { verificarConquistas }   = require('./conquistas');

const ITENS_LOJA = [
  { id: 'escudo',    icon: '🛡️', nome: 'Escudo',         desc: 'Protege 1 roubo',          preco: 500,  tipo: 'consumivel' },
  { id: 'boost_xp',  icon: '⚡', nome: 'Boost XP',       desc: '+2x XP por 1 hora',         preco: 1000, tipo: 'consumivel' },
  { id: 'dado_ouro', icon: '🎲', nome: 'Dado de Ouro',   desc: '/dado ganha moedas extras', preco: 2000, tipo: 'consumivel' },
  { id: 'vip',       icon: '👑', nome: 'VIP',            desc: 'Badge VIP no perfil',        preco: 5000, tipo: 'permanente' },
];

function getRef(db, grupoId, userId) {
  return db.collection('grupos').doc(grupoId).collection('usuarios_stats').doc(userId);
}

async function getDados(db, grupoId, userId, nome, foto) {
  const ref  = getRef(db, grupoId, userId);
  const snap = await ref.get();
  if (snap.exists) return { ref, dados: snap.data() };
  const dados = {
    userId, nome, foto: foto || '',
    xp: 0, moedas: 100, level: 1,
    conquistas: [], wins: 0, mensagens: 0,
    itens: [], escudos: 0,
    ultimoDaily: null, ultimoTrabalho: null,
    streak_daily: 0, quiz_acertos: 0,
    criadoEm: new Date().toISOString(),
  };
  await ref.set(dados);
  return { ref, dados };
}

// ─── DAILY ───────────────────────────────────────────────────────────────────
async function daily({ grupoId, userId, autorNome, foto, botDados, replyTo, enviarMensagemBot, db }) {
  const { ref, dados } = await getDados(db, grupoId, userId, autorNome, foto);
  const agora     = Date.now();
  const ultimo    = dados.ultimoDaily ? new Date(dados.ultimoDaily).getTime() : 0;
  const diffHoras = (agora - ultimo) / 1000 / 3600;

  if (diffHoras < 22) {
    const horas    = Math.floor(22 - diffHoras);
    const minutos  = Math.floor(((22 - diffHoras) - horas) * 60);
    await enviarMensagemBot(grupoId,
      `⏰ *${autorNome}*, seu daily ja foi coletado!\n\nVolte em *${horas}h ${minutos}m*`,
      botDados, { replyTo }
    );
    return;
  }

  // Calcula streak
  const diffDias  = diffHoras / 24;
  const novoStreak = diffDias <= 26 ? (dados.streak_daily || 0) + 1 : 1;
  const bonus     = Math.min(novoStreak * 10, 200); // bonus de streak max 200
  const moedas    = 200 + bonus;
  const novasMoedas = (dados.moedas || 0) + moedas;

  await ref.update({
    moedas:      novasMoedas,
    ultimoDaily: new Date().toISOString(),
    streak_daily: novoStreak,
  });

  await adicionarXP(db, grupoId, userId, autorNome, foto, 'daily', enviarMensagemBot, botDados);

  const streakTexto = novoStreak > 1 ? `\n🔥 Streak: *${novoStreak} dias* (+${bonus} bonus)` : '';
  await enviarMensagemBot(grupoId,
    `💰 *${autorNome}* coletou o daily!\n\n+*${moedas} moedas*${streakTexto}\n\n💳 Saldo: *${novasMoedas} moedas*`,
    botDados, { replyTo }
  );

  const statsAtual = await getStats(db, grupoId, userId);
  if (statsAtual) await verificarConquistas(db, grupoId, userId, { ...statsAtual, streak_daily: novoStreak }, enviarMensagemBot, botDados);
}

// ─── TRABALHAR ───────────────────────────────────────────────────────────────
const TRABALHOS = [
  { desc: 'trabalhou como programador', min: 80,  max: 200 },
  { desc: 'fez entrega de pizza',       min: 50,  max: 150 },
  { desc: 'jogou poker profissional',   min: 10,  max: 300 },
  { desc: 'vendeu meme na internet',    min: 5,   max: 500 },
  { desc: 'minerou cripto',            min: 20,  max: 400 },
  { desc: 'fez freela de design',      min: 100, max: 250 },
  { desc: 'vendeu brigadeiro',         min: 30,  max: 120 },
];

async function trabalhar({ grupoId, userId, autorNome, foto, botDados, replyTo, enviarMensagemBot, db }) {
  const { ref, dados } = await getDados(db, grupoId, userId, autorNome, foto);
  const agora     = Date.now();
  const ultimo    = dados.ultimoTrabalho ? new Date(dados.ultimoTrabalho).getTime() : 0;
  const diffMin   = (agora - ultimo) / 1000 / 60;

  if (diffMin < 60) {
    const min = Math.floor(60 - diffMin);
    await enviarMensagemBot(grupoId,
      `⏰ *${autorNome}*, voce ainda esta cansado!\n\nDescanse por *${min} minutos*`,
      botDados, { replyTo }
    );
    return;
  }

  const trabalho  = TRABALHOS[Math.floor(Math.random() * TRABALHOS.length)];
  const ganho     = Math.floor(Math.random() * (trabalho.max - trabalho.min + 1)) + trabalho.min;
  const novasMoedas = (dados.moedas || 0) + ganho;

  await ref.update({ moedas: novasMoedas, ultimoTrabalho: new Date().toISOString() });
  await adicionarXP(db, grupoId, userId, autorNome, foto, 'trabalhar', enviarMensagemBot, botDados);

  await enviarMensagemBot(grupoId,
    `💼 *${autorNome}* ${trabalho.desc}\n\n+*${ganho} moedas*\n💳 Saldo: *${novasMoedas} moedas*`,
    botDados, { replyTo }
  );
}

// ─── ROUBAR ───────────────────────────────────────────────────────────────────
async function roubar({ grupoId, userId, autorNome, foto, args, botDados, replyTo, enviarMensagemBot, db }) {
  if (!args) {
    await enviarMensagemBot(grupoId, '⚠️ Use: /roubar @nome', botDados, { replyTo });
    return;
  }

  const { ref: refLadrao, dados: dadosLadrao } = await getDados(db, grupoId, userId, autorNome, foto);

  // Busca vitima
  const busca    = args.replace('@','').toLowerCase().trim();
  const grupoDoc = await db.collection('grupos').doc(grupoId).get();
  const membros  = grupoDoc.data()?.membros || [];

  let vitima = null;
  for (const uid of membros) {
    if (uid === userId) continue;
    const u = await db.collection('usuarios').doc(uid).get();
    if (u.exists && u.data().nome?.toLowerCase().includes(busca)) {
      const stats = await getStats(db, grupoId, uid);
      vitima = { uid, nome: u.data().nome, stats };
      break;
    }
  }

  if (!vitima || !vitima.stats) {
    await enviarMensagemBot(grupoId, `❌ Usuario "${args}" nao encontrado.`, botDados, { replyTo });
    return;
  }

  // Vitima tem escudo?
  const refVitima = getRef(db, grupoId, vitima.uid);
  if ((vitima.stats.escudos || 0) > 0) {
    await refVitima.update({ escudos: vitima.stats.escudos - 1 });
    await enviarMensagemBot(grupoId,
      `🛡️ *${vitima.nome}* estava protegido!\n\nO escudo bloqueou o roubo de *${autorNome}*!`,
      botDados
    );
    return;
  }

  // 40% chance de sucesso
  const sucesso = Math.random() < 0.4;

  if (sucesso) {
    const moedasVitima = vitima.stats.moedas || 0;
    const roubado = Math.floor(moedasVitima * (Math.random() * 0.3 + 0.1)); // rouba 10-40%
    if (roubado < 1) {
      await enviarMensagemBot(grupoId, `💸 *${vitima.nome}* esta quebrado! Nao tem nada pra roubar.`, botDados, { replyTo });
      return;
    }
    await refVitima.update({ moedas: moedasVitima - roubado });
    await refLadrao.update({ moedas: (dadosLadrao.moedas || 0) + roubado });
    await enviarMensagemBot(grupoId,
      `🦹 *${autorNome}* roubou *${vitima.nome}*!\n\n💰 +*${roubado} moedas* roubadas!\n💳 Saldo: *${(dadosLadrao.moedas || 0) + roubado} moedas*`,
      botDados
    );
  } else {
    // Falhou — paga multa
    const multa = Math.floor((dadosLadrao.moedas || 0) * 0.15);
    await refLadrao.update({ moedas: Math.max(0, (dadosLadrao.moedas || 0) - multa) });
    await enviarMensagemBot(grupoId,
      `🚔 *${autorNome}* foi pego tentando roubar *${vitima.nome}*!\n\n💸 Multa: *-${multa} moedas*`,
      botDados
    );
  }
}

// ─── LOJA ─────────────────────────────────────────────────────────────────────
async function loja({ grupoId, userId, autorNome, foto, args, botDados, replyTo, enviarMensagemBot, db }) {
  if (!args) {
    // Mostra loja
    const lista = ITENS_LOJA.map(i => `${i.icon} *${i.nome}* — ${i.preco} moedas\n   ${i.desc}`).join('\n\n');
    const botoes = ITENS_LOJA.map(i => ({ label: `${i.icon} ${i.nome}`, comando: `/loja ${i.id}` }));
    await enviarMensagemBot(grupoId,
      `🏪 *LOJA DO GRUPO*\n\n${lista}\n\nUse /loja [id] para comprar`,
      botDados, { replyTo, botoes }
    );
    return;
  }

  const item = ITENS_LOJA.find(i => i.id === args.trim().toLowerCase());
  if (!item) {
    await enviarMensagemBot(grupoId, '❌ Item nao encontrado! Use /loja para ver os itens.', botDados, { replyTo });
    return;
  }

  const { ref, dados } = await getDados(db, grupoId, userId, autorNome, foto);
  if ((dados.moedas || 0) < item.preco) {
    await enviarMensagemBot(grupoId,
      `💸 *${autorNome}*, voce nao tem moedas suficientes!\n\nNecessario: *${item.preco}*\nSeu saldo: *${dados.moedas || 0}*`,
      botDados, { replyTo }
    );
    return;
  }

  const novasMoedas = (dados.moedas || 0) - item.preco;
  const updates     = { moedas: novasMoedas };

  if (item.id === 'escudo') updates.escudos = (dados.escudos || 0) + 1;
  if (item.id === 'vip')    updates.vip = true;

  await ref.update(updates);
  await enviarMensagemBot(grupoId,
    `🛍️ *${autorNome}* comprou *${item.nome}*!\n\n${item.icon} ${item.desc}\n💳 Saldo: *${novasMoedas} moedas*`,
    botDados, { replyTo }
  );

  const statsAtual = await getStats(db, grupoId, userId);
  if (statsAtual) await verificarConquistas(db, grupoId, userId, { ...statsAtual, moedas: novasMoedas }, enviarMensagemBot, botDados);
}

// ─── SALDO ────────────────────────────────────────────────────────────────────
async function saldo({ grupoId, userId, autorNome, foto, botDados, replyTo, enviarMensagemBot, db }) {
  const { dados } = await getDados(db, grupoId, userId, autorNome, foto);
  const itens     = (dados.escudos || 0) > 0 ? `\n🛡️ Escudos: *${dados.escudos}*` : '';
  const vip       = dados.vip ? '\n👑 *VIP*' : '';
  await enviarMensagemBot(grupoId,
    `💳 *Carteira de ${autorNome}*\n\n💰 Moedas: *${dados.moedas || 0}*${itens}${vip}`,
    botDados, { replyTo }
  );
}

module.exports = { daily, trabalhar, roubar, loja, saldo, getDados };