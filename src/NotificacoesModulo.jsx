// ============================================================================
//  NotificacoesModulo.jsx
//  Espaço Ciriani | Aba "Notificações" — histórico central de eventos
// ----------------------------------------------------------------------------
//  Registro de tudo que gera aviso no sistema (cadastro, avaliação
//  respondida, contrato assinado, eventos do Diário), independente do push
//  ter funcionado ou não. Cada módulo grava um documento na coleção
//  "notificacoes" via Admin SDK (backend), e essa tela só lê e mostra.
//
//  Uso no App.jsx, como mais um item do menu lateral:
//    <NotificacoesModulo />
// ============================================================================

import { useState, useEffect, useCallback } from "react";
import { collection, query, orderBy, limit, getDocs, doc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";

const ICONES_POR_TIPO = {
  cadastro: "📝",
  avaliacao: "🧪",
  contrato: "📄",
  diario_risco: "🚨",
  diario_pagamento: "💰",
  diario_replica: "💬",
};

const CORES_POR_TIPO = {
  diario_risco: "#B3261E",
};

export function NotificacoesModulo() {
  const [notificacoes, setNotificacoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [filtro, setFiltro] = useState("todas"); // "todas" | "nao-lidas"

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const q = query(collection(db, "notificacoes"), orderBy("criadoEm", "desc"), limit(100));
      const snap = await getDocs(q);
      setNotificacoes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("Erro ao carregar notificações:", e);
      setErro(e.message || "Erro ao carregar notificações.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const marcarLida = async (id, valorAtual) => {
    await updateDoc(doc(db, "notificacoes", id), { lida: !valorAtual });
    setNotificacoes((prev) => prev.map((n) => (n.id === id ? { ...n, lida: !valorAtual } : n)));
  };

  const marcarTodasLidas = async () => {
    const naoLidas = notificacoes.filter((n) => !n.lida);
    if (!naoLidas.length) return;
    const batch = writeBatch(db);
    naoLidas.forEach((n) => batch.update(doc(db, "notificacoes", n.id), { lida: true }));
    await batch.commit();
    setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })));
  };

  const totalNaoLidas = notificacoes.filter((n) => !n.lida).length;
  const listaFiltrada = filtro === "nao-lidas" ? notificacoes.filter((n) => !n.lida) : notificacoes;

  return (
    <div style={estilos.container}>
      <div style={estilos.cabecalho}>
        <div style={estilos.abasFiltro}>
          <button
            onClick={() => setFiltro("todas")}
            style={filtro === "todas" ? estilos.filtroAtivo : estilos.filtro}
          >
            Todas
          </button>
          <button
            onClick={() => setFiltro("nao-lidas")}
            style={filtro === "nao-lidas" ? estilos.filtroAtivo : estilos.filtro}
          >
            Não lidas {totalNaoLidas > 0 && `(${totalNaoLidas})`}
          </button>
        </div>
        {totalNaoLidas > 0 && (
          <button onClick={marcarTodasLidas} style={estilos.botaoMarcarTodas}>
            Marcar todas como lidas
          </button>
        )}
      </div>

      {carregando && <p>Carregando notificações...</p>}
      {!carregando && erro && <p style={{ color: "#B3261E" }}>Não consegui carregar: {erro}</p>}
      {!carregando && !erro && listaFiltrada.length === 0 && (
        <p style={{ color: "#888" }}>
          {filtro === "nao-lidas" ? "Nenhuma notificação não lida." : "Nenhuma notificação ainda."}
        </p>
      )}

      {!carregando &&
        listaFiltrada.map((n) => (
          <div
            key={n.id}
            onClick={() => marcarLida(n.id, n.lida)}
            style={{
              ...estilos.item,
              background: n.lida ? "#FFF" : "#F1F6EE",
              borderLeftColor: CORES_POR_TIPO[n.tipo] || "#6F8F5E",
            }}
          >
            <div style={estilos.itemIcone}>{ICONES_POR_TIPO[n.tipo] || "🔔"}</div>
            <div style={{ flex: 1 }}>
              <div style={estilos.itemCabecalho}>
                <span style={{ fontWeight: n.lida ? 500 : 700 }}>{n.titulo}</span>
                <span style={estilos.itemData}>
                  {n.criadoEm?.toDate ? n.criadoEm.toDate().toLocaleString("pt-BR") : ""}
                </span>
              </div>
              <p style={estilos.itemMensagem}>{n.mensagem}</p>
              {n.pacienteNome && <span style={estilos.itemPaciente}>{n.pacienteNome}</span>}
            </div>
            {!n.lida && <div style={estilos.pontoNaoLida} />}
          </div>
        ))}
    </div>
  );
}

const estilos = {
  container: { padding: "4px 0" },
  cabecalho: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 },
  abasFiltro: { display: "flex", gap: 8 },
  filtro: { padding: "8px 14px", borderRadius: 8, border: "1px solid #DDD", background: "#FFF", cursor: "pointer", fontSize: 13, color: "#666" },
  filtroAtivo: { padding: "8px 14px", borderRadius: 8, border: "1px solid #6F8F5E", background: "#6F8F5E", color: "#FFF", cursor: "pointer", fontSize: 13, fontWeight: 600 },
  botaoMarcarTodas: { padding: "8px 14px", borderRadius: 8, border: "1px solid #DDD", background: "#FFF", color: "#666", cursor: "pointer", fontSize: 13 },
  item: { display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px", borderRadius: 8, borderLeft: "4px solid #6F8F5E", marginBottom: 8, cursor: "pointer" },
  itemIcone: { fontSize: 20 },
  itemCabecalho: { display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" },
  itemData: { fontSize: 11, color: "#999", whiteSpace: "nowrap" },
  itemMensagem: { fontSize: 13, color: "#555", margin: "4px 0 0" },
  itemPaciente: { fontSize: 12, color: "#6F8F5E", fontWeight: 600 },
  pontoNaoLida: { width: 8, height: 8, borderRadius: "50%", background: "#B3261E", flexShrink: 0, marginTop: 6 },
};
