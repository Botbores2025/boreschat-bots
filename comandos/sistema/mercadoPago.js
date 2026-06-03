// ═══════════════════════════════════════════════════
// SISTEMA/MERCADOPAGO.JS — Integração PIX via https nativo
// ═══════════════════════════════════════════════════

const https = require('https');

const MP_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN;
const WEBHOOK_BASE    = process.env.WEBHOOK_URL || 'https://boreschat-bots-production.up.railway.app';

async function criarPagamentoPix({ userId, planoId, email, valor, descricao }) {
  if (!MP_ACCESS_TOKEN) throw new Error('Pagamentos temporariamente indisponíveis');

  const body = JSON.stringify({
    transaction_amount: valor,
    description:        descricao,
    payment_method_id:  'pix',
    payer:              { email: email || 'cliente@boreschat.com' },
    external_reference: `${userId}|${planoId}|${Date.now()}`,
    notification_url:   `${WEBHOOK_BASE}/api/pagamento/webhook`,
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.mercadopago.com',
      path:     '/v1/payments',
      method:   'POST',
      headers: {
        'Content-Type':      'application/json',
        'Authorization':     `Bearer ${MP_ACCESS_TOKEN}`,
        'X-Idempotency-Key': `${userId}_${planoId}_${Date.now()}`,
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Resposta inválida do Mercado Pago')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function consultarPagamento(pagamentoId) {
  if (!MP_ACCESS_TOKEN) throw new Error('Pagamentos temporariamente indisponíveis');

  return new Promise((resolve, reject) => {
    https.get({
      hostname: 'api.mercadopago.com',
      path:     `/v1/payments/${pagamentoId}`,
      headers:  { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Resposta inválida do Mercado Pago')); }
      });
    }).on('error', reject);
  });
}

module.exports = { criarPagamentoPix, consultarPagamento };
