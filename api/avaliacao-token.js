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
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
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

// Escala Likert de 6 pontos do CDE (valores 1 a 6)
const ESCALA_CDE = [
  { label: "Completamente falso pra mim", valor: 1 },
  { label: "Na maior parte falso", valor: 2 },
  { label: "Levemente mais verdadeiro que falso", valor: 3 },
  { label: "Moderadamente verdadeiro", valor: 4 },
  { label: "Na maior parte verdadeiro", valor: 5 },
  { label: "Me descreve perfeitamente", valor: 6 },
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
  "CDE": {
    titulo: "Questionário sobre relacionamentos",
    instrucao:
      "As frases abaixo descrevem como uma pessoa pode se sentir em relação ao seu par romântico. Leia cada uma e escolha o quanto ela combina com você. Quando estiver em dúvida, responda pelo que você sente, não pelo que acha que seria certo.",
    escala: ESCALA_CDE,
    itens: [
      "Me sinto desamparado quando estou sozinho",
      "Me preocupa a ideia de ser abandonado pelo meu parceiro",
      "Para atrair meu parceiro, procuro deslumbrá-lo ou diverti-lo",
      "Faço todo o possível pra ser o centro das atenções na vida do meu parceiro",
      "Preciso constantemente de expressões de afeto do meu parceiro",
      "Se meu parceiro não liga ou não aparece na hora combinada, me angustia pensar que está bravo comigo",
      "Quando meu parceiro precisa se ausentar por alguns dias, me sinto angustiado",
      "Quando discuto com meu parceiro, me preocupa que deixe de me querer",
      "Já ameacei me machucar pra que meu parceiro não me deixasse",
      "Sou uma pessoa carente e frágil",
      "Preciso demais que meu parceiro seja expressivo comigo",
      "Preciso ter uma pessoa pra quem eu seja mais especial que os demais",
      "Quando tenho uma discussão com meu parceiro, me sinto vazio",
      "Me sinto muito mal se meu parceiro não me expressa afeto constantemente",
      "Sinto medo de que meu parceiro me abandone",
      "Se meu parceiro me propõe um programa, largo todas as atividades que eu tenha pra estar com ele",
      "Se não sei onde meu parceiro está, me sinto intranquilo",
      "Sinto uma forte sensação de vazio quando estou sozinho",
      "Não tolero a solidão",
      "Sou capaz de fazer coisas arriscadas, até colocar minha vida em risco, pra conservar o amor do outro",
      "Se tenho planos e meu parceiro aparece, mudo tudo só pra ficar com ele",
      "Me afasto demais dos meus amigos quando estou num relacionamento",
      "Só me divirto quando estou com meu parceiro",
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
