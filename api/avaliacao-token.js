// api/avaliacao-token.js
// ----------------------------------------------------------------------------
//  Rota pública (SEM auth) chamada pela página do paciente ao abrir o link.
//  Recebe o token, valida, e devolve as perguntas dos instrumentos.
//  Segue o mesmo padrão de inicialização do firebase-admin que
//  api/agenda-diaria.js já usa neste projeto.
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

// ---------------------------------------------------------------------------
//  Definição dos instrumentos — mesma fonte usada em api/avaliacao-submit.js
//  (mantenha os dois arquivos sincronizados se editar um)
// ---------------------------------------------------------------------------
const ESCALA_FREQUENCIA = [
  { label: "Nenhuma vez", valor: 0 },
  { label: "Vários dias", valor: 1 },
  { label: "Mais da metade dos dias", valor: 2 },
  { label: "Quase todos os dias", valor: 3 },
];

const INSTRUMENTOS = {
  "PHQ-9": {
    titulo: "Questionário sobre a sua saúde",
    instrucao:
      "Nas últimas 2 semanas, com que frequência você foi incomodado(a) por algum dos problemas abaixo?",
    escala: ESCALA_FREQUENCIA,
    itens: [
      "Pouco interesse ou pouco prazer em fazer as coisas",
      'Se sentir "pra baixo", deprimido(a) ou sem perspectiva',
      "Dificuldade pra pegar no sono, permanecer dormindo, ou dormir mais do que de costume",
      "Se sentir cansado(a) ou com pouca energia",
      "Falta de apetite ou comendo demais",
      "Se sentir mal consigo mesmo(a), achar que é um fracasso ou que decepcionou sua família ou você mesmo(a)",
      "Dificuldade pra se concentrar nas coisas, como ler ou ver televisão",
      "Lentidão pra se mover ou falar a ponto de outras pessoas notarem, ou o oposto: agitação, não conseguir ficar parado(a)",
      "Pensar que seria melhor estar morto(a) ou em se ferir de alguma maneira",
    ],
  },
  "GAD-7": {
    titulo: "Questionário de ansiedade",
    instrucao:
      "Nas últimas 2 semanas, com que frequência você foi incomodado(a) por algum dos problemas abaixo?",
    escala: ESCALA_FREQUENCIA,
    itens: [
      "Sentir-se nervoso(a), ansioso(a) ou muito tenso(a)",
      "Não conseguir impedir ou controlar as preocupações",
      "Preocupar-se demais com diversas coisas",
      "Dificuldade para relaxar",
      "Ficar tão agitado(a) que se torna difícil permanecer sentado(a)",
      "Ficar facilmente aborrecido(a) ou irritado(a)",
      "Sentir medo, como se algo horrível fosse acontecer",
    ],
  },
};

module.exports = async (req, res) => {
  // CORS básico — ajuste o domínio se quiser travar mais
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, erro: "Método não permitido." });
  }

  try {
    const token = req.query.token;
    if (!token) {
      return res.status(400).json({ ok: false, erro: "Token ausente." });
    }

    const snap = await db.collection("avaliacaoTokens").doc(String(token)).get();
    if (!snap.exists) {
      return res.status(404).json({ ok: false, erro: "Link inválido. Confira o endereço." });
    }

    const t = snap.data();

    if (t.status === "respondido") {
      return res
        .status(409)
        .json({ ok: false, erro: "Este questionário já foi respondido." });
    }
    if (t.expiraEm && t.expiraEm.toMillis && t.expiraEm.toMillis() < Date.now()) {
      return res
        .status(410)
        .json({ ok: false, erro: "Este link expirou. Peça um novo ao seu psicólogo." });
    }

    const instrumentos = (t.instrumentos || [])
      .filter((id) => INSTRUMENTOS[id])
      .map((id) => ({ id, ...INSTRUMENTOS[id] }));

    const primeiroNome = String(t.pacienteNome || "").trim().split(" ")[0] || "";

    return res.status(200).json({ ok: true, pacienteNome: primeiroNome, instrumentos });
  } catch (e) {
    console.error("avaliacao-token erro:", e);
    return res.status(500).json({ ok: false, erro: "Algo deu errado. Tente novamente." });
  }
};
