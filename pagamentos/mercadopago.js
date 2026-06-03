// ═══════════════════════════════════════════════════
// PAGAMENTOS/MERCADOPAGO.JS — Integração PIX
// Gera QR Code PIX e consulta status de pagamentos
// ═══════════════════════════════════════════════════

const PRECOS = {
  bores_plus: 4.90,
  pro:        9.90,
  max:        19.90,
};

const NOMES_PLANOS = {
  bores_plus: 'Bores Plus',
  pro:        'Pro',
  max:        'Max',
};

function criarCliente() {
  const { MercadoPagoConfig } = require('mercadopago');
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado');
  return new MercadoPagoConfig({ accessToken: token });
}

async function gerarPixPagamento({ userId, plano }) {
  if (!PRECOS[plano]) throw new Error(`Plano inválido: ${plano}`);

  const { Payment } = require('mercadopago');
  const client    = criarCliente();
  const payment   = new Payment(client);

  const webhookUrl = process.env.WEBHOOK_URL
    ? `${process.env.WEBHOOK_URL}/api/pagamentos/webhook`
    : undefined;

  const resultado = await payment.create({
    body: {
      transaction_amount: PRECOS[plano],
      description:        `BoresBot ${NOMES_PLANOS[plano]} - 30 dias`,
      payment_method_id:  'pix',
      payer: {
        email: `user_${userId}@boreschat.app`,
      },
      metadata:         { userId, plano },
      ...(webhookUrl && { notification_url: webhookUrl }),
    },
  });

  const txData = resultado.point_of_interaction?.transaction_data;

  return {
    paymentId:     String(resultado.id),
    status:        resultado.status,
    qrCode:        txData?.qr_code        ?? null,
    qrCodeBase64:  txData?.qr_code_base64 ?? null,
    valor:         PRECOS[plano],
    plano,
  };
}

async function consultarPagamento(paymentId) {
  const { Payment } = require('mercadopago');
  const client    = criarCliente();
  const payment   = new Payment(client);

  const resultado = await payment.get({ id: String(paymentId) });

  return {
    id:       String(resultado.id),
    status:   resultado.status,
    metadata: resultado.metadata ?? {},
  };
}

module.exports = { gerarPixPagamento, consultarPagamento, PRECOS, NOMES_PLANOS };
