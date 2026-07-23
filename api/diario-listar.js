// ============================================================================
//  api/diario-listar.js
//  Espaço Ciriani | Diário do Paciente — histórico do próprio paciente
// ----------------------------------------------------------------------------
//  GET /api/diario-listar?token=XXXX
//  Devolve TODAS as anotações do paciente (inclusive as privadas — é o
//  histórico dele mesmo), com URL assinada temporária pra tocar os áudios.
//
//  Quem lê isso pro lado do psicólogo é a AbaDiario.jsx direto pelo Firestore
//  client SDK (autenticado), filtrando visibilidade in ["visivel","orientacao"].
//  Esse endpoint aqui é só pro paciente, via link público.
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

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ erro: "Método não permitido" });

  const { token } = req.query;
  if (!token) return res.status(400).json({ erro: "Token ausente" });

  try {
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
          criadoEm: d.criadoEm ? d.criadoEm.toDate().toISOString() : null,
        };

        if (d.tipo === "audio" && d.audioPath) {
          try {
            const [url] = await bucket.file(d.audioPath).getSignedUrl({
              action: "read",
              expires: Date.now() + 60 * 60 * 1000, // 1 hora
            });
            item.audioUrl = url;
          } catch (e) {
            console.error("Erro ao gerar URL assinada:", e);
            item.audioUrl = null;
          }
        }

        return item;
      })
    );

    return res.status(200).json({ registros });
  } catch (erro) {
    console.error("Erro ao listar diário:", erro);
    return res.status(500).json({ erro: "Erro interno ao listar" });
  }
};
