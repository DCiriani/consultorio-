import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { getPacientes, deletePaciente, addPaciente, getPagamentos, addPagamento, deletePagamento } from "./db";
import { HOJE, FORMAS, chipColor, fCPF, fTel, fCEP, s } from "./utils";
import Toast from "./Toast";

const PARENTESCOS = ["Mãe","Pai","Filho(a)","Cônjuge / Parceiro(a)","Irmão / Irmã","Avô / Avó","Tio(a)","Primo(a)","Amigo(a)","Outro"];
const VAZIO_PAC = { nome:"", cpf:"", nascimento:"", tel1:"", emergNome:"", emergParentesco:"", emergTel:"", cep:"", logradouro:"", numero:"", complemento:"", bairro:"", cidade:"", estado:"" };
const OBRIG_PAC = ["nome","cpf","nascimento","tel1","emergNome","emergParentesco","emergTel","cep","logradouro","numero","bairro","cidade","estado"];

export default function Painel() {
  const nav = useNavigate();
  const [aba, setAba] = useState("pagamentos");
  const [pacientes, setPacientes] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [carregando, setCarregando] = useState(true);

  // form pagamento
  const [nome, setNome] = useState("");
  const [pacSel, setPacSel] = useState(null);
  const [pagamento, setPagamento] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(HOJE());
  const [sugestoes, setSugestoes] = useState([]);
  const [sidx, setSidx] = useState(-1);
  const [toast, setToast] = useState(null);
  const [detalhe, setDetalhe] = useState(null);
  const [modalCadastro, setModalCadastro] = useState(false);
  const [novoPac, setNovoPac] = useState(VAZIO_PAC);
  const [errosPac, setErrosPac] = useState({});
  const [salvandoPac, setSalvandoPac] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const nomeRef = useRef(null);

  function upPac(campo, val) { setNovoPac(prev => ({ ...prev, [campo]: val })); setErrosPac(e => ({ ...e, [campo]: false })); }

  async function buscarCepPainel(cep) {
    const raw = cep.replace(/\D/g, "");
    if (raw.length !== 8) return;
    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
      const d = await res.json();
      if (!d.erro) {
        setNovoPac(prev => ({ ...prev, logradouro: d.logradouro || "", bairro: d.bairro || "", cidade: d.localidade || "", estado: d.uf || "" }));
        setErrosPac(e => ({ ...e, logradouro: false, bairro: false, cidade: false, estado: false }));
      }
    } catch {}
    setBuscandoCep(false);
  }

  async function salvarNovoPaciente() {
    const novosErros = {};
    OBRIG_PAC.forEach(k => { if (!novoPac[k]?.trim()) novosErros[k] = true; });
    setErrosPac(novosErros);
    if (Object.keys(novosErros).length > 0) { showToast("Preencha todos os campos obrigatórios.", "erro"); return; }
    setSalvandoPac(true);
    try {
      const id = await addPaciente(novoPac);
      setPacientes(p => [...p, { id, ...novoPac }].sort((a,b) => a.nome.localeCompare(b.nome)));
      setNovoPac(VAZIO_PAC);
      setErrosPac({});
      setModalCadastro(false);
      showToast("Paciente cadastrado!");
    } catch { showToast("Erro ao salvar.", "erro"); }
    setSalvandoPac(false);
  }

  function showToast(msg, tipo = "ok") { setToast({ msg, tipo }); setTimeout(() => setToast(null), 2500); }

  useEffect(() => {
    (async () => {
      const [p, r] = await Promise.all([getPacientes(), getPagamentos()]);
      setPacientes(p); setRegistros(r); setCarregando(false);
    })();
  }, []);

  useEffect(() => {
    if (nome.trim().length < 2) { setSugestoes([]); return; }
    const q = nome.toLowerCase();
    setSugestoes(pacientes.filter(p => p.nome.toLowerCase().includes(q)).slice(0, 6));
    setSidx(-1);
  }, [nome, pacientes]);

  function selecionarPac(p) {
    setNome(p.nome); setPacSel(p);
    setSugestoes([]); setSidx(-1);
    setTimeout(() => document.getElementById("pag")?.focus(), 50);
  }

  function handleKeyDown(e) {
    if (!sugestoes.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setSidx(i => Math.min(i + 1, sugestoes.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSidx(i => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && sidx >= 0) { e.preventDefault(); selecionarPac(sugestoes[sidx]); }
    if (e.key === "Escape") setSugestoes([]);
  }

  async function registrar() {
    if (!nome || !pagamento) { showToast("Selecione o paciente e a forma de pagamento.", "erro"); return; }
    setSalvando(true);
    try {
      const novo = { data, nome, cpf: pacSel?.cpf || "", pagamento, valor: valor || "—" };
      const id = await addPagamento(novo);
      setRegistros(r => [{ id, ...novo }, ...r]);
      setNome(""); setPacSel(null); setPagamento(""); setValor("");
      nomeRef.current?.focus();
      showToast("Pagamento registrado!");
    } catch { showToast("Erro ao salvar.", "erro"); }
    setSalvando(false);
  }

  async function excluirReg(id) {
    await deletePagamento(id);
    setRegistros(r => r.filter(x => x.id !== id));
  }

  async function excluirPac(id) {
    await deletePaciente(id);
    setPacientes(p => p.filter(x => x.id !== id));
    showToast("Paciente removido.");
  }

  function exportar() {
    if (!registros.length) { showToast("Nenhum registro para exportar.", "erro"); return; }
    const ws_data = [
      ["Data", "Nome Completo", "CPF", "Forma de Pagamento", "Valor (R$)"],
      ...registros.map(r => [r.data, r.nome, r.cpf, r.pagamento, r.valor]),
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    ws["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 16 }, { wch: 20 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, "Pagamentos");
    const mes = new Date().toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" }).replace("/", "-");
    XLSX.writeFile(wb, `pagamentos-${mes}.xlsx`);
    showToast("Planilha exportada!");
  }

  const linkCadastro = window.location.origin + "/cadastro";

  function copiarLink() {
    navigator.clipboard.writeText(linkCadastro);
    showToast("Link copiado!");
  }

  if (carregando) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f4f6f0", fontFamily: "sans-serif", color: "#4a6a5a", fontSize: 16 }}>
      Carregando...
    </div>
  );

  return (
    <div style={s.root}>
      <Toast toast={toast} />
      {detalhe && <ModalFicha p={detalhe} onClose={() => setDetalhe(null)} />}
      {modalCadastro && (
        <ModalCadastro
          f={novoPac} up={upPac} erros={errosPac}
          salvando={salvandoPac} buscandoCep={buscandoCep}
          onCep={buscarCepPainel}
          onSalvar={salvarNovoPaciente}
          onClose={() => { setModalCadastro(false); setNovoPac(VAZIO_PAC); setErrosPac({}); }}
        />
      )}

      <header style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <div style={{ fontSize: 38 }}>📋</div>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#1a3a2a" }}>Consultório</h1>
          <p style={{ margin: 0, fontSize: 13, color: "#5a7a6a", fontFamily: "sans-serif" }}>Painel do psicólogo</p>
        </div>
      </header>

      {/* LINK DE CADASTRO */}
      <div style={{ ...s.card, background: "#e8f4ec", border: "1px solid #b0d8bc", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 20 }}>🔗</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#1a4a2a", fontFamily: "sans-serif" }}>Link de cadastro para pacientes</div>
            <code style={{ fontSize: 13, color: "#2a6a3a", wordBreak: "break-all" }}>{linkCadastro}</code>
          </div>
          <button style={{ ...s.btnPrimario, whiteSpace: "nowrap" }} onClick={copiarLink}>📋 Copiar link</button>
        </div>
      </div>

      {/* ABAS */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {["pagamentos", "pacientes"].map(a => (
          <button key={a} onClick={() => setAba(a)} style={{
            padding: "10px 20px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontFamily: "sans-serif",
            background: aba === a ? "#2a7a4a" : "#fff",
            color: aba === a ? "#fff" : "#4a6a5a",
            border: aba === a ? "1.5px solid #2a7a4a" : "1.5px solid #c8ddd0",
            fontWeight: aba === a ? 700 : 400,
          }}>
            {a === "pagamentos" ? `💳 Pagamentos (${registros.length})` : `👤 Pacientes (${pacientes.length})`}
          </button>
        ))}
      </div>

      {/* ABA PAGAMENTOS */}
      {aba === "pagamentos" && (
        <>
          <section style={s.card}>
            <h2 style={s.cardTitulo}>Registrar pagamento</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px", marginBottom: 20 }}>
              <div style={{ position: "relative", gridColumn: "1 / -1" }}>
                <label style={s.label}>Paciente</label>
                <input ref={nomeRef} style={s.inputGrande} placeholder="Digite o nome para buscar..."
                  value={nome} autoComplete="off"
                  onChange={e => { setNome(e.target.value); setPacSel(null); }}
                  onKeyDown={handleKeyDown}
                  onBlur={() => setTimeout(() => setSugestoes([]), 150)} />
                {sugestoes.length > 0 && (
                  <ul style={s.dropdown}>
                    {sugestoes.map((p, i) => (
                      <li key={i} style={{ ...s.dropdownItem, background: i === sidx ? "#e8f4ec" : "#fff" }}
                        onMouseDown={() => selecionarPac(p)}>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontWeight: 600 }}>{p.nome}</span>
                          <span style={{ color: "#888", fontSize: 12, marginLeft: 8 }}>{p.cpf}</span>
                        </div>
                        {p.nascimento && <span style={{ fontSize: 12, color: "#aaa" }}>nasc. {p.nascimento}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {pacSel && (
                <div style={{ gridColumn: "1 / -1", background: "#e8f4ec", borderRadius: 8, padding: "10px 14px", fontFamily: "sans-serif", fontSize: 13, color: "#1a4a2a" }}>
                  ✓ <strong>{pacSel.nome}</strong> — CPF: {pacSel.cpf} {pacSel.tel1 && `· Tel: ${pacSel.tel1}`}
                </div>
              )}

              <div>
                <label style={s.label}>Forma de pagamento</label>
                <select id="pag" style={s.select} value={pagamento} onChange={e => setPagamento(e.target.value)}>
                  <option value="">Selecione...</option>
                  {FORMAS.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label style={s.label}>Data</label>
                <input style={s.input} value={data} onChange={e => setData(e.target.value)} />
              </div>
              <div>
                <label style={s.label}>Valor (R$) — opcional</label>
                <input style={s.input} placeholder="ex: 200,00" value={valor} onChange={e => setValor(e.target.value)} />
              </div>
            </div>
            <button style={{ width: "100%", padding: 14, background: "#2a7a4a", color: "#fff", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "sans-serif", opacity: salvando ? 0.7 : 1 }}
              onClick={registrar} disabled={salvando}>
              {salvando ? "Salvando..." : "✓ Registrar pagamento"}
            </button>
          </section>

          {registros.length > 0 && (
            <section style={s.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h2 style={{ ...s.cardTitulo, marginBottom: 0 }}>
                  Registros do mês <span style={s.badge}>{registros.length}</span>
                </h2>
                <button style={{ padding: "8px 18px", background: "#1a4a2a", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "sans-serif" }}
                  onClick={exportar}>↓ Exportar .xlsx</button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={s.tabela}>
                  <thead><tr>{["Data", "Paciente", "CPF", "Pagamento", "Valor", ""].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {registros.map((r) => (
                      <tr key={r.id}>
                        <td style={s.td}>{r.data}</td>
                        <td style={{ ...s.td, fontWeight: 600 }}>{r.nome}</td>
                        <td style={s.td}>{r.cpf}</td>
                        <td style={s.td}><span style={{ ...s.chip, ...chipColor(r.pagamento) }}>{r.pagamento}</span></td>
                        <td style={s.td}>{r.valor !== "—" ? `R$ ${r.valor}` : "—"}</td>
                        <td style={s.td}><button style={s.btnPerigo} onClick={() => excluirReg(r.id)}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {registros.length === 0 && <div style={s.empty}>Nenhum pagamento registrado ainda.</div>}
        </>
      )}

      {/* ABA PACIENTES */}
      {aba === "pacientes" && (
        <section style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <h2 style={{ ...s.cardTitulo, marginBottom: 0 }}>Pacientes cadastrados</h2>
            <button style={{ ...s.btnPrimario, fontSize: 13 }} onClick={() => setModalCadastro(true)}>+ Cadastrar manual</button>
          </div>
          {pacientes.length === 0
            ? <div style={s.empty}>Nenhum paciente ainda.<br />Copie o link acima e envie para seus pacientes.</div>
            : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {pacientes.map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#f7faf8", borderRadius: 10, border: "1px solid #e0ede5" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "#1a3a2a" }}>{p.nome}</div>
                      <div style={{ fontSize: 13, color: "#5a7a6a", fontFamily: "sans-serif", marginTop: 2 }}>
                        CPF: {p.cpf} {p.tel1 && `· ${p.tel1}`} {p.cidade && `· ${p.cidade}`}
                      </div>
                    </div>
                    <button style={{ padding: "6px 14px", background: "#e8f4ec", border: "1px solid #b0d8bc", borderRadius: 6, cursor: "pointer", fontSize: 13, fontFamily: "sans-serif", color: "#1a4a2a", marginRight: 4 }}
                      onClick={() => setDetalhe(p)}>Ver ficha</button>
                    <button style={s.btnPerigo} onClick={() => excluirPac(p.id)}>✕</button>
                  </div>
                ))}
              </div>
            )}
        </section>
      )}
    </div>
  );
}

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid #eef4ec", fontFamily: "sans-serif" }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#4a6a5a", textTransform: "uppercase", width: 110, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 14, color: "#1a3a2a" }}>{value}</span>
    </div>
  );
}

function ModalFicha({ p, onClose }) {
  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h3 style={{ margin: 0, color: "#1a3a2a", fontSize: 18 }}>{p.nome}</h3>
          <button style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }} onClick={onClose}>✕</button>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#2a5a3a", fontFamily: "sans-serif", textTransform: "uppercase", marginBottom: 8, marginTop: 4 }}>Dados pessoais</div>
        <Row label="CPF" value={p.cpf} />
        <Row label="Nascimento" value={p.nascimento} />
        <Row label="Telefone" value={p.tel1} />
        <div style={{ fontSize: 12, fontWeight: 700, color: "#2a5a3a", fontFamily: "sans-serif", textTransform: "uppercase", margin: "14px 0 8px" }}>Contato de emergência</div>
        <Row label="Nome" value={p.emergNome} />
        <Row label="Parentesco" value={p.emergParentesco} />
        <Row label="Telefone" value={p.emergTel} />
        <div style={{ fontSize: 12, fontWeight: 700, color: "#2a5a3a", fontFamily: "sans-serif", textTransform: "uppercase", margin: "14px 0 8px" }}>Endereço</div>
        <Row label="CEP" value={p.cep} />
        <Row label="Logradouro" value={[p.logradouro, p.numero, p.complemento].filter(Boolean).join(", ")} />
        <Row label="Bairro" value={p.bairro} />
        <Row label="Cidade/UF" value={[p.cidade, p.estado].filter(Boolean).join(" - ")} />
      </div>
    </div>
  );
}

// ── MODAL CADASTRO MANUAL ────────────────────────────────────────────────────
const ms = {
  label: { display: "block", fontSize: 11, fontWeight: 700, color: "#4a6a5a", marginBottom: 4, fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.04em" },
  obrig: { color: "#c0392b" },
  input: { width: "100%", padding: "9px 12px", border: "1.5px solid #c8ddd0", borderRadius: 7, fontSize: 14, fontFamily: "sans-serif", outline: "none", boxSizing: "border-box", background: "#fafdfa", color: "#1a3a2a" },
  inputErr: { border: "1.5px solid #e74c3c", background: "#fff8f8" },
  select: { width: "100%", padding: "9px 12px", border: "1.5px solid #c8ddd0", borderRadius: 7, fontSize: 14, fontFamily: "sans-serif", outline: "none", background: "#fafdfa", color: "#1a3a2a", cursor: "pointer", boxSizing: "border-box" },
  selectErr: { border: "1.5px solid #e74c3c", background: "#fff8f8" },
  secTit: { margin: "16px 0 10px", fontSize: 13, fontWeight: 700, color: "#2a5a3a", fontFamily: "sans-serif" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 14px" },
  err: { fontSize: 11, color: "#c0392b", fontFamily: "sans-serif", marginTop: 3 },
  hint: { fontSize: 11, color: "#8aaa9a", fontFamily: "sans-serif", marginTop: 3 },
};

function ModalCadastro({ f, up, erros, salvando, buscandoCep, onCep, onSalvar, onClose }) {
  const inp = (k) => ({ ...ms.input, ...(erros[k] ? ms.inputErr : {}) });
  const sel = (k) => ({ ...ms.select, ...(erros[k] ? ms.selectErr : {}) });
  const Lbl = ({ campo, txt }) => <label style={ms.label}>{txt} <span style={ms.obrig}>*</span></label>;
  const Err = ({ k }) => erros[k] ? <p style={ms.err}>Obrigatório</p> : null;

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={{ ...s.modal, maxWidth: 540 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h3 style={{ margin: 0, color: "#1a3a2a", fontSize: 17 }}>Novo paciente</h3>
          <button style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }} onClick={onClose}>✕</button>
        </div>
        <p style={{ fontSize: 12, color: "#8aaa9a", fontFamily: "sans-serif", marginTop: 0, marginBottom: 4 }}>Todos os campos marcados com <span style={ms.obrig}>*</span> são obrigatórios.</p>

        <div style={ms.secTit}>Dados pessoais</div>
        <div style={ms.grid2}>
          <div style={{ gridColumn: "1 / -1" }}>
            <Lbl campo="nome" txt="Nome completo" />
            <input style={inp("nome")} value={f.nome} onChange={e => up("nome", e.target.value)} placeholder="Nome completo" />
            <Err k="nome" />
          </div>
          <div>
            <Lbl campo="cpf" txt="CPF" />
            <input style={inp("cpf")} value={f.cpf} onChange={e => up("cpf", fCPF(e.target.value))} placeholder="000.000.000-00" />
            <Err k="cpf" />
          </div>
          <div>
            <Lbl campo="nascimento" txt="Nascimento" />
            <input style={inp("nascimento")} type="date" value={f.nascimento} onChange={e => up("nascimento", e.target.value)} />
            <Err k="nascimento" />
          </div>
        </div>

        <div style={ms.secTit}>Contato</div>
        <div>
          <Lbl campo="tel1" txt="Telefone principal" />
          <input style={inp("tel1")} value={f.tel1} onChange={e => up("tel1", fTel(e.target.value))} placeholder="(11) 99999-9999" />
          <Err k="tel1" />
        </div>

        <div style={ms.secTit}>Contato de emergência</div>
        <div style={ms.grid2}>
          <div style={{ gridColumn: "1 / -1" }}>
            <Lbl campo="emergNome" txt="Nome do contato" />
            <input style={inp("emergNome")} value={f.emergNome} onChange={e => up("emergNome", e.target.value)} placeholder="Nome completo" />
            <Err k="emergNome" />
          </div>
          <div>
            <Lbl campo="emergParentesco" txt="Parentesco" />
            <select style={sel("emergParentesco")} value={f.emergParentesco} onChange={e => up("emergParentesco", e.target.value)}>
              <option value="">Selecione...</option>
              {PARENTESCOS.map(p => <option key={p}>{p}</option>)}
            </select>
            <Err k="emergParentesco" />
          </div>
          <div>
            <Lbl campo="emergTel" txt="Telefone" />
            <input style={inp("emergTel")} value={f.emergTel} onChange={e => up("emergTel", fTel(e.target.value))} placeholder="(11) 99999-9999" />
            <Err k="emergTel" />
          </div>
        </div>

        <div style={ms.secTit}>Endereço</div>
        <div style={ms.grid2}>
          <div>
            <Lbl campo="cep" txt="CEP" />
            <input style={inp("cep")} value={f.cep}
              onChange={e => { const v = fCEP(e.target.value); up("cep", v); if (v.replace(/\D/g,"").length===8) onCep(v); }}
              placeholder="00000-000" />
            {buscandoCep && <p style={ms.hint}>Buscando...</p>}
            <Err k="cep" />
          </div>
          <div>
            <Lbl campo="estado" txt="Estado" />
            <input style={inp("estado")} value={f.estado} onChange={e => up("estado", e.target.value.toUpperCase())} placeholder="SP" maxLength={2} />
            <Err k="estado" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <Lbl campo="logradouro" txt="Logradouro" />
            <input style={inp("logradouro")} value={f.logradouro} onChange={e => up("logradouro", e.target.value)} placeholder="Rua, Avenida..." />
            <Err k="logradouro" />
          </div>
          <div>
            <Lbl campo="numero" txt="Número" />
            <input style={inp("numero")} value={f.numero} onChange={e => up("numero", e.target.value)} placeholder="123" />
            <Err k="numero" />
          </div>
          <div>
            <label style={ms.label}>Complemento</label>
            <input style={ms.input} value={f.complemento} onChange={e => up("complemento", e.target.value)} placeholder="Apto..." />
          </div>
          <div>
            <Lbl campo="bairro" txt="Bairro" />
            <input style={inp("bairro")} value={f.bairro} onChange={e => up("bairro", e.target.value)} placeholder="Bairro" />
            <Err k="bairro" />
          </div>
          <div>
            <Lbl campo="cidade" txt="Cidade" />
            <input style={inp("cidade")} value={f.cidade} onChange={e => up("cidade", e.target.value)} placeholder="Cidade" />
            <Err k="cidade" />
          </div>
        </div>

        <button style={{ width: "100%", marginTop: 20, padding: "13px", background: "#2a7a4a", color: "#fff", border: "none", borderRadius: 9, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "sans-serif", opacity: salvando ? 0.7 : 1 }}
          onClick={onSalvar} disabled={salvando}>
          {salvando ? "Salvando..." : "✓ Salvar paciente"}
        </button>
      </div>
    </div>
  );
}
