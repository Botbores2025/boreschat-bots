// ═══════════════════════════════════════════════════════════════
// BOT-USUARIO.JS — Bot como usuario real no BoresChat
// - Mantém online 24h
// - Responde mensagens privadas com IA (Gemini)
// - Entra em grupos automaticamente por convite
// ═══════════════════════════════════════════════════════════════

const BOT_ID    = 'BOT_BORES_OFICIAL';
const BOT_NOME  = 'BoresBot';
const BOT_TOKEN = 'BORES_1BF57D7481294163923C991F';

const https = require('https');

// ─── HELPER HTTP ─────────────────────────────────────────────────────────────
function httpPost(hostname, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req  = https.request({
      hostname, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers },
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch (_) { resolve(raw); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ─── GEMINI IA ───────────────────────────────────────────────────────────────
async function perguntarGemini(pergunta) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return 'Oi! Sou o BoresBot, assistente do BoresChat. Como posso ajudar?';

  try {
    const resp = await httpPost(
      'generativelanguage.googleapis.com',
      `/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
      {
        contents: [{
          parts: [{
            text: `Voce e o BoresBot, assistente oficial do BoresChat. 
Seja simpatico, curto e direto. Responda em portugues.
Nao use markdown. Maximo 3 frases.

Pergunta do usuario: ${pergunta}`
          }]
        }]
      }
    );
    return resp?.candidates?.[0]?.content?.parts?.[0]?.text || 'Desculpe, nao entendi. Pode repetir?';
  } catch (e) {
    console.error('[BotUsuario] Gemini erro:', e.message);
    return 'Oi! Estou aqui para ajudar. O que precisas?';
  }
}

// ─── RESPOSTAS AUTOMATICAS (sem Gemini) ──────────────────────────────────────
const RESPOSTAS_AUTO = [
  { pattern: /oi|ola|hello|hey|boa/i,      resp: 'Oi! Tudo bem? Sou o BoresBot, assistente do BoresChat! Como posso ajudar?' },
  { pattern: /tudo|como vai|como esta/i,   resp: 'Estou otimo, obrigado! Disponivel 24h para ajudar!' },
  { pattern: /comando|ajuda|help/i,        resp: 'No grupo voce pode usar /menu para ver todos os comandos disponíveis!' },
  { pattern: /grupo|entrar|convite/i,      resp: 'Me adicione ao seu grupo! Va em Gerenciar Grupo → Bots → cole meu token: BORES_1BF57D7481294163923C991F' },
  { pattern: /quem e|quem és|quem es/i,   resp: 'Sou o BoresBot! Assistente oficial do BoresChat, aqui para ajudar 24h!' },
  { pattern: /obrigad/i,                   resp: 'De nada! Fico feliz em ajudar! Se precisar de algo e so chamar!' },
];

function respostaAutomatica(texto) {
  for (const r of RESPOSTAS_AUTO) {
    if (r.pattern.test(texto)) return r.resp;
  }
  return null;
}

// ─── INICIALIZA BOT USUARIO ───────────────────────────────────────────────────
async function iniciarBotUsuario(db, admin) {
  console.log(`🤖 BotUsuario "${BOT_NOME}" iniciando...`);

  // 1. Mantém online 24h — atualiza statusConexao a cada 30s
  const manterOnline = async () => {
    try {
      await db.collection('usuarios').doc(BOT_ID).update({
        statusConexao: 'online',
        online:        true,
        ultimaVez:     admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) { console.error('[BotUsuario] Erro manter online:', e.message); }
  };

  await manterOnline();
  setInterval(manterOnline, 30000); // a cada 30 segundos
  console.log('✅ BotUsuario online 24h ativado');

  // 2. Listener de conversas privadas
  let primeiraExecConversas = true;
  const conversasProcessadas = new Set();

  db.collection('conversas')
    .where('participantes', 'array-contains', BOT_ID)
    .onSnapshot(async (snap) => {
      if (primeiraExecConversas) { primeiraExecConversas = false; return; }

      for (const conversaDoc of snap.docs) {
        const conversaId = conversaDoc.id;

        // Listener de mensagens da conversa
        db.collection('conversas').doc(conversaId)
          .collection('mensagens')
          .orderBy('timestamp', 'desc')
          .limit(1)
          .onSnapshot(async (msgSnap) => {
            if (msgSnap.empty) return;

            const msgDoc  = msgSnap.docs[0];
            const msgId   = msgDoc.id;
            const dado    = msgDoc.data();

            // Ignora mensagens do proprio bot
            if (dado.enviado_por === BOT_ID) return;
            if (conversasProcessadas.has(msgId)) return;
            conversasProcessadas.add(msgId);

            const texto = (dado.texto || '').trim();
            if (!texto) return;

            console.log(`[BotUsuario] Mensagem privada: "${texto}"`);

            // Simula digitando
            try {
              await db.collection('usuarios').doc(BOT_ID).update({
                digitando:          true,
                digitandoTimestamp: admin.firestore.FieldValue.serverTimestamp(),
              });
            } catch (_) {}

            // Aguarda 1-2s para parecer humano
            const delay = 1000 + Math.random() * 1500;
            await new Promise(r => setTimeout(r, delay));

            // Gera resposta
            let resposta = respostaAutomatica(texto);
            if (!resposta) {
              resposta = await perguntarGemini(texto);
            }

            // Para digitando
            try {
              await db.collection('usuarios').doc(BOT_ID).update({
                digitando: false,
              });
            } catch (_) {}

            // Envia resposta
            try {
              await db.collection('conversas').doc(conversaId)
                .collection('mensagens').add({
                  texto:       resposta,
                  tipo:        'texto',
                  enviado_por: BOT_ID,
                  nome:        BOT_NOME,
                  foto:        'https://iili.io/C3rRxRf.jpg',
                  timestamp:   admin.firestore.FieldValue.serverTimestamp(),
                  lido:        false,
                  entregue:    true,
                });
              console.log(`[BotUsuario] Respondeu: "${resposta.substring(0, 50)}"`);
            } catch (e) {
              console.error('[BotUsuario] Erro ao responder:', e.message);
            }
          });
      }
    });

  // 3. Listener de convites de grupo (mensagens privadas com link de grupo)
  console.log('✅ BotUsuario listeners ativos');
}

module.exports = { iniciarBotUsuario, BOT_ID, BOT_NOME };