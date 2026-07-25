// ============================================================================
//  api/contrato.js
//  Espaço Ciriani | Contrato terapêutico — endpoint único (4 rotas)
// ----------------------------------------------------------------------------
//  Consolida o que antes eram 4 arquivos separados (contrato-buscar.js,
//  contrato-gerar.js, contrato-assinar.js, contrato-gerenciar.js), pra
//  liberar vagas no limite de 12 Serverless Functions do plano Hobby.
//
//  GET  /api/contrato?rota=buscar&token=X
//  POST /api/contrato  { rota:"gerar", pacienteId, pacienteNome }
//  POST /api/contrato  { rota:"assinar", token, nomeCompleto, cpf, cidade, assinaturaBase64 }
//  POST /api/contrato  { rota:"gerenciar", token, acao:"excluir"|"arquivar"|"desarquivar" }
//
//  Uso "rota" como chave de despacho (em vez de "acao") porque a rota
//  "gerenciar" já usa um campo "acao" internamente com outro significado
//  (excluir/arquivar/desarquivar) — evita confundir os dois.
// ============================================================================

import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import crypto from "crypto";

function getDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      }),
    });
  }
  return getFirestore();
}

// ---------------------------------------------------------------------------
//  ROTA: buscar — dados do contrato pro paciente ver/assinar
// ---------------------------------------------------------------------------
async function rotaBuscar(req, res, db) {
  const { token } = req.query;
  if (!token) return res.status(400).json({ erro: "Link inválido." });

  const snap = await db.collection("contratos").doc(String(token)).get();
  if (!snap.exists) return res.status(404).json({ erro: "Link inválido ou expirado." });

  const c = snap.data();
  return res.status(200).json({
    pacienteNome: c.pacienteNome || "",
    textoContrato: c.textoContrato || "",
    assinaturaPsicologo: c.assinaturaPsicologo || "",
    status: c.status || "pendente",
    assinadoEm: c.assinadoEm || null,
    nomeAssinante: c.assinatura?.nomeCompleto || null,
  });
}

// ---------------------------------------------------------------------------
//  ROTA: gerar — cria um novo contrato pendente pro paciente assinar
// ---------------------------------------------------------------------------
async function rotaGerar(req, res, db) {
  const { pacienteId, pacienteNome } = req.body;
  if (!pacienteId) return res.status(400).json({ erro: "Paciente não informado." });

  const modeloSnap = await db.collection("configuracoes").doc("modeloContrato").get();
  if (!modeloSnap.exists) {
    return res.status(400).json({ erro: "Nenhum modelo de contrato cadastrado. Configure o modelo antes de gerar links." });
  }
  const modelo = modeloSnap.data();
  const textoContrato = modelo.texto || "";
  if (!textoContrato.trim()) {
    return res.status(400).json({ erro: "O modelo de contrato está vazio." });
  }

  const hashContrato = crypto.createHash("sha256").update(textoContrato).digest("hex");
  const token = crypto.randomBytes(32).toString("hex");
  const agora = new Date().toISOString();

  await db.collection("contratos").doc(token).set({
    token,
    pacienteId,
    pacienteNome: pacienteNome || "",
    textoContrato,
    assinaturaPsicologo: modelo.assinaturaPsicologo || "",
    hashContrato,
    versaoModelo: modelo.versao || 1,
    status: "pendente",
    criadoEm: agora,
    assinadoEm: null,
    assinatura: null,
    evidencias: null,
  });

  return res.status(200).json({ token });
}

// ---------------------------------------------------------------------------
//  ROTA: assinar — paciente confirma a assinatura
// ---------------------------------------------------------------------------
async function rotaAssinar(req, res, db) {
  const { token, nomeCompleto, cpf, cidade, assinaturaBase64 } = req.body;

  if (!token) return res.status(400).json({ erro: "Link inválido." });
  if (!nomeCompleto || !nomeCompleto.trim()) return res.status(400).json({ erro: "Informe o nome completo." });
  if (!cpf || cpf.replace(/\D/g, "").length !== 11) return res.status(400).json({ erro: "Informe um CPF válido." });
  if (!cidade || !cidade.trim()) return res.status(400).json({ erro: "Informe a cidade." });
  if (!assinaturaBase64) return res.status(400).json({ erro: "Assine no campo indicado." });

  const ref = db.collection("contratos").doc(String(token));
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ erro: "Link inválido ou expirado." });

  const contrato = snap.data();
  if (contrato.status === "assinado") {
    return res.status(400).json({ erro: "Este contrato já foi assinado." });
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "desconhecido";
  const userAgent = req.headers["user-agent"] || "desconhecido";
  const agora = new Date().toISOString();

  const hashConfirmado = crypto.createHash("sha256").update(contrato.textoContrato || "").digest("hex");

  const evidencias = {
    ip,
    userAgent,
    dataHoraServidor: agora,
    hashContratoNoAceite: hashConfirmado,
    hashConfere: hashConfirmado === contrato.hashContrato,
  };

  await ref.update({
    status: "assinado",
    assinadoEm: agora,
    assinatura: {
      nomeCompleto: nomeCompleto.trim(),
      cpf: cpf.replace(/\D/g, ""),
      cidade: cidade.trim(),
      imagemBase64: assinaturaBase64,
    },
    evidencias,
  });

  // notificação interna (aba Notificações do painel)
  db.collection("notificacoes").add({
    tipo: "contrato",
    titulo: "📄 Contrato assinado",
    mensagem: `${nomeCompleto.trim()} assinou o contrato.`,
    pacienteId: contrato.pacienteId || null,
    pacienteNome: nomeCompleto.trim(),
    lida: false,
    criadoEm: FieldValue.serverTimestamp(),
    dados: { token: String(token) },
  }).catch((e) => console.error("Falha ao registrar notificação de contrato:", e));

  return res.status(200).json({ ok: true, assinadoEm: agora });
}

// ---------------------------------------------------------------------------
//  ROTA: gerenciar — excluir/arquivar/desarquivar um contrato existente
// ---------------------------------------------------------------------------
async function rotaGerenciar(req, res, db) {
  const { token, acao } = req.body;
  if (!token) return res.status(400).json({ erro: "Contrato não informado." });
  if (!["excluir", "arquivar", "desarquivar"].includes(acao)) {
    return res.status(400).json({ erro: "Ação inválida." });
  }

  const ref = db.collection("contratos").doc(String(token));
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ erro: "Contrato não encontrado." });

  if (acao === "excluir") {
    await ref.delete();
    return res.status(200).json({ ok: true, acao: "excluido" });
  }

  await ref.update({
    arquivado: acao === "arquivar",
    arquivadoEm: acao === "arquivar" ? new Date().toISOString() : null,
  });

  return res.status(200).json({ ok: true, acao });
}

// ---------------------------------------------------------------------------
//  Roteador
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  const db = getDb();
  const rota = req.query?.rota || req.body?.rota;

  try {
    if (req.method === "GET" && rota === "buscar") return await rotaBuscar(req, res, db);
    if (req.method === "POST" && rota === "gerar") return await rotaGerar(req, res, db);
    if (req.method === "POST" && rota === "assinar") return await rotaAssinar(req, res, db);
    if (req.method === "POST" && rota === "gerenciar") return await rotaGerenciar(req, res, db);

    return res.status(400).json({ erro: "Rota inválida" });
  } catch (e) {
    console.error(`contrato erro (rota: ${rota}):`, e);
    return res.status(500).json({ erro: "Erro interno", detalhe: String(e) });
  }
}
