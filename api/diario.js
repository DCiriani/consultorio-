// ============================================================================
//  api/diario.js
//  Espaço Ciriani | Diário do Paciente — endpoint único (3 ações)
// ----------------------------------------------------------------------------
//  Consolida o que antes eram 3 arquivos separados, pra caber no limite de
//  12 Serverless Functions do plano Hobby da Vercel.
//
//  GET  /api/diario?acao=token&token=XXXX    -> valida o link, devolve paciente
//  GET  /api/diario?acao=listar&token=XXXX   -> histórico do paciente
//  POST /api/diario  (body: { acao:"salvar", token, tipo, ... })
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
}

// ---------------------------------------------------------------------------
//  AÇÃO: salvar — grava anotação de texto ou áudio
// ---------------------------------------------------------------------------
async function acaoSalvar(req, res) {
  const { token, tipo, conteudo, audioBase64, visibilidade } = req.body || {};

  if (!token) return res.status(400).json({ erro: "Token ausente" });
  if (!["texto", "audio"].includes(tipo)) return res.status(400).json({ erro: "Tipo inválido" });
  if (!["privado", "visivel", "orientacao"].includes(visibilidade)) {
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

  if (visibilidade === "orientacao") {
    await db.collection("alertasRisco").add({
      pacienteId,
      pacienteNome: pacienteNome || "Paciente",
      motivo: "Solicitação de orientação via Diário do Paciente",
      origem: "diario",
      diarioId: docRef.id,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      lido: false,
    });
  }

  return res.status(200).json({ ok: true, id: docRef.id });
}

// ---------------------------------------------------------------------------
//  Roteador
// ---------------------------------------------------------------------------
const handler = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // a ação vem na query (GET) ou no corpo (POST)
  const acao = req.query?.acao || req.body?.acao;

  try {
    if (req.method === "GET" && acao === "token") return await acaoToken(req, res);
    if (req.method === "GET" && acao === "listar") return await acaoListar(req, res);
    if (req.method === "POST" && acao === "salvar") return await acaoSalvar(req, res);

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
