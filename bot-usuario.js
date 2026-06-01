// ═══════════════════════════════════════════════════════════════
// BOT-USUARIO.JS — Bot como usuario real no BoresChat
// ═══════════════════════════════════════════════════════════════

const BOT_ID   = 'BOT_BORES_OFICIAL';
const BOT_NOME = 'BoresBot';
const BOT_FOTO = 'https://iili.io/C3rRxRf.jpg';

const https = require('https');

// ─── GEMINI ──────────────────────────────────────────────────────────────────
async function perguntarGemini(texto) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const body = JSON.stringify({
      contents: [{ parts: [{ text: `Voce e o BoresBot, assistente oficial do BoresChat. Seja simpatico, curto e direto. Responda em portugues sem markdown. Maximo 2 frases.\n\nUsuario disse: ${texto}` }] }]
    });
    return await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'generativelanguage.googleapis.com',
        path:     `/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
        method:   'POST',
        headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
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
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  } catch (e) { return null; }
}

// ─── RESPOSTAS AUTOMATICAS ────────────────────────────────────────────────────
const AUTO = [
  { p: /^(oi|ola|ola|hello|hey|e ai|eai|bom dia|boa tarde|boa noite|boa madrugada)/i, r: `Oi! Sou o BoresBot, assistente oficial do BoresChat! Como posso ajudar?` },
  { p: /tudo|como vai|como ta|como esta/i, r: `Estou otimo! Disponivel 24h para ajudar no BoresChat!` },
  { p: /ajuda|help|comando/i, r: `No grupo use /menu para ver todos os comandos! Se quiser me adicionar a um grupo va em Gerenciar Grupo → Bots.` },
  { p: /quem e(s)? voce|quem es tu/i, r: `Sou o BoresBot! Assistente oficial do BoresChat, criado para ajudar 24h!` },
  { p: /obrigad/i, r: `De nada! Fico feliz em ajudar! Se precisar e so chamar!` },
  { p: /grupo|entrar|convite|adicionar/i, r: `Para me adicionar ao seu grupo: Gerenciar Grupo → Bots → cole o token BORES_1BF57D7481294163923C991F` },
];

function respostaAuto(texto) {
  for (const a of AUTO) {
    if (a.p.test(texto.trim())) return a.r;
  }
  return null;
}

// ─── INICIALIZA ───────────────────────────────────────────────────────────────
async function iniciarBotUsuario(db, admin) {
  console.log(`🤖 BotUsuario "${BOT_NOME}" iniciando...`);

  // 1. Mantém online 24h
  const manterOnline = async () => {
    try {
      await db.collection('usuarios').doc(BOT_ID).update({
        statusConexao: 'online',
        online:        true,
        ultimaVez:     admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {}
  };
  await manterOnline();
  setInterval(manterOnline, 30000);
  console.log('✅ BotUsuario online 24h ativado');

  // 2. Ouve conversas pelo ID — formato: BOT_BORES_OFICIAL_USERID ou USERID_BOT_BORES_OFICIAL
  const msgProcessadas = new Set();
  const conversasOuvindo = new Set();

  const ouvirConversa = (conversaId) => {
    if (conversasOuvindo.has(conversaId)) return;
    conversasOuvindo.add(conversaId);

    let primeira = true;
    db.collection('conversas').doc(conversaId)
      .collection('mensagens')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .onSnapshot(async (snap) => {
        if (primeira) { primeira = false; return; }
        if (snap.empty) return;

        const msgDoc = snap.docs[0];
        const msgId  = msgDoc.id;
        const dado   = msgDoc.data();

        if (dado.enviado_por === BOT_ID) return;
        if (msgProcessadas.has(msgId)) return;
        msgProcessadas.add(msgId);

        const texto = (dado.texto || '').trim();
        if (!texto) return;

        console.log(`[BotUsuario] "${texto}" de ${dado.enviado_por}`);

        // Simula digitando
        try {
          await db.collection('usuarios').doc(BOT_ID).update({
            digitando:          true,
            digitandoTimestamp: admin.firestore.FieldValue.serverTimestamp(),
          });
        } catch (_) {}

        // Delay humano
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 1500));

        // Gera resposta
        let resposta = respostaAuto(texto);
        if (!resposta) resposta = await perguntarGemini(texto);
        if (!resposta) resposta = 'Entendi! Posso ajudar com mais alguma coisa?';

        // Para digitando
        try {
          await db.collection('usuarios').doc(BOT_ID).update({ digitando: false });
        } catch (_) {}

        // Envia resposta
        try {
          await db.collection('conversas').doc(conversaId)
            .collection('mensagens').add({
              texto,       tipo: 'texto',
              texto:       resposta,
              enviado_por: BOT_ID,
              nome:        BOT_NOME,
              foto:        BOT_FOTO,
              timestamp:   admin.firestore.FieldValue.serverTimestamp(),
              lido:        false,
              entregue:    true,
            });
          console.log(`[BotUsuario] Respondeu: "${resposta.substring(0, 60)}"`);
        } catch (e) {
          console.error('[BotUsuario] Erro ao responder:', e.message);
        }
      });
  };

  // 3. Detecta novas conversas onde o bot e participante
  // O ID da conversa segue o padrao: ID1_ID2 (ordenado alfabeticamente)
  // Ouve todas as conversas que começam com BOT_BORES_OFICIAL
  db.collection('conversas')
    .onSnapshot((snap) => {
      snap.docs.forEach(d => {
        const id = d.id;
        if (id.includes(BOT_ID)) {
          ouvirConversa(id);
        }
      });
    });

  console.log('✅ BotUsuario listeners ativos');
}

module.exports = { iniciarBotUsuario, BOT_ID, BOT_NOME };