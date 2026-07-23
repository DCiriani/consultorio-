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
//  terapeuta). Ajusta o import de `db` pro caminho real do teu firebase.js.
// ============================================================================

import { useState, useEffect, useCallback } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  setDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { getStorage, ref, getDownloadURL } from "firebase/storage";
import { db } from "./firebase"; // ajuste o caminho conforme o teu projeto

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
      // usa o token como ID do documento (não addDoc) pra busca O(1) nas
      // functions, que fazem .doc(token).get() direto
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

  // ---- carrega as anotações visíveis pro terapeuta ---------------------
  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const q = query(
        collection(db, "diarios"),
        where("pacienteId", "==", pacienteId),
        where("visibilidade", "in", ["visivel", "orientacao"]),
        orderBy("criadoEm", "desc")
      );
      const snap = await getDocs(q);
      const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRegistros(lista);

      // busca URL de download pros áudios (Storage rules exigem auth — ok,
      // terapeuta já está autenticado)
      const storage = getStorage();
      const urls = {};
      await Promise.all(
        lista
          .filter((r) => r.tipo === "audio" && r.audioPath)
          .map(async (r) => {
            try {
              urls[r.id] = await getDownloadURL(ref(storage, r.audioPath));
            } catch (e) {
              urls[r.id] = null;
            }
          })
      );
      setAudioUrls(urls);
    } finally {
      setCarregando(false);
    }
  }, [pacienteId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const marcarConversado = async (id, valorAtual) => {
    await updateDoc(doc(db, "diarios", id), { conversadoNaSessao: !valorAtual });
    setRegistros((prev) =>
      prev.map((r) => (r.id === id ? { ...r, conversadoNaSessao: !valorAtual } : r))
    );
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
            <button onClick={copiarLink} style={estilos.botaoCopiar}>
              Copiar
            </button>
          </div>
        )}
      </div>

      {carregando && <p>Carregando anotações...</p>}

      {!carregando && registros.length === 0 && (
        <p style={{ color: "#888" }}>Nenhuma anotação visível ainda.</p>
      )}

      {!carregando &&
        registros.map((r) => (
          <div
            key={r.id}
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
                <span style={estilos.tagOrientacao}>💬 Pediu orientação</span>
              )}
            </div>

            {r.tipo === "texto" && <p style={{ marginTop: 6 }}>{r.conteudo}</p>}
            {r.tipo === "audio" && audioUrls[r.id] && (
              <audio src={audioUrls[r.id]} controls style={{ width: "100%", marginTop: 6 }} />
            )}

            <label style={estilos.checkboxLabel}>
              <input
                type="checkbox"
                checked={!!r.conversadoNaSessao}
                onChange={() => marcarConversado(r.id, r.conversadoNaSessao)}
              />
              Conversado na sessão
            </label>
          </div>
        ))}
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
};
