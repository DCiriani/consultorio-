// ============================================================================
//  api/diario-salvar.js
//  Espaço Ciriani | Diário do Paciente — salvar anotação (texto ou áudio)
// ----------------------------------------------------------------------------
//  POST /api/diario-salvar
//  Body JSON:
//  {
//    token: "xxxx",
//    tipo: "texto" | "audio",
//    conteudo: "texto da anotação"        // se tipo === "texto"
//    audioBase64: "data:audio/webm;..."   // se tipo === "audio"
//    visibilidade: "privado" | "visivel" | "orientacao"
//  }
//
//  "privado"     -> só o paciente vê (fica marcado assim no documento)
//  "visivel"     -> aparece na aba Diário da ficha, pro psicólogo
//  "orientacao"  -> aparece destacado + dispara alerta (reusa notificarRisco
//                   se você quiser plugar FCM aqui depois, igual Avaliações)
//
//  Limite de áudio: 3 minutos gravados no front, e ~4MB de payload aqui
//  (config abaixo aumenta o limite padrão do Vercel Functions).
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

// Aumenta o limite de payload (áudio em base64 pesa ~33% a mais que o binário)
module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: "6mb",
    },
  },
};

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ erro: "Método não permitido" });

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

  try {
    // 1) valida o token e recupera o paciente
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

    // 2) se for texto, salva direto
    if (tipo === "texto") {
      registro.conteudo = conteudo.trim();
    }

    // 3) se for áudio, sobe pro Storage primeiro
    if (tipo === "audio") {
      const matches = audioBase64.match(/^data:(audio\/\w+);base64,(.+)$/);
      if (!matches) return res.status(400).json({ erro: "Formato de áudio inválido" });

      const mimeType = matches[1];
      const buffer = Buffer.from(matches[2], "base64");

      // limite de segurança: ~5MB (3min de webm/opus fica bem abaixo disso)
      if (buffer.length > 5 * 1024 * 1024) {
        return res.status(400).json({ erro: "Áudio muito grande" });
      }

      const extensao = mimeType.split("/")[1] || "webm";
      const caminho = `diarios/${pacienteId}/${Date.now()}.${extensao}`;
      const arquivo = bucket.file(caminho);

      await arquivo.save(buffer, { metadata: { contentType: mimeType } });

      registro.audioPath = caminho;
      registro.audioMimeType = mimeType;
    }

    const docRef = await db.collection("diarios").add(registro);

    // 4) se pediu orientação, marca um alerta separado pra aparecer destacado
    //    na ficha (mesma ideia do alertasRisco das Avaliações)
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
  } catch (erro) {
    console.error("Erro ao salvar anotação do diário:", erro);
    return res.status(500).json({ erro: "Erro interno ao salvar" });
  }
};
