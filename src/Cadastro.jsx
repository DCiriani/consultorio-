import { useState } from "react";
import { addPaciente } from "./db";
import { fCPF, fTel, fCEP } from "./utils";
import Toast from "./Toast";

const PARENTESCOS = [
  "Mãe", "Pai", "Filho(a)", "Cônjuge / Parceiro(a)", "Irmão / Irmã",
  "Avô / Avó", "Tio(a)", "Primo(a)", "Amigo(a)", "Outro"
];

const sc = {
  root: { fontFamily: "'Georgia', serif", maxWidth: 580, margin: "0 auto", padding: "24px 16px 60px", background: "#f4f6f0", minHeight: "100vh" },
  header: { textAlign: "center", marginBottom: 28 },
  titulo: { margin: "8px 0 4px", fontSize: 22, fontWeight: 700, color: "#1a3a2a" },
  sub: { margin: 0, fontSize: 13, color: "#5a7a6a", fontFamily: "sans-serif" },
  card: { background: "#fff", borderRadius: 14, padding: 22, marginBottom: 16, boxShadow: "0 2px 10px rgba(0,40,20,0.07)", border: "1px solid #deeade" },
  secTitulo: { margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#2a5a3a", fontFamily: "sans-serif" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "#4a6a5a", marginBottom: 5, fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.04em" },
  obrig: { color: "#c0392b", marginLeft: 2 },
  input: { width: "100%", padding: "10px 14px", border: "1.5px solid #c8ddd0", borderRadius: 8, fontSize: 15, fontFamily: "sans-serif", outline: "none", boxSizing: "border-box", background: "#fafdfa", color: "#1a3a2a" },
  inputErro: { border: "1.5px solid #e74c3c", background: "#fff8f8" },
  select: { width: "100%", padding: "10px 14px", border: "1.5px solid #c8ddd0", borderRadius: 8, fontSize: 15, fontFamily: "sans-serif", outline: "none", background: "#fafdfa", color: "#1a3a2a", cursor: "pointer", boxSizing: "border-box" },
  selectErro: { border: "1.5px solid #e74c3c", background: "#fff8f8" },
  btnEnviar: { width: "100%", padding: "15px", background: "#2a7a4a", color: "#fff", border: "none", borderRadius: 10, fontSize: 17, fontWeight: 700, cursor: "pointer", fontFamily: "sans-serif", marginTop: 8 },
  sucesso: { background: "#fff", borderRadius: 16, padding: 48, textAlign: "center", boxShadow: "0 4px 24px rgba(0,40,20,0.1)", border: "1px solid #deeade", maxWidth: 360, margin: "80px auto" },
  hint: { fontSize: 11, color: "#8aaa9a", fontFamily: "sans-serif", marginTop: 4 },
  erroMsg: { fontSize: 11, color: "#c0392b", fontFamily: "sans-serif", marginTop: 4 },
  obrigNote: { fontSize: 12, color: "#8aaa9a", fontFamily: "sans-serif", marginBottom: 16 },
};

const VAZIO = {
  nome: "", cpf: "", nascimento: "", tel1: "",
  emergNome: "", emergParentesco: "", emergTel: "",
  cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", estado: ""
};

const OBRIGATORIOS = ["nome","cpf","nascimento","tel1","emergNome","emergParentesco","emergTel","cep","logradouro","numero","bairro","cidade","estado"];

export default function Cadastro() {
  const [f, setF] = useState(VAZIO);
  const [erros, setErros] = useState({});
  const [enviado, setEnviado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [toast, setToast] = useState(null);

  function up(campo, val) { setF(prev => ({ ...prev, [campo]: val })); setErros(e => ({ ...e, [campo]: false })); }
  function showToast(msg, tipo = "ok") { setToast({ msg, tipo }); setTimeout(() => setToast(null), 3500); }

  async function buscarCep(cep) {
    const raw = cep.replace(/\D/g, "");
    if (raw.length !== 8) return;
    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
      const d = await res.json();
      if (!d.erro) {
        setF(prev => ({ ...prev, logradouro: d.logradouro || "", bairro: d.bairro || "", cidade: d.localidade || "", estado: d.uf || "" }));
        setErros(e => ({ ...e, logradouro: false, bairro: false, cidade: false, estado: false }));
      }
    } catch {}
    setBuscandoCep(false);
  }

  function validar() {
    const novosErros = {};
    OBRIGATORIOS.forEach(k => { if (!f[k]?.trim()) novosErros[k] = true; });
    setErros(novosErros);
    return Object.keys(novosErros).length === 0;
  }

  async function handleEnviar() {
    if (!validar()) { showToast("Preencha todos os campos obrigatórios.", "erro"); return; }
    setSalvando(true);
    try {
      await addPaciente(f);
      setEnviado(true);
    } catch { showToast("Erro ao salvar. Tente novamente.", "erro"); }
    setSalvando(false);
  }

  const inp = (campo) => ({ ...sc.input, ...(erros[campo] ? sc.inputErro : {}) });
  const sel = (campo) => ({ ...sc.select, ...(erros[campo] ? sc.selectErro : {}) });

  if (enviado) return (
    <div style={sc.root}>
      <div style={sc.sucesso}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
        <h2 style={{ color: "#1a4a2a", margin: "0 0 10px" }}>Cadastro realizado!</h2>
        <p style={{ color: "#4a6a5a", fontFamily: "sans-serif", textAlign: "center", lineHeight: 1.6 }}>
          Seus dados foram enviados ao consultório com sucesso.<br />Obrigado!
        </p>
      </div>
    </div>
  );

  return (
    <div style={sc.root}>
      <Toast toast={toast} />
      <header style={sc.header}>
        <div style={{ fontSize: 40 }}>🏥</div>
        <h1 style={sc.titulo}>Diego Ciriani — Psicólogo</h1>
        <p style={sc.sub}>Ficha de cadastro do paciente</p>
      </header>
      <p style={sc.obrigNote}>Todos os campos marcados com <span style={sc.obrig}>*</span> são obrigatórios.</p>

      {/* DADOS PESSOAIS */}
      <div style={sc.card}>
        <h3 style={sc.secTitulo}>Dados pessoais</h3>
        <div style={sc.grid2}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={sc.label}>Nome completo <span style={sc.obrig}>*</span></label>
            <input style={inp("nome")} value={f.nome} onChange={e => up("nome", e.target.value)} placeholder="Seu nome completo" />
            {erros.nome && <p style={sc.erroMsg}>Campo obrigatório</p>}
          </div>
          <div>
            <label style={sc.label}>CPF <span style={sc.obrig}>*</span></label>
            <input style={inp("cpf")} value={f.cpf} onChange={e => up("cpf", fCPF(e.target.value))} placeholder="000.000.000-00" />
            {erros.cpf && <p style={sc.erroMsg}>Campo obrigatório</p>}
          </div>
          <div>
            <label style={sc.label}>Data de nascimento <span style={sc.obrig}>*</span></label>
            <input style={inp("nascimento")} type="date" value={f.nascimento} onChange={e => up("nascimento", e.target.value)} />
            {erros.nascimento && <p style={sc.erroMsg}>Campo obrigatório</p>}
          </div>
        </div>
      </div>

      {/* CONTATO PRINCIPAL */}
      <div style={sc.card}>
        <h3 style={sc.secTitulo}>Telefone de contato</h3>
        <div>
          <label style={sc.label}>Telefone principal <span style={sc.obrig}>*</span></label>
          <input style={inp("tel1")} value={f.tel1} onChange={e => up("tel1", fTel(e.target.value))} placeholder="(11) 99999-9999" />
          {erros.tel1 && <p style={sc.erroMsg}>Campo obrigatório</p>}
        </div>
      </div>

      {/* CONTATO DE EMERGÊNCIA */}
      <div style={sc.card}>
        <h3 style={sc.secTitulo}>Contato de emergência</h3>
        <div style={sc.grid2}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={sc.label}>Nome do contato <span style={sc.obrig}>*</span></label>
            <input style={inp("emergNome")} value={f.emergNome} onChange={e => up("emergNome", e.target.value)} placeholder="Nome completo do contato" />
            {erros.emergNome && <p style={sc.erroMsg}>Campo obrigatório</p>}
          </div>
          <div>
            <label style={sc.label}>Grau de parentesco <span style={sc.obrig}>*</span></label>
            <select style={sel("emergParentesco")} value={f.emergParentesco} onChange={e => up("emergParentesco", e.target.value)}>
              <option value="">Selecione...</option>
              {PARENTESCOS.map(p => <option key={p}>{p}</option>)}
            </select>
            {erros.emergParentesco && <p style={sc.erroMsg}>Campo obrigatório</p>}
          </div>
          <div>
            <label style={sc.label}>Telefone <span style={sc.obrig}>*</span></label>
            <input style={inp("emergTel")} value={f.emergTel} onChange={e => up("emergTel", fTel(e.target.value))} placeholder="(11) 99999-9999" />
            {erros.emergTel && <p style={sc.erroMsg}>Campo obrigatório</p>}
          </div>
        </div>
      </div>

      {/* ENDEREÇO */}
      <div style={sc.card}>
        <h3 style={sc.secTitulo}>Endereço</h3>
        <div style={sc.grid2}>
          <div>
            <label style={sc.label}>CEP <span style={sc.obrig}>*</span></label>
            <input style={inp("cep")} value={f.cep}
              onChange={e => { const v = fCEP(e.target.value); up("cep", v); if (v.replace(/\D/g, "").length === 8) buscarCep(v); }}
              placeholder="00000-000" />
            {buscandoCep && <p style={sc.hint}>Buscando endereço...</p>}
            {erros.cep && <p style={sc.erroMsg}>Campo obrigatório</p>}
          </div>
          <div>
            <label style={sc.label}>Estado <span style={sc.obrig}>*</span></label>
            <input style={inp("estado")} value={f.estado} onChange={e => up("estado", e.target.value.toUpperCase())} placeholder="SP" maxLength={2} />
            {erros.estado && <p style={sc.erroMsg}>Campo obrigatório</p>}
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={sc.label}>Logradouro <span style={sc.obrig}>*</span></label>
            <input style={inp("logradouro")} value={f.logradouro} onChange={e => up("logradouro", e.target.value)} placeholder="Rua, Avenida..." />
            {erros.logradouro && <p style={sc.erroMsg}>Campo obrigatório</p>}
          </div>
          <div>
            <label style={sc.label}>Número <span style={sc.obrig}>*</span></label>
            <input style={inp("numero")} value={f.numero} onChange={e => up("numero", e.target.value)} placeholder="123" />
            {erros.numero && <p style={sc.erroMsg}>Campo obrigatório</p>}
          </div>
          <div>
            <label style={sc.label}>Complemento</label>
            <input style={sc.input} value={f.complemento} onChange={e => up("complemento", e.target.value)} placeholder="Apto, bloco..." />
          </div>
          <div>
            <label style={sc.label}>Bairro <span style={sc.obrig}>*</span></label>
            <input style={inp("bairro")} value={f.bairro} onChange={e => up("bairro", e.target.value)} placeholder="Bairro" />
            {erros.bairro && <p style={sc.erroMsg}>Campo obrigatório</p>}
          </div>
          <div>
            <label style={sc.label}>Cidade <span style={sc.obrig}>*</span></label>
            <input style={inp("cidade")} value={f.cidade} onChange={e => up("cidade", e.target.value)} placeholder="Cidade" />
            {erros.cidade && <p style={sc.erroMsg}>Campo obrigatório</p>}
          </div>
        </div>
      </div>

      <button style={{ ...sc.btnEnviar, opacity: salvando ? 0.7 : 1 }} onClick={handleEnviar} disabled={salvando}>
        {salvando ? "Enviando..." : "Enviar cadastro →"}
      </button>
      <p style={{ textAlign: "center", fontSize: 12, color: "#8aaa9a", fontFamily: "sans-serif", marginTop: 16 }}>
        Seus dados são confidenciais e protegidos pelo sigilo profissional.
      </p>
    </div>
  );
}
