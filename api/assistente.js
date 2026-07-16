export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  try {
    const { pacienteNome, textoSessoes } = req.body;
    if (!textoSessoes) {
      return res.status(400).json({ erro: "Nenhuma anotação de sessão informada." });
    }

    const systemPrompt = `Você é um assistente de apoio clínico para um psicólogo formado em Terapia Cognitivo-Comportamental (TCC). Seu papel é ajudar o profissional a organizar e refletir sobre suas próprias anotações de sessão — você não substitui o julgamento clínico dele, apenas apoia.

Baseie-se exclusivamente nas anotações fornecidas. Organize sua resposta em:
1. Resumo do que foi observado
2. Padrões ou temas recorrentes (se houver mais de uma sessão)
3. Hipóteses de caso na perspectiva da TCC (crenças centrais, distorções cognitivas, comportamentos de evitação/segurança, etc.)
4. Sugestões de intervenção ou próximos passos, alinhadas à TCC

Seja direto e clinicamente fundamentado. Evite linguagem vaga ou genérica.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `Paciente: ${pacienteNome || "não informado"}\n\nAnotações de sessão:\n\n${textoSessoes}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const erroTexto = await response.text();
      return res.status(500).json({ erro: "Falha ao consultar o assistente", detalhe: erroTexto });
    }

    const data = await response.json();
    const textoResposta = data.content?.map(c => c.text || "").join("\n") || "Sem resposta.";
    return res.status(200).json({ resposta: textoResposta });
  } catch (e) {
    return res.status(500).json({ erro: "Erro interno", detalhe: String(e) });
  }
}
export const config = {
  maxDuration: 60,
};