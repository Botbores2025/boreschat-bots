// ═══════════════════════════════════════════════════════════════
// BOT-USUARIO.JS — BoresBot como usuário real no PV
// ═══════════════════════════════════════════════════════════════

const BOT_ID   = 'BOT_BORES_OFICIAL';
const BOT_NOME = 'BoresBot';
const BOT_FOTO = 'https://iili.io/C3iXrOv.jpg';
const https    = require('https');

const MODELOS_GEMINI = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

const SYSTEM_PROMPT = `Voce e o BoresBot, assistente oficial do BoresChat.
Fui criado e treinado por Riquefla, o desenvolvedor do BoresChat.
Sou simpatico, divertido, prestativo e um pouco brincalhao.
Respondo em portugues brasileiro natural e informal, como um amigo.
Quando perguntarem quem me criou: "Fui criado pelo Riquefla, desenvolvedor do BoresChat!"
Maximo 3 frases. Sem markdown, sem asterisco, texto simples.`;

// ─── GEMINI COM FALLBACK ──────────────────────────────────────
async function perguntarGemini(texto) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  for (const modelo of MODELOS_GEMINI) {
    try {
      const body = JSON.stringify({
        contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\nUsuario: ${texto}` }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 300 }
      });

      const resposta = await new Promise((resolve) => {
        const req = https.request({
          hostname: 'generativelanguage.googleapis.com',
          path: `/v1beta/models/${modelo}:generateContent?key=${apiKey}`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, (res) => {
          let raw = '';
          res.on('data', c => raw += c);
          res.on('end', () => {
            try {
              const data = JSON.parse(raw);
              resolve(data?.candidates?.[0]?.content?.parts?.[0]?.text || null);
            } catch (_) { resolve(null); }
          });
        });
        req.on('error', () => resolve(null));
        req.write(body); req.end();
      });

      if (resposta) {
        console.log(`[Bot] Gemini respondeu (${modelo})`);
        return resposta;
      }
    } catch (_) {}
  }
  return null;
}

// ─── RESPOSTAS AUTOMÁTICAS ────────────────────────────────────
const AUTO = [
  { p: /^(oi|ola|hello|hey|e ai|eae|salve)[\s!?]*$/i,
    r: ['Oi! Tudo bem? 😊', 'Olá! Como posso ajudar?', 'Eae! Sou o BoresBot, pode falar!', 'Oi oi! O que manda?'] },
  { p: /bom dia/i,
    r: ['Bom dia! Que seu dia seja incrível! ☀️', 'Bom dia! Já pegou suas moedas do dia? Use /daily no grupo!'] },
  { p: /boa tarde/i,
    r: ['Boa tarde! 😄', 'Boa tarde! Tudo certo por aí?'] },
  { p: /boa noite/i,
    r: ['Boa noite! 🌙', 'Boa noite! Descansando bem?'] },
  { p: /tudo (bem|bom|certo|ok)|como (vai|ta|está)/i,
    r: ['Tudo ótimo! Disponível 24h pra ajudar! 😎', 'Estou bem! E você?', 'Tudo certo por aqui! Pode me chamar quando quiser!'] },
  { p: /quem (é|e) (você|voce)|o que (é|e) (você|voce)/i,
    r: ['Sou o BoresBot! Assistente oficial do BoresChat, criado pelo Riquefla! 🤖', 'Sou o BoresBot, seu assistente no BoresChat! Fui criado pelo Riquefla!'] },
  { p: /quem (te |)criou|quem (te |)fez|quem (é|e) (seu|teu) criador/i,
    r: ['Fui criado pelo Riquefla, o desenvolvedor do BoresChat! Ele é o chefe! 😄', 'Meu criador é o Riquefla! Ele me treinou e me colocou no BoresChat!'] },
  { p: /obrigad|valeu|vlw|tmj/i,
    r: ['De nada! 😊', 'Tmj! Qualquer coisa é só chamar!', 'Disponha! Estou sempre aqui!'] },
  { p: /ajuda|help|como usa|o que (você|voce) faz/i,
    r: ['Posso responder perguntas aqui no PV! No grupo use /menu para ver todos os comandos! 🎮', 'No grupo tenho vários comandos! Digite /menu lá para ver tudo. Aqui no PV pode me perguntar qualquer coisa!'] },
  { p: /tchau|até|flw|falou/i,
    r: ['Até! 👋', 'Falou! Qualquer coisa é só chamar!', 'Tchau! Cuida-se! 😊'] },
  { p: /triste|mal|ruim|deprimid/i,
    r: ['Poxa, sinto muito... Espero que melhore logo! 💙', 'Fica bem! Às vezes conversar ajuda, pode falar comigo!'] },
  { p: /feliz|otimo|incrivel|top|maravilh/i,
    r: ['Que ótimo! Fico feliz por você! 😄', 'Arrasou! Continues assim! 🔥'] },
];

function respostaAuto(texto) {
  for (const a of AUTO) {
    if (a.p.test(texto)) {
      const respostas = Array.isArray(a.r) ? a.r : [a.r];
      return respostas[Math.floor(Math.random() * respostas.length)];
    }
  }
  return null;
}

// ─── ENVIA MENSAGEM ───────────────────────────────────────────
async function enviarMensagem(db, admin, conversaId, texto) {
  try {
    await db.collection('conversas').doc(conversaId).collection('mensagens').add({
      texto, tipo: 'texto',
      enviado_por: BOT_ID,
      nome: BOT_NOME,
      foto: BOT_FOTO,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      lido: false, entregue: true,
    });
    console.log(`[Bot] Respondeu: "${texto.substring(0, 60)}"`);
  } catch (e) { console.error('[Bot] Erro ao enviar:', e.message); }
}

// ─── RESPONDE MENSAGEM ────────────────────────────────────────
async function responder(db, admin, conversaId, texto) {
  // Simula digitando
  try {
    await db.collection('usuarios').doc(BOT_ID).update({
      digitando: true,
      digitandoTimestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (_) {}

  // Delay humano
  const delay = 1200 + Math.random() * 2000;
  await new Promise(r => setTimeout(r, delay));

  // Para de digitar
  try { await db.collection('usuarios').doc(BOT_ID).update({ digitando: false }); } catch (_) {}

  // Tenta resposta automática primeiro
  let resp = respostaAuto(texto);

  // Se não encontrou, usa Gemini
  if (!resp) {
    resp = await perguntarGemini(texto);
  }

  // Fallback final
  if (!resp) {
    const fallbacks = [
      'Interessante! Me conta mais sobre isso.',
      'Boa pergunta! Infelizmente não sei responder isso agora.',
      'Hmm, deixa eu pensar... Pode reformular a pergunta?',
      'Não entendi muito bem. Pode explicar diferente?',
    ];
    resp = fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  await enviarMensagem(db, admin, conversaId, resp);
}

// ─── OUVE CONVERSA ────────────────────────────────────────────
const processadas = new Set();
const ouvindo     = new Set();

function ouvirConversa(db, admin, conversaId) {
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
      console.log(`[Bot] Msg recebida: "${texto}"`);
      await responder(db, admin, conversaId, texto);
    });
}

// ─── INICIA BOT ───────────────────────────────────────────────
async function iniciarBotUsuario(db, admin) {
  console.log('🤖 BotUsuario iniciando...');

  // Atualiza perfil do bot com foto nova
  try {
    await db.collection('usuarios').doc(BOT_ID).set({
      nome:          BOT_NOME,
      fotoPerfil:    BOT_FOTO,
      bio:           'Assistente oficial do BoresChat. Disponível 24h! 🤖',
      statusConexao: 'online',
      online:        true,
      ehBot:         true,
      digitando:     false,
      ultimaVez:     admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log('[Bot] Perfil atualizado com nova foto!');
  } catch (e) { console.error('[Bot] Erro ao atualizar perfil:', e.message); }

  // Mantém online 24h
  const manterOnline = async () => {
    try {
      await db.collection('usuarios').doc(BOT_ID).update({
        statusConexao: 'online',
        online:        true,
        ultimaVez:     admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (_) {}
  };
  await manterOnline();
  setInterval(manterOnline, 25000);

  // Busca conversas existentes
  try {
    const allDocs = await db.collection('conversas').listDocuments();
    let encontradas = 0;
    for (const docRef of allDocs) {
      if (docRef.id.includes(BOT_ID)) {
        ouvirConversa(db, admin, docRef.id);
        encontradas++;
      }
    }
    console.log(`[Bot] ${encontradas} conversa(s) do bot encontrada(s)`);
  } catch (e) { console.error('[Bot] Erro listDocuments:', e.message); }

  // Detecta novas conversas
  db.collection('conversas').onSnapshot((snap) => {
    snap.docChanges().forEach(change => {
      if (change.doc.id.includes(BOT_ID)) {
        ouvirConversa(db, admin, change.doc.id);
      }
    });
  });

  console.log('✅ BotUsuario pronto!');
}

module.exports = { iniciarBotUsuario, BOT_ID, BOT_NOME };