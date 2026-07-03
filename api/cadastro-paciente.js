// api/cadastro-paciente.js
// ----------------------------------------------------------------------------
//  Rota pública (SEM auth) chamada pelo formulário de cadastro do paciente
//  (/cadastro). Recebe os dados via fetch simples e quem grava no Firestore
//  é o SERVIDOR (firebase-admin) — não mais o navegador do paciente.
//
//  Por quê: o navegador embutido do WhatsApp (e de outros apps) quebra a
//  escrita client-side do Firestore (que usa streaming/WebSocket), mas
//  aguenta numa boa uma requisição HTTP comum como esta. Mesmo padrão já
//  usado em api/avaliacao-token.js e api/avaliacao-submit.js.
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

// mesmos campos obrigatórios do formulário (ver OBRIG_PAC em src/App.jsx)
const CAMPOS_OBRIGATORIOS = [
  "nome", "cpf", "nascimento", "tel1",
  "emergNome", "emergParentesco", "emergTel",
  "cep", "logradouro", "numero", "bairro", "cidade", "estado",
];

// campos aceitos — qualquer coisa fora daqui é ignorada (evita gravar lixo)
const CAMPOS_PERMITIDOS = [
  ...CAMPOS_OBRIGATORIOS,
  "complemento", "profissional",
];

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, erro: "Método não permitido." });
  }

  try {
    const body = req.body || {};

    const dados = {};
    for (const campo of CAMPOS_PERMITIDOS) {
      dados[campo] = typeof body[campo] === "string" ? body[campo].trim() : (body[campo] || "");
    }

    const faltando = CAMPOS_OBRIGATORIOS.filter((c) => !dados[c]);
    if (faltando.length > 0) {
      return res.status(400).json({
        ok: false,
        erro: `Campos obrigatórios faltando: ${faltando.join(", ")}`,
      });
    }

    const ref = await db.collection("pacientes").add({
      ...dados,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ ok: true, id: ref.id });
  } catch (e) {
    console.error("cadastro-paciente erro:", e);
    return res.status(500).json({ ok: false, erro: "Erro ao salvar cadastro. Tente novamente." });
  }
};
