export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ erro: "ID não informado" });
  }

  try {
    const response = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
      headers: {
        authorization: process.env.ASSEMBLYAI_API_KEY,
      },
    });

    if (!response.ok) {
      const erroTexto = await response.text();
      return res.status(500).json({ erro: "Falha ao consultar status", detalhe: erroTexto });
    }

    const data = await response.json();

    if (data.status === "completed") {
      const utterances = (data.utterances || []).map(u => ({
        speaker: u.speaker,
        text: u.text,
      }));
      return res.status(200).json({ status: "completed", utterances, texto: data.text });
    }

    if (data.status === "error") {
      return res.status(200).json({ status: "error", erro: data.error });
    }

    return res.status(200).json({ status: data.status });
  } catch (e) {
    return res.status(500).json({ erro: "Erro interno", detalhe: String(e) });
  }
}