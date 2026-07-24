// ============================================================================
//  AbaDiario.jsx
//  Espaço Ciriani | Diário do Paciente — aba dentro da ficha (lado terapeuta)
// ----------------------------------------------------------------------------
//  Uso dentro da ficha do paciente (componente que já tem `paciente.id` e
//  `paciente.nome` disponíveis):
//
//    <AbaDiario pacienteId={paciente.id} pacienteNome={paciente.nome} />
//
//  Usa o Firestore client SDK direto (você já está autenticado como
//  terapeuta). Ajusta o import de `db` pro caminho real do teu projeto.
//
//  Conversa de orientação paga: pergunta original (campo raiz do doc) ->
//  sua 1ª resposta -> réplica do paciente (uma só, feita pelo app do
//  paciente) -> sua resposta final. Depois disso a conversa fecha.
// ============================================================================

import { useState, useEffect, useCallback, useRef } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { getStorage, ref, getDownloadURL, uploadBytes } from "firebase/storage";
import { db } from "./firebase";

function gerarTokenAleatorio() {
  // token simples e único o bastante pra link de paciente (não é segredo
  // criptográfico, é só difícil de adivinhar)
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2) +
    Date.now().toString(36)
  );
}

export function AbaDiario({ pacienteId, pacienteNome }) {
  const [linkExistente, setLinkExistente] = useState(null);
  const [gerandoLink, setGerandoLink] = useState(false);

  const [registros, setRegistros] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarregar, setErroCarregar] = useState(null);
  const [audioUrls, setAudioUrls] = useState({});

  // ---- verifica se já existe um token pra esse paciente ---------------------
  useEffect(() => {
    async function buscarTokenExistente() {
      const q = query(collection(db, "diarioTokens"), where("pacienteId", "==", pacienteId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        setLinkExistente(`${window.location.origin}/diario?token=${snap.docs[0].id}`);
      }
    }
    buscarTokenExistente();
  }, [pacienteId]);

  const gerarLink = async () => {
    setGerandoLink(true);
    try {
      const token = gerarTokenAleatorio();
      await setDoc(doc(db, "diarioTokens", token), {
        pacienteId,
        pacienteNome,
        criadoEm: serverTimestamp(),
      });
      setLinkExistente(`${window.location.origin}/diario?token=${token}`);
    } catch (e) {
      alert("Não consegui gerar o link agora. Tenta de novo.");
    } finally {
      setGerandoLink(false);
    }
  };

  // ---- carrega as anotações visíveis + a conversa de cada orientação -------
  const carregar = useCallback(async () => {
    setCarregando(true);
    setErroCarregar(null);
    try {
      const q = query(
        collection(db, "diarios"),
        where("pacienteId", "==", pacienteId),
        where("visibilidade", "in", ["visivel", "orientacao"]),
        orderBy("criadoEm", "desc")
      );
      const snap = await getDocs(q);
      const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // busca a conversa (subcoleção mensagens) de cada orientação paga
      await Promise.all(
        lista
          .filter((r) => r.visibilidade === "orientacao" && r.statusPagamento === "pago")
          .map(async (r) => {
            const msgsSnap = await getDocs(
              query(collection(db, "diarios", r.id, "mensagens"), orderBy("criadoEm", "asc"))
            );
            r.mensagens = msgsSnap.docs.map((m) => ({ id: m.id, ...m.data() }));
          })
      );

      setRegistros(lista);

      // busca URL de download pros áudios (pergunta original + mensagens)
      const storage = getStorage();
      const urls = {};
      const tarefas = [];

      lista.forEach((r) => {
        if (r.tipo === "audio" && r.audioPath) {
          tarefas.push(
            getDownloadURL(ref(storage, r.audioPath))
              .then((url) => (urls[r.id] = url))
              .catch(() => (urls[r.id] = null))
          );
        }
        (r.mensagens || []).forEach((m) => {
          if (m.tipo === "audio" && m.audioPath) {
            tarefas.push(
              getDownloadURL(ref(storage, m.audioPath))
                .then((url) => (urls[m.id] = url))
                .catch(() => (urls[m.id] = null))
            );
          }
        });
      });

      await Promise.all(tarefas);
      setAudioUrls(urls);
    } catch (e) {
      console.error("Erro ao carregar diário:", e);
      setErroCarregar(e.message || "Erro ao carregar anotações.");
    } finally {
      setCarregando(false);
    }
  }, [pacienteId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const marcarConversado = async (id, valorAtual) => {
    await updateDoc(doc(db, "diarios", id), { conversadoNaSessao: !valorAtual });
    setRegistros((prev) => prev.map((r) => (r.id === id ? { ...r, conversadoNaSessao: !valorAtual } : r)));
  };

  const copiarLink = () => {
    navigator.clipboard.writeText(linkExistente);
    alert("Link copiado.");
  };

  return (
    <div style={estilos.container}>
      <div style={estilos.blocoLink}>
        {!linkExistente ? (
          <button onClick={gerarLink} disabled={gerandoLink} style={estilos.botaoGerar}>
            {gerandoLink ? "Gerando..." : "Gerar link do diário"}
          </button>
        ) : (
          <div style={estilos.linkPronto}>
            <span style={estilos.linkTexto}>{linkExistente}</span>
            <button onClick={copiarLink} style={estilos.botaoCopiar}>Copiar</button>
          </div>
        )}
      </div>

      {carregando && <p>Carregando anotações...</p>}

      {!carregando && erroCarregar && (
        <p style={{ color: "#B3261E" }}>
          Não consegui carregar: {erroCarregar}
          <br />
          <span style={{ fontSize: 12 }}>(confere o console do navegador — F12 — se for erro de índice do Firestore)</span>
        </p>
      )}

      {!carregando && !erroCarregar && registros.length === 0 && (
        <p style={{ color: "#888" }}>Nenhuma anotação visível ainda.</p>
      )}

      {!carregando &&
        registros.map((r) => (
          <ItemDiario key={r.id} registro={r} audioUrls={audioUrls} onMarcarConversado={marcarConversado} onRecarregar={carregar} />
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Um item do diário — se for orientação paga, mostra a conversa toda e o
//  compositor de resposta (quando for a vez do psicólogo responder)
// ---------------------------------------------------------------------------
function ItemDiario({ registro: r, audioUrls, onMarcarConversado, onRecarregar }) {
  const [respondendo, setRespondendo] = useState(false);
  const [modoResposta, setModoResposta] = useState("texto"); // "texto" | "audio"
  const [textoResposta, setTextoResposta] = useState("");
  const [gravando, setGravando] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrlLocal, setAudioUrlLocal] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erroResposta, setErroResposta] = useState(null);
  const recorderRef = useRef(null);

  const ehOrientacaoPaga = r.visibilidade === "orientacao" && r.statusPagamento === "pago";
  const mensagens = r.mensagens || [];
  // vez do psicólogo responder: 0 mensagens (1ª resposta) ou 2 mensagens
  // (resposta final, depois da réplica do paciente)
  const vezDoPsicologo = ehOrientacaoPaga && (mensagens.length === 0 || mensagens.length === 2);
  const conversaEncerrada = ehOrientacaoPaga && mensagens.length >= 3;

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
      setErroResposta("Não consegui acessar o microfone.");
    }
  };

  const pararGravacao = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setGravando(false);
  };

  const enviarResposta = async () => {
    setErroResposta(null);
    if (modoResposta === "texto" && !textoResposta.trim()) {
      setErroResposta("Escreve a resposta antes de enviar.");
      return;
    }
    if (modoResposta === "audio" && !audioBlob) {
      setErroResposta("Grava a resposta antes de enviar.");
      return;
    }

    setEnviando(true);
    try {
      const mensagem = {
        autor: "psicologo",
        tipo: modoResposta,
        criadoEm: serverTimestamp(),
      };

      if (modoResposta === "texto") {
        mensagem.conteudo = textoResposta.trim();
      } else {
        const storage = getStorage();
        const extensao = (audioBlob.type.split("/")[1] || "webm").split(";")[0];
        const caminho = `diarios/${r.pacienteId}/respostas/${Date.now()}.${extensao}`;
        await uploadBytes(ref(storage, caminho), audioBlob, { contentType: audioBlob.type });
        mensagem.audioPath = caminho;
        mensagem.audioMimeType = audioBlob.type;
      }

      await addDoc(collection(db, "diarios", r.id, "mensagens"), mensagem);

      setRespondendo(false);
      setTextoResposta("");
      setAudioBlob(null);
      setAudioUrlLocal(null);
      await onRecarregar();
    } catch (e) {
      console.error(e);
      setErroResposta("Não consegui enviar a resposta. Tenta de novo.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      style={{
        ...estilos.item,
        borderColor: r.visibilidade === "orientacao" ? "#B3261E" : "#EEE",
        background: r.visibilidade === "orientacao" ? "#FDECEA" : "#FFF",
      }}
    >
      <div style={estilos.itemCabecalho}>
        <span style={{ fontSize: 12, color: "#888" }}>
          {r.criadoEm ? r.criadoEm.toDate().toLocaleString("pt-BR") : ""}
        </span>
        {r.visibilidade === "orientacao" && (
          <span style={estilos.tagOrientacao}>
            💬 Orientação {r.formatoResposta ? `(${r.formatoResposta})` : ""}
          </span>
        )}
      </div>

      {r.tipo === "texto" && <p style={{ marginTop: 6 }}>{r.conteudo}</p>}
      {r.tipo === "audio" && audioUrls[r.id] && (
        <audio src={audioUrls[r.id]} controls style={{ width: "100%", marginTop: 6 }} />
      )}

      {ehOrientacaoPaga && mensagens.length > 0 && (
        <div style={estilos.blocoConversa}>
          {mensagens.map((m) => (
            <div key={m.id} style={m.autor === "psicologo" ? estilos.bolhaPsicologo : estilos.bolhaPaciente}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, opacity: 0.7 }}>
                {m.autor === "psicologo" ? "Você" : "Paciente"}
              </div>
              {m.tipo === "texto" && <p style={{ margin: 0 }}>{m.conteudo}</p>}
              {m.tipo === "audio" && audioUrls[m.id] && (
                <audio src={audioUrls[m.id]} controls style={{ width: "100%" }} />
              )}
            </div>
          ))}
        </div>
      )}

      {ehOrientacaoPaga && conversaEncerrada && (
        <p style={{ fontSize: 12, color: "#888", marginTop: 8 }}>Conversa encerrada.</p>
      )}

      {ehOrientacaoPaga && vezDoPsicologo && !respondendo && (
        <button onClick={() => setRespondendo(true)} style={estilos.botaoResponder}>
          {mensagens.length === 0 ? "Responder" : "Enviar resposta final"}
        </button>
      )}

      {ehOrientacaoPaga && vezDoPsicologo && respondendo && (
        <div style={estilos.compositor}>
          <div style={estilos.abasCompositor}>
            <button
              onClick={() => setModoResposta("texto")}
              style={modoResposta === "texto" ? estilos.modoAtivo : estilos.modo}
            >
              ✏️ Texto
            </button>
            <button
              onClick={() => setModoResposta("audio")}
              style={modoResposta === "audio" ? estilos.modoAtivo : estilos.modo}
            >
              🎙️ Áudio
            </button>
          </div>

          {modoResposta === "texto" && (
            <textarea
              value={textoResposta}
              onChange={(e) => setTextoResposta(e.target.value)}
              rows={4}
              style={estilos.textarea}
              placeholder="Escreve sua resposta..."
            />
          )}

          {modoResposta === "audio" && (
            <div style={{ marginTop: 8 }}>
              {!audioUrlLocal && !gravando && (
                <button onClick={iniciarGravacao} style={estilos.botaoGravar}>🎙️ Gravar</button>
              )}
              {gravando && (
                <button onClick={pararGravacao} style={estilos.botaoParar}>⏹ Parar</button>
              )}
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
          )}

          {erroResposta && <p style={{ color: "#B3261E", fontSize: 13 }}>{erroResposta}</p>}

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={enviarResposta} disabled={enviando} style={estilos.botaoEnviar}>
              {enviando ? "Enviando..." : "Enviar"}
            </button>
            <button onClick={() => setRespondendo(false)} style={estilos.botaoCancelar}>Cancelar</button>
          </div>
        </div>
      )}

      <label style={estilos.checkboxLabel}>
        <input
          type="checkbox"
          checked={!!r.conversadoNaSessao}
          onChange={() => onMarcarConversado(r.id, r.conversadoNaSessao)}
        />
        Conversado na sessão
      </label>
    </div>
  );
}

const estilos = {
  container: { padding: "4px 0" },
  blocoLink: { marginBottom: 16 },
  botaoGerar: { padding: "10px 16px", borderRadius: 8, border: "none", background: "#6F8F5E", color: "#FFF", cursor: "pointer" },
  linkPronto: { display: "flex", alignItems: "center", gap: 10, background: "#F1F6EE", padding: "10px 12px", borderRadius: 8 },
  linkTexto: { fontSize: 13, color: "#3E5433", flex: 1, wordBreak: "break-all" },
  botaoCopiar: { padding: "6px 12px", borderRadius: 6, border: "1px solid #6F8F5E", background: "#FFF", color: "#3E5433", cursor: "pointer" },
  item: { border: "1px solid #EEE", borderRadius: 10, padding: 12, marginBottom: 10 },
  itemCabecalho: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  tagOrientacao: { fontSize: 12, fontWeight: 600, color: "#B3261E" },
  checkboxLabel: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#666", marginTop: 8 },
  blocoConversa: { marginTop: 10, display: "flex", flexDirection: "column", gap: 8 },
  bolhaPsicologo: { background: "#E9F3E5", borderRadius: 8, padding: "8px 10px", alignSelf: "flex-end", maxWidth: "90%" },
  bolhaPaciente: { background: "#FFF", border: "1px solid #EEE", borderRadius: 8, padding: "8px 10px", alignSelf: "flex-start", maxWidth: "90%" },
  botaoResponder: { marginTop: 10, padding: "8px 14px", borderRadius: 8, border: "none", background: "#6F8F5E", color: "#FFF", cursor: "pointer", fontWeight: 600 },
  compositor: { marginTop: 10, background: "#FAFAFA", borderRadius: 10, padding: 12 },
  abasCompositor: { display: "flex", gap: 6, marginBottom: 8 },
  modo: { flex: 1, padding: "6px 8px", borderRadius: 6, border: "1px solid #DDD", background: "#FFF", cursor: "pointer", fontSize: 13 },
  modoAtivo: { flex: 1, padding: "6px 8px", borderRadius: 6, border: "1px solid #6F8F5E", background: "#F1F6EE", color: "#3E5433", fontWeight: 600, cursor: "pointer", fontSize: 13 },
  textarea: { width: "100%", borderRadius: 8, border: "1px solid #DDD", padding: 10, fontSize: 14, boxSizing: "border-box" },
  botaoGravar: { padding: "8px 14px", borderRadius: 8, border: "none", background: "#6F8F5E", color: "#FFF", cursor: "pointer" },
  botaoParar: { padding: "8px 14px", borderRadius: 8, border: "1px solid #B3261E", background: "#FFF", color: "#B3261E", cursor: "pointer" },
  botaoDescartar: { display: "block", marginTop: 6, background: "none", border: "none", color: "#888", textDecoration: "underline", cursor: "pointer", fontSize: 12 },
  botaoEnviar: { padding: "8px 16px", borderRadius: 8, border: "none", background: "#6F8F5E", color: "#FFF", cursor: "pointer", fontWeight: 600 },
  botaoCancelar: { padding: "8px 16px", borderRadius: 8, border: "1px solid #DDD", background: "#FFF", color: "#666", cursor: "pointer" },
};
