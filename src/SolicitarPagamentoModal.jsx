// ============================================================================
//  SolicitarPagamentoModal.jsx
//  Espaço Ciriani | Botão "Solicitar pagamento" na lista de pacientes
// ----------------------------------------------------------------------------
//  Uso: dentro do card de cada paciente na aba Pacientes, ao lado do botão
//  "Ver ficha":
//
//    const [pacienteParaPagamento, setPacienteParaPagamento] = useState(null);
//    ...
//    <button onClick={()=>setPacienteParaPagamento(p)} style={...}>💰 Solicitar pagamento</button>
//    ...
//    {pacienteParaPagamento && (
//      <SolicitarPagamentoModal
//        paciente={pacienteParaPagamento}
//        onClose={()=>setPacienteParaPagamento(null)}
//      />
//    )}
// ============================================================================

import { useState } from "react";

export function SolicitarPagamentoModal({ paciente, onClose }) {
  const [valor, setValor] = useState("");
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState(null);
  const [link, setLink] = useState(null);
  const [copiado, setCopiado] = useState(false);

  const gerarLink = async () => {
    setErro(null);
    const valorNumerico = Number(valor.replace(",", "."));
    if (!valorNumerico || valorNumerico <= 0) {
      setErro("Informa um valor válido.");
      return;
    }

    setGerando(true);
    try {
      const r = await fetch("/api/pagamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rota: "solicitar",
          pacienteId: paciente.id,
          pacienteNome: paciente.nome,
          cpf: paciente.cpf || "",
          valor,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.erro || `Erro ${r.status}`);
      setLink(data.linkCurto);
    } catch (e) {
      setErro(e.message || "Não consegui gerar o link. Tenta de novo.");
    } finally {
      setGerando(false);
    }
  };

  const copiarLink = () => {
    navigator.clipboard.writeText(link);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const abrirWhatsApp = () => {
    const msg = encodeURIComponent(`Olá! Segue o link para pagamento da sessão:\n\n${link}`);
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };

  return (
    <div style={estilos.fundo} onClick={onClose}>
      <div style={estilos.caixa} onClick={(e) => e.stopPropagation()}>
        <div style={estilos.cabecalho}>
          <h3 style={estilos.titulo}>Solicitar pagamento</h3>
          <button onClick={onClose} style={estilos.botaoFechar}>✕</button>
        </div>

        <p style={estilos.subtitulo}>{paciente.nome}</p>

        {!link && (
          <>
            <label style={estilos.rotulo}>Valor (R$)</label>
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="ex: 200,00"
              style={estilos.input}
              autoFocus
            />
            {erro && <p style={estilos.erro}>{erro}</p>}
            <button onClick={gerarLink} disabled={gerando} style={estilos.botaoGerar}>
              {gerando ? "Gerando..." : "Gerar link de pagamento"}
            </button>
          </>
        )}

        {link && (
          <div>
            <div style={estilos.blocoLink}>
              <div style={estilos.rotulo}>Link gerado</div>
              <div style={estilos.linkTexto}>{link}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button onClick={copiarLink} style={estilos.botaoCopiar}>
                  {copiado ? "✓ Copiado!" : "📋 Copiar link"}
                </button>
                <button onClick={abrirWhatsApp} style={estilos.botaoWhatsApp}>
                  Enviar no WhatsApp
                </button>
              </div>
            </div>
            <p style={estilos.avisoFinal}>
              Quando o paciente pagar, o registro aparece sozinho em "Últimos registros" — não
              precisa fazer nada.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const estilos = {
  fundo: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  caixa: { background: "#fff", borderRadius: 14, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 8px 40px rgba(0,0,0,0.2)" },
  cabecalho: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  titulo: { margin: 0, color: "#1a3a2a", fontSize: 18, fontFamily: "Georgia,serif" },
  botaoFechar: { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" },
  subtitulo: { fontSize: 13, color: "#5a7a6a", fontFamily: "sans-serif", margin: "0 0 18px" },
  rotulo: { display: "block", fontSize: 11, fontWeight: 700, color: "#4a6a5a", marginBottom: 6, fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.04em" },
  input: { width: "100%", padding: "11px 14px", border: "1.5px solid #c8ddd0", borderRadius: 8, fontSize: 15, fontFamily: "sans-serif", boxSizing: "border-box", background: "#fafdfa", color: "#1a3a2a", outline: "none" },
  erro: { color: "#c0392b", fontSize: 13, fontFamily: "sans-serif", marginTop: 8 },
  botaoGerar: { width: "100%", marginTop: 16, padding: 13, background: "#2a7a4a", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "sans-serif" },
  blocoLink: { background: "#e8f4ec", border: "1px solid #b0d8bc", borderRadius: 10, padding: 14 },
  linkTexto: { fontSize: 12, fontFamily: "monospace", color: "#1a4a2a", wordBreak: "break-all", marginTop: 6, background: "#fff", padding: "8px 10px", borderRadius: 6, border: "1px solid #c8ddd0" },
  botaoCopiar: { padding: "9px 16px", background: "#2a7a4a", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: "sans-serif", fontWeight: 600 },
  botaoWhatsApp: { padding: "9px 16px", background: "#25D366", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: "sans-serif", fontWeight: 600 },
  avisoFinal: { fontSize: 12, color: "#5a7a6a", fontFamily: "sans-serif", marginTop: 14, lineHeight: 1.5 },
};
