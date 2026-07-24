// ============================================================================
//  PaginaDiarioPaciente.jsx
//  Espaço Ciriani | Diário do Paciente — página pública (rota /diario)
// ----------------------------------------------------------------------------
//  Uso: adiciona no teu roteador (App.jsx):
//
//    <Route path="/diario" element={<PaginaDiarioPaciente />} />
//    (fora do bloqueio de autenticação, igual a rota /cadastro)
//
//  O paciente acessa via link permanente: https://SEUDOMINIO/diario?token=XXXX
//  Tudo passa pelas ações de api/diario.js — não usa Firestore/Storage direto.
//
//  3 ABAS: Escrever (privado/visível, sem pagamento) | Orientação (pago,
//  fluxo formato -> triagem -> como funciona -> conteúdo -> pagamento) |
//  Meu histórico.
// ============================================================================

import { useState, useEffect, useRef, useCallback } from "react";

const LIMITE_AUDIO_MS = 3 * 60 * 1000; // 3 minutos

const FORMATOS_ORIENTACAO = [
  { id: "texto", emoji: "💬", titulo: "Resposta por texto", preco: "R$ 30,00" },
  { id: "audio", emoji: "🎙️", titulo: "Resposta por áudio", preco: "R$ 50,00" },
  { id: "video", emoji: "🎥", titulo: "Videochamada (30 min)", preco: "R$ 100,00" },
];

const PERGUNTAS_TRIAGEM = [
  {
    texto: "Nos últimos dias, você teve pensamentos de que não valeria a pena continuar vivendo?",
    opcoes: ["Não", "Às vezes", "Sim, com frequência"],
  },
  {
    texto: "Você chegou a pensar em como faria isso, ou já tem um plano?",
    opcoes: ["Não", "Sim"],
  },
  {
    texto: "Existe algo ou alguém que te impede de agir nesse pensamento agora?",
    opcoes: ["Sim, tenho isso claro", "Não sei / Não tenho certeza"],
  },
];

const COMO_FUNCIONA = {
  texto: "Funciona assim: você escreve sua dúvida com todos os detalhes. Seu psicólogo tem até 24h para te responder por escrito. Depois da resposta, você pode enviar mais uma mensagem sobre o mesmo assunto, e ele responde mais uma vez para fechar. É uma orientação única, focada em um ponto específico — não dá para abrir vários assuntos aqui. Capriche nos detalhes.",
  audio: "Funciona assim: você grava sua dúvida em áudio, com todos os detalhes. Seu psicólogo tem até 24h para te responder, também em áudio. Depois da resposta, você pode gravar mais um áudio sobre o mesmo assunto, e ele responde mais uma vez para fechar. É uma orientação única, focada em um ponto específico — não dá para abrir vários assuntos aqui. Capriche nos detalhes.",
  video: "Funciona assim: depois do pagamento, seu psicólogo vai entrar em contato em até 72h para agendar uma chamada de 30 minutos com você. É uma orientação única, focada em um ponto específico — pensa com antecedência no que quer conversar, para aproveitar bem o tempo.",
};

export function PaginaDiarioPaciente() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const retornoPagamento = params.get("pagamento") === "retorno";
  const pedidoRetorno = params.get("pedido");

  const [carregando, setCarregando] = useState(true);
  const [erroToken, setErroToken] = useState(null);
  const [paciente, setPaciente] = useState(null);

  const [aba, setAba] = useState("escrever"); // "escrever" | "orientacao" | "historico"

  // ---- aba Escrever (privado / visível — sem pagamento) --------------------
  const [modo, setModo] = useState("texto");
  const [texto, setTexto] = useState("");
  const [visibilidade, setVisibilidade] = useState("privado");
  const [gravando, setGravando] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [tempoGravado, setTempoGravado] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  // ---- aba Orientação (pago) ------------------------------------------------
  // "formato" | "triagem" | "comoFunciona" | "conteudo" | "acolhimento" | "redirecionando"
  const [etapaOrientacao, setEtapaOrientacao] = useState("formato");
  const [formatoEscolhido, setFormatoEscolhido] = useState(null);
  const [respostasRisco, setRespostasRisco] = useState([null, null, null]);
  const [erroOrientacao, setErroOrientacao] = useState(null);
  const [textoOrientacao, setTextoOrientacao] = useState("");
  const [gravandoOrientacao, setGravandoOrientacao] = useState(false);
  const [audioBlobOrientacao, setAudioBlobOrientacao] = useState(null);
  const [audioUrlOrientacao, setAudioUrlOrientacao] = useState(null);
  const [tempoGravadoOrientacao, setTempoGravadoOrientacao] = useState(0);
  const mediaRecorderRefO = useRef(null);
  const chunksRefO = useRef([]);
  const timerRefO = useRef(null);

  // ---- aba Meu histórico ------------------------------------------------
  const [historico, setHistorico] = useState([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [erroHistorico, setErroHistorico] = useState(null);

  // ---- retorno do pagamento ------------------------------------------------
  const [verificandoPagamento, setVerificandoPagamento] = useState(retornoPagamento);
  const [statusPagamentoRetorno, setStatusPagamentoRetorno] = useState(null);

  // ---- instalar na tela inicial ------------------------------------------
  const [promptInstalacao, setPromptInstalacao] = useState(null);
  const [appInstalado, setAppInstalado] = useState(false);
  const ehIOS =
    (/iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream) ||
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
        document.title = `Diário — ${data.pacienteNome}`;
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

  // ---- confere retorno de pagamento (InfinityPay redirecionou de volta) ---
  useEffect(() => {
    if (!retornoPagamento || !pedidoRetorno) return;

    let tentativas = 0;
    const maxTentativas = 8;

    const checar = () => {
      tentativas += 1;
      fetch(`/api/diario?acao=statusPagamento&id=${encodeURIComponent(pedidoRetorno)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.statusPagamento === "pago") {
            setStatusPagamentoRetorno("pago");
            setVerificandoPagamento(false);
            setAba("historico");
          } else if (tentativas >= maxTentativas) {
            setStatusPagamentoRetorno("pendente");
            setVerificandoPagamento(false);
          } else {
            setTimeout(checar, 2500);
          }
        })
        .catch(() => {
          if (tentativas >= maxTentativas) {
            setStatusPagamentoRetorno("pendente");
            setVerificandoPagamento(false);
          } else {
            setTimeout(checar, 2500);
          }
        });
    };

    checar();
  }, [retornoPagamento, pedidoRetorno]);

  // ---- histórico ------------------------------------------------------------
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

  // ---- gravação de áudio (helper genérico, usado nas duas abas) -----------
  function criarGravador({ onBlobPronto, refRecorder, refChunks, refTimer, setGravandoFn, setTempoFn }) {
    return async function iniciar() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const tiposSuportados = ["audio/webm", "audio/mp4", "audio/aac", "audio/ogg", "audio/wav"];
        const mimeType = tiposSuportados.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || "";
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        const tipoFinal = recorder.mimeType || mimeType || "audio/mp4";

        refChunks.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) refChunks.current.push(e.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(refChunks.current, { type: tipoFinal });
          onBlobPronto(blob);
          stream.getTracks().forEach((t) => t.stop());
        };

        recorder.start();
        refRecorder.current = recorder;
        setGravandoFn(true);
        setTempoFn(0);

        const inicio = Date.now();
        refTimer.current = setInterval(() => {
          const decorrido = Date.now() - inicio;
          setTempoFn(decorrido);
          if (decorrido >= LIMITE_AUDIO_MS) {
            clearInterval(refTimer.current);
            if (refRecorder.current && refRecorder.current.state !== "inactive") refRecorder.current.stop();
            setGravandoFn(false);
          }
        }, 200);
      } catch (e) {
        setMensagem({ tipo: "erro", texto: "Não consegui acessar o microfone. Verifique a permissão do navegador." });
      }
    };
  }

  const iniciarGravacao = criarGravador({
    onBlobPronto: (blob) => {
      setAudioBlob(blob);
      setAudioUrl(URL.createObjectURL(blob));
    },
    refRecorder: mediaRecorderRef,
    refChunks: chunksRef,
    refTimer: timerRef,
    setGravandoFn: setGravando,
    setTempoFn: setTempoGravado,
  });

  const pararGravacao = () => {
    clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
    setGravando(false);
  };

  const descartarAudio = () => {
    setAudioBlob(null);
    setAudioUrl(null);
    setTempoGravado(0);
  };

  const iniciarGravacaoOrientacao = criarGravador({
    onBlobPronto: (blob) => {
      setAudioBlobOrientacao(blob);
      setAudioUrlOrientacao(URL.createObjectURL(blob));
    },
    refRecorder: mediaRecorderRefO,
    refChunks: chunksRefO,
    refTimer: timerRefO,
    setGravandoFn: setGravandoOrientacao,
    setTempoFn: setTempoGravadoOrientacao,
  });

  const pararGravacaoOrientacao = () => {
    clearInterval(timerRefO.current);
    if (mediaRecorderRefO.current && mediaRecorderRefO.current.state !== "inactive") mediaRecorderRefO.current.stop();
    setGravandoOrientacao(false);
  };

  const descartarAudioOrientacao = () => {
    setAudioBlobOrientacao(null);
    setAudioUrlOrientacao(null);
    setTempoGravadoOrientacao(0);
  };

  // ---- salvar (aba Escrever: privado / visível) ------------------------------
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

  // ---- fluxo Orientação ----------------------------------------------------
  const resetarOrientacao = () => {
    setEtapaOrientacao("formato");
    setFormatoEscolhido(null);
    setRespostasRisco([null, null, null]);
    setErroOrientacao(null);
    setTextoOrientacao("");
    descartarAudioOrientacao();
  };

  const avancarParaComoFunciona = (formato) => {
    setFormatoEscolhido(formato);
    setEtapaOrientacao("comoFunciona");
  };

  const confirmarTriagem = () => {
    if (respostasRisco.some((r) => r === null)) {
      setErroOrientacao("Responde as 3 perguntas antes de continuar.");
      return;
    }
    setErroOrientacao(null);
    setEtapaOrientacao(formatoEscolhido === "video" ? "confirmarVideo" : "conteudo");
  };

  const enviarPedidoDeOrientacao = async () => {
    setErroOrientacao(null);

    if (formatoEscolhido === "texto" && !textoOrientacao.trim()) {
      setErroOrientacao("Escreve sua dúvida antes de continuar.");
      return;
    }
    if (formatoEscolhido === "audio" && !audioBlobOrientacao) {
      setErroOrientacao("Grava sua dúvida antes de continuar.");
      return;
    }

    setEtapaOrientacao("redirecionando");

    try {
      const body = {
        acao: "iniciarPagamento",
        token,
        formatoResposta: formatoEscolhido,
        respostasRisco,
      };

      if (formatoEscolhido === "video") {
        body.tipo = "texto";
        body.conteudo = "(pedido de videochamada de orientação — agendar por WhatsApp após o pagamento)";
      } else if (formatoEscolhido === "texto") {
        body.tipo = "texto";
        body.conteudo = textoOrientacao.trim();
      } else {
        body.tipo = "audio";
        body.audioBase64 = await blobParaBase64(audioBlobOrientacao);
      }

      const r = await fetch("/api/diario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.erro || `Erro ${r.status}`);

      if (data.risco) {
        setEtapaOrientacao("acolhimento");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("Resposta inesperada do servidor.");
    } catch (e) {
      setErroOrientacao(e.message || "Não consegui continuar. Tenta de novo.");
      setEtapaOrientacao(formatoEscolhido === "video" ? "confirmarVideo" : "conteudo");
    }
  };

  // ---- render ------------------------------------------------------------
  if (carregando) return <TelaCentral>Carregando...</TelaCentral>;
  if (erroToken) return <TelaCentral erro>{erroToken}</TelaCentral>;
  if (verificandoPagamento) return <TelaCentral>Confirmando seu pagamento, só um instante...</TelaCentral>;

  const segundosRestantes = Math.max(0, Math.ceil((LIMITE_AUDIO_MS - tempoGravado) / 1000));
  const segundosRestantesOrientacao = Math.max(0, Math.ceil((LIMITE_AUDIO_MS - tempoGravadoOrientacao) / 1000));

  return (
    <div style={estilos.pagina}>
      <div style={estilos.avisoEmergencia}>
        Este espaço não é um canal de emergência. Em caso de risco imediato, ligue{" "}
        <strong>CVV 188</strong> ou <strong>SAMU 192</strong>.
      </div>

      <div style={estilos.container}>
        <h1 style={estilos.titulo}>Diário — {paciente.pacienteNome}</h1>

        {statusPagamentoRetorno === "pago" && (
          <div style={estilos.avisoSucesso}>
            ✅ Pagamento confirmado! Seu psicólogo foi avisado e vai te procurar.
          </div>
        )}
        {statusPagamentoRetorno === "pendente" && (
          <div style={estilos.avisoPendente}>
            Ainda estamos confirmando seu pagamento. Se você já pagou, atualiza essa página em
            alguns instantes.
          </div>
        )}

        {!jaInstalado && !appInstalado && (promptInstalacao || ehIOS) && (
          <div style={estilos.bannerInstalar}>
            {promptInstalacao && !ehIOS && (
              <>
                <span>📲 Instala esse link como um app na tela do seu celular.</span>
                <button onClick={instalarApp} style={estilos.botaoInstalar}>Instalar</button>
              </>
            )}
            {ehIOS && (
              <span>
                📲 Pra ter isso como um app: toque em <strong>Compartilhar (⬆️)</strong> e depois em{" "}
                <strong>Adicionar à Tela de Início</strong>.
              </span>
            )}
          </div>
        )}

        <div style={estilos.abas}>
          <button onClick={() => setAba("escrever")} style={aba === "escrever" ? estilos.abaAtiva : estilos.aba}>
            Escrever
          </button>
          <button
            onClick={() => {
              setAba("orientacao");
              if (etapaOrientacao === null) setEtapaOrientacao("formato");
            }}
            style={aba === "orientacao" ? estilos.abaAtiva : estilos.aba}
          >
            Orientação
          </button>
          <button onClick={() => setAba("historico")} style={aba === "historico" ? estilos.abaAtiva : estilos.aba}>
            Histórico
          </button>
        </div>

        {aba === "escrever" && (
          <div style={estilos.card}>
            <div style={estilos.abas}>
              <button onClick={() => setModo("texto")} style={modo === "texto" ? estilos.modoAtivo : estilos.modo}>
                ✏️ Texto
              </button>
              <button onClick={() => setModo("audio")} style={modo === "audio" ? estilos.modoAtivo : estilos.modo}>
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
                  <button onClick={iniciarGravacao} style={estilos.botaoGravar}>🎙️ Iniciar gravação</button>
                )}
                {gravando && (
                  <div style={estilos.gravando}>
                    <span style={estilos.pontoGravando} /> Gravando... {segundosRestantes}s restantes
                    <button onClick={pararGravacao} style={estilos.botaoParar}>Parar</button>
                  </div>
                )}
                {audioUrl && !gravando && (
                  <div>
                    <audio src={audioUrl} controls style={{ width: "100%" }} />
                    <button onClick={descartarAudio} style={estilos.botaoDescartar}>Descartar e gravar de novo</button>
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

        {aba === "orientacao" && etapaOrientacao === "formato" && (
          <div style={estilos.card}>
            <p style={estilos.perguntaVisibilidade}>
              Peça uma orientação pontual do seu psicólogo. Escolha como quer receber a resposta:
            </p>
            {FORMATOS_ORIENTACAO.map((f) => (
              <div key={f.id} onClick={() => avancarParaComoFunciona(f.id)} style={estilos.opcaoFormato}>
                <span style={{ fontSize: 20, marginRight: 10 }}>{f.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{f.titulo}</div>
                </div>
                <div style={{ fontWeight: 700, color: "#3E5433" }}>{f.preco}</div>
              </div>
            ))}
          </div>
        )}

        {aba === "orientacao" && etapaOrientacao === "comoFunciona" && (
          <div style={estilos.card}>
            <button onClick={() => setEtapaOrientacao("formato")} style={estilos.botaoVoltar}>← Voltar</button>
            <p style={estilos.perguntaVisibilidade}>
              Como funciona · {FORMATOS_ORIENTACAO.find((f) => f.id === formatoEscolhido)?.preco}
            </p>
            <p style={{ fontSize: 14, color: "#444", lineHeight: 1.6 }}>{COMO_FUNCIONA[formatoEscolhido]}</p>
            <button onClick={() => setEtapaOrientacao("triagem")} style={estilos.botaoSalvar}>
              Faz sentido, continuar
            </button>
          </div>
        )}

        {aba === "orientacao" && etapaOrientacao === "triagem" && (
          <div style={estilos.card}>
            <button onClick={() => setEtapaOrientacao("comoFunciona")} style={estilos.botaoVoltar}>← Voltar</button>
            <p style={estilos.perguntaVisibilidade}>Antes de continuar, responde essas 3 perguntas rápidas:</p>
            {PERGUNTAS_TRIAGEM.map((pergunta, i) => (
              <div key={i} style={estilos.blocoPergunta}>
                <p style={estilos.textoPergunta}>{pergunta.texto}</p>
                {pergunta.opcoes.map((opcao, j) => (
                  <label key={j} style={estilos.opcaoRadio}>
                    <input
                      type="radio"
                      name={`pergunta-${i}`}
                      checked={respostasRisco[i] === j}
                      onChange={() => {
                        const novas = [...respostasRisco];
                        novas[i] = j;
                        setRespostasRisco(novas);
                      }}
                    />
                    {opcao}
                  </label>
                ))}
              </div>
            ))}
            {erroOrientacao && <div style={estilos.mensagemErro}>{erroOrientacao}</div>}
            <button onClick={confirmarTriagem} style={estilos.botaoSalvar}>Continuar</button>
          </div>
        )}


        {aba === "orientacao" && etapaOrientacao === "conteudo" && formatoEscolhido === "texto" && (
          <div style={estilos.card}>
            <button onClick={() => setEtapaOrientacao("triagem")} style={estilos.botaoVoltar}>← Voltar</button>
            <p style={estilos.perguntaVisibilidade}>Escreve sua dúvida (seja detalhista, é um ponto só):</p>
            <textarea
              value={textoOrientacao}
              onChange={(e) => setTextoOrientacao(e.target.value)}
              placeholder="Descreve a situação com o máximo de detalhes que puder..."
              rows={8}
              style={estilos.textarea}
            />
            {erroOrientacao && <div style={estilos.mensagemErro}>{erroOrientacao}</div>}
            <button onClick={enviarPedidoDeOrientacao} style={estilos.botaoSalvar}>Ir para pagamento — R$ 30,00</button>
          </div>
        )}

        {aba === "orientacao" && etapaOrientacao === "conteudo" && formatoEscolhido === "audio" && (
          <div style={estilos.card}>
            <button onClick={() => setEtapaOrientacao("triagem")} style={estilos.botaoVoltar}>← Voltar</button>
            <p style={estilos.perguntaVisibilidade}>Grava sua dúvida (seja detalhista, é um ponto só):</p>
            <div style={estilos.blocoAudio}>
              {!audioUrlOrientacao && !gravandoOrientacao && (
                <button onClick={iniciarGravacaoOrientacao} style={estilos.botaoGravar}>🎙️ Iniciar gravação</button>
              )}
              {gravandoOrientacao && (
                <div style={estilos.gravando}>
                  <span style={estilos.pontoGravando} /> Gravando... {segundosRestantesOrientacao}s restantes
                  <button onClick={pararGravacaoOrientacao} style={estilos.botaoParar}>Parar</button>
                </div>
              )}
              {audioUrlOrientacao && !gravandoOrientacao && (
                <div>
                  <audio src={audioUrlOrientacao} controls style={{ width: "100%" }} />
                  <button onClick={descartarAudioOrientacao} style={estilos.botaoDescartar}>
                    Descartar e gravar de novo
                  </button>
                </div>
              )}
            </div>
            {erroOrientacao && <div style={estilos.mensagemErro}>{erroOrientacao}</div>}
            <button onClick={enviarPedidoDeOrientacao} style={estilos.botaoSalvar}>Ir para pagamento — R$ 50,00</button>
          </div>
        )}

        {aba === "orientacao" && etapaOrientacao === "confirmarVideo" && (
          <div style={estilos.card}>
            <button onClick={() => setEtapaOrientacao("triagem")} style={estilos.botaoVoltar}>← Voltar</button>
            <p style={estilos.perguntaVisibilidade}>
              Depois do pagamento, seu psicólogo vai te chamar para agendar o horário da chamada.
            </p>
            {erroOrientacao && <div style={estilos.mensagemErro}>{erroOrientacao}</div>}
            <button onClick={enviarPedidoDeOrientacao} style={estilos.botaoSalvar}>Ir para pagamento — R$ 100,00</button>
          </div>
        )}

        {aba === "orientacao" && etapaOrientacao === "redirecionando" && (
          <div style={estilos.card}>
            <p>Preparando seu pagamento, só um instante...</p>
          </div>
        )}

        {aba === "orientacao" && etapaOrientacao === "acolhimento" && (
          <div style={estilos.card}>
            <div style={estilos.blocoAcolhimento}>
              <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>
                Percebemos que você pode estar passando por um momento difícil.
              </p>
              <p style={{ marginBottom: 10 }}>
                Esse canal não é indicado para situações de risco imediato. Seu psicólogo já foi
                avisado, mas se você está em perigo agora, por favor busque ajuda imediata:
              </p>
              <p style={{ marginBottom: 6 }}>📞 <strong>CVV — 188</strong> (ligação gratuita, 24h)</p>
              <p style={{ marginBottom: 6 }}>🚑 <strong>SAMU — 192</strong></p>
              <p>Ou procure o pronto-socorro mais próximo.</p>
            </div>
            <button onClick={resetarOrientacao} style={estilos.botaoSalvar}>Entendi</button>
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
              historico.map((item) => (
                <ItemHistorico key={item.id} item={item} token={token} onRecarregar={carregarHistorico} />
              ))}
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

function ItemHistorico({ item, token, onRecarregar }) {
  const data = item.criadoEm ? new Date(item.criadoEm).toLocaleString("pt-BR") : "";
  const rotulo = {
    privado: "🔒 Só para mim",
    visivel: "👁 Visível",
    orientacao: "💬 Orientação (paga)",
  }[item.visibilidade];

  const [respondendo, setRespondendo] = useState(false);
  const [textoReplica, setTextoReplica] = useState("");
  const [gravando, setGravando] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrlLocal, setAudioUrlLocal] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const recorderRef = useRef(null);

  const iniciarGravacao = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tiposSuportados = ["audio/webm", "audio/mp4", "audio/aac", "audio/ogg", "audio/wav"];
      const mimeType = tiposSuportados.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const tipoFinal = recorder.mimeType || mimeType || "audio/mp4";
      const chunks = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: tipoFinal });
        setAudioBlob(blob);
        setAudioUrlLocal(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      recorderRef.current = recorder;
      setGravando(true);
    } catch (e) {
      setErro("Não consegui acessar o microfone.");
    }
  };

  const pararGravacao = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    setGravando(false);
  };

  const blobParaBase64 = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const enviarReplica = async () => {
    setErro(null);
    const tipo = item.formatoResposta === "audio" ? "audio" : "texto";

    if (tipo === "texto" && !textoReplica.trim()) {
      setErro("Escreve sua réplica antes de enviar.");
      return;
    }
    if (tipo === "audio" && !audioBlob) {
      setErro("Grava sua réplica antes de enviar.");
      return;
    }

    setEnviando(true);
    try {
      const body = { acao: "enviarReplica", token, diarioId: item.id, tipo };
      if (tipo === "texto") body.conteudo = textoReplica.trim();
      else body.audioBase64 = await blobParaBase64(audioBlob);

      const r = await fetch("/api/diario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.erro || `Erro ${r.status}`);

      setRespondendo(false);
      setTextoReplica("");
      setAudioBlob(null);
      setAudioUrlLocal(null);
      await onRecarregar();
    } catch (e) {
      setErro(e.message || "Não consegui enviar. Tenta de novo.");
    } finally {
      setEnviando(false);
    }
  };

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

      {(item.mensagens || []).length > 0 && (
        <div style={estilos.blocoConversa}>
          {item.mensagens.map((m) => (
            <div key={m.id} style={m.autor === "psicologo" ? estilos.bolhaPsicologo : estilos.bolhaPaciente}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, opacity: 0.7 }}>
                {m.autor === "psicologo" ? "Seu psicólogo" : "Você"}
              </div>
              {m.tipo === "texto" && <p style={{ margin: 0 }}>{m.conteudo}</p>}
              {m.tipo === "audio" && m.audioUrl && (
                <audio src={m.audioUrl} controls style={{ width: "100%" }} />
              )}
            </div>
          ))}
        </div>
      )}

      {item.conversaEncerrada && (
        <p style={{ fontSize: 12, color: "#888", marginTop: 8 }}>Essa conversa foi encerrada.</p>
      )}

      {item.podeReplicar && !respondendo && (
        <button onClick={() => setRespondendo(true)} style={estilos.botaoResponderPaciente}>
          Responder
        </button>
      )}

      {item.podeReplicar && respondendo && (
        <div style={estilos.compositor}>
          {item.formatoResposta === "audio" ? (
            <div>
              {!audioUrlLocal && !gravando && (
                <button onClick={iniciarGravacao} style={estilos.botaoGravar}>🎙️ Gravar réplica</button>
              )}
              {gravando && <button onClick={pararGravacao} style={estilos.botaoParar}>⏹ Parar</button>}
              {audioUrlLocal && !gravando && (
                <div>
                  <audio src={audioUrlLocal} controls style={{ width: "100%" }} />
                  <button
                    onClick={() => { setAudioBlob(null); setAudioUrlLocal(null); }}
                    style={estilos.botaoDescartar}
                  >
                    Descartar e gravar de novo
                  </button>
                </div>
              )}
            </div>
          ) : (
            <textarea
              value={textoReplica}
              onChange={(e) => setTextoReplica(e.target.value)}
              rows={4}
              style={estilos.textarea}
              placeholder="Escreve sua réplica..."
            />
          )}

          {erro && <p style={{ color: "#B3261E", fontSize: 13 }}>{erro}</p>}

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={enviarReplica} disabled={enviando} style={estilos.botaoEnviarReplica}>
              {enviando ? "Enviando..." : "Enviar"}
            </button>
            <button onClick={() => setRespondendo(false)} style={estilos.botaoCancelarReplica}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- estilos ------------------------------------------------------------

const estilos = {
  pagina: { minHeight: "100vh", background: "#F7F8F6", padding: "0 0 40px" },
  avisoEmergencia: { background: "#FDECEA", color: "#B3261E", textAlign: "center", padding: "10px 16px", fontSize: 13, fontWeight: 500 },
  avisoSucesso: { background: "#E9F3E5", color: "#2E5433", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 14 },
  avisoPendente: { background: "#FFF6E5", color: "#8A6116", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 14 },
  container: { maxWidth: 560, margin: "0 auto", padding: "24px 16px" },
  titulo: { fontSize: 22, marginBottom: 16, color: "#2E3B2C" },
  bannerInstalar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", background: "#F1F6EE", border: "1px solid #C9DCC0", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#3E5433" },
  botaoInstalar: { padding: "6px 14px", borderRadius: 8, border: "none", background: "#6F8F5E", color: "#FFF", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  abas: { display: "flex", gap: 8, marginBottom: 16 },
  aba: { flex: 1, padding: "10px 8px", borderRadius: 10, border: "1px solid #DDD", background: "#FFF", cursor: "pointer", fontSize: 13 },
  abaAtiva: { flex: 1, padding: "10px 8px", borderRadius: 10, border: "1px solid #6F8F5E", background: "#6F8F5E", color: "#FFF", cursor: "pointer", fontWeight: 600, fontSize: 13 },
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
  opcaoFormato: { display: "flex", alignItems: "center", border: "1.5px solid #DDD", borderRadius: 10, padding: "12px 14px", marginBottom: 8, cursor: "pointer" },
  mensagemErro: { marginTop: 14, color: "#B3261E", fontSize: 14 },
  mensagemSucesso: { marginTop: 14, color: "#3E5433", fontSize: 14 },
  botaoSalvar: { width: "100%", marginTop: 16, padding: "14px", borderRadius: 10, border: "none", background: "#6F8F5E", color: "#FFF", fontSize: 16, fontWeight: 600, cursor: "pointer" },
  botaoVoltar: { background: "none", border: "none", color: "#6F8F5E", fontWeight: 600, cursor: "pointer", marginBottom: 14, padding: 0, fontSize: 14 },
  blocoPergunta: { marginBottom: 18 },
  textoPergunta: { fontWeight: 600, fontSize: 14, color: "#333", marginBottom: 8 },
  opcaoRadio: { display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#444", marginBottom: 6, cursor: "pointer" },
  blocoAcolhimento: { background: "#FDECEA", borderRadius: 10, padding: 16, color: "#7A2B24", fontSize: 14, lineHeight: 1.5 },
  itemHistorico: { borderBottom: "1px solid #EEE", padding: "12px 0" },
  itemCabecalho: { display: "flex", justifyContent: "space-between" },
  blocoConversa: { marginTop: 10, display: "flex", flexDirection: "column", gap: 8 },
  bolhaPsicologo: { background: "#F1F6EE", borderRadius: 8, padding: "8px 10px", alignSelf: "flex-start", maxWidth: "90%" },
  bolhaPaciente: { background: "#EAF1FB", borderRadius: 8, padding: "8px 10px", alignSelf: "flex-end", maxWidth: "90%" },
  botaoResponderPaciente: { marginTop: 10, padding: "8px 14px", borderRadius: 8, border: "none", background: "#6F8F5E", color: "#FFF", cursor: "pointer", fontWeight: 600, fontSize: 13 },
  compositor: { marginTop: 10, background: "#FAFAFA", borderRadius: 10, padding: 12 },
  botaoEnviarReplica: { padding: "8px 16px", borderRadius: 8, border: "none", background: "#6F8F5E", color: "#FFF", cursor: "pointer", fontWeight: 600 },
  botaoCancelarReplica: { padding: "8px 16px", borderRadius: 8, border: "1px solid #DDD", background: "#FFF", color: "#666", cursor: "pointer" },
};
