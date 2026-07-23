import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import crypto from "crypto";

function getDb(){
  if(!getApps().length){
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  try {
    const { pacienteId, pacienteNome } = req.body;
    if (!pacienteId) {
      return res.status(400).json({ erro: "Paciente não informado." });
    }

    const db = getDb();

    // Busca o modelo de contrato vigente
    const modeloSnap = await db.collection("configuracoes").doc("modeloContrato").get();
    if (!modeloSnap.exists) {
      return res.status(400).json({ erro: "Nenhum modelo de contrato cadastrado. Configure o modelo antes de gerar links." });
    }
    const modelo = modeloSnap.data();
    const textoContrato = modelo.texto || "";
    if (!textoContrato.trim()) {
      return res.status(400).json({ erro: "O modelo de contrato está vazio." });
    }

    // Impressão digital do texto (para provar integridade depois)
    const hashContrato = crypto.createHash("sha256").update(textoContrato).digest("hex");

    // Token longo e aleatório
    const token = crypto.randomBytes(32).toString("hex");

    const agora = new Date().toISOString();

    await db.collection("contratos").doc(token).set({
      token,
      pacienteId,
      pacienteNome: pacienteNome || "",
      textoContrato,
      hashContrato,
      versaoModelo: modelo.versao || 1,
      status: "pendente",
      criadoEm: agora,
      assinadoEm: null,
      assinatura: null,
      evidencias: null,
    });

    return res.status(200).json({ token });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: "Erro interno", detalhe: String(e) });
  }
}
