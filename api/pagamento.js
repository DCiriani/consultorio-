// ============================================================================
//  api/pagamento.js
//  Espaço Ciriani | Solicitar pagamento — link InfinityPay + registro automático
// ----------------------------------------------------------------------------
//  Mesmo padrão do fluxo de pagamento do Diário: gera um link de checkout,
//  e quando a InfinityPay confirma via webhook, registra sozinho na
//  coleção "pagamentos" (mesma que a tela "Registrar pagamento" usa) — sem
//  precisar digitar nada manualmente depois.
//
//  POST /api/pagamento  { rota:"solicitar", pacienteId, pacienteNome, cpf, valor }
//  POST /api/pagamento  { rota:"webhook", ...payload da InfinityPay }
// ============================================================================

const admin = require("firebase-admin");
const crypto = require("crypto");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

const INFINITEPAY_HANDLE = "espacociriani";
const BASE_URL = "https://app.psicologodiegociriani.com.br";

// traduz o método que a InfinityPay devolve pro texto que já é usado na
// tela de "Registrar pagamento" — ajuste os textos se não baterem com o
// que aparece no seletor "Forma de pagamento" do seu painel
const NOMES_METODO = {
  pix: "Pix",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  boleto: "Boleto",
};

function formatarDataHoje() {
  const d = new Date();
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${d.getFullYear()}`;
}

async function notificarPush(titulo, corpo, dataExtra) {
  const tokensSnap = await db.collection("tokens").get();
  const tokens = tokensSnap.docs.map((d) => d.id).filter(Boolean);
  if (!tokens.length) return;
  await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title: titulo, body: corpo },
    data: dataExtra || {},
    android: { priority: "high" },
    webpush: { headers: { Urgency: "high" } },
  }).catch((e) => console.error("Falha ao enviar push:", e));
}

// ---------------------------------------------------------------------------
//  ROTA: solicitar — gera o link de pagamento
// ---------------------------------------------------------------------------
async function rotaSolicitar(req, res) {
  const { pacienteId, pacienteNome, cpf, valor, titularId } = req.body || {};

  if (!pacienteId) return res.status(400).json({ erro: "Paciente não informado." });
  if (!pacienteNome) return res.status(400).json({ erro: "Nome do paciente ausente." });

  const valorCentavos = Math.round(Number(String(valor).replace(",", ".")) * 100);
  if (!valorCentavos || valorCentavos <= 0) {
    return res.status(400).json({ erro: "Informe um valor válido." });
  }

  // código curto pro link de compartilhar (em vez do ID longo do Firestore)
  const codigo = crypto.randomBytes(4).toString("hex"); // 8 caracteres

  // registro "pendente" — só vira um pagamento de verdade quando o
  // webhook confirmar; guardado numa coleção separada pra não aparecer
  // na tabela de "Últimos registros" antes da hora
  const pendenteRef = db.collection("solicitacoesPagamento").doc(codigo);
  await pendenteRef.set({
    pacienteId,
    pacienteNome,
    cpf: cpf || "",
    titularId: titularId || null,
    valorCentavos,
    status: "aguardando",
    checkoutUrl: null,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });

  try {
    const resposta = await fetch("https://api.checkout.infinitepay.io/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle: INFINITEPAY_HANDLE,
        redirect_url: BASE_URL,
        webhook_url: `${BASE_URL}/api/pagamento?rota=webhook`,
        order_nsu: codigo,
        customer: { name: pacienteNome },
        items: [
          {
            quantity: 1,
            price: valorCentavos,
            description: `Sessão - ${pacienteNome}`,
          },
        ],
      }),
    });

    const dados = await resposta.json();
    if (!resposta.ok || !dados.url) {
      console.error("Erro InfinityPay:", dados);
      await pendenteRef.delete();
      return res.status(502).json({ erro: "Não consegui gerar o link de pagamento. Tenta de novo." });
    }

    await pendenteRef.update({ checkoutUrl: dados.url });

    return res.status(200).json({ codigo, linkCurto: `${BASE_URL}/p/${codigo}` });
  } catch (e) {
    console.error("Erro ao chamar InfinityPay:", e);
    await pendenteRef.delete();
    return res.status(502).json({ erro: "Não consegui gerar o link de pagamento. Tenta de novo." });
  }
}

// ---------------------------------------------------------------------------
//  ROTA: ir — link curto (/p/codigo) redireciona pro checkout real
// ---------------------------------------------------------------------------
async function rotaIr(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).send("Link inválido.");

  const doc = await db.collection("solicitacoesPagamento").doc(String(id)).get();
  if (!doc.exists || !doc.data().checkoutUrl) {
    return res.status(404).send("Este link de pagamento não existe ou expirou.");
  }

  res.writeHead(302, { Location: doc.data().checkoutUrl });
  return res.end();
}

// ---------------------------------------------------------------------------
//  ROTA: webhook — InfinityPay confirma o pagamento
// ---------------------------------------------------------------------------
async function rotaWebhook(req, res) {
  const { order_nsu, capture_method, transaction_nsu, receipt_url } = req.body || {};
  if (!order_nsu) return res.status(400).json({ success: false, message: "order_nsu ausente" });

  const pendenteRef = db.collection("solicitacoesPagamento").doc(String(order_nsu));
  const pendenteDoc = await pendenteRef.get();
  if (!pendenteDoc.exists) return res.status(400).json({ success: false, message: "Solicitação não encontrada" });

  const pendente = pendenteDoc.data();

  // já processado (a InfinityPay pode reenviar o mesmo webhook)
  if (pendente.status === "pago") {
    return res.status(200).json({ success: true, message: null });
  }

  const valorReais = (pendente.valorCentavos / 100).toFixed(2).replace(".", ",");
  const formaPagamento = NOMES_METODO[capture_method] || "InfinityPay";

  // grava exatamente no mesmo formato que a tela "Registrar pagamento" usa
  await db.collection("pagamentos").add({
    data: formatarDataHoje(),
    nome: pendente.pacienteNome,
    cpf: pendente.cpf || "",
    pagamento: formaPagamento,
    valor: valorReais,
    titularId: pendente.titularId || null,
    nfEmitida: false,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    origemAutomatica: true,
    transactionNsu: transaction_nsu || null,
    receiptUrl: receipt_url || null,
  });

  await pendenteRef.update({
    status: "pago",
    pagoEm: admin.firestore.FieldValue.serverTimestamp(),
  });

  await notificarPush(
    "💰 Pagamento recebido",
    `${pendente.pacienteNome} pagou R$ ${valorReais} (${formaPagamento}). Já registrado automaticamente.`,
    { tipo: "pagamento_automatico", pacienteId: String(pendente.pacienteId) }
  );

  db.collection("notificacoes").add({
    tipo: "pagamento",
    titulo: "💰 Pagamento recebido",
    mensagem: `${pendente.pacienteNome} pagou R$ ${valorReais} (${formaPagamento}). Já registrado automaticamente.`,
    pacienteId: pendente.pacienteId,
    pacienteNome: pendente.pacienteNome,
    lida: false,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    dados: { valor: valorReais, formaPagamento },
  }).catch((e) => console.error("Falha ao registrar notificação de pagamento:", e));

  return res.status(200).json({ success: true, message: null });
}

// ---------------------------------------------------------------------------
//  Roteador
// ---------------------------------------------------------------------------
const handler = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const rota = req.query?.rota || req.body?.rota;

  try {
    if (req.method === "GET" && rota === "ir") return await rotaIr(req, res);
    if (req.method === "POST" && rota === "solicitar") return await rotaSolicitar(req, res);
    if (req.method === "POST" && rota === "webhook") return await rotaWebhook(req, res);
    return res.status(400).json({ erro: "Rota inválida" });
  } catch (e) {
    console.error(`pagamento erro (rota: ${rota}):`, e);
    return res.status(500).json({ erro: "Erro interno" });
  }
};

module.exports = handler;