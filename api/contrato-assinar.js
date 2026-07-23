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
    const { token, nomeCompleto, cpf, assinaturaBase64 } = req.body;

    if (!token) return res.status(400).json({ erro: "Link inválido." });
    if (!nomeCompleto || !nomeCompleto.trim()) return res.status(400).json({ erro: "Informe o nome completo." });
    if (!cpf || cpf.replace(/\D/g,"").length !== 11) return res.status(400).json({ erro: "Informe um CPF válido." });
    if (!assinaturaBase64) return res.status(400).json({ erro: "Assine no campo indicado." });

    const db = getDb();
    const ref = db.collection("contratos").doc(String(token));
    const snap = await ref.get();

    if (!snap.exists) {
      return res.status(404).json({ erro: "Link inválido ou expirado." });
    }

    const contrato = snap.data();

    if (contrato.status === "assinado") {
      return res.status(400).json({ erro: "Este contrato já foi assinado." });
    }

    // Evidências
    const ip =
      (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
      req.socket?.remoteAddress ||
      "desconhecido";
    const userAgent = req.headers["user-agent"] || "desconhecido";
    const agora = new Date().toISOString();

    // Reconfirma a integridade do texto que foi assinado
    const hashConfirmado = crypto
      .createHash("sha256")
      .update(contrato.textoContrato || "")
      .digest("hex");

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
        imagemBase64: assinaturaBase64,
      },
      evidencias,
    });

    return res.status(200).json({ ok: true, assinadoEm: agora });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: "Erro interno", detalhe: String(e) });
  }
}
