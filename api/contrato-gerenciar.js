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
  if (req.method !== "POST") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  try {
    const { token, acao } = req.body;
    if (!token) return res.status(400).json({ erro: "Contrato não informado." });
    if (!["excluir","arquivar","desarquivar"].includes(acao)) {
      return res.status(400).json({ erro: "Ação inválida." });
    }

    const db = getDb();
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
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: "Erro interno", detalhe: String(e) });
  }
}
