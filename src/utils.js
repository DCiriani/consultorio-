export const fCPF = (raw) => {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};

export const fTel = (raw) => {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").replace(/-$/, "");
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3").replace(/-$/, "");
};

export const fCEP = (raw) => {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  return d.replace(/(\d{5})(\d{0,3})/, "$1-$2").replace(/-$/, "");
};

export const HOJE = () => new Date().toLocaleDateString("pt-BR");
export const FORMAS = ["Pix", "Cartão de Débito", "Cartão de Crédito", "Dinheiro"];

export function chipColor(pag) {
  if (pag === "Pix") return { background: "#d4edda", color: "#155724" };
  if (pag === "Dinheiro") return { background: "#fff3cd", color: "#856404" };
  if (pag?.includes("Débito")) return { background: "#cce5ff", color: "#004085" };
  if (pag?.includes("Crédito")) return { background: "#f8d7da", color: "#721c24" };
  return { background: "#e2e3e5", color: "#383d41" };
}

export const s = {
  root: { fontFamily: "'Georgia', serif", maxWidth: 860, margin: "0 auto", padding: "24px 16px 60px", background: "#f4f6f0", minHeight: "100vh" },
  card: { background: "#fff", borderRadius: 14, padding: 24, marginBottom: 20, boxShadow: "0 2px 12px rgba(0,40,20,0.07)", border: "1px solid #deeade" },
  cardTitulo: { margin: "0 0 18px", fontSize: 17, fontWeight: 700, color: "#1a3a2a", display: "flex", alignItems: "center", gap: 10 },
  badge: { background: "#2a8a4a", color: "#fff", borderRadius: 20, padding: "2px 10px", fontSize: 13, fontFamily: "sans-serif" },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "#4a6a5a", marginBottom: 5, fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.04em" },
  input: { width: "100%", padding: "10px 14px", border: "1.5px solid #c8ddd0", borderRadius: 8, fontSize: 15, fontFamily: "sans-serif", outline: "none", boxSizing: "border-box", background: "#fafdfa", color: "#1a3a2a" },
  inputGrande: { width: "100%", padding: "12px 16px", border: "1.5px solid #c8ddd0", borderRadius: 8, fontSize: 16, fontFamily: "sans-serif", outline: "none", boxSizing: "border-box", background: "#fafdfa", color: "#1a3a2a" },
  select: { width: "100%", padding: "10px 14px", border: "1.5px solid #c8ddd0", borderRadius: 8, fontSize: 15, fontFamily: "sans-serif", outline: "none", background: "#fafdfa", color: "#1a3a2a", cursor: "pointer", boxSizing: "border-box" },
  btnPrimario: { padding: "10px 20px", background: "#2a7a4a", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "sans-serif" },
  btnSecundario: { padding: "9px 18px", background: "#fff", border: "1.5px solid #b0c8b8", borderRadius: 8, cursor: "pointer", fontSize: 13, color: "#2a5a3a", fontFamily: "sans-serif" },
  btnPerigo: { background: "none", border: "none", color: "#c0392b", cursor: "pointer", fontSize: 14, padding: "2px 6px" },
  tabela: { width: "100%", borderCollapse: "collapse", fontFamily: "sans-serif" },
  th: { textAlign: "left", padding: "10px 12px", fontSize: 12, fontWeight: 700, color: "#4a6a5a", borderBottom: "2px solid #deeade", textTransform: "uppercase", letterSpacing: "0.04em" },
  td: { padding: "10px 12px", fontSize: 14, color: "#1a3a2a", borderBottom: "1px solid #eef4ec" },
  chip: { padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" },
  empty: { textAlign: "center", color: "#8aaa9a", fontFamily: "sans-serif", padding: 40, fontSize: 15, lineHeight: 1.8 },
  dropdown: { position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1.5px solid #c8ddd0", borderRadius: 8, zIndex: 100, listStyle: "none", margin: 0, padding: "4px 0", boxShadow: "0 8px 24px rgba(0,40,20,0.12)", maxHeight: 220, overflowY: "auto" },
  dropdownItem: { padding: "10px 16px", cursor: "pointer", display: "flex", gap: 8, alignItems: "center", fontFamily: "sans-serif", fontSize: 14 },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  modal: { background: "#fff", borderRadius: 14, padding: 28, width: "100%", maxWidth: 460, boxShadow: "0 8px 40px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" },
};
