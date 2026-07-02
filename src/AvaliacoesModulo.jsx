// ============================================================================
//  MÓDULO DE AVALIAÇÕES — Frontend (React)
//  Espaço Ciriani | drop-in no repo consultorio-
// ----------------------------------------------------------------------------
//  Exporta 3 coisas:
//    <PaginaAvaliacaoPaciente/>  -> rota pública /avaliacao?t=TOKEN (paciente)
//    <AbaAvaliacoes .../>        -> aba dentro da ficha do paciente (terapeuta)
//    gerarLinkAvaliacao(...)     -> cria o token e devolve o link pra enviar
//
//  Assume Firebase SDK modular (v9+) pro lado cliente (db do Firestore, via
//  src/firebase.js). As chamadas de rede vão por fetch() pras rotas de API
//  da Vercel (api/avaliacao-token.js e api/avaliacao-submit.js) — sem
//  Firebase Cloud Functions, esse projeto usa Vercel Functions.
// ============================================================================

import { useEffect, useState, useMemo } from "react";
import {
  collection, doc, setDoc, onSnapshot, query, orderBy,
} from "firebase/firestore";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from "recharts";

// ajuste se o teu arquivo central tiver outro caminho/nome
import { db } from "./firebase";

// Base pública do link enviado ao paciente
const BASE_URL =
  (typeof window !== "undefined" && window.location.origin) ||
  "https://SEU-APP.vercel.app";

// paleta calma (baixa ativação — quem responde pode estar ansioso/deprimido)
const C = {
  fundo: "#F5F3EE",
  cartao: "#FFFFFF",
  tinta: "#2B2B2B",
  suave: "#6B6B6B",
  verde: "#3E6B57",
  verdeClaro: "#E7EFEA",
  borda: "#E3DFD6",
  alerta: "#B3261E",
  alertaFundo: "#FBEBE9",
};

// ---------------------------------------------------------------------------
//  Helper de escrita do token (roda como TERAPEUTA autenticado)
// ---------------------------------------------------------------------------
export async function gerarLinkAvaliacao({
  pacienteId,
  pacienteNome,
  instrumentos = ["PHQ-9", "GAD-7"],
  validadeDias = 14,
}) {
  const token =
    (crypto.randomUUID && crypto.randomUUID().replace(/-/g, "")) ||
    Math.random().toString(36).slice(2) + Date.now().toString(36);

  const expiraEm = new Date();
  expiraEm.setDate(expiraEm.getDate() + validadeDias);

  await setDoc(doc(db, "avaliacaoTokens", token), {
    pacienteId,
    pacienteNome,
    instrumentos,
    status: "pendente",
    criadoEm: new Date(),
    expiraEm,
  });

  return `${BASE_URL}/avaliacao?t=${token}`;
}

// ===========================================================================
//  PÁGINA DO PACIENTE  (rota pública)
// ===========================================================================
export function PaginaAvaliacaoPaciente() {
  const [estado, setEstado] = useState("carregando"); // carregando|form|enviando|ok|erro
  const [erro, setErro] = useState("");
  const [dados, setDados] = useState(null); // { pacienteNome, instrumentos }
  const [respostas, setRespostas] = useState({}); // { 'PHQ-9': {0:2,...} }

  const token = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("t");
  }, []);

  useEffect(() => {
    if (!token) {
      setEstado("erro");
      setErro("Link inválido. Verifique se copiou o endereço completo.");
      return;
    }
    (async () => {
      try {
        const resp = await fetch(`/api/avaliacao-token?token=${encodeURIComponent(token)}`);
        const json = await resp.json();
        if (!resp.ok || !json.ok) {
          throw new Error(json.erro || "Não foi possível carregar o questionário.");
        }
        setDados(json);
        const inic = {};
        json.instrumentos.forEach((i) => (inic[i.id] = {}));
        setRespostas(inic);
        setEstado("form");
      } catch (e) {
        setEstado("erro");
        setErro(e.message || "Algo deu errado. Tente novamente.");
      }
    })();
  }, [token]);

  function marcar(instId, itemIdx, valor) {
    setRespostas((prev) => ({
      ...prev,
      [instId]: { ...prev[instId], [itemIdx]: valor },
    }));
  }

  function tudoRespondido() {
    if (!dados) return false;
    return dados.instrumentos.every((inst) =>
      inst.itens.every((_, idx) => respostas[inst.id]?.[idx] !== undefined)
    );
  }

  function primeiroSemResposta() {
    for (const inst of dados.instrumentos) {
      for (let idx = 0; idx < inst.itens.length; idx++) {
        if (respostas[inst.id]?.[idx] === undefined) return `${inst.id}-${idx}`;
      }
    }
    return null;
  }

  async function enviar() {
    if (!tudoRespondido()) {
      const alvo = primeiroSemResposta();
      if (alvo) {
        const el = document.getElementById(alvo);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    setEstado("enviando");
    try {
      const payload = {};
      dados.instrumentos.forEach((inst) => {
        payload[inst.id] = inst.itens.map((_, idx) => respostas[inst.id][idx]);
      });
      const resp = await fetch("/api/avaliacao-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, respostas: payload }),
      });
      const json = await resp.json();
      if (!resp.ok || !json.ok) {
        throw new Error(json.erro || "Algo deu errado ao enviar.");
      }
      setEstado("ok");
    } catch (e) {
      setEstado("erro");
      setErro(e.message || "Algo deu errado. Tente novamente.");
    }
  }

  const wrap = {
    minHeight: "100vh",
    background: C.fundo,
    color: C.tinta,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    padding: "24px 16px 64px",
  };
  const cartao = {
    maxWidth: 620,
    margin: "0 auto",
    background: C.cartao,
    border: `1px solid ${C.borda}`,
    borderRadius: 16,
    padding: "24px 20px",
  };

  if (estado === "carregando")
    return (
      <div style={wrap}>
        <div style={{ ...cartao, textAlign: "center", color: C.suave }}>
          Carregando…
        </div>
      </div>
    );

  if (estado === "erro")
    return (
      <div style={wrap}>
        <div style={cartao}>
          <h2 style={{ color: C.verde, marginTop: 0 }}>Não deu certo</h2>
          <p style={{ color: C.suave, lineHeight: 1.6 }}>{erro}</p>
        </div>
      </div>
    );

  if (estado === "ok")
    return (
      <div style={wrap}>
        <div style={{ ...cartao, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
          <h2 style={{ color: C.verde, marginTop: 0 }}>Recebido, obrigado</h2>
          <p style={{ color: C.suave, lineHeight: 1.6 }}>
            Suas respostas foram enviadas com segurança pro seu psicólogo. Vocês
            vão conversar sobre isso na sessão. Pode fechar esta página.
          </p>
        </div>
      </div>
    );

  // form
  return (
    <div style={wrap}>
      <div style={{ ...cartao, marginBottom: 16 }}>
        <div style={{ fontSize: 13, letterSpacing: 1, color: C.verde, fontWeight: 700 }}>
          ESPAÇO CIRIANI
        </div>
        <h1 style={{ fontSize: 24, margin: "8px 0 4px" }}>
          {dados.pacienteNome
            ? `Olá, ${dados.pacienteNome}`
            : "Questionário rápido"}
        </h1>
        <p style={{ color: C.suave, lineHeight: 1.6, margin: "8px 0 0" }}>
          São algumas perguntas curtas sobre como você tem se sentido. Não há
          resposta certa ou errada. Responda pensando nas <b>últimas 2 semanas</b>.
        </p>
        <div
          style={{
            marginTop: 14,
            background: C.verdeClaro,
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 13,
            color: C.tinta,
            lineHeight: 1.5,
          }}
        >
          Este questionário é um instrumento de acompanhamento, não um
          diagnóstico. Suas respostas vão direto pro seu psicólogo.
        </div>
      </div>

      {dados.instrumentos.map((inst) => (
        <div key={inst.id} style={{ ...cartao, marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, color: C.verde, marginTop: 0 }}>
            {inst.titulo}
          </h2>
          <p style={{ color: C.suave, fontSize: 14, marginTop: 0, lineHeight: 1.5 }}>
            {inst.instrucao}
          </p>

          {inst.itens.map((texto, idx) => {
            const val = respostas[inst.id]?.[idx];
            return (
              <div
                id={`${inst.id}-${idx}`}
                key={idx}
                style={{
                  padding: "14px 0",
                  borderTop: idx === 0 ? "none" : `1px solid ${C.borda}`,
                }}
              >
                <div style={{ fontSize: 15, marginBottom: 10, lineHeight: 1.45 }}>
                  {idx + 1}. {texto}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {inst.escala.map((op) => {
                    const sel = val === op.valor;
                    return (
                      <button
                        key={op.valor}
                        type="button"
                        onClick={() => marcar(inst.id, idx, op.valor)}
                        style={{
                          flex: "1 1 auto",
                          minWidth: 130,
                          textAlign: "left",
                          cursor: "pointer",
                          borderRadius: 10,
                          border: `1.5px solid ${sel ? C.verde : C.borda}`,
                          background: sel ? C.verde : C.cartao,
                          color: sel ? "#fff" : C.tinta,
                          padding: "10px 12px",
                          fontSize: 14,
                          transition: "all .12s",
                        }}
                      >
                        {op.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <div style={{ maxWidth: 620, margin: "0 auto" }}>
        <button
          type="button"
          onClick={enviar}
          disabled={estado === "enviando"}
          style={{
            width: "100%",
            padding: "16px",
            borderRadius: 12,
            border: "none",
            background: tudoRespondido() ? C.verde : "#B7C5BD",
            color: "#fff",
            fontSize: 16,
            fontWeight: 700,
            cursor: estado === "enviando" ? "wait" : "pointer",
          }}
        >
          {estado === "enviando" ? "Enviando…" : "Enviar respostas"}
        </button>
        {!tudoRespondido() && (
          <p style={{ textAlign: "center", color: C.suave, fontSize: 13, marginTop: 10 }}>
            Responda todas as perguntas para enviar.
          </p>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
//  ABA DO TERAPEUTA  (dentro da ficha do paciente)
// ===========================================================================
export function AbaAvaliacoes({ pacienteId, pacienteNome }) {
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [link, setLink] = useState("");
  const [gerando, setGerando] = useState(false);
  const [selecionados, setSelecionados] = useState(["PHQ-9", "GAD-7"]);

  useEffect(() => {
    if (!pacienteId) return;
    const q = query(
      collection(db, "pacientes", pacienteId, "avaliacoes"),
      orderBy("criadoEm", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setAvaliacoes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setCarregando(false);
    });
    return () => unsub();
  }, [pacienteId]);

  async function gerar() {
    setGerando(true);
    setLink("");
    try {
      const url = await gerarLinkAvaliacao({
        pacienteId,
        pacienteNome,
        instrumentos: selecionados,
      });
      setLink(url);
    } finally {
      setGerando(false);
    }
  }

  function toggleInstrumento(id) {
    setSelecionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const temRisco = avaliacoes.some((a) => a.itemCritico);

  // dados do gráfico: uma linha por instrumento
  const porInstrumento = useMemo(() => {
    const map = {};
    avaliacoes.forEach((a) => {
      if (!map[a.instrumento]) map[a.instrumento] = [];
      const data = a.criadoEm?.toDate
        ? a.criadoEm.toDate()
        : a.criadoEm
        ? new Date(a.criadoEm)
        : null;
      map[a.instrumento].push({
        data: data ? data.toLocaleDateString("pt-BR") : "—",
        escore: a.escore,
      });
    });
    return map;
  }, [avaliacoes]);

  const box = {
    background: "#fff",
    border: "1px solid #E3DFD6",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  };
  const maxEscore = { "PHQ-9": 27, "GAD-7": 21 };
  const corte = { "PHQ-9": 10, "GAD-7": 10 };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", color: "#2B2B2B" }}>
      {temRisco && (
        <div
          style={{
            ...box,
            background: "#FBEBE9",
            border: "1px solid #E7B4AE",
            color: "#8A1C15",
          }}
        >
          <b>⚠️ Alerta de risco.</b> Uma ou mais avaliações têm o item 9 do PHQ-9
          pontuado (ideação de morte/autolesão). Priorize a avaliação de risco.
        </div>
      )}

      {/* Gerar novo link */}
      <div style={box}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Enviar nova avaliação</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {["PHQ-9", "GAD-7"].map((id) => {
            const on = selecionados.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleInstrumento(id)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 20,
                  border: `1.5px solid ${on ? "#3E6B57" : "#E3DFD6"}`,
                  background: on ? "#3E6B57" : "#fff",
                  color: on ? "#fff" : "#2B2B2B",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                {id === "PHQ-9" ? "PHQ-9 (depressão)" : "GAD-7 (ansiedade)"}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={gerar}
          disabled={gerando || selecionados.length === 0}
          style={{
            padding: "10px 18px",
            borderRadius: 10,
            border: "none",
            background: "#3E6B57",
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {gerando ? "Gerando…" : "Gerar link"}
        </button>

        {link && (
          <div style={{ marginTop: 14 }}>
            <div
              style={{
                background: "#F5F3EE",
                border: "1px solid #E3DFD6",
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 13,
                wordBreak: "break-all",
              }}
            >
              {link}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(link)}
                style={btnSec}
              >
                Copiar link
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `Olá! Segue um questionário rápido pra gente conversar na sessão: ${link}`
                )}`}
                target="_blank"
                rel="noreferrer"
                style={{ ...btnSec, textDecoration: "none", display: "inline-block" }}
              >
                Enviar no WhatsApp
              </a>
            </div>
            <p style={{ color: "#6B6B6B", fontSize: 12, marginTop: 8 }}>
              O link expira em 14 dias e só pode ser respondido uma vez.
            </p>
          </div>
        )}
      </div>

      {/* Histórico + gráfico */}
      {carregando ? (
        <div style={{ color: "#6B6B6B" }}>Carregando avaliações…</div>
      ) : avaliacoes.length === 0 ? (
        <div style={{ ...box, color: "#6B6B6B" }}>
          Nenhuma avaliação ainda. Gere um link acima e envie pro paciente.
        </div>
      ) : (
        <>
          {Object.entries(porInstrumento).map(([inst, serie]) => (
            <div key={inst} style={box}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                {inst} — evolução do escore
              </div>
              <div style={{ fontSize: 12, color: "#6B6B6B", marginBottom: 10 }}>
                Linha tracejada = ponto de corte de triagem ({corte[inst]}).
              </div>
              <div style={{ width: "100%", height: 220 }}>
                <ResponsiveContainer>
                  <LineChart data={serie} margin={{ top: 6, right: 12, bottom: 4, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEE" />
                    <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, maxEscore[inst] || "auto"]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    {corte[inst] && (
                      <ReferenceLine y={corte[inst]} stroke="#B3261E" strokeDasharray="4 4" />
                    )}
                    <Line
                      type="monotone"
                      dataKey="escore"
                      stroke="#3E6B57"
                      strokeWidth={2.5}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}

          <div style={box}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Histórico</div>
            <div style={{ display: "grid", gap: 8 }}>
              {[...avaliacoes].reverse().map((a) => {
                const data = a.criadoEm?.toDate
                  ? a.criadoEm.toDate().toLocaleDateString("pt-BR")
                  : "—";
                return (
                  <div
                    key={a.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 12px",
                      borderRadius: 8,
                      background: a.itemCritico ? "#FBEBE9" : "#F5F3EE",
                      border: `1px solid ${a.itemCritico ? "#E7B4AE" : "#E3DFD6"}`,
                    }}
                  >
                    <div>
                      <b>{a.instrumento}</b>{" "}
                      <span style={{ color: "#6B6B6B", fontSize: 13 }}>· {data}</span>
                      {a.itemCritico && (
                        <span style={{ color: "#B3261E", fontSize: 13 }}> · ⚠️ item de risco</span>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700 }}>{a.escore}</div>
                      <div style={{ fontSize: 12, color: "#6B6B6B" }}>{a.faixa}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const btnSec = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1.5px solid #3E6B57",
  background: "#fff",
  color: "#3E6B57",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};
