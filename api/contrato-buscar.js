import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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
  if (req.method !== "GET") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ erro: "Link inválido." });
    }

    const db = getDb();
    const snap = await db.collection("contratos").doc(String(token)).get();

    if (!snap.exists) {
      return res.status(404).json({ erro: "Link inválido ou expirado." });
    }

    const c = snap.data();

    return res.status(200).json({
      pacienteNome: c.pacienteNome || "",
      textoContrato: c.textoContrato || "",
      assinaturaPsicologo: c.assinaturaPsicologo || "",
      status: c.status || "pendente",
      assinadoEm: c.assinadoEm || null,
      nomeAssinante: c.assinatura?.nomeCompleto || null,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: "Erro interno", detalhe: String(e) });
  }
}
