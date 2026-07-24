// ============================================================================
//  api/diario.js
//  Espaço Ciriani | Diário do Paciente — endpoint único
// ----------------------------------------------------------------------------
//  Consolida vários endpoints num arquivo só, pra caber no limite de 12
//  Serverless Functions do plano Hobby da Vercel.
//
//  GET  /api/diario?acao=token&token=X          -> valida o link, devolve paciente
//  GET  /api/diario?acao=listar&token=X          -> histórico do paciente (com conversa)
//  GET  /api/diario?acao=manifest&token=X        -> manifest.json pra instalar
//  GET  /api/diario?acao=statusPagamento&id=X    -> paciente confere se já pagou
//  POST /api/diario  { acao:"salvar", ... }              -> anotação privada/visível
//  POST /api/diario  { acao:"iniciarPagamento", ... }    -> triagem + link InfinityPay
//  POST /api/diario  { acao:"webhookPagamento", ... }    -> InfinityPay confirma pagamento
//  POST /api/diario  { acao:"enviarReplica", ... }       -> paciente responde a orientação
//
//  Conversa de uma orientação paga (subcoleção diarios/{id}/mensagens):
//  pergunta original (campo raiz do doc) -> resposta do psicólogo (direto no
//  Firestore, client SDK autenticado, em AbaDiario.jsx) -> réplica do
//  paciente (aqui, via enviarReplica) -> resposta final do psicólogo.
//  Depois de 3 mensagens na subcoleção, a conversa está encerrada.
// ============================================================================

const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
    storageBucket: `${process.env.FIREBASE_ADMIN_PROJECT_ID}.firebasestorage.app`,
  });
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

// handle InfinityPay do consultório — não é segredo, é só o @ público da conta
const INFINITEPAY_HANDLE = "espacociriani";

// preços em centavos, por formato de resposta da orientação
// >>> TEMPORÁRIO: todos em R$ 1,00 para teste real do pagamento/webhook.
//     Depois do teste, voltar para: texto 3000, audio 5000, video 10000.
const PRECOS_ORIENTACAO = {
  texto: 100, // R$ 1,00 (teste)
  audio: 100, // R$ 1,00 (teste)
  video: 100, // R$ 1,00 (teste)
};

const DESCRICAO_FORMATO = {
  texto: "Orientação por texto",
  audio: "Orientação por áudio",
  video: "Orientação por videochamada (30 min)",
};

// precisa bater com a URL real de produção pra InfinityPay redirecionar certo
const BASE_URL = "https://app.psicologodiegociriani.com.br";

// ---------------------------------------------------------------------------
//  Triagem de risco — P4 Screener simplificado (3 perguntas)
//  respostas: [indexP1, indexP2, indexP3]
//  P1: 0=Não, 1=Às vezes, 2=Sim com frequência
//  P2: 0=Não, 1=Sim (tem plano)
//  P3: 0=Sim tenho isso claro, 1=Não sei/não tenho certeza (não entra no corte)
// ---------------------------------------------------------------------------
function avaliarRisco(respostas) {
  if (!Array.isArray(respostas) || respostas.length !== 3) return true; // fail-safe: trata como risco
  const [p1, p2] = respostas;
  return p1 === 2 || p2 === 1;
}

// ---------------------------------------------------------------------------
//  Notificação push pro terapeuta (mesmo padrão de avaliacao-submit.js)
// ---------------------------------------------------------------------------
async function notificarPush(titulo, corpo, dataExtra) {
  const tokensSnap = await db.collection("tokens").get();
  const tokens = tokensSnap.docs.map((d) => d.id).filter(Boolean);
  if (!tokens.length) return;

  await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title: titulo, body: corpo },
    data: dataExtra || {},
  });
}

// ---------------------------------------------------------------------------
//  AÇÃO: token — valida o link permanente
// ---------------------------------------------------------------------------
async function acaoToken(req, res) {
  const { token } = req.query;
  if (!token) return res.status(400).json({ erro: "Token ausente" });

  const doc = await db.collection("diarioTokens").doc(String(token)).get();
  if (!doc.exists) return res.status(404).json({ erro: "Link inválido ou expirado" });

  const dados = doc.data();
  return res.status(200).json({
    pacienteId: dados.pacienteId,
    pacienteNome: dados.pacienteNome || "Paciente",
  });
}

// ---------------------------------------------------------------------------
//  AÇÃO: manifest — manifest.json próprio do paciente
// ---------------------------------------------------------------------------
async function acaoManifest(req, res) {
  const { token } = req.query;
  if (!token) return res.status(400).json({ erro: "Token ausente" });

  const doc = await db.collection("diarioTokens").doc(String(token)).get();
  const nome = doc.exists ? doc.data().pacienteNome || "Paciente" : "Paciente";

  const manifest = {
    name: `Diário — ${nome}`,
    short_name: "Diário",
    description: "Seu espaço pessoal de anotações do Espaço Ciriani",
    start_url: `/diario?token=${encodeURIComponent(token)}`,
    scope: "/diario",
    display: "standalone",
    background_color: "#f4f6f0",
    theme_color: "#1C3D2E",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };

  res.setHeader("Content-Type", "application/manifest+json");
  return res.status(200).json(manifest);
}

// ---------------------------------------------------------------------------
//  AÇÃO: listar — histórico completo do próprio paciente
// ---------------------------------------------------------------------------
async function acaoListar(req, res) {
  const { token } = req.query;
  if (!token) return res.status(400).json({ erro: "Token ausente" });

  const tokenDoc = await db.collection("diarioTokens").doc(String(token)).get();
  if (!tokenDoc.exists) return res.status(404).json({ erro: "Link inválido" });

  const { pacienteId } = tokenDoc.data();

  const snap = await db
    .collection("diarios")
    .where("pacienteId", "==", pacienteId)
    .orderBy("criadoEm", "desc")
    .get();

  const registros = await Promise.all(
    snap.docs.map(async (doc) => {
      const d = doc.data();
      const item = {
        id: doc.id,
        tipo: d.tipo,
        conteudo: d.conteudo || null,
        visibilidade: d.visibilidade,
        statusPagamento: d.statusPagamento || null,
        formatoResposta: d.formatoResposta || null,
        criadoEm: d.criadoEm ? d.criadoEm.toDate().toISOString() : null,
      };

      // pedidos de orientação ainda não pagos não aparecem no histórico —
      // só depois que o pagamento é confirmado (ou se nem chegou a virar
      // pedido de pagamento, como as anotações normais e as de risco)
      if (d.statusPagamento && d.statusPagamento !== "pago" && d.statusPagamento !== "n/a") {
        return null;
      }

      if (d.tipo === "audio" && d.audioPath) {
        try {
          const [url] = await bucket.file(d.audioPath).getSignedUrl({
            action: "read",
            expires: Date.now() + 60 * 60 * 1000,
          });
          item.audioUrl = url;
        } catch (e) {
          console.error("Erro ao gerar URL assinada:", e);
          item.audioUrl = null;
        }
      }

      // pedidos de orientação pagos trazem a conversa junto (resposta do
      // psicólogo, réplica, resposta final)
      if (d.visibilidade === "orientacao" && d.statusPagamento === "pago") {
        const msgsSnap = await db
          .collection("diarios")
          .doc(doc.id)
          .collection("mensagens")
          .orderBy("criadoEm", "asc")
          .get();

        item.mensagens = await Promise.all(
          msgsSnap.docs.map(async (m) => {
            const md = m.data();
            const msg = {
              id: m.id,
              autor: md.autor,
              tipo: md.tipo,
              conteudo: md.conteudo || null,
              criadoEm: md.criadoEm ? md.criadoEm.toDate().toISOString() : null,
            };
            if (md.tipo === "audio" && md.audioPath) {
              try {
                const [url] = await bucket.file(md.audioPath).getSignedUrl({
                  action: "read",
                  expires: Date.now() + 60 * 60 * 1000,
                });
                msg.audioUrl = url;
              } catch (e) {
                msg.audioUrl = null;
              }
            }
            return msg;
          })
        );

        // a réplica só é permitida logo depois da 1ª resposta do psicólogo
        item.podeReplicar = item.mensagens.length === 1 && item.mensagens[0].autor === "psicologo";
        item.conversaEncerrada = item.mensagens.length >= 3;
      }

      return item;
    })
  );

  return res.status(200).json({ registros: registros.filter(Boolean) });
}

// ---------------------------------------------------------------------------
//  AÇÃO: salvar — grava anotação PRIVADA ou VISÍVEL (não orientação — essa
//  passa pelo fluxo de pagamento em acaoIniciarPagamento)
// ---------------------------------------------------------------------------
async function acaoSalvar(req, res) {
  const { token, tipo, conteudo, audioBase64, visibilidade } = req.body || {};

  if (!token) return res.status(400).json({ erro: "Token ausente" });
  if (!["texto", "audio"].includes(tipo)) return res.status(400).json({ erro: "Tipo inválido" });
  if (!["privado", "visivel"].includes(visibilidade)) {
    return res.status(400).json({ erro: "Visibilidade inválida" });
  }
  if (tipo === "texto" && !conteudo?.trim()) {
    return res.status(400).json({ erro: "Conteúdo vazio" });
  }
  if (tipo === "audio" && !audioBase64) {
    return res.status(400).json({ erro: "Áudio ausente" });
  }

  const tokenDoc = await db.collection("diarioTokens").doc(String(token)).get();
  if (!tokenDoc.exists) return res.status(404).json({ erro: "Link inválido" });

  const { pacienteId, pacienteNome } = tokenDoc.data();

  const registro = {
    pacienteId,
    pacienteNome: pacienteNome || "Paciente",
    tipo,
    visibilidade,
    conversadoNaSessao: false,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (tipo === "texto") {
    registro.conteudo = conteudo.trim();
  }

  if (tipo === "audio") {
    const matches = audioBase64.match(/^data:(audio\/\w+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ erro: "Formato de áudio inválido" });

    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], "base64");

    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ erro: "Áudio muito grande" });
    }

    const extensao = mimeType.split("/")[1] || "webm";
    const caminho = `diarios/${pacienteId}/${Date.now()}.${extensao}`;
    await bucket.file(caminho).save(buffer, { metadata: { contentType: mimeType } });

    registro.audioPath = caminho;
    registro.audioMimeType = mimeType;
  }

  const docRef = await db.collection("diarios").add(registro);
  return res.status(200).json({ ok: true, id: docRef.id });
}

// ---------------------------------------------------------------------------
//  AÇÃO: iniciarPagamento — roda a triagem de risco; se seguro, cria o
//  registro pendente e devolve o link de checkout da InfinityPay; se risco,
//  bloqueia, alerta o terapeuta e devolve sinal pro front mostrar acolhimento
// ---------------------------------------------------------------------------
async function acaoIniciarPagamento(req, res) {
  const { token, tipo, conteudo, audioBase64, formatoResposta, respostasRisco } = req.body || {};

  if (!token) return res.status(400).json({ erro: "Token ausente" });
  if (!["texto", "audio"].includes(tipo)) return res.status(400).json({ erro: "Tipo inválido" });
  if (!PRECOS_ORIENTACAO[formatoResposta]) {
    return res.status(400).json({ erro: "Formato de resposta inválido" });
  }
  if (tipo === "texto" && !conteudo?.trim()) {
    return res.status(400).json({ erro: "Conteúdo vazio" });
  }
  if (tipo === "audio" && !audioBase64) {
    return res.status(400).json({ erro: "Áudio ausente" });
  }

  const tokenDoc = await db.collection("diarioTokens").doc(String(token)).get();
  if (!tokenDoc.exists) return res.status(404).json({ erro: "Link inválido" });

  const { pacienteId, pacienteNome } = tokenDoc.data();
  const nome = pacienteNome || "Paciente";

  const emRisco = avaliarRisco(respostasRisco);

  // monta o registro base (igual nos dois casos)
  const registro = {
    pacienteId,
    pacienteNome: nome,
    tipo,
    visibilidade: emRisco ? "privado" : "pendente", // só vira "orientacao" quando o webhook confirmar o pagamento
    formatoResposta,
    statusPagamento: emRisco ? "n/a" : "aguardando_pagamento",
    riscoDetectadoNaTriagem: emRisco,
    conversadoNaSessao: false,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (tipo === "texto") {
    registro.conteudo = conteudo.trim();
  } else {
    const matches = audioBase64.match(/^data:(audio\/\w+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ erro: "Formato de áudio inválido" });
    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], "base64");
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ erro: "Áudio muito grande" });
    }
    const extensao = mimeType.split("/")[1] || "webm";
    const caminho = `diarios/${pacienteId}/${Date.now()}.${extensao}`;
    await bucket.file(caminho).save(buffer, { metadata: { contentType: mimeType } });
    registro.audioPath = caminho;
    registro.audioMimeType = mimeType;
  }

  const docRef = await db.collection("diarios").add(registro);

  // -------- caminho de risco: bloqueia pagamento, alerta na hora ----------
  if (emRisco) {
    await db.collection("alertasRisco").add({
      pacienteId,
      pacienteNome: nome,
      motivo: "Risco detectado na triagem do Diário (pedido de orientação)",
      origem: "diario",
      diarioId: docRef.id,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      lido: false,
    });

    await notificarPush(
      "🚨 Risco detectado no Diário",
      `${nome} sinalizou risco na triagem ao pedir orientação. Abra a ficha.`,
      { tipo: "risco_diario", pacienteId: String(pacienteId) }
    ).catch((e) => console.error("Falha ao notificar risco:", e));

    return res.status(200).json({ risco: true });
  }

  // -------- caminho seguro: gera o link de pagamento na InfinityPay -------
  try {
    const resposta = await fetch("https://api.checkout.infinitepay.io/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle: INFINITEPAY_HANDLE,
        redirect_url: `${BASE_URL}/diario?token=${encodeURIComponent(token)}&pagamento=retorno&pedido=${docRef.id}`,
        webhook_url: `${BASE_URL}/api/diario?acao=webhookPagamento`,
        order_nsu: docRef.id,
        customer: { name: nome },
        items: [
          {
            quantity: 1,
            price: PRECOS_ORIENTACAO[formatoResposta],
            description: DESCRICAO_FORMATO[formatoResposta],
          },
        ],
      }),
    });

    const dados = await resposta.json();
    if (!resposta.ok || !dados.url) {
      console.error("Erro InfinityPay:", dados);
      return res.status(502).json({ erro: "Não consegui gerar o link de pagamento. Tenta de novo." });
    }

    return res.status(200).json({ risco: false, url: dados.url, pedidoId: docRef.id });
  } catch (e) {
    console.error("Erro ao chamar InfinityPay:", e);
    return res.status(502).json({ erro: "Não consegui gerar o link de pagamento. Tenta de novo." });
  }
}

// ---------------------------------------------------------------------------
//  AÇÃO: webhookPagamento — chamado pela InfinityPay quando o pagamento cai
// ---------------------------------------------------------------------------
async function acaoWebhookPagamento(req, res) {
  const { order_nsu, amount, paid_amount, capture_method, transaction_nsu, receipt_url } =
    req.body || {};

  if (!order_nsu) {
    return res.status(400).json({ success: false, message: "order_nsu ausente" });
  }

  const docRef = db.collection("diarios").doc(String(order_nsu));
  const doc = await docRef.get();

  if (!doc.exists) {
    return res.status(400).json({ success: false, message: "Pedido não encontrado" });
  }

  const dados = doc.data();

  // já processado (a InfinityPay pode reenviar o mesmo webhook)
  if (dados.statusPagamento === "pago") {
    return res.status(200).json({ success: true, message: null });
  }

  await docRef.update({
    statusPagamento: "pago",
    visibilidade: "orientacao",
    pagoEm: admin.firestore.FieldValue.serverTimestamp(),
    valorPago: paid_amount || amount || null,
    metodoPagamento: capture_method || null,
    transactionNsu: transaction_nsu || null,
    receiptUrl: receipt_url || null,
  });

  await notificarPush(
    "💰 Orientação paga",
    `${dados.pacienteNome} pagou por ${DESCRICAO_FORMATO[dados.formatoResposta] || "orientação"}. Abra o Diário na ficha.`,
    { tipo: "orientacao_paga", pacienteId: String(dados.pacienteId), diarioId: doc.id }
  ).catch((e) => console.error("Falha ao notificar pagamento:", e));

  return res.status(200).json({ success: true, message: null });
}

// ---------------------------------------------------------------------------
//  AÇÃO: statusPagamento — o paciente confere se o pagamento já confirmou
//  (usado na tela de retorno, como fallback enquanto o webhook não chega)
// ---------------------------------------------------------------------------
async function acaoStatusPagamento(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ erro: "id ausente" });

  const doc = await db.collection("diarios").doc(String(id)).get();
  if (!doc.exists) return res.status(404).json({ erro: "Pedido não encontrado" });

  return res.status(200).json({ statusPagamento: doc.data().statusPagamento || "desconhecido" });
}

// ---------------------------------------------------------------------------
//  AÇÃO: excluir — paciente apaga uma anotação própria (só privado/visível
//  — pedidos de orientação pagos não podem ser apagados, já envolvem
//  pagamento e a resposta do psicólogo)
// ---------------------------------------------------------------------------
async function acaoExcluir(req, res) {
  const { token, diarioId } = req.body || {};
  if (!token) return res.status(400).json({ erro: "Token ausente" });
  if (!diarioId) return res.status(400).json({ erro: "Pedido ausente" });

  const tokenDoc = await db.collection("diarioTokens").doc(String(token)).get();
  if (!tokenDoc.exists) return res.status(404).json({ erro: "Link inválido" });
  const { pacienteId } = tokenDoc.data();

  const diarioRef = db.collection("diarios").doc(String(diarioId));
  const diarioDoc = await diarioRef.get();
  if (!diarioDoc.exists) return res.status(404).json({ erro: "Anotação não encontrada" });

  const dados = diarioDoc.data();
  if (dados.pacienteId !== pacienteId) {
    return res.status(403).json({ erro: "Essa anotação não pertence a esse link" });
  }
  if (!["privado", "visivel"].includes(dados.visibilidade)) {
    return res.status(400).json({ erro: "Pedidos de orientação não podem ser apagados." });
  }

  if (dados.tipo === "audio" && dados.audioPath) {
    await bucket.file(dados.audioPath).delete().catch((e) => console.error("Falha ao apagar áudio:", e));
  }

  await diarioRef.delete();
  return res.status(200).json({ ok: true });
}

// ---------------------------------------------------------------------------
//  AÇÃO: enviarReplica — paciente responde depois da 1ª resposta do
//  psicólogo (uma réplica só, depois disso a conversa aguarda a resposta
//  final e encerra)
// ---------------------------------------------------------------------------
async function acaoEnviarReplica(req, res) {
  const { token, diarioId, tipo, conteudo, audioBase64 } = req.body || {};

  if (!token) return res.status(400).json({ erro: "Token ausente" });
  if (!diarioId) return res.status(400).json({ erro: "Pedido ausente" });
  if (!["texto", "audio"].includes(tipo)) return res.status(400).json({ erro: "Tipo inválido" });
  if (tipo === "texto" && !conteudo?.trim()) return res.status(400).json({ erro: "Conteúdo vazio" });
  if (tipo === "audio" && !audioBase64) return res.status(400).json({ erro: "Áudio ausente" });

  const tokenDoc = await db.collection("diarioTokens").doc(String(token)).get();
  if (!tokenDoc.exists) return res.status(404).json({ erro: "Link inválido" });
  const { pacienteId } = tokenDoc.data();

  const diarioRef = db.collection("diarios").doc(String(diarioId));
  const diarioDoc = await diarioRef.get();
  if (!diarioDoc.exists) return res.status(404).json({ erro: "Pedido não encontrado" });

  const dados = diarioDoc.data();
  if (dados.pacienteId !== pacienteId) {
    return res.status(403).json({ erro: "Esse pedido não pertence a esse link" });
  }
  if (dados.visibilidade !== "orientacao" || dados.statusPagamento !== "pago") {
    return res.status(400).json({ erro: "Esse pedido ainda não está liberado para conversa" });
  }

  const msgsSnap = await diarioRef.collection("mensagens").orderBy("criadoEm", "asc").get();
  const mensagens = msgsSnap.docs.map((d) => d.data());

  if (mensagens.length !== 1 || mensagens[0].autor !== "psicologo") {
    return res.status(400).json({
      erro:
        mensagens.length === 0
          ? "Seu psicólogo ainda não respondeu."
          : "Você já usou sua réplica nessa orientação.",
    });
  }

  const mensagem = { autor: "paciente", tipo, criadoEm: admin.firestore.FieldValue.serverTimestamp() };

  if (tipo === "texto") {
    mensagem.conteudo = conteudo.trim();
  } else {
    const matches = audioBase64.match(/^data:(audio\/\w+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ erro: "Formato de áudio inválido" });
    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], "base64");
    if (buffer.length > 5 * 1024 * 1024) return res.status(400).json({ erro: "Áudio muito grande" });
    const extensao = mimeType.split("/")[1] || "webm";
    const caminho = `diarios/${pacienteId}/respostas/${Date.now()}.${extensao}`;
    await bucket.file(caminho).save(buffer, { metadata: { contentType: mimeType } });
    mensagem.audioPath = caminho;
    mensagem.audioMimeType = mimeType;
  }

  await diarioRef.collection("mensagens").add(mensagem);

  await notificarPush(
    "💬 Réplica na orientação",
    `${dados.pacienteNome} respondeu na conversa de orientação. Abra o Diário na ficha.`,
    { tipo: "replica_diario", pacienteId: String(pacienteId), diarioId: String(diarioId) }
  ).catch((e) => console.error("Falha ao notificar réplica:", e));

  return res.status(200).json({ ok: true });
}

// ---------------------------------------------------------------------------
//  Roteador
// ---------------------------------------------------------------------------
const handler = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const acao = req.query?.acao || req.body?.acao;

  try {
    if (req.method === "GET" && acao === "token") return await acaoToken(req, res);
    if (req.method === "GET" && acao === "listar") return await acaoListar(req, res);
    if (req.method === "GET" && acao === "manifest") return await acaoManifest(req, res);
    if (req.method === "GET" && acao === "statusPagamento") return await acaoStatusPagamento(req, res);
    if (req.method === "POST" && acao === "salvar") return await acaoSalvar(req, res);
    if (req.method === "POST" && acao === "iniciarPagamento") return await acaoIniciarPagamento(req, res);
    if (req.method === "POST" && acao === "webhookPagamento") return await acaoWebhookPagamento(req, res);
    if (req.method === "POST" && acao === "enviarReplica") return await acaoEnviarReplica(req, res);
    if (req.method === "POST" && acao === "excluir") return await acaoExcluir(req, res);

    return res.status(400).json({ erro: "Ação inválida" });
  } catch (erro) {
    console.error(`Erro no diário (ação: ${acao}):`, erro);
    return res.status(500).json({ erro: "Erro interno" });
  }
};

handler.config = {
  api: {
    bodyParser: {
      sizeLimit: "6mb",
    },
  },
};

module.exports = handler;
module.exports.config = handler.config;
