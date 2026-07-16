export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  try {
    const { audioBase64, mimeType } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ erro: "Áudio não enviado" });
    }

    const audioBuffer = Buffer.from(audioBase64, "base64");

    const uploadResponse = await fetch("https://api.assemblyai.com/v2/upload", {
      method: "POST",
      headers: {
        authorization: process.env.ASSEMBLYAI_API_KEY,
        "content-type": mimeType || "audio/webm",
      },
      body: audioBuffer,
    });

    if (!uploadResponse.ok) {
      const erroTexto = await uploadResponse.text();
      return res.status(500).json({ erro: "Falha ao enviar áudio", detalhe: erroTexto });
    }

    const uploadData = await uploadResponse.json();

    const transcriptResponse = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: {
        authorization: process.env.ASSEMBLYAI_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        audio_url: uploadData.upload_url,
        speaker_labels: true,
        language_code: "pt",
      }),
    });

    if (!transcriptResponse.ok) {
      const erroTexto = await transcriptResponse.text();
      return res.status(500).json({ erro: "Falha ao criar transcrição", detalhe: erroTexto });
    }

    const transcriptData = await transcriptResponse.json();
    return res.status(200).json({ id: transcriptData.id });
  } catch (e) {
    return res.status(500).json({ erro: "Erro interno", detalhe: String(e) });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "4mb",
    },
  },
};