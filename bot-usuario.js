const BOT_ID   = 'BOT_BORES_OFICIAL';
const BOT_NOME = 'BoresBot';
const BOT_FOTO = 'https://iili.io/C3rRxRf.jpg';
const https    = require('https');

async function perguntarGemini(texto) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const body = JSON.stringify({
      contents: [{ parts: [{ text: `Voce e o BoresBot, assistente do BoresChat. Responda em portugues, curto e simpatico. Maximo 2 frases.\n\nUsuario: ${texto}` }] }]
    });
    return await new Promise((resolve) => {
      const req = https.request({
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }, (res) => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => {
          try { resolve(JSON.parse(raw)?.candidates?.[0]?.content?.parts?.[0]?.text || null); }
          catch (_) { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.write(body); req.end();
    });
  } catch (_) { return null; }
}

const AUTO = [
  { p: /^(oi|ola|hello|hey|bom dia|boa tarde|boa noite)/i, r: 'Oi! Sou o BoresBot, assistente do BoresChat! Como posso ajudar?' },
  { p: /tudo|como vai|como ta/i,  r: 'Estou otimo! Disponivel 24h!' },
  { p: /ajuda|help|comando/i,     r: 'No grupo use /menu para ver os comandos!' },
  { p: /quem|voce/i,              r: 'Sou o BoresBot! Assistente oficial do BoresChat!' },
  { p: /obrigad/i,                r: 'De nada! Sempre disponivel!' },
];

function respostaAuto(texto) {
  for (const a of AUTO) if (a.p.test(texto)) return a.r;
  return null;
}

async function responder(db, admin, conversaId, texto) {
  try { await db.collection('usuarios').doc(BOT_ID).update({ digitando: true, digitandoTimestamp: admin.firestore.FieldValue.serverTimestamp() }); } catch (_) {}
  await new Promise(r => setTimeout(r, 1000 + Math.random() * 1500));
  let resp = respostaAuto(texto) || await perguntarGemini(texto) || 'Posso ajudar com mais alguma coisa?';
  try { await db.collection('usuarios').doc(BOT_ID).update({ digitando: false }); } catch (_) {}
  try {
    await db.collection('conversas').doc(conversaId).collection('mensagens').add({
      texto: resp, tipo: 'texto', enviado_por: BOT_ID,
      nome: BOT_NOME, foto: BOT_FOTO,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      lido: false, entregue: true,
    });
    console.log(`[Bot] Respondeu: "${resp.substring(0, 50)}"`);
  } catch (e) { console.error('[Bot] Erro:', e.message); }
}

async function iniciarBotUsuario(db, admin) {
  console.log('🤖 BotUsuario iniciando...');

  // Online 24h
  const online = async () => {
    try { await db.collection('usuarios').doc(BOT_ID).update({ statusConexao: 'online', online: true, ultimaVez: admin.firestore.FieldValue.serverTimestamp() }); } catch (_) {}
  };
  await online();
  setInterval(online, 30000);

  const processadas = new Set();
  const ouvindo     = new Set();

  const ouvirConversa = (conversaId) => {
    if (ouvindo.has(conversaId)) return;
    ouvindo.add(conversaId);
    console.log(`[Bot] Ouvindo: ${conversaId}`);
    let primeira = true;
    db.collection('conversas').doc(conversaId).collection('mensagens')
      .orderBy('timestamp', 'desc').limit(1)
      .onSnapshot(async (snap) => {
        if (primeira) { primeira = false; return; }
        if (snap.empty) return;
        const doc  = snap.docs[0];
        const dado = doc.data();
        if (dado.enviado_por === BOT_ID) return;
        if (processadas.has(doc.id)) return;
        processadas.add(doc.id);
        const texto = (dado.texto || '').trim();
        if (!texto) return;
        console.log(`[Bot] Msg: "${texto}"`);
        await responder(db, admin, conversaId, texto);
      });
  };

  // Ouve todas as conversas do Firestore e filtra pelo ID do bot
  db.collection('conversas').onSnapshot((snap) => {
    snap.docs.forEach(d => {
      if (d.id.includes(BOT_ID)) ouvirConversa(d.id);
    });
  });

  console.log('✅ BotUsuario pronto!');
}

module.exports = { iniciarBotUsuario, BOT_ID, BOT_NOME };