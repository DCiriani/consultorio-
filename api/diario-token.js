// ============================================================================
//  api/diario-token.js
//  Espaço Ciriani | Diário do Paciente — validação do link permanente
// ----------------------------------------------------------------------------
//  GET /api/diario-token?token=XXXX
//  Devolve { pacienteId, pacienteNome } se o token existir, ou 404 se não.
//  Usa o mesmo padrão do avaliacao-token.js (Admin SDK, sem Firebase Auth,
//  já que o paciente acessa por link público).
// ============================================================================

const admin = require("firebase-admin");

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

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ erro: "Método não permitido" });

  const { token } = req.query;
  if (!token) return res.status(400).json({ erro: "Token ausente" });

  try {
    const doc = await db.collection("diarioTokens").doc(String(token)).get();

    if (!doc.exists) {
      return res.status(404).json({ erro: "Link inválido ou expirado" });
    }

    const dados = doc.data();

    return res.status(200).json({
      pacienteId: dados.pacienteId,
      pacienteNome: dados.pacienteNome || "Paciente",
    });
  } catch (erro) {
    console.error("Erro ao validar token do diário:", erro);
    return res.status(500).json({ erro: "Erro interno ao validar link" });
  }
};
