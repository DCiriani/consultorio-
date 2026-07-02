// api/avaliacao-submit.js
// ----------------------------------------------------------------------------
//  Rota pública (SEM auth) chamada pela página do paciente ao enviar respostas.
//  Valida o token, calcula o escore NO SERVIDOR, grava em
//  pacientes/{id}/avaliacoes e dispara alerta se houver item de risco.
// ----------------------------------------------------------------------------

const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

// mesma definição de api/avaliacao-token.js — mantenha sincronizado
const INSTRUMENTOS = {
  "PHQ-9": {
    numItens: 9,
    itemCriticoIndex: 8, // item 9 (0-indexado): ideação de morte/autolesão
    faixas: [
      [0, 4, "mínimo"],
      [5, 9, "leve"],
      [10, 14, "moderado"],
      [15, 19, "moderadamente grave"],
      [20, 27, "grave"],
    ],
  },
  "GAD-7": {
    numItens: 7,
    itemCriticoIndex: null,
    faixas: [
      [0, 4, "mínimo"],
      [5, 9, "leve"],
      [10, 14, "moderado"],
      [15, 21, "grave"],
    ],
  },
};

function faixaDe(instrumentoId, escore) {
  for (const [min, max, nome] of INSTRUMENTOS[instrumentoId].faixas) {
    if (escore >= min && escore <= max) return nome;
  }
  return "indefinido";
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, erro: "Método não permitido." });
  }

  try {
    const { token, respostas } = req.body || {};
    if (!token) return res.status(400).json({ ok: false, erro: "Token ausente." });
    if (!respostas || typeof respostas !== "object") {
      return res.status(400).json({ ok: false, erro: "Respostas ausentes." });
    }

    const tokenRef = db.collection("avaliacaoTokens").doc(String(token));
    const snap = await tokenRef.get();
    if (!snap.exists) {
      return res.status(404).json({ ok: false, erro: "Link inválido." });
    }
    const t = snap.data();

    if (t.status === "respondido") {
      return res
        .status(409)
        .json({ ok: false, erro: "Este questionário já foi respondido." });
    }
    if (t.expiraEm && t.expiraEm.toMillis && t.expiraEm.toMillis() < Date.now()) {
      return res.status(410).json({ ok: false, erro: "Este link expirou." });
    }

    const batch = db.batch();
    let algumCritico = false;
    const resumo = [];

    for (const id of t.instrumentos || []) {
      const cfg = INSTRUMENTOS[id];
      if (!cfg) continue;

      const resp = respostas[id];
      if (!Array.isArray(resp) || resp.length !== cfg.numItens) {
        return res
          .status(400)
          .json({ ok: false, erro: `Respostas incompletas em ${id}.` });
      }

      const limpo = resp.map((v) => Number(v));
      if (limpo.some((n) => !Number.isInteger(n) || n < 0 || n > 3)) {
        return res.status(400).json({ ok: false, erro: `Valor inválido em ${id}.` });
      }

      const escore = limpo.reduce((a, b) => a + b, 0);
      const faixa = faixaDe(id, escore);
      const itemCritico =
        cfg.itemCriticoIndex != null && limpo[cfg.itemCriticoIndex] > 0;
      if (itemCritico) algumCritico = true;

      const avalRef = db
        .collection("pacientes")
        .doc(t.pacienteId)
        .collection("avaliacoes")
        .doc();

      batch.set(avalRef, {
        instrumento: id,
        respostas: limpo,
        escore,
        faixa,
        itemCritico,
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        tokenId: String(token),
      });

      resumo.push({ id, escore, faixa, itemCritico });
    }

    batch.update(tokenRef, {
      status: "respondido",
      respondidoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();

    if (algumCritico) {
      await notificarRisco(t, resumo).catch((e) =>
        console.error("Falha ao notificar risco:", e)
      );
    }

    // O paciente não recebe escore de volta (decisão clínica).
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("avaliacao-submit erro:", e);
    return res.status(500).json({ ok: false, erro: "Algo deu errado. Tente novamente." });
  }
};

// ---------------------------------------------------------------------------
//  Alerta de risco (item 9 do PHQ-9 > 0)
//  Ajuste o nome da coleção de tokens FCM pro mesmo lugar que
//  api/agenda-diaria.js já usa nesse projeto, pra reaproveitar.
// ---------------------------------------------------------------------------
async function notificarRisco(tokenData, resumo) {
  const nome = tokenData.pacienteNome || "Paciente";
  const critico = resumo.find((r) => r.itemCritico);

  await db.collection("alertasRisco").add({
    pacienteId: tokenData.pacienteId,
    pacienteNome: nome,
    motivo: "PHQ-9 item 9 > 0 (ideação de morte/autolesão)",
    escore: critico ? critico.escore : null,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    lido: false,
  });

  const tokensSnap = await db.collection("tokens").get();
  const tokens = tokensSnap.docs.map((d) => d.id).filter(Boolean);
  if (!tokens.length) return;

  await admin.messaging().sendEachForMulticast({
    tokens,
    notification: {
      title: "⚠️ Alerta de risco em avaliação",
      body: `${nome} pontuou no item de risco do PHQ-9. Abra a ficha.`,
    },
    data: { tipo: "risco", pacienteId: String(tokenData.pacienteId) },
  });
}
