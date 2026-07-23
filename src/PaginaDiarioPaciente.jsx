// ============================================================================
//  PaginaDiarioPaciente.jsx
//  Espaço Ciriani | Diário do Paciente — página pública (rota /diario)
// ----------------------------------------------------------------------------
//  Uso: adiciona no teu roteador (App.jsx ou main.jsx):
//
//    <Route path="/diario" element={<PaginaDiarioPaciente />} />
//
//  Essa rota precisa estar FORA do bloqueio de autenticação, igual a rota
//  /cadastro já está hoje. O paciente acessa via link salvo na tela do
//  celular: https://SEUDOMINIO/diario?token=XXXX
//
//  Não usa Firestore/Storage direto — tudo passa pelas 3 functions em api/,
//  então não precisa de nenhuma config de Firebase client aqui.
// ============================================================================

import { useState, useEffect, useRef, useCallback } from "react";

const LIMITE_AUDIO_MS = 3 * 60 * 1000; // 3 minutos

export function PaginaDiarioPaciente() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  const [carregando, setCarregando] = useState(true);
  const [erroToken, setErroToken] = useState(null);
  const [paciente, setPaciente] = useState(null);

  // ---- instalar na tela inicial ------------------------------------------
  const [promptInstalacao, setPromptInstalacao] = useState(null);
  const [appInstalado, setAppInstalado] = useState(false);
  const ehIOS =
    (/iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream) ||
    // iPadOS 13+ se identifica como "Macintosh" no user agent — só dá pra
    // diferenciar de um Mac de verdade pela tela sensível ao toque
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const jaInstalado =
    window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;

  useEffect(() => {
    const aoTerPrompt = (e) => {
      e.preventDefault();
      setPromptInstalacao(e);
    };
    window.addEventListener("beforeinstallprompt", aoTerPrompt);
    window.addEventListener("appinstalled", () => setAppInstalado(true));
    return () => window.removeEventListener("beforeinstallprompt", aoTerPrompt);
  }, []);

  const instalarApp = async () => {
    if (!promptInstalacao) return;
    promptInstalacao.prompt();
    const escolha = await promptInstalacao.userChoice;
    if (escolha.outcome === "accepted") setAppInstalado(true);
    setPromptInstalacao(null);
  };


  const [aba, setAba] = useState("escrever"); // "escrever" | "historico"
  const [modo, setModo] = useState("texto"); // "texto" | "audio"
  const [texto, setTexto] = useState("");
  const [visibilidade, setVisibilidade] = useState("privado");

  const [gravando, setGravando] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [tempoGravado, setTempoGravado] = useState(0);

  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState(null);

  const [historico, setHistorico] = useState([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  // ---- valida o token ao carregar ------------------------------------------
  useEffect(() => {
    if (!token) {
      setErroToken("Link inválido: token ausente.");
      setCarregando(false);
      return;
    }
    fetch(`/api/diario?acao=token&token=${encodeURIComponent(token)}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        setPaciente(data);
        // título da aba, em vez de "Espaço Ciriani — Cadastro"
        document.title = `Diário — ${data.pacienteNome}`;
        // manifest próprio do paciente: o manifest.json geral do app
        // aponta start_url pra "/", que cairia no login do psicólogo
        let linkManifest = document.querySelector('link[rel="manifest"]');
        if (!linkManifest) {
          linkManifest = document.createElement("link");
          linkManifest.rel = "manifest";
          document.head.appendChild(linkManifest);
        }
        linkManifest.href = `/api/diario?acao=manifest&token=${encodeURIComponent(token)}`;
      })
      .catch(() => setErroToken("Este link não é válido ou expirou. Fale com seu psicólogo."))
      .finally(() => setCarregando(false));
  }, [token]);

  // ---- histórico ------------------------------------------------------------
  const [erroHistorico, setErroHistorico] = useState(null);

  const carregarHistorico = useCallback(() => {
    if (!token) return;
    setCarregandoHistorico(true);
    setErroHistorico(null);
    fetch(`/api/diario?acao=listar&token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data?.erro || `Erro ${r.status}`);
        setHistorico(data.registros || []);
      })
      .catch((e) => {
        setHistorico([]);
        setErroHistorico(e.message || "Não consegui carregar o histórico.");
      })
      .finally(() => setCarregandoHistorico(false));
  }, [token]);


  useEffect(() => {
    if (aba === "historico") carregarHistorico();
  }, [aba, carregarHistorico]);

  // ---- gravação de áudio ------------------------------------------------
  const iniciarGravacao = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tiposSuportados = [
        "audio/webm",
        "audio/mp4",
        "audio/aac",
        "audio/ogg",
        "audio/wav",
      ];
      const mimeType =
        tiposSuportados.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || "";

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream); // deixa o navegador escolher (ex: iOS Safari)
      const tipoFinal = recorder.mimeType || mimeType || "audio/mp4";
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: tipoFinal });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setGravando(true);
      setTempoGravado(0);

      const inicio = Date.now();
      timerRef.current = setInterval(() => {
        const decorrido = Date.now() - inicio;
        setTempoGravado(decorrido);
        if (decorrido >= LIMITE_AUDIO_MS) pararGravacao();
      }, 200);
    } catch (e) {
      setMensagem({ tipo: "erro", texto: "Não consegui acessar o microfone. Verifique a permissão do navegador." });
    }
  };

  const pararGravacao = () => {
    clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setGravando(false);
  };

  const descartarAudio = () => {
    setAudioBlob(null);
    setAudioUrl(null);
    setTempoGravado(0);
  };

  // ---- salvar ------------------------------------------------------------
  const blobParaBase64 = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const salvar = async () => {
    setMensagem(null);

    if (modo === "texto" && !texto.trim()) {
      setMensagem({ tipo: "erro", texto: "Escreve alguma coisa antes de salvar." });
      return;
    }
    if (modo === "audio" && !audioBlob) {
      setMensagem({ tipo: "erro", texto: "Grava um áudio antes de salvar." });
      return;
    }

    setSalvando(true);
    try {
      const body = { acao: "salvar", token, tipo: modo, visibilidade };
      if (modo === "texto") {
        body.conteudo = texto.trim();
      } else {
        body.audioBase64 = await blobParaBase64(audioBlob);
      }

      const r = await fetch("/api/diario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.erro || `Erro ${r.status}`);

      setMensagem({ tipo: "sucesso", texto: "Anotação salva." });
      setTexto("");
      descartarAudio();
      setVisibilidade("privado");
    } catch (e) {
      setMensagem({ tipo: "erro", texto: e.message || "Não consegui salvar agora. Tenta de novo em instantes." });
    } finally {
      setSalvando(false);
    }
  };

  // ---- render ------------------------------------------------------------
  if (carregando) {
    return <TelaCentral>Carregando...</TelaCentral>;
  }

  if (erroToken) {
    return <TelaCentral erro>{erroToken}</TelaCentral>;
  }

  const segundosRestantes = Math.max(0, Math.ceil((LIMITE_AUDIO_MS - tempoGravado) / 1000));

  return (
    <div style={estilos.pagina}>
      <div style={estilos.avisoEmergencia}>
        Este espaço não é um canal de emergência. Em caso de risco imediato, ligue{" "}
        <strong>CVV 188</strong> ou <strong>SAMU 192</strong>.
      </div>

      <div style={estilos.container}>
        <h1 style={estilos.titulo}>Diário — {paciente.pacienteNome}</h1>

        {!jaInstalado && !appInstalado && (promptInstalacao || ehIOS) && (
          <div style={estilos.bannerInstalar}>
            {promptInstalacao && !ehIOS && (
              <>
                <span>📲 Instala esse link como um app na tela do seu celular.</span>
                <button onClick={instalarApp} style={estilos.botaoInstalar}>
                  Instalar
                </button>
              </>
            )}
            {ehIOS && (
              <span>
                📲 Pra ter isso como um app: toque em{" "}
                <strong>Compartilhar (⬆️)</strong> e depois em{" "}
                <strong>Adicionar à Tela de Início</strong>.
              </span>
            )}
          </div>
        )}


        <div style={estilos.abas}>
          <button
            onClick={() => setAba("escrever")}
            style={aba === "escrever" ? estilos.abaAtiva : estilos.aba}
          >
            Escrever
          </button>
          <button
            onClick={() => setAba("historico")}
            style={aba === "historico" ? estilos.abaAtiva : estilos.aba}
          >
            Meu histórico
          </button>
        </div>

        {aba === "escrever" && (
          <div style={estilos.card}>
            <div style={estilos.abas}>
              <button
                onClick={() => setModo("texto")}
                style={modo === "texto" ? estilos.modoAtivo : estilos.modo}
              >
                ✏️ Texto
              </button>
              <button
                onClick={() => setModo("audio")}
                style={modo === "audio" ? estilos.modoAtivo : estilos.modo}
              >
                🎙️ Áudio
              </button>
            </div>

            {modo === "texto" && (
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Escreve o que quiser registrar..."
                rows={8}
                style={estilos.textarea}
              />
            )}

            {modo === "audio" && (
              <div style={estilos.blocoAudio}>
                {!audioUrl && !gravando && (
                  <button onClick={iniciarGravacao} style={estilos.botaoGravar}>
                    🎙️ Iniciar gravação
                  </button>
                )}

                {gravando && (
                  <div style={estilos.gravando}>
                    <span style={estilos.pontoGravando} /> Gravando... {segundosRestantes}s restantes
                    <button onClick={pararGravacao} style={estilos.botaoParar}>
                      Parar
                    </button>
                  </div>
                )}

                {audioUrl && !gravando && (
                  <div>
                    <audio src={audioUrl} controls style={{ width: "100%" }} />
                    <button onClick={descartarAudio} style={estilos.botaoDescartar}>
                      Descartar e gravar de novo
                    </button>
                  </div>
                )}
              </div>
            )}

            <div style={estilos.opcoesVisibilidade}>
              <p style={estilos.perguntaVisibilidade}>Ao salvar, quero que fique:</p>
              <OpcaoVisibilidade
                selecionado={visibilidade === "privado"}
                onClick={() => setVisibilidade("privado")}
                emoji="🔒"
                titulo="Só para mim"
                descricao="Só você vê. Fica no seu histórico particular."
              />
              <OpcaoVisibilidade
                selecionado={visibilidade === "visivel"}
                onClick={() => setVisibilidade("visivel")}
                emoji="👁"
                titulo="Visível para o psicólogo"
                descricao="Aparece na sua ficha, pra conversarem sobre isso."
              />
              <OpcaoVisibilidade
                selecionado={visibilidade === "orientacao"}
                onClick={() => setVisibilidade("orientacao")}
                emoji="💬"
                titulo="Salvar e solicitar orientação"
                descricao="Seu psicólogo será avisado e vai entrar em contato."
              />
            </div>

            {mensagem && (
              <div style={mensagem.tipo === "erro" ? estilos.mensagemErro : estilos.mensagemSucesso}>
                {mensagem.texto}
              </div>
            )}

            <button onClick={salvar} disabled={salvando} style={estilos.botaoSalvar}>
              {salvando ? "Salvando..." : "Salvar anotação"}
            </button>
          </div>
        )}

        {aba === "historico" && (
          <div style={estilos.card}>
            {carregandoHistorico && <p>Carregando histórico...</p>}
            {!carregandoHistorico && erroHistorico && (
              <p style={{ color: "#B3261E" }}>Não consegui carregar: {erroHistorico}</p>
            )}
            {!carregandoHistorico && !erroHistorico && historico.length === 0 && (
              <p>Você ainda não tem anotações.</p>
            )}
            {!carregandoHistorico &&
              historico.map((item) => <ItemHistorico key={item.id} item={item} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- subcomponentes ---------------------------------------------------------

function TelaCentral({ children, erro }) {
  return (
    <div style={{ ...estilos.pagina, alignItems: "center", justifyContent: "center", display: "flex" }}>
      <div style={{ ...estilos.card, maxWidth: 400, textAlign: "center", color: erro ? "#B3261E" : "#333" }}>
        {children}
      </div>
    </div>
  );
}

function OpcaoVisibilidade({ selecionado, onClick, emoji, titulo, descricao }) {
  return (
    <div
      onClick={onClick}
      style={{
        ...estilos.opcaoVisibilidade,
        borderColor: selecionado ? "#6F8F5E" : "#DDD",
        background: selecionado ? "#F1F6EE" : "#FFF",
      }}
    >
      <span style={{ fontSize: 20, marginRight: 10 }}>{emoji}</span>
      <div>
        <div style={{ fontWeight: 600 }}>{titulo}</div>
        <div style={{ fontSize: 13, color: "#666" }}>{descricao}</div>
      </div>
    </div>
  );
}

function ItemHistorico({ item }) {
  const data = item.criadoEm ? new Date(item.criadoEm).toLocaleString("pt-BR") : "";
  const rotulo = { privado: "🔒 Só para mim", visivel: "👁 Visível", orientacao: "💬 Orientação solicitada" }[
    item.visibilidade
  ];

  return (
    <div style={estilos.itemHistorico}>
      <div style={estilos.itemCabecalho}>
        <span style={{ fontSize: 12, color: "#888" }}>{data}</span>
        <span style={{ fontSize: 12, color: "#6F8F5E", fontWeight: 600 }}>{rotulo}</span>
      </div>
      {item.tipo === "texto" && <p style={{ marginTop: 6 }}>{item.conteudo}</p>}
      {item.tipo === "audio" && item.audioUrl && (
        <audio src={item.audioUrl} controls style={{ width: "100%", marginTop: 6 }} />
      )}
    </div>
  );
}

// ---- estilos ------------------------------------------------------------

const estilos = {
  pagina: { minHeight: "100vh", background: "#F7F8F6", padding: "0 0 40px" },
  avisoEmergencia: {
    background: "#FDECEA",
    color: "#B3261E",
    textAlign: "center",
    padding: "10px 16px",
    fontSize: 13,
    fontWeight: 500,
  },
  container: { maxWidth: 560, margin: "0 auto", padding: "24px 16px" },
  titulo: { fontSize: 22, marginBottom: 16, color: "#2E3B2C" },
  bannerInstalar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    background: "#F1F6EE",
    border: "1px solid #C9DCC0",
    borderRadius: 10,
    padding: "10px 14px",
    marginBottom: 16,
    fontSize: 13,
    color: "#3E5433",
  },
  botaoInstalar: {
    padding: "6px 14px",
    borderRadius: 8,
    border: "none",
    background: "#6F8F5E",
    color: "#FFF",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  abas: { display: "flex", gap: 8, marginBottom: 16 },
  aba: {
    flex: 1,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #DDD",
    background: "#FFF",
    cursor: "pointer",
  },
  abaAtiva: {
    flex: 1,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #6F8F5E",
    background: "#6F8F5E",
    color: "#FFF",
    cursor: "pointer",
    fontWeight: 600,
  },
  card: { background: "#FFF", borderRadius: 14, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" },
  modo: { flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD", background: "#FAFAFA", cursor: "pointer" },
  modoAtivo: { flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #6F8F5E", background: "#F1F6EE", color: "#3E5433", fontWeight: 600, cursor: "pointer" },
  textarea: { width: "100%", borderRadius: 10, border: "1px solid #DDD", padding: 12, fontSize: 15, marginTop: 12, resize: "vertical", boxSizing: "border-box" },
  blocoAudio: { marginTop: 12, textAlign: "center" },
  botaoGravar: { padding: "12px 20px", borderRadius: 10, border: "none", background: "#6F8F5E", color: "#FFF", fontSize: 15, cursor: "pointer" },
  gravando: { display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "#B3261E", fontWeight: 500 },
  pontoGravando: { width: 10, height: 10, borderRadius: "50%", background: "#B3261E", display: "inline-block" },
  botaoParar: { marginLeft: 10, padding: "6px 12px", borderRadius: 8, border: "1px solid #B3261E", background: "#FFF", color: "#B3261E", cursor: "pointer" },
  botaoDescartar: { display: "block", margin: "10px auto 0", background: "none", border: "none", color: "#888", textDecoration: "underline", cursor: "pointer" },
  opcoesVisibilidade: { marginTop: 18 },
  perguntaVisibilidade: { fontSize: 14, fontWeight: 600, marginBottom: 8, color: "#444" },
  opcaoVisibilidade: { display: "flex", alignItems: "center", border: "1.5px solid #DDD", borderRadius: 10, padding: "10px 12px", marginBottom: 8, cursor: "pointer" },
  mensagemErro: { marginTop: 14, color: "#B3261E", fontSize: 14 },
  mensagemSucesso: { marginTop: 14, color: "#3E5433", fontSize: 14 },
  botaoSalvar: { width: "100%", marginTop: 16, padding: "14px", borderRadius: 10, border: "none", background: "#6F8F5E", color: "#FFF", fontSize: 16, fontWeight: 600, cursor: "pointer" },
  itemHistorico: { borderBottom: "1px solid #EEE", padding: "12px 0" },
  itemCabecalho: { display: "flex", justifyContent: "space-between" },
};
