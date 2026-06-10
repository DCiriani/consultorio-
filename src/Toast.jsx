export default function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{
      position: "fixed", top: 20, right: 20, zIndex: 9999,
      background: toast.tipo === "erro" ? "#c0392b" : "#1a6b3c",
      color: "#fff", padding: "12px 20px", borderRadius: 8,
      fontFamily: "sans-serif", fontSize: 14, fontWeight: 600,
      boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
      animation: "fadeIn 0.2s ease",
    }}>{toast.msg}</div>
  );
}
