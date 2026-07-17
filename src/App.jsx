import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import logoEspacoCiriani from "./assets/logo-espaco-ciriani.png";
import { PieChart, Pie, Cell, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, setDoc, query, orderBy, serverTimestamp } from "firebase/firestore";
import { getToken } from "firebase/messaging";
import { getMessagingIfSupported } from "./firebase-messaging";
import { auth, db } from "./firebase";
import { PaginaAvaliacaoPaciente, AbaAvaliacoes } from "./AvaliacoesModulo";

// ── HELPERS ──────────────────────────────────────────────────────────────────
const fCPF = r => { const d = r.replace(/\D/g,"").slice(0,11); return d.replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d{1,2})$/,"$1-$2"); };
const fTel = r => { const d = r.replace(/\D/g,"").slice(0,11); return d.length<=10?d.replace(/(\d{2})(\d{4})(\d{0,4})/,"($1) $2-$3").replace(/-$/,""):d.replace(/(\d{2})(\d{5})(\d{0,4})/,"($1) $2-$3").replace(/-$/,""); };
const fData = r => { const d = r.replace(/\D/g,"").slice(0,8); return d.replace(/(\d{2})(\d)/,"$1/$2").replace(/(\d{2})(\d)/,"$1/$2"); };
function criarReconhecimentoVoz(onResultado, onErro){
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SpeechRecognition){
    if(onErro) onErro("Seu navegador não suporta reconhecimento de voz. Use o Chrome.");
    return null;
  }
  const rec = new SpeechRecognition();
  rec.lang = "pt-BR";
  rec.continuous = true;
  rec.interimResults = false;
  rec.onresult = (e) => {
    let texto = "";
    for(let i=e.resultIndex; i<e.results.length; i++){
      if(e.results[i].isFinal) texto += e.results[i][0].transcript;
    }
    if(texto.trim()) onResultado(texto.trim());
  };
  rec.onerror = (e) => {
    if(onErro) onErro(e.error==="not-allowed" ? "Permissão de microfone negada." : "Erro no reconhecimento de voz.");
  };
  return rec;
}
const fCEP = r => { const d=r.replace(/\D/g,"").slice(0,8); return d.replace(/(\d{5})(\d{0,3})/,"$1-$2").replace(/-$/,""); };
const HOJE = () => new Date().toLocaleDateString("pt-BR");
const FORMAS = ["Pix","Cartão de Débito","Cartão de Crédito","Dinheiro"];

// ── HELPERS DO DASHBOARD ─────────────────────────────────────────────────────
const DIAS_SEMANA_CURTO = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

function parseDataBR(str){
  // "23/06/2026" -> Date local, ou null se inválido
  if(!str) return null;
  const [d,m,a] = str.split("/").map(Number);
  if(!d||!m||!a) return null;
  return new Date(a,m-1,d);
}

function valorParaNumero(valor){
  if(!valor || valor==="—") return 0;
  const n = parseFloat(String(valor).replace(/\./g,"").replace(",","."));
  return isNaN(n) ? 0 : n;
}

function inicioDaSemana(data){
  // Retorna a segunda-feira da semana de "data"
  const d = new Date(data);
  const diaSemana = d.getDay(); // 0=domingo
  const diff = diaSemana===0 ? -6 : 1-diaSemana;
  d.setDate(d.getDate()+diff);
  d.setHours(0,0,0,0);
  return d;
}

function formatBRL(n){
  return `R$ ${n.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
}

const PARENTESCOS = ["Mãe","Pai","Filho(a)","Cônjuge / Parceiro(a)","Irmão / Irmã","Avô / Avó","Tio(a)","Primo(a)","Amigo(a)","Outro"];
const OBRIG_PAC = ["nome","cpf","nascimento","tel1","emergNome","emergParentesco","emergTel","cep","logradouro","numero","bairro","cidade","estado"];
const OBRIG_TIT = ["nome","cpf"];
const VAZIO_PAC = {nome:"",cpf:"",nascimento:"",tel1:"",emergNome:"",emergParentesco:"",emergTel:"",cep:"",logradouro:"",numero:"",complemento:"",bairro:"",cidade:"",estado:"",profissional:""};
function formatarTextoAnotacao(texto){
  if(!texto)return null;
  const partes=[];
  const regex=/(\*\*(.+?)\*\*)|(__(.+?)__)|(==(.+?)==)/g;
  let ultimoIndex=0;
  let match;
  let key=0;
  while((match=regex.exec(texto))!==null){
    if(match.index>ultimoIndex){
      partes.push(texto.slice(ultimoIndex,match.index));
    }
    if(match[1]){
      partes.push(<strong key={key++}>{match[2]}</strong>);
    }else if(match[3]){
      partes.push(<u key={key++}>{match[4]}</u>);
    }else if(match[5]){
      partes.push(<mark key={key++} style={{background:"#fff3a3",padding:"0 2px"}}>{match[6]}</mark>);
    }
    ultimoIndex=regex.lastIndex;
  }
  if(ultimoIndex<texto.length){
    partes.push(texto.slice(ultimoIndex));
  }
  return partes;
}
function chipColor(p){
  if(p==="Pix")return{background:"#d4edda",color:"#155724"};
  if(p==="Dinheiro")return{background:"#fff3cd",color:"#856404"};
  if(p?.includes("Débito"))return{background:"#cce5ff",color:"#004085"};
  if(p?.includes("Crédito"))return{background:"#f8d7da",color:"#721c24"};
  return{background:"#e2e3e5",color:"#383d41"};
}

// ── STORAGE ───────────────────────────────────────────────────────────────────
// ── FIRESTORE ─────────────────────────────────────────────────────────────────
const COLECOES = { pac: "pacientes", reg: "pagamentos", tit: "titulares", evol: "evolucoes", age: "agenda" };

async function load(chave){
  try{
    const snap = await getDocs(collection(db, COLECOES[chave]));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }catch(e){ console.error(e); return []; }
}

async function addItem(chave, dados){
  const ref = await addDoc(collection(db, COLECOES[chave]), { ...dados, criadoEm: serverTimestamp() });
  return ref.id;
}

async function deleteItem(chave, id){
  try{ await deleteDoc(doc(db, COLECOES[chave], id)); }catch(e){ console.error(e); }
}

async function updateItem(chave, id, dados){
  try{ await updateDoc(doc(db, COLECOES[chave], id), dados); }catch(e){ console.error(e); }
}

// ── TOAST ─────────────────────────────────────────────────────────────────────
function Toast({t}){
  if(!t)return null;
  return <div style={{position:"fixed",top:20,right:20,zIndex:9999,background:t.tipo==="erro"?"#c0392b":"#1a6b3c",color:"#fff",padding:"12px 20px",borderRadius:8,fontFamily:"sans-serif",fontSize:14,fontWeight:600,boxShadow:"0 4px 20px rgba(0,0,0,0.25)"}}>{t.msg}</div>;
}

// ── TELA DE LOGIN ─────────────────────────────────────────────────────────────
function Login({onLogin}){
  const [email,setEmail]=useState("");
  const [senha,setSenha]=useState("");
  const [erro,setErro]=useState("");
  const [carregando,setCarregando]=useState(false);
  const [mostrarSenha,setMostrarSenha]=useState(false);

  async function handleLogin(e){
    e.preventDefault();
    setErro("");setCarregando(true);
    try{
      await signInWithEmailAndPassword(auth, email.trim(), senha);
      onLogin();
    }catch(err){
      setErro("E-mail ou senha incorretos.");
    }
    setCarregando(false);
  }

  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"linear-gradient(135deg,#1a4a2a 0%,#2a7a4a 100%)",padding:"24px 16px",boxSizing:"border-box"}}>
      <div style={{background:"#fff",borderRadius:20,padding:"40px 32px",width:"100%",maxWidth:400,boxShadow:"0 20px 60px rgba(0,0,0,0.3)",boxSizing:"border-box"}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <img src={logoEspacoCiriani} alt="Espaço Ciriani" style={{width:56,height:56,marginBottom:12}}/>
          <h1 style={{margin:"0 0 4px",fontSize:22,fontWeight:600,color:"#1a3a2a",fontFamily:"Georgia,serif"}}>Espaço Ciriani</h1>
          <p style={{margin:0,fontSize:13,color:"#8aaa9a",fontFamily:"sans-serif"}}>Acesso restrito</p>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{marginBottom:16}}>
            <label style={{display:"block",fontSize:12,fontWeight:700,color:"#4a6a5a",marginBottom:6,fontFamily:"sans-serif",textTransform:"uppercase",letterSpacing:"0.04em"}}>E-mail</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="seu@email.com" required
              style={{width:"100%",padding:"12px 14px",border:"1.5px solid #c8ddd0",borderRadius:8,fontSize:15,fontFamily:"sans-serif",outline:"none",boxSizing:"border-box",background:"#fafdfa",color:"#1a3a2a"}}/>
          </div>
          <div style={{marginBottom:8,position:"relative"}}>
            <label style={{display:"block",fontSize:12,fontWeight:700,color:"#4a6a5a",marginBottom:6,fontFamily:"sans-serif",textTransform:"uppercase",letterSpacing:"0.04em"}}>Senha</label>
            <input type={mostrarSenha?"text":"password"} value={senha} onChange={e=>setSenha(e.target.value)} placeholder="••••••••" required
              style={{width:"100%",padding:"12px 44px 12px 14px",border:"1.5px solid #c8ddd0",borderRadius:8,fontSize:15,fontFamily:"sans-serif",outline:"none",boxSizing:"border-box",background:"#fafdfa",color:"#1a3a2a"}}/>
            <button type="button" onClick={()=>setMostrarSenha(v=>!v)}
              style={{position:"absolute",right:12,top:34,background:"none",border:"none",cursor:"pointer",color:"#8aaa9a",fontSize:16}}>
              {mostrarSenha?"🙈":"👁"}
            </button>
          </div>
          {erro&&<p style={{color:"#c0392b",fontFamily:"sans-serif",fontSize:13,marginBottom:12,textAlign:"center"}}>{erro}</p>}
          <button type="submit" disabled={carregando}
            style={{width:"100%",padding:12,background:"#2a7a4a",color:"#fff",border:"none",borderRadius:10,fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"sans-serif",marginTop:8,opacity:carregando?0.7:1}}>
            {carregando?"Entrando...":"Entrar →"}
          </button>
        </form>

        <p style={{textAlign:"center",fontSize:11,color:"#c8ddd0",fontFamily:"sans-serif",marginTop:24,marginBottom:0}}>
          Acesso exclusivo para profissionais do Espaço Ciriani
        </p>
      </div>
    </div>
  );
}

// ── LABEL / ERRO ──────────────────────────────────────────────────────────────
const LBL = ({t,o}) => <label style={{display:"block",fontSize:11,fontWeight:700,color:"#4a6a5a",marginBottom:4,fontFamily:"sans-serif",textTransform:"uppercase",letterSpacing:"0.04em"}}>{t}{o&&<span style={{color:"#c0392b",marginLeft:2}}>*</span>}</label>;
const ERR = ({s}) => s?<p style={{fontSize:11,color:"#c0392b",fontFamily:"sans-serif",marginTop:3,marginBottom:0}}>Obrigatório</p>:null;
const inp = (err) => ({width:"100%",padding:"9px 12px",border:`1.5px solid ${err?"#e74c3c":"#c8ddd0"}`,borderRadius:7,fontSize:14,fontFamily:"sans-serif",outline:"none",boxSizing:"border-box",background:err?"#fff8f8":"#fafdfa",color:"#1a3a2a"});
const sel = (err) => ({...inp(err),cursor:"pointer"});
const CARD = {background:"#fff",borderRadius:12,padding:18,marginBottom:14,border:"1px solid #deeade"};
const G2 = {display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"};
const SEC = {margin:"0 0 12px",fontSize:13,fontWeight:700,color:"#2a5a3a",fontFamily:"sans-serif"};
{/* ════════════════════════════════════════════════════════════════════
   PARTE 1 — Componente de seleção de profissional
   Cole isto ANTES da função FormPaciente (que começa na linha 138).
   ════════════════════════════════════════════════════════════════════ */}
const STATUS_SESSAO = [
  { id: "compareceu", label: "✅ Compareceu", cor: "#2a7a4a" },
  { id: "falta_sem_justificativa", label: "❌ Faltou sem justificativa (sem direito a remarcação)", cor: "#c0392b" },
  { id: "falta_justificativa", label: "🏥 Faltou com justificativa - ex. saúde (com direito a remarcação)", cor: "#B9762F" },
  { id: "remarcacao_dentro_prazo", label: "🔄 Remarcação dentro do prazo +4h (com direito a remarcação)", cor: "#1a4a8a" },
  { id: "remarcacao_fora_prazo", label: "⚠️ Remarcação fora do prazo -4h (sem direito a remarcação)", cor: "#8a5a1a" },
];

const STATUS_TEXTO = {
  compareceu: "Sessão realizada normalmente. Paciente compareceu.",
  falta_sem_justificativa: "Paciente faltou à sessão sem justificativa. Sem direito a remarcação.",
  falta_justificativa: "Paciente faltou à sessão com justificativa (ex. saúde). Com direito a remarcação.",
  remarcacao_dentro_prazo: "Paciente solicitou remarcação dentro do prazo (mais de 4h de antecedência). Com direito a remarcação.",
  remarcacao_fora_prazo: "Paciente solicitou remarcação fora do prazo (menos de 4h de antecedência). Sem direito a remarcação.",
};
const PROFISSIONAIS = [
  { id: "diego", nome: "Diego Ciriani", titulo: "Psicólogo" },
  { id: "rhania", nome: "Rhania Mulia", titulo: "Psicóloga" },
];

function SeletorProfissional({ onEscolher }) {
  return (
    <div style={{fontFamily:"Georgia,serif",maxWidth:420,margin:"0 auto",padding:"60px 20px",minHeight:"100vh",background:"#f4f6f0",display:"flex",flexDirection:"column",justifyContent:"center"}}>
      <div style={{textAlign:"center",marginBottom:32}}>
        <img src={logoEspacoCiriani} alt="Espaço Ciriani" style={{width:48,height:48,marginBottom:10}}/>
        <h1 style={{margin:"0 0 6px",fontSize:22,fontWeight:700,color:"#1a3a2a"}}>Espaço Ciriani</h1>
        <p style={{margin:0,fontSize:13,color:"#5a7a6a",fontFamily:"sans-serif"}}>Com qual profissional você será atendido(a)?</p>
      </div>

      {PROFISSIONAIS.map(p=>(
        <button
          key={p.id}
          onClick={()=>onEscolher(p.id)}
          style={{
            display:"block",
            width:"100%",
            textAlign:"left",
            background:"#fff",
            border:"1.5px solid #c8ddd0",
            borderRadius:12,
            padding:"18px 20px",
            marginBottom:14,
            cursor:"pointer",
            fontFamily:"sans-serif"
          }}
        >
          <div style={{fontSize:12,fontWeight:700,color:"#2a7a4a",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>
            {p.titulo}
          </div>
          <div style={{fontSize:17,fontWeight:700,color:"#1a3a2a"}}>
            {p.nome}
          </div>
        </button>
      ))}
    </div>
  );
}
// ── FORM PACIENTE ─────────────────────────────────────────────────────────────
function FormPaciente({onSalvo,onVoltar,titulo,salvando,profissional,dadosIniciais}){
  const [f,setF]=useState(dadosIniciais ? {...VAZIO_PAC,...dadosIniciais} : {...VAZIO_PAC,profissional:profissional||""});
  const [erros,setErros]=useState({});
  const [buscando,setBuscando]=useState(false);
  const up=(c,v)=>{setF(p=>({...p,[c]:v}));setErros(e=>({...e,[c]:false}));};

  async function buscarCep(cep){
    const r=cep.replace(/\D/g,"");if(r.length!==8)return;
    setBuscando(true);
    try{const res=await fetch(`https://viacep.com.br/ws/${r}/json/`);const d=await res.json();
      if(!d.erro){setF(p=>({...p,logradouro:d.logradouro||"",bairro:d.bairro||"",cidade:d.localidade||"",estado:d.uf||""}));setErros(e=>({...e,logradouro:false,bairro:false,cidade:false,estado:false}));}
    }catch{}setBuscando(false);
  }

  function validar(){const e={};OBRIG_PAC.forEach(k=>{if(!f[k]?.trim())e[k]=true;});setErros(e);return Object.keys(e).length===0;}

  return(
    <div style={{fontFamily:"Georgia,serif",maxWidth:560,margin:"0 auto",padding:"20px 16px 60px",background:"#f4f6f0",minHeight:"100vh"}}>
      {onVoltar&&<button onClick={onVoltar} style={{background:"none",border:"none",color:"#2a7a4a",cursor:"pointer",fontFamily:"sans-serif",fontSize:13,marginBottom:16,padding:0}}>← Voltar</button>}
      <div style={{textAlign:"center",marginBottom:22}}>
        <img src={logoEspacoCiriani} alt="Espaço Ciriani" style={{width:42,height:42}}/>
        <h1 style={{margin:"6px 0 2px",fontSize:20,fontWeight:700,color:"#1a3a2a"}}>{titulo||"Ficha de cadastro"}</h1>
        {profissional&&<p style={{margin:"2px 0 0",fontSize:13,fontWeight:600,color:"#2a7a4a",fontFamily:"sans-serif"}}>{PROFISSIONAIS.find(p=>p.id===profissional)?.titulo} {PROFISSIONAIS.find(p=>p.id===profissional)?.nome}</p>}
        <p style={{margin:"6px 0 0",fontSize:12,color:"#5a7a6a",fontFamily:"sans-serif"}}>Todos os campos com <span style={{color:"#c0392b"}}>*</span> são obrigatórios</p>
      </div>

      <div style={CARD}>
        <h3 style={SEC}>Dados pessoais</h3>
        <div style={G2}>
          <div style={{gridColumn:"1/-1"}}><LBL t="Nome completo" o/><input style={inp(erros.nome)} value={f.nome} onChange={e=>up("nome",e.target.value)} placeholder="Nome completo"/><ERR s={erros.nome}/></div>
          <div><LBL t="CPF" o/><input style={inp(erros.cpf)} value={f.cpf} onChange={e=>up("cpf",fCPF(e.target.value))} placeholder="000.000.000-00"/><ERR s={erros.cpf}/></div>
          <div><LBL t="Nascimento" o/><input style={inp(erros.nascimento)} type="text" inputMode="numeric" placeholder="DD/MM/AAAA" maxLength={10} value={f.nascimento} onChange={e=>up("nascimento",fData(e.target.value))}/><ERR s={erros.nascimento}/></div>
        </div>
      </div>

      <div style={CARD}>
        <h3 style={SEC}>Telefone</h3>
        <LBL t="Telefone principal" o/>
        <input style={inp(erros.tel1)} value={f.tel1} onChange={e=>up("tel1",fTel(e.target.value))} placeholder="(11) 99999-9999"/>
        <ERR s={erros.tel1}/>
      </div>

      <div style={CARD}>
        <h3 style={SEC}>Contato de emergência</h3>
        <div style={G2}>
          <div style={{gridColumn:"1/-1"}}><LBL t="Nome do contato" o/><input style={inp(erros.emergNome)} value={f.emergNome} onChange={e=>up("emergNome",e.target.value)} placeholder="Nome completo"/><ERR s={erros.emergNome}/></div>
          <div><LBL t="Grau de parentesco" o/><select style={sel(erros.emergParentesco)} value={f.emergParentesco} onChange={e=>up("emergParentesco",e.target.value)}><option value="">Selecione...</option>{PARENTESCOS.map(p=><option key={p}>{p}</option>)}</select><ERR s={erros.emergParentesco}/></div>
          <div><LBL t="Telefone" o/><input style={inp(erros.emergTel)} value={f.emergTel} onChange={e=>up("emergTel",fTel(e.target.value))} placeholder="(11) 99999-9999"/><ERR s={erros.emergTel}/></div>
        </div>
      </div>

      <div style={CARD}>
        <h3 style={SEC}>Endereço</h3>
        <div style={G2}>
          <div><LBL t="CEP" o/><input style={inp(erros.cep)} value={f.cep} onChange={e=>{const v=fCEP(e.target.value);up("cep",v);if(v.replace(/\D/g,"").length===8)buscarCep(v);}} placeholder="00000-000"/>{buscando&&<p style={{fontSize:11,color:"#8aaa9a",fontFamily:"sans-serif",marginTop:3}}>Buscando...</p>}<ERR s={erros.cep}/></div>
          <div><LBL t="Estado" o/><input style={inp(erros.estado)} value={f.estado} onChange={e=>up("estado",e.target.value.toUpperCase())} placeholder="SP" maxLength={2}/><ERR s={erros.estado}/></div>
          <div style={{gridColumn:"1/-1"}}><LBL t="Logradouro" o/><input style={inp(erros.logradouro)} value={f.logradouro} onChange={e=>up("logradouro",e.target.value)} placeholder="Rua, Avenida..."/><ERR s={erros.logradouro}/></div>
          <div><LBL t="Número" o/><input style={inp(erros.numero)} value={f.numero} onChange={e=>up("numero",e.target.value)} placeholder="123"/><ERR s={erros.numero}/></div>
          <div><LBL t="Complemento"/><input style={inp(false)} value={f.complemento} onChange={e=>up("complemento",e.target.value)} placeholder="Apto..."/></div>
          <div><LBL t="Bairro" o/><input style={inp(erros.bairro)} value={f.bairro} onChange={e=>up("bairro",e.target.value)} placeholder="Bairro"/><ERR s={erros.bairro}/></div>
          <div><LBL t="Cidade" o/><input style={inp(erros.cidade)} value={f.cidade} onChange={e=>up("cidade",e.target.value)} placeholder="Cidade"/><ERR s={erros.cidade}/></div>
        </div>
      </div>

      <button onClick={()=>{if(validar())onSalvo(f);}} disabled={salvando} style={{width:"100%",padding:12,background:"#2a7a4a",color:"#fff",border:"none",borderRadius:10,fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"sans-serif",opacity:salvando?0.7:1}}>
        {salvando?"Salvando...":"Enviar cadastro →"}
      </button>
      <p style={{textAlign:"center",fontSize:11,color:"#8aaa9a",fontFamily:"sans-serif",marginTop:12}}>Dados confidenciais protegidos pelo sigilo profissional.</p>
    </div>
  );
}
// ── MODAL FICHA ───────────────────────────────────────────────────────────────
function ModalFicha({p,titulares,registros,evolucoes,setEvolucoes,showT,pacientes,setPacientes,onClose}){
  const [abaModal,setAbaModal]=useState("dados");
  const [filtroAno,setFiltroAno]=useState("todos");
  const [filtroMes,setFiltroMes]=useState("todos");
  const Row=({l,v})=>v?<div style={{display:"flex",gap:12,padding:"8px 0",borderBottom:"1px solid #eef4ec",fontFamily:"sans-serif"}}><span style={{fontSize:11,fontWeight:700,color:"#4a6a5a",textTransform:"uppercase",width:110,flexShrink:0}}>{l}</span><span style={{fontSize:14,color:"#1a3a2a"}}>{v}</span></div>:null;
  const tits=titulares.filter(t=>t.pacienteId===p.id);
  const pacienteAtual=pacientes.find(x=>x.id===p.id)||p;

  async function atualizarTipoPagamento(novoTipo){
    let dados={tipoPagamento:novoTipo};
    if(novoTipo==="pacote4")dados.sessoesRestantes=4;
    else if(novoTipo==="pacote8")dados.sessoesRestantes=8;
    else dados.sessoesRestantes=null;
    if(novoTipo==="pacote4"||novoTipo==="pacote8")dados.avisarPacote=true;
    await updateItem("pac",p.id,dados);
    setPacientes(pacientes.map(x=>x.id===p.id?{...x,...dados}:x));
    showT("Plano de pagamento atualizado.");
  }

  async function ajustarSessoesRestantes(delta){
    const atual=pacienteAtual.sessoesRestantes ?? 0;
    const novo=Math.max(0,atual+delta);
    await updateItem("pac",p.id,{sessoesRestantes:novo});
    setPacientes(pacientes.map(x=>x.id===p.id?{...x,sessoesRestantes:novo}:x));
  }

  async function renovarPacote(){
    const total=pacienteAtual.tipoPagamento==="pacote8"?8:4;
    await updateItem("pac",p.id,{sessoesRestantes:total,avisarPacote:true});
    setPacientes(pacientes.map(x=>x.id===p.id?{...x,sessoesRestantes:total,avisarPacote:true}:x));
    showT("Pacote renovado!");
  }
  const atendimentosPac=evolucoes.filter(ev=>ev.pacienteId===p.id).sort((a,b)=>(b.dataOrdenacao||"").localeCompare(a.dataOrdenacao||""));
  const hoje=new Date();
  const dataHojeStr=`${String(hoje.getDate()).padStart(2,"0")}/${String(hoje.getMonth()+1).padStart(2,"0")}/${hoje.getFullYear()}`;
  const [novaDataEv,setNovaDataEv]=useState(dataHojeStr);
  const [novoTextoEv,setNovoTextoEv]=useState("");
  const [salvandoEv,setSalvandoEv]=useState(false);
  const [editandoEvId,setEditandoEvId]=useState(null);
  const [modalAssistente,setModalAssistente]=useState(false);
const [carregandoAssistente,setCarregandoAssistente]=useState(false);
const [respostaAssistente,setRespostaAssistente]=useState("");
const [erroAssistente,setErroAssistente]=useState("");
const [detalheAtendimentoId,setDetalheAtendimentoId]=useState(null);
const [mostrarSugestao,setMostrarSugestao]=useState(false);
const detalheEv=atendimentosPac.find(ev=>ev.id===detalheAtendimentoId);
  const [gravando,setGravando]=useState(false);
const recRef=useRef(null);
  const [textoEdit,setTextoEdit]=useState("");
  const novoTextoEvRef=useRef(null);
  const textoEditRef=useRef(null);

  function aplicarFormatacao(ref, valor, setValor, marcador){
    const ta=ref.current;
    if(!ta)return;
    const inicio=ta.selectionStart;
    const fim=ta.selectionEnd;
    if(inicio===fim)return;
    const selecionado=valor.slice(inicio,fim);
    const novoValor=valor.slice(0,inicio)+marcador+selecionado+marcador+valor.slice(fim);
    setValor(novoValor);
    setTimeout(()=>{
      ta.focus();
      ta.setSelectionRange(inicio+marcador.length, fim+marcador.length);
    },0);
  }
  const [dataEdit,setDataEdit]=useState("");

  async function salvarAtendimento(){
    if(!novoTextoEv.trim())return;
    setSalvandoEv(true);
    const [dd,mm,yyyy]=novaDataEv.split("/");
    const dataOrdenacao=(dd&&mm&&yyyy)?`${yyyy}-${mm}-${dd}`:"";
    const dados={pacienteId:p.id,data:novaDataEv,texto:novoTextoEv.trim(),dataOrdenacao};
    const novoId=await addItem("evol",dados);
    setEvolucoes([...evolucoes,{id:novoId,...dados}]);
    setNovoTextoEv("");
    setNovaDataEv(dataHojeStr);
    setSalvandoEv(false);
  }

  async function excluirAtendimento(id){
    if(!window.confirm("Tem certeza que deseja excluir esta anotação de atendimento? Essa ação não pode ser desfeita."))return;
    await deleteItem("evol",id);
    setEvolucoes(evolucoes.filter(ev=>ev.id!==id));
  }

  function iniciarEdicao(ev){
    setEditandoEvId(ev.id);
    setTextoEdit(ev.texto);
    setDataEdit(ev.data);
  }

  async function salvarEdicaoAtendimento(){
    const [dd,mm,yyyy]=dataEdit.split("/");
    const dataOrdenacao=(dd&&mm&&yyyy)?`${yyyy}-${mm}-${dd}`:"";
    await updateItem("evol",editandoEvId,{texto:textoEdit,data:dataEdit,dataOrdenacao});
    setEvolucoes(evolucoes.map(ev=>ev.id===editandoEvId?{...ev,texto:textoEdit,data:dataEdit,dataOrdenacao}:ev));
    setEditandoEvId(null);
  }

  function montarTextoSessoes(escopo){
    const ordenadosAsc=[...atendimentosPac].sort((a,b)=>(a.dataOrdenacao||"").localeCompare(b.dataOrdenacao||""));
    let selecionados=[];
    if(escopo==="atual"){
      selecionados=ordenadosAsc.slice(-1);
    }else if(escopo==="atual_anterior"){
      selecionados=ordenadosAsc.slice(-2);
    }else{
      selecionados=ordenadosAsc;
    }
    return selecionados.map(ev=>`[${ev.data}]\n${ev.texto}`).join("\n\n---\n\n");
  }

  async function consultarAssistente(escopo){
    if(atendimentosPac.length===0){
      setErroAssistente("Não há anotações de atendimento registradas para este paciente.");
      return;
    }
    setCarregandoAssistente(true);
    setRespostaAssistente("");
    setErroAssistente("");
    try{
      const textoSessoes=montarTextoSessoes(escopo);
      const resp=await fetch("/api/assistente",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({pacienteNome:p.nome, textoSessoes})
      });
      const data=await resp.json();
      if(!resp.ok||data.erro){
        setErroAssistente("Não foi possível consultar o assistente. Tente novamente.");
      }else{
        setRespostaAssistente(data.resposta);
      }
    }catch(e){
      setErroAssistente("Erro de conexão ao consultar o assistente.");
    }
    setCarregandoAssistente(false);
  }
async function salvarSugestaoAssistente(){
    if(!atendimentosPac.length)return;
    const alvo=atendimentosPac[0];
    await updateItem("evol",alvo.id,{sugestao:respostaAssistente});
    setEvolucoes(evolucoes.map(ev=>ev.id===alvo.id?{...ev,sugestao:respostaAssistente}:ev));
    setModalAssistente(false);
    setRespostaAssistente("");
    showT("Sugestão salva na sessão mais recente!");
  }
  const pagsPaciente=registros.filter(r=>r.nome===p.nome);
  const anos=[...new Set(pagsPaciente.map(r=>r.data.split("/")[2]))].sort().reverse();
  const meses=["01","02","03","04","05","06","07","08","09","10","11","12"];
  const nomesMeses=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

  const pagsFiltrados=pagsPaciente.filter(r=>{
    const [,m,a]=r.data.split("/");
    if(filtroAno!=="todos"&&a!==filtroAno)return false;
    if(filtroMes!=="todos"&&m!==filtroMes)return false;
    return true;
  }).sort((a,b)=>{
    const [da,ma,aa]=a.data.split("/");const [db,mb,ab]=b.data.split("/");
    return `${ab}${mb}${db}`.localeCompare(`${aa}${ma}${da}`);
  });

  const totalFiltrado=pagsFiltrados.filter(r=>r.valor!=="—").reduce((s,r)=>s+(parseFloat(r.valor.replace(",","."))||0),0);

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{background:"#fff",borderRadius:14,padding:28,width:"100%",maxWidth:520,boxShadow:"0 8px 40px rgba(0,0,0,0.2)",maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h3 style={{margin:0,color:"#1a3a2a",fontSize:18,fontFamily:"Georgia,serif"}}>{p.nome}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#888"}}>✕</button>
        </div>

        <div style={{display:"flex",gap:6,marginBottom:18}}>
          {[["dados","📋 Dados"],["pagamentos",`💳 Pagamentos (${pagsPaciente.length})`],["atendimentos",`📝 Atendimentos (${atendimentosPac.length})`],["avaliacoes","🧪 Avaliações"]].map(([v,l])=>(
            <button key={v} onClick={()=>setAbaModal(v)} style={{padding:"7px 14px",borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"sans-serif",background:abaModal===v?"#2a7a4a":"#f4f6f0",color:abaModal===v?"#fff":"#4a6a5a",border:"none",fontWeight:abaModal===v?700:400}}>{l}</button>
          ))}
        </div>

        {abaModal==="avaliacoes"&&<AbaAvaliacoes pacienteId={p.id} pacienteNome={p.nome}/>}

        {abaModal==="dados"&&<>
          <div style={{fontSize:11,fontWeight:700,color:"#2a5a3a",fontFamily:"sans-serif",textTransform:"uppercase",marginBottom:8}}>Dados pessoais</div>
          <Row l="CPF" v={p.cpf}/><Row l="Nascimento" v={p.nascimento}/><Row l="Telefone" v={p.tel1}/>
          <div style={{fontSize:11,fontWeight:700,color:"#2a5a3a",fontFamily:"sans-serif",textTransform:"uppercase",margin:"14px 0 8px"}}>Plano de pagamento</div>
          <select value={pacienteAtual.tipoPagamento||"avulso"} onChange={e=>atualizarTipoPagamento(e.target.value)} style={{...sel(false),marginBottom:8}}>
            <option value="avulso">Avulso</option>
            <option value="pacote4">Pacote de 4 sessões</option>
            <option value="pacote8">Pacote de 8 sessões</option>
          </select>
          {(pacienteAtual.tipoPagamento==="pacote4"||pacienteAtual.tipoPagamento==="pacote8")&&
            <div style={{display:"flex",alignItems:"center",gap:10,fontFamily:"sans-serif",fontSize:13,color:"#1a3a2a",marginBottom:4,flexWrap:"wrap"}}>
              <span style={{fontWeight:700}}>Sessões restantes: <strong style={{fontSize:15}}>{pacienteAtual.sessoesRestantes ?? 0}</strong></span>
              <button onClick={()=>ajustarSessoesRestantes(-1)} style={{padding:"3px 10px",borderRadius:6,border:"1px solid #c8ddd0",background:"#fff",cursor:"pointer",fontSize:13}}>-1</button>
              <button onClick={()=>ajustarSessoesRestantes(1)} style={{padding:"3px 10px",borderRadius:6,border:"1px solid #c8ddd0",background:"#fff",cursor:"pointer",fontSize:13}}>+1</button>
              <button onClick={renovarPacote} style={{padding:"5px 12px",borderRadius:6,border:"none",background:"#2a7a4a",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:600}}>Renovar pacote</button>
            </div>
          }
          <div style={{fontSize:11,fontWeight:700,color:"#2a5a3a",fontFamily:"sans-serif",textTransform:"uppercase",margin:"14px 0 8px"}}>Contato de emergência</div>
          <Row l="Nome" v={p.emergNome}/><Row l="Parentesco" v={p.emergParentesco}/><Row l="Telefone" v={p.emergTel}/>
          <div style={{fontSize:11,fontWeight:700,color:"#2a5a3a",fontFamily:"sans-serif",textTransform:"uppercase",margin:"14px 0 8px"}}>Endereço</div>
          <Row l="CEP" v={p.cep}/><Row l="Logradouro" v={[p.logradouro,p.numero,p.complemento].filter(Boolean).join(", ")}/><Row l="Bairro" v={p.bairro}/><Row l="Cidade/UF" v={[p.cidade,p.estado].filter(Boolean).join(" - ")}/>
          {tits.length>0&&<>
            <div style={{fontSize:11,fontWeight:700,color:"#2a5a3a",fontFamily:"sans-serif",textTransform:"uppercase",margin:"14px 0 8px"}}>Titulares do pagamento</div>
            {tits.map(t=><div key={t.id}><Row l="Nome" v={t.nome}/><Row l="CPF" v={t.cpf}/>{t.parentesco&&<Row l="Parentesco" v={t.parentesco}/>}</div>)}
          </>}
        </>}

        {abaModal==="pagamentos"&&<>
          <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
            <select value={filtroAno} onChange={e=>setFiltroAno(e.target.value)} style={{...sel(false),width:"auto",fontSize:13,padding:"6px 10px"}}>
              <option value="todos">Todos os anos</option>
              {anos.map(a=><option key={a} value={a}>{a}</option>)}
            </select>
            <select value={filtroMes} onChange={e=>setFiltroMes(e.target.value)} style={{...sel(false),width:"auto",fontSize:13,padding:"6px 10px"}}>
              <option value="todos">Todos os meses</option>
              {meses.map((m,i)=><option key={m} value={m}>{nomesMeses[i]}</option>)}
            </select>
          </div>

          {pagsFiltrados.length===0
            ? <div style={{textAlign:"center",color:"#8aaa9a",fontFamily:"sans-serif",padding:24,fontSize:14}}>Nenhum pagamento encontrado.</div>
            : <>
              <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
               {pagsFiltrados.map(r=>(
                  <div key={r.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#f7faf8",borderRadius:7,fontFamily:"sans-serif",fontSize:13}}>
                    <span style={{color:"#4a6a5a",minWidth:70}}>{r.data}</span>
                    <span style={{...{padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:600},...chipColor(r.pagamento)}}>{r.pagamento}</span>
                    <span style={{fontWeight:700,marginLeft:"auto"}}>{r.valor!=="—"?`R$ ${r.valor}`:"—"}</span>
                    {r.nfEmitida&&<span title="NF emitida" style={{fontSize:14}}>✅</span>}
                  </div>
                ))}
              </div>
              <div style={{textAlign:"right",fontFamily:"sans-serif",fontSize:14,fontWeight:700,color:"#1a4a2a",borderTop:"1px solid #eef4ec",paddingTop:10}}>
                Total: R$ {totalFiltrado.toFixed(2).replace(".",",")}
              </div>
            </>
          }
        </>}

        {abaModal==="atendimentos"&&<>
          <div style={{marginBottom:14}}>
            <input
              value={novaDataEv}
              onChange={e=>setNovaDataEv(fData(e.target.value))}
              type="text" inputMode="numeric" placeholder="DD/MM/AAAA" maxLength={10}
              style={{width:110,padding:"8px 10px",borderRadius:7,border:"1.5px solid #dbe8df",fontSize:13,fontFamily:"sans-serif",marginBottom:8}}
            />
            <div style={{display:"flex",gap:6,marginBottom:6}}>
              <button type="button" onClick={()=>aplicarFormatacao(novoTextoEvRef,novoTextoEv,setNovoTextoEv,"**")} style={{padding:"5px 10px",borderRadius:6,border:"1px solid #c8ddd0",background:"#fff",cursor:"pointer",fontWeight:700,fontSize:13}}>N</button>
              <button type="button" onClick={()=>aplicarFormatacao(novoTextoEvRef,novoTextoEv,setNovoTextoEv,"__")} style={{padding:"5px 10px",borderRadius:6,border:"1px solid #c8ddd0",background:"#fff",cursor:"pointer",textDecoration:"underline",fontSize:13}}>S</button>
              <button type="button" onClick={()=>aplicarFormatacao(novoTextoEvRef,novoTextoEv,setNovoTextoEv,"==")} style={{padding:"5px 10px",borderRadius:6,border:"1px solid #c8ddd0",background:"#fff3a3",cursor:"pointer",fontSize:13}}>Marcador</button>
            </div>
            <textarea
              ref={novoTextoEvRef}
              value={novoTextoEv}
              onChange={e=>setNovoTextoEv(e.target.value)}
              placeholder="Escreva aqui as anotações desta sessão... (selecione um trecho e clique em N/S/Marcador para formatar)"
              rows={4}
              style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1.5px solid #dbe8df",fontSize:14,fontFamily:"sans-serif",boxSizing:"border-box",resize:"vertical",marginBottom:8,display:"block"}}
            />
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
              <button onClick={()=>{
                if(gravando){
                  recRef.current?.stop();
                  setGravando(false);
                }else{
                  const rec=criarReconhecimentoVoz(
                    (texto)=>setNovoTextoEv(prev=>prev?(prev+" "+texto):texto),
                    (erro)=>showT(erro,"erro")
                  );
                  if(rec){recRef.current=rec;rec.start();setGravando(true);}
                }
              }} style={{padding:"7px 14px",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontFamily:"sans-serif",fontWeight:600,background:gravando?"#c0392b":"#1C3D2E",color:"#fff",display:"flex",alignItems:"center",gap:6}}>
                {gravando ? "⏹ Parar gravação" : "🎤 Falar"}
              </button>
              
            </div>
            
            <button
              onClick={salvarAtendimento}
              disabled={salvandoEv||!novoTextoEv.trim()}
              style={{padding:"9px 18px",background:novoTextoEv.trim()?"#2a7a4a":"#cfe0d6",color:"#fff",border:"none",borderRadius:8,cursor:novoTextoEv.trim()?"pointer":"default",fontSize:13,fontFamily:"sans-serif",fontWeight:600}}
            >{salvandoEv?"Salvando...":"Adicionar atendimento"}</button>
            <button onClick={()=>{setModalAssistente(true);setRespostaAssistente("");setErroAssistente("");}} style={{marginLeft:8,padding:"9px 18px",background:"#1a4a8a",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontSize:13,fontFamily:"sans-serif",fontWeight:600}}>🧠 Assistente</button>
          </div>

          {atendimentosPac.length===0
            ? <div style={{textAlign:"center",color:"#8aaa9a",fontFamily:"sans-serif",padding:"16px 0",fontSize:13}}>Nenhum atendimento registrado ainda.</div>
            : <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {atendimentosPac.map(ev=>(
                editandoEvId===ev.id ? (
                  <div key={ev.id} style={{background:"#fff7e8",borderRadius:8,padding:"10px 12px",border:"1.5px solid #e8cfa3"}}>
                    <input
                      value={dataEdit}
                      onChange={e=>setDataEdit(fData(e.target.value))}
                      type="text" inputMode="numeric" maxLength={10}
                      style={{width:110,padding:"7px 9px",borderRadius:6,border:"1.5px solid #dbe8df",fontSize:13,fontFamily:"sans-serif",marginBottom:8}}
                    />
                    <div style={{display:"flex",gap:6,marginBottom:6}}>
                      <button type="button" onClick={()=>aplicarFormatacao(textoEditRef,textoEdit,setTextoEdit,"**")} style={{padding:"5px 10px",borderRadius:6,border:"1px solid #c8ddd0",background:"#fff",cursor:"pointer",fontWeight:700,fontSize:12}}>N</button>
                      <button type="button" onClick={()=>aplicarFormatacao(textoEditRef,textoEdit,setTextoEdit,"__")} style={{padding:"5px 10px",borderRadius:6,border:"1px solid #c8ddd0",background:"#fff",cursor:"pointer",textDecoration:"underline",fontSize:12}}>S</button>
                      <button type="button" onClick={()=>aplicarFormatacao(textoEditRef,textoEdit,setTextoEdit,"==")} style={{padding:"5px 10px",borderRadius:6,border:"1px solid #c8ddd0",background:"#fff3a3",cursor:"pointer",fontSize:12}}>Marcador</button>
                    </div>
                    <textarea
                      ref={textoEditRef}
                      value={textoEdit}
                      onChange={e=>setTextoEdit(e.target.value)}
                      rows={4}
                      style={{width:"100%",padding:"9px 11px",borderRadius:7,border:"1.5px solid #dbe8df",fontSize:13,fontFamily:"sans-serif",boxSizing:"border-box",resize:"vertical",marginBottom:8,display:"block"}}
                    />
                    <button onClick={salvarEdicaoAtendimento} style={{padding:"7px 14px",background:"#2a7a4a",color:"#fff",border:"none",borderRadius:7,cursor:"pointer",fontSize:12,fontFamily:"sans-serif",fontWeight:600,marginRight:8}}>Salvar</button>
                    <button onClick={()=>setEditandoEvId(null)} style={{padding:"7px 14px",background:"#fff",color:"#5a7a6a",border:"1px solid #c8ddd0",borderRadius:7,cursor:"pointer",fontSize:12,fontFamily:"sans-serif"}}>Cancelar</button>
                  </div>
                ) : (
                  <div key={ev.id} style={{background:"#f7faf8",borderRadius:8,padding:"10px 12px",border:"1px solid #e0ede5"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <span style={{fontSize:12,fontWeight:700,color:"#2a7a4a",fontFamily:"sans-serif"}}>{ev.data}</span>
                      <div style={{display:"flex",gap:10}}>
                        <button onClick={()=>{setDetalheAtendimentoId(ev.id);setMostrarSugestao(false);}} style={{background:"none",border:"none",color:"#2a7a4a",cursor:"pointer",fontSize:12,fontFamily:"sans-serif"}}>ver anotação</button>
                        <button onClick={()=>iniciarEdicao(ev)} style={{background:"none",border:"none",color:"#1a3a6a",cursor:"pointer",fontSize:12,fontFamily:"sans-serif"}}>editar</button>
                        <button onClick={()=>excluirAtendimento(ev.id)} style={{background:"none",border:"none",color:"#c0392b",cursor:"pointer",fontSize:12,fontFamily:"sans-serif"}}>excluir</button>
                      </div>
                    </div>
                    <div style={{fontSize:13,color:"#1a3a2a",fontFamily:"sans-serif",whiteSpace:"pre-wrap",lineHeight:1.5}}>{formatarTextoAnotacao(ev.texto)}</div>
                  </div>
                )
              ))}
            </div>
          }
          {modalAssistente&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setModalAssistente(false)}>
            <div style={{background:"#fff",borderRadius:14,padding:28,width:"100%",maxWidth:560,boxShadow:"0 8px 40px rgba(0,0,0,0.3)",maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
                <h3 style={{margin:0,color:"#1a3a2a",fontSize:18,fontFamily:"Georgia,serif"}}>🧠 Assistente Clínico (TCC)</h3>
                <button onClick={()=>setModalAssistente(false)} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#888"}}>✕</button>
              </div>

              {!carregandoAssistente && !respostaAssistente && !erroAssistente && <>
                <p style={{fontFamily:"sans-serif",fontSize:13,color:"#5a7a6a",marginBottom:16}}>Escolha o que o assistente deve analisar:</p>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <button onClick={()=>consultarAssistente("atual")} style={{padding:"12px 16px",borderRadius:8,border:"1.5px solid #c8ddd0",background:"#fff",cursor:"pointer",fontSize:14,fontFamily:"sans-serif",fontWeight:600,textAlign:"left",color:"#1a3a2a"}}>Analisar somente a sessão atual (última anotada)</button>
                  <button onClick={()=>consultarAssistente("atual_anterior")} style={{padding:"12px 16px",borderRadius:8,border:"1.5px solid #c8ddd0",background:"#fff",cursor:"pointer",fontSize:14,fontFamily:"sans-serif",fontWeight:600,textAlign:"left",color:"#1a3a2a"}}>Analisar a sessão atual e a anterior</button>
                  <button onClick={()=>consultarAssistente("todas")} style={{padding:"12px 16px",borderRadius:8,border:"1.5px solid #c8ddd0",background:"#fff",cursor:"pointer",fontSize:14,fontFamily:"sans-serif",fontWeight:600,textAlign:"left",color:"#1a3a2a"}}>Analisar todas as sessões deste paciente</button>
                </div>
              </>}

              {carregandoAssistente && <div style={{textAlign:"center",padding:"30px 0",fontFamily:"sans-serif",color:"#5a7a6a",fontSize:14}}>Consultando o assistente...</div>}

              {erroAssistente && <div style={{textAlign:"center",padding:"20px 0"}}>
                <p style={{fontFamily:"sans-serif",color:"#c0392b",fontSize:14,marginBottom:14}}>{erroAssistente}</p>
                <button onClick={()=>{setErroAssistente("");}} style={{padding:"9px 18px",background:"#1a4a2a",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontSize:13,fontFamily:"sans-serif"}}>Voltar</button>
              </div>}

              {respostaAssistente && <>
                <div style={{fontFamily:"sans-serif",fontSize:13,color:"#1a3a2a",whiteSpace:"pre-wrap",lineHeight:1.6,background:"#f7faf8",borderRadius:8,padding:16,marginBottom:16}}>{respostaAssistente}</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <button onClick={salvarSugestaoAssistente} style={{padding:"9px 18px",background:"#2a7a4a",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontSize:13,fontFamily:"sans-serif",fontWeight:600}}>✓ Salvar sugestão</button>
                  <button onClick={()=>{setRespostaAssistente("");}} style={{padding:"9px 18px",background:"#fff",color:"#4a6a5a",border:"1.5px solid #c8ddd0",borderRadius:8,cursor:"pointer",fontSize:13,fontFamily:"sans-serif"}}>Nova consulta</button>
                  <button onClick={()=>{setModalAssistente(false);setRespostaAssistente("");}} style={{padding:"9px 18px",background:"#fff",color:"#c0392b",border:"1.5px solid #f5c6cb",borderRadius:8,cursor:"pointer",fontSize:13,fontFamily:"sans-serif"}}>Cancelar</button>
                </div>
              </>}
            </div>
          </div>}
          {detalheEv&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>{setDetalheAtendimentoId(null);setMostrarSugestao(false);}}>
            <div style={{background:"#fff",borderRadius:14,padding:28,width:"100%",maxWidth:520,boxShadow:"0 8px 40px rgba(0,0,0,0.3)",maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <h3 style={{margin:0,color:"#1a3a2a",fontSize:18,fontFamily:"Georgia,serif"}}>Anotação — {detalheEv.data}</h3>
                <button onClick={()=>{setDetalheAtendimentoId(null);setMostrarSugestao(false);}} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#888"}}>✕</button>
              </div>

              <div style={{fontFamily:"sans-serif",fontSize:14,color:"#1a3a2a",whiteSpace:"pre-wrap",lineHeight:1.6,marginBottom:18}}>{formatarTextoAnotacao(detalheEv.texto)}</div>

              <button onClick={()=>setMostrarSugestao(v=>!v)} style={{padding:"9px 18px",background:"#1a4a8a",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontSize:13,fontFamily:"sans-serif",fontWeight:600,marginBottom:14}}>🧠 Sugestões</button>

              {mostrarSugestao&&<div style={{fontFamily:"sans-serif",fontSize:13,color:"#1a3a2a",whiteSpace:"pre-wrap",lineHeight:1.6,background:"#f7faf8",borderRadius:8,padding:16}}>
                {detalheEv.sugestao || "Nenhuma sugestão salva para esta sessão. Use o botão Assistente para gerar uma."}
              </div>}
            </div>
          </div>}
        </>}
      </div>
    </div>
  );
}

// ── ABA TITULARES ─────────────────────────────────────────────────────────────
function AbaTitulares({titulares,setTitulares,pacientes,showT}){
  const [f,setF]=useState({pacienteId:"",nome:"",cpf:"",parentesco:""});
  const [erros,setErros]=useState({});
  const up=(c,v)=>{setF(p=>({...p,[c]:v}));setErros(e=>({...e,[c]:false}));};

  async function salvar(){
    const e={};
    if(!f.pacienteId)e.pacienteId=true;
    OBRIG_TIT.forEach(k=>{if(!f[k]?.trim())e[k]=true;});
    setErros(e);
    if(Object.keys(e).length>0){showT("Preencha todos os campos obrigatórios.","erro");return;}
    const novoId=await addItem("tit",f);
    const a=[...titulares,{id:novoId,...f}];
    setTitulares(a);
    setF({pacienteId:"",nome:"",cpf:"",parentesco:""});
    showT("Titular cadastrado!");
  }

  async function excluir(id){
    await deleteItem("tit",id);
    const a=titulares.filter(x=>x.id!==id);setTitulares(a);showT("Titular removido.");
  }

  const pacNome=(id)=>pacientes.find(p=>p.id===id)?.nome||"—";

  return(
    <div>
      <div style={CARD}>
        <h3 style={{...SEC,marginBottom:16}}>Cadastrar titular do pagamento</h3>
        <p style={{margin:"0 0 14px",fontSize:13,color:"#5a7a6a",fontFamily:"sans-serif",lineHeight:1.5}}>
          Cadastre aqui quando o pagamento é feito por outra pessoa (pai, mãe, cônjuge etc).
        </p>
        <div style={G2}>
          <div style={{gridColumn:"1/-1"}}>
            <LBL t="Paciente vinculado" o/>
            <select style={sel(erros.pacienteId)} value={f.pacienteId} onChange={e=>up("pacienteId",e.target.value)}>
              <option value="">Selecione o paciente...</option>
              {pacientes.map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
            <ERR s={erros.pacienteId}/>
          </div>
          <div style={{gridColumn:"1/-1"}}><LBL t="Nome do titular" o/><input style={inp(erros.nome)} value={f.nome} onChange={e=>up("nome",e.target.value)} placeholder="Nome completo do titular"/><ERR s={erros.nome}/></div>
          <div><LBL t="CPF do titular" o/><input style={inp(erros.cpf)} value={f.cpf} onChange={e=>up("cpf",fCPF(e.target.value))} placeholder="000.000.000-00"/><ERR s={erros.cpf}/></div>
          <div><LBL t="Parentesco"/><select style={sel(false)} value={f.parentesco} onChange={e=>up("parentesco",e.target.value)}><option value="">Selecione...</option>{PARENTESCOS.map(p=><option key={p}>{p}</option>)}</select></div>
        </div>
        <button onClick={salvar} style={{marginTop:14,width:"100%",padding:12,background:"#2a7a4a",color:"#fff",border:"none",borderRadius:8,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"sans-serif"}}>+ Cadastrar titular</button>
      </div>

      {titulares.length>0&&<div style={CARD}>
        <h3 style={{...SEC,marginBottom:14}}>Titulares cadastrados</h3>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {titulares.map(t=>(
            <div key={t.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:"#f7faf8",borderRadius:8,border:"1px solid #e0ede5"}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14,color:"#1a3a2a",fontFamily:"sans-serif"}}>{t.nome}</div>
                <div style={{fontSize:12,color:"#5a7a6a",fontFamily:"sans-serif",marginTop:2}}>
                  CPF: {t.cpf}{t.parentesco&&` · ${t.parentesco}`}
                  <span style={{color:"#8aaa9a",marginLeft:8}}>→ {pacNome(t.pacienteId)}</span>
                </div>
              </div>
              <button onClick={()=>excluir(t.id)} style={{background:"none",border:"none",color:"#c0392b",cursor:"pointer",fontSize:14,padding:"4px 8px"}}>✕</button>
            </div>
          ))}
        </div>
      </div>}
    </div>
  );
}

// ── ABA RELATÓRIO ─────────────────────────────────────────────────────────────
function AbaRelatorio({registros,setRegistros,pacientes,titulares}){
  const [busca,setBusca]=useState("");
  const [sugestoes,setSugestoes]=useState([]);
  const [pacSel,setPacSel]=useState(null);
  const [filtroNF,setFiltroNF]=useState("todos");
  const [tipoFiltroData,setTipoFiltroData]=useState("nenhum");
  const [mesFiltro,setMesFiltro]=useState("todos");
  const [anoFiltro,setAnoFiltro]=useState("todos");
  const [dataInicio,setDataInicio]=useState("");
  const [dataFim,setDataFim]=useState("");

  useEffect(()=>{
    if(busca.trim().length<2){setSugestoes([]);return;}
    const q=busca.toLowerCase();
    setSugestoes(pacientes.filter(p=>p.nome.toLowerCase().includes(q)).slice(0,6));
  },[busca,pacientes]);

  function selPac(p){setPacSel(p);setBusca(p.nome);setSugestoes([]);}

  async function toggleNF(reg){
    const atualizado={...reg,nfEmitida:!reg.nfEmitida};
    const novaLista=registros.map(r=>r.id===reg.id?atualizado:r);
    setRegistros(novaLista);
    await updateItem("reg",reg.id,{nfEmitida:atualizado.nfEmitida});
  }

  const anosDisponiveis=[...new Set(registros.map(r=>r.data.split("/")[2]))].sort().reverse();
  const meses=["01","02","03","04","05","06","07","08","09","10","11","12"];
  const nomesMeses=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

  function dataDentroDoFiltro(dataStr){
    if(tipoFiltroData==="nenhum")return true;
    const [d,m,a]=dataStr.split("/");
    if(tipoFiltroData==="mes"){
      if(mesFiltro!=="todos"&&m!==mesFiltro)return false;
      if(anoFiltro!=="todos"&&a!==anoFiltro)return false;
      return true;
    }
    if(tipoFiltroData==="periodo"){
      if(!dataInicio||!dataFim)return true;
      const [di,mi,ai]=dataInicio.split("/");
      const [df,mf,af]=dataFim.split("/");
      if(!di||!mi||!ai||!df||!mf||!af)return true;
      const dAtual=new Date(Number(a),Number(m)-1,Number(d));
      const dIni=new Date(Number(ai),Number(mi)-1,Number(di));
      const dFimD=new Date(Number(af),Number(mf)-1,Number(df));
      return dAtual>=dIni&&dAtual<=dFimD;
    }
    return true;
  }

  const regsBase=pacSel?registros.filter(r=>r.nome===pacSel.nome):registros;
  const regsOrdenados=[...regsBase].sort((a,b)=>a.nome.localeCompare(b.nome)||a.data.localeCompare(b.data));
  const regs=regsOrdenados.filter(r=>{
    if(filtroNF==="pendente") return !r.nfEmitida;
    if(filtroNF==="emitida") return r.nfEmitida;
    return true;
  }).filter(r=>dataDentroDoFiltro(r.data));
  const pendentes=registros.filter(r=>!r.nfEmitida).length;

  function profissionalDoRegistro(r){
    const pac=pacientes.find(p=>p.nome===r.nome);
    return pac?.profissional||"sem_profissional";
  }

  function exportarCSV(){
    if(!regs.length)return;

    const grupos={diego:[],rhania:[],sem_profissional:[]};
    regs.forEach(r=>{
      const prof=profissionalDoRegistro(r);
      if(grupos[prof]) grupos[prof].push(r);
      else grupos.sem_profissional.push(r);
    });

    function linhaDe(r){
      const pac=pacientes.find(p=>p.nome===r.nome);
      const tit=pac?titulares.find(t=>t.pacienteId===pac.id):null;
      const valorNum=r.valor!=="—"?parseFloat(r.valor.replace(",",".")):0;
      return [
        r.nome.toUpperCase(),
        pac?.cpf||r.cpf||"",
        tit?tit.nome.toUpperCase():"",
        tit?tit.cpf:"",
        r.pagamento.toUpperCase().replace("CARTÃO DE ",""),
        valorNum > 0 ? `R$ ${valorNum.toFixed(2).replace(".", ",")}` : "",
        r.nfEmitida ? "EMITIDA" : "PENDENTE"
      ];
    }

    function totalDe(lista){
      return lista.filter(r=>r.valor!=="—").reduce((s,r)=>s+(parseFloat(r.valor.replace(",","."))||0),0);
    }

    const header=["PACIENTE","CPF PACIENTE","TITULAR","CPF TITULAR","FORMA DE PAGAMENTO","VALOR","STATUS NF"];
    const linhas=[header];

    const secoes=[
      {chave:"diego",titulo:"PAGAMENTOS - DIEGO CIRIANI"},
      {chave:"rhania",titulo:"PAGAMENTOS - RHANIA MULIA"},
      {chave:"sem_profissional",titulo:"PAGAMENTOS - SEM PROFISSIONAL DEFINIDO"},
    ];

    let totalGeral=0;
    secoes.forEach(sec=>{
      const lista=grupos[sec.chave];
      if(lista.length===0)return;
      linhas.push([sec.titulo]);
      lista.forEach(r=>linhas.push(linhaDe(r)));
      const totalSec=totalDe(lista);
      totalGeral+=totalSec;
      linhas.push([`TOTAL ${sec.chave.toUpperCase()}`,"","","","",`R$ ${totalSec.toFixed(2).replace(".",",")}`,""]);
      linhas.push([]);
    });

    linhas.push(["TOTAL GERAL (DIEGO + RHANIA)","","","","",`R$ ${totalGeral.toFixed(2).replace(".",",")}`,""]);

    const ws=XLSX.utils.aoa_to_sheet(linhas);
    ws["!cols"]=[{wch:28},{wch:16},{wch:22},{wch:16},{wch:18},{wch:12},{wch:15}];

    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,"Pagamentos");

    const mesArquivo=new Date().toLocaleDateString("pt-BR",{month:"2-digit",year:"numeric"}).replace("/","-");
    XLSX.writeFile(wb,`notas-fiscais-${mesArquivo}.xlsx`);
  }

  const totalValor=regs.filter(r=>r.valor!=="—").reduce((s,r)=>{
    const v=parseFloat(r.valor.replace(",","."));return s+(isNaN(v)?0:v);
  },0);

  return(
    <div>
      <div style={CARD}>
        <h3 style={{...SEC,marginBottom:14}}>Relatório de pagamentos</h3>
        <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
          {[["todos","Todos"],["pendente","⏳ NF pendente"],["emitida","✅ NF emitida"]].map(([v,l])=>(
            <button key={v} onClick={()=>setFiltroNF(v)} style={{padding:"7px 14px",borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"sans-serif",background:filtroNF===v?"#2a7a4a":"#fff",color:filtroNF===v?"#fff":"#4a6a5a",border:filtroNF===v?"1.5px solid #2a7a4a":"1.5px solid #c8ddd0",fontWeight:filtroNF===v?700:400}}>{l}</button>
          ))}
          {pendentes>0&&<span style={{fontFamily:"sans-serif",fontSize:13,color:"#c0392b",fontWeight:600,alignSelf:"center",marginLeft:8}}>⚠ {pendentes} pendente(s)</span>}
        </div>

        <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
          {[["nenhum","Sem filtro de data"],["mes","Filtrar por mês"],["periodo","Filtrar por período"]].map(([v,l])=>(
            <button key={v} onClick={()=>setTipoFiltroData(v)} style={{padding:"7px 14px",borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"sans-serif",background:tipoFiltroData===v?"#1a4a2a":"#fff",color:tipoFiltroData===v?"#fff":"#4a6a5a",border:tipoFiltroData===v?"none":"1.5px solid #c8ddd0",fontWeight:tipoFiltroData===v?700:400}}>{l}</button>
          ))}
        </div>

        {tipoFiltroData==="mes"&&<div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
          <select value={mesFiltro} onChange={e=>setMesFiltro(e.target.value)} style={{...sel(false),width:"auto",fontSize:13,padding:"6px 10px"}}>
            <option value="todos">Todos os meses</option>
            {meses.map((m,i)=><option key={m} value={m}>{nomesMeses[i]}</option>)}
          </select>
          <select value={anoFiltro} onChange={e=>setAnoFiltro(e.target.value)} style={{...sel(false),width:"auto",fontSize:13,padding:"6px 10px"}}>
            <option value="todos">Todos os anos</option>
            {anosDisponiveis.map(a=><option key={a} value={a}>{a}</option>)}
          </select>
        </div>}

        {tipoFiltroData==="periodo"&&<div style={{display:"flex",gap:14,marginBottom:14,flexWrap:"wrap",alignItems:"flex-end"}}>
          <div>
            <LBL t="De"/>
            <input style={{...inp(false),width:140}} type="text" inputMode="numeric" placeholder="DD/MM/AAAA" maxLength={10} value={dataInicio} onChange={e=>setDataInicio(fData(e.target.value))}/>
          </div>
          <div>
            <LBL t="Até"/>
            <input style={{...inp(false),width:140}} type="text" inputMode="numeric" placeholder="DD/MM/AAAA" maxLength={10} value={dataFim} onChange={e=>setDataFim(fData(e.target.value))}/>
          </div>
        </div>}

        <div style={{position:"relative",marginBottom:16}}>
          <LBL t="Filtrar por paciente"/>
          <input style={{...inp(false),fontSize:15,padding:"11px 14px"}} value={busca} onChange={e=>{setBusca(e.target.value);if(!e.target.value)setPacSel(null);}} placeholder="Digite o nome ou deixe em branco para ver todos..." autoComplete="off" onBlur={()=>setTimeout(()=>setSugestoes([]),150)}/>
          {sugestoes.length>0&&<ul style={{position:"absolute",top:"100%",left:0,right:0,background:"#fff",border:"1.5px solid #c8ddd0",borderRadius:8,zIndex:100,listStyle:"none",margin:0,padding:"4px 0",boxShadow:"0 8px 24px rgba(0,40,20,0.12)",maxHeight:200,overflowY:"auto"}}>
            {sugestoes.map((p,i)=><li key={i} style={{padding:"10px 16px",cursor:"pointer",fontFamily:"sans-serif",fontSize:14}} onMouseDown={()=>selPac(p)}>
              <span style={{fontWeight:600}}>{p.nome}</span><span style={{color:"#888",fontSize:12,marginLeft:8}}>{p.cpf}</span>
            </li>)}
          </ul>}
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center",justifyContent:"space-between",flexWrap:"wrap"}}>
          <div style={{fontFamily:"sans-serif",fontSize:13,color:"#4a6a5a"}}>
            <strong>{regs.length}</strong> registro(s)
            {totalValor>0&&<span style={{marginLeft:12}}>Total: <strong>R$ {totalValor.toFixed(2).replace(".",",")}</strong></span>}
          </div>
          <button onClick={exportarCSV} disabled={!regs.length} style={{padding:"9px 18px",background:"#1a4a2a",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"sans-serif",opacity:regs.length?1:0.5}}>
            ↓ Exportar Excel
          </button>
        </div>
      </div>

      {regs.length>0&&<div style={CARD}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"sans-serif",fontSize:13}}>
            <thead><tr style={{background:"#f4f6f0"}}>
              {["Paciente","CPF","Data","Titular","Pagamento","Valor","NF"].map(h=><th key={h} style={{textAlign:"left",padding:"10px 12px",fontSize:11,fontWeight:700,color:"#4a6a5a",borderBottom:"2px solid #deeade",textTransform:"uppercase",letterSpacing:"0.04em",whiteSpace:"nowrap"}}>{h}</th>)}
            </tr></thead>
            <tbody>{regs.map((r,i)=>{
              const pac=pacientes.find(p=>p.nome===r.nome);
              const tit=pac?titulares.find(t=>t.pacienteId===pac.id):null;
              const prevNome=i>0?regs[i-1].nome:"";
              const novoGrupo=r.nome!==prevNome;
              return<tr key={r.id} style={{background:r.nfEmitida?"#f0faf4":novoGrupo&&i>0?"#f7faf8":"#fff"}}>
                <td style={{padding:"9px 12px",borderBottom:"1px solid #eef4ec",fontWeight:600,borderTop:novoGrupo&&i>0?"2px solid #c8ddd0":"none"}}>{r.nome}</td>
                <td style={{padding:"9px 12px",borderBottom:"1px solid #eef4ec",color:"#666",borderTop:novoGrupo&&i>0?"2px solid #c8ddd0":"none"}}>{pac?.cpf||r.cpf||"—"}</td>
                <td style={{padding:"9px 12px",borderBottom:"1px solid #eef4ec",whiteSpace:"nowrap",borderTop:novoGrupo&&i>0?"2px solid #c8ddd0":"none"}}>{r.data}</td>
                <td style={{padding:"9px 12px",borderBottom:"1px solid #eef4ec",borderTop:novoGrupo&&i>0?"2px solid #c8ddd0":"none"}}>{tit?<span style={{fontSize:12}}>{tit.nome}<br/><span style={{color:"#888"}}>{tit.cpf}</span></span>:<span style={{color:"#aaa",fontSize:12}}>Próprio</span>}</td>
                <td style={{padding:"9px 12px",borderBottom:"1px solid #eef4ec",borderTop:novoGrupo&&i>0?"2px solid #c8ddd0":"none"}}><span style={{...{padding:"3px 8px",borderRadius:20,fontSize:11,fontWeight:600},...chipColor(r.pagamento)}}>{r.pagamento}</span></td>
                <td style={{padding:"9px 12px",borderBottom:"1px solid #eef4ec",fontWeight:600,borderTop:novoGrupo&&i>0?"2px solid #c8ddd0":"none"}}>{r.valor!=="—"?`R$ ${r.valor}`:"—"}</td>
                <td style={{padding:"9px 12px",borderBottom:"1px solid #eef4ec",textAlign:"center",borderTop:novoGrupo&&i>0?"2px solid #c8ddd0":"none"}}>
                  <input type="checkbox" checked={!!r.nfEmitida} onChange={()=>toggleNF(r)} style={{accentColor:"#2a7a4a",width:16,height:16,cursor:"pointer"}} title={r.nfEmitida?"NF emitida":"Marcar como emitida"}/>
                </td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </div>}
      {regs.length===0&&<div style={{textAlign:"center",color:"#8aaa9a",fontFamily:"sans-serif",padding:40,fontSize:15}}>Nenhum registro encontrado.</div>}
    </div>
  );
}
function IconAba({nome,color="currentColor",size=17}){
  const st={fill:"none",stroke:color,strokeWidth:1.8,strokeLinecap:"round",strokeLinejoin:"round"};
  const paths={
    dashboard:<><rect x="3" y="3" width="7" height="9" rx="1.5" {...st}/><rect x="14" y="3" width="7" height="5" rx="1.5" {...st}/><rect x="14" y="12" width="7" height="9" rx="1.5" {...st}/><rect x="3" y="16" width="7" height="5" rx="1.5" {...st}/></>,
    agenda:<><rect x="3" y="4" width="18" height="17" rx="2" {...st}/><line x1="3" y1="9" x2="21" y2="9" {...st}/><line x1="8" y1="2" x2="8" y2="6" {...st}/><line x1="16" y1="2" x2="16" y2="6" {...st}/></>,
    pagamentos:<><rect x="2.5" y="5.5" width="19" height="13" rx="2.2" {...st}/><line x1="2.5" y1="9.5" x2="21.5" y2="9.5" {...st}/></>,
    pacientes:<><circle cx="12" cy="8" r="3.5" {...st}/><path d="M5 20c0-3.5 3-6.5 7-6.5s7 3 7 6.5" {...st}/></>,
    titulares:<><path d="M6 2.5h9l3 3v16H6z" {...st}/><line x1="9" y1="9" x2="15" y2="9" {...st}/><line x1="9" y1="13" x2="15" y2="13" {...st}/><line x1="9" y1="17" x2="13" y2="17" {...st}/></>,
    relatorio:<><line x1="5" y1="20" x2="5" y2="11" {...st}/><line x1="12" y1="20" x2="12" y2="6" {...st}/><line x1="19" y1="20" x2="19" y2="14" {...st}/><line x1="3" y1="20" x2="21" y2="20" {...st}/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24">{paths[nome]}</svg>;
}
function IconDash({nome,color="currentColor",size=20}){
  const st={fill:"none",stroke:color,strokeWidth:1.8,strokeLinecap:"round",strokeLinejoin:"round"};
  const paths={
    pacientes:<><circle cx="9" cy="8" r="3" {...st}/><path d="M3 19c0-3 2.7-5.5 6-5.5s6 2.5 6 5.5" {...st}/><circle cx="17" cy="9" r="2.4" {...st}/><path d="M14.5 13.2c2.4.3 4.5 2.3 4.8 5" {...st}/></>,
    agenda:<><rect x="3" y="4" width="18" height="17" rx="2" {...st}/><line x1="3" y1="9" x2="21" y2="9" {...st}/><line x1="8" y1="2" x2="8" y2="6" {...st}/><line x1="16" y1="2" x2="16" y2="6" {...st}/></>,
    cifrao:<><circle cx="12" cy="12" r="9.5" {...st}/><path d="M14.5 9.2c0-1.1-1.1-2-2.5-2s-2.5.9-2.5 2c0 1.1 1.1 1.6 2.5 2c1.4.4 2.5 1 2.5 2c0 1.1-1.1 2-2.5 2s-2.5-.9-2.5-2" {...st}/><line x1="12" y1="5.5" x2="12" y2="18.5" {...st}/></>,
    carteira:<><rect x="2.5" y="6" width="19" height="13" rx="2.2" {...st}/><path d="M6.5 6V4.5a2 2 0 012-2h7a2 2 0 012 2V6" {...st}/><circle cx="16" cy="12.5" r="1.3" fill={color} stroke="none"/></>,
    sino:<><path d="M12 3.5c-3 0-4.5 2.3-4.5 5.2v3.1c0 .9-.4 1.7-1.1 2.4l-.6.6h12.4l-.6-.6a3.3 3.3 0 01-1.1-2.4V8.7c0-2.9-1.5-5.2-4.5-5.2z" {...st}/><path d="M9.8 18.3a2.3 2.3 0 004.4 0" {...st}/></>,
    hamburguer:<><line x1="3.5" y1="6.5" x2="20.5" y2="6.5" {...st}/><line x1="3.5" y1="12" x2="20.5" y2="12" {...st}/><line x1="3.5" y1="17.5" x2="20.5" y2="17.5" {...st}/></>,
    saida:<><path d="M9 4.5H5.5a2 2 0 00-2 2v11a2 2 0 002 2H9" {...st}/><line x1="21.5" y1="12" x2="10" y2="12" {...st}/><polyline points="16,7 21.5,12 16,17" {...st}/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24">{paths[nome]}</svg>;
}
// ── PAINEL ────────────────────────────────────────────────────────────────────
function Painel({pacientes,setPacientes,registros,setRegistros,titulares,setTitulares,evolucoes,setEvolucoes,agenda,setAgenda,onCadastro,onLogout}){
  const [aba,setAba]=useState("dashboard");
  const [filtroProf,setFiltroProf]=useState("todos");
  const [buscaPac,setBuscaPac]=useState("");
  const [editandoReg,setEditandoReg]=useState(null);
  const [editandoPac,setEditandoPac]=useState(null);
  const [menuMobileAberto,setMenuMobileAberto]=useState(false);
const pacientesFiltrados = filtroProf==="todos" ? pacientes : pacientes.filter(p=>p.profissional===filtroProf);
const nomesFiltrados = new Set(pacientesFiltrados.map(p=>p.nome));
const registrosFiltrados = filtroProf==="todos" ? registros : registros.filter(r=>nomesFiltrados.has(r.nome));
const pacientesAtivos = pacientesFiltrados.filter(p=>!p.inativo);
const pacientesInativos = pacientesFiltrados.filter(p=>p.inativo);
const buscaLower = buscaPac.trim().toLowerCase();
const pacientesBuscados = buscaLower
  ? pacientesAtivos.filter(p=>p.nome.toLowerCase().includes(buscaLower))
  : pacientesAtivos;
const pacientesInativosBuscados = buscaLower
  ? pacientesInativos.filter(p=>p.nome.toLowerCase().includes(buscaLower))
  : pacientesInativos;
const agendaFiltrada = filtroProf==="todos" ? agenda : agenda.filter(ev=>ev.profissional===filtroProf);

// ── CÁLCULOS DO DASHBOARD ───────────────────────────────────────────────────
const hojeDate = new Date();
const inicioSemanaAtual = inicioDaSemana(hojeDate);
const fimSemanaAtual = new Date(inicioSemanaAtual); fimSemanaAtual.setDate(fimSemanaAtual.getDate()+6); fimSemanaAtual.setHours(23,59,59,999);

const eventosEstaSemana = agendaFiltrada.filter(ev=>{
  const d = parseDataBR(ev.data);
  return d && d>=inicioSemanaAtual && d<=fimSemanaAtual && ev.tipo==="sessao";
});

const registrosComData = registrosFiltrados.map(r=>({...r, _data: parseDataBR(r.data), _valorNum: valorParaNumero(r.valor)}));
const receitaSemana = registrosComData
  .filter(r=>r._data && r._data>=inicioSemanaAtual && r._data<=fimSemanaAtual)
  .reduce((t,r)=>t+r._valorNum,0);

const inicioMes = new Date(hojeDate.getFullYear(), hojeDate.getMonth(), 1);
const fimMes = new Date(hojeDate.getFullYear(), hojeDate.getMonth()+1, 0, 23,59,59,999);
const receitaMes = registrosComData
  .filter(r=>r._data && r._data>=inicioMes && r._data<=fimMes)
  .reduce((t,r)=>t+r._valorNum,0);

// Atendimentos agendados na semana, por dia (Seg a Sex, como no modelo)
const diasUteisSemana = [1,2,3,4,5].map(offset=>{
  const d = new Date(inicioSemanaAtual); d.setDate(d.getDate()+offset-1);
  return d;
});
const atendimentosPorDiaSemana = diasUteisSemana.map(d=>{
  const dStr = `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
  const qtd = agendaFiltrada.filter(ev=>ev.data===dStr && ev.tipo==="sessao").length;
  return { dia: DIAS_SEMANA_CURTO[d.getDay()], qtd };
});

// Atendimentos por modalidade (donut)
const sessoesTotais = agendaFiltrada.filter(ev=>ev.tipo==="sessao");
const contagemModalidade = sessoesTotais.reduce((acc,ev)=>{
  const k = ev.modalidade==="online" ? "Online" : ev.modalidade==="presencial" ? "Presencial" : "Outro";
  acc[k] = (acc[k]||0)+1;
  return acc;
},{});
const totalSessoesModalidade = Object.values(contagemModalidade).reduce((a,b)=>a+b,0) || 1;
const CORES_DONUT = { Presencial:"#3D7A63", Online:"#4A90D9", Outro:"#9B7FC4" };
const dadosDonut = Object.entries(contagemModalidade).map(([nome,qtd])=>({
  nome, qtd, pct: Math.round((qtd/totalSessoesModalidade)*100), cor: CORES_DONUT[nome]||"#9B7FC4"
}));

// Receita dos últimos 7 dias (barras)
const ultimos7Dias = Array.from({length:7},(_,i)=>{
  const d = new Date(hojeDate); d.setDate(d.getDate()-(6-i));
  return d;
});
const receitaUltimos7Dias = ultimos7Dias.map(d=>{
  const dStr = `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
  const total = registrosComData.filter(r=>r.data===dStr).reduce((t,r)=>t+r._valorNum,0);
  return { dia: DIAS_SEMANA_CURTO[d.getDay()], total };
});

// Próximos atendimentos (a partir de hoje, ordenados)
const hojeStr = `${String(hojeDate.getDate()).padStart(2,"0")}/${String(hojeDate.getMonth()+1).padStart(2,"0")}/${hojeDate.getFullYear()}`;
const proximosAtendimentos = agendaFiltrada
  .filter(ev=>ev.tipo==="sessao")
  .map(ev=>({...ev, _data: parseDataBR(ev.data)}))
  .filter(ev=>ev._data && (ev.data===hojeStr || ev._data>hojeDate))
  .sort((a,b)=> a._data - b._data || (a.horario||"").localeCompare(b.horario||""))
  .slice(0,3);

// Pagamentos pendentes (NF não emitida), mais recentes primeiro
const pagamentosPendentesDash = registrosComData
  .filter(r=>!r.nfEmitida)
  .sort((a,b)=> (b._data||0) - (a._data||0))
  .slice(0,3);

  const [nome,setNome]=useState("");const [pacSel,setPacSel]=useState(null);
  const [pagamento,setPagamento]=useState("");const [valor,setValor]=useState("");
  const [data,setData]=useState(HOJE());
  const [titularOpcao,setTitularOpcao]=useState("proprio");const [titularSel,setTitularSel]=useState(null);
  const [sugestoes,setSugestoes]=useState([]);const [sidx,setSidx]=useState(-1);
  const [toast,setToast]=useState(null);
  const [detalhe,setDetalhe]=useState(null);
  const [modalCad,setModalCad]=useState(false);
  const [salvandoPag,setSalvandoPag]=useState(false);
  const [salvandoPac,setSalvandoPac]=useState(false);
  const [tabPag,setTabPag]=useState("recentes");
  const [agendaVisao,setAgendaVisao]=useState("dia");
const [agendaData,setAgendaData]=useState(new Date());
const [modalEvento,setModalEvento]=useState(false);
const [novoEvento,setNovoEvento]=useState({tipo:"sessao",pacienteNome:"",profissional:"diego",descricao:"",horario:"09:00",horarioFim:"10:00",data:"",modalidade:"presencial",recorrencia:"avulsa"});const [editandoEvento,setEditandoEvento]=useState(null);
const [sugestoesEvento,setSugestoesEvento]=useState([]);
  const nomeRef=useRef(null);

  function showT(msg,tipo="ok"){setToast({msg,tipo});setTimeout(()=>setToast(null),2500);}

  async function ativarNotificacoes(){
    try{
      if(Notification.permission==="denied"){
        alert("As notificações estão bloqueadas para esse app. Vá nas configurações do navegador/celular e permita notificações pro Espaço Ciriani manualmente, depois recarregue a página.");
        return;
      }
      const permissao = await Notification.requestPermission();
      if(permissao!=="granted"){
        alert("Permissão não concedida: "+permissao);
        return;
      }
      const messaging = await getMessagingIfSupported(firebaseApp);
      if(!messaging){
        alert("Esse navegador não suporta notificações.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const token = await getToken(messaging,{
        vapidKey:"BDUPczlPlOuxIH0KOTfjF0NxJZyOsucAZ-Goav6NmVibPu9W_3QxYdRHyIcdKC1g8glUBmsmj61nEBe1SxxFQd0",
        serviceWorkerRegistration:registration,
      });
      if(token){
        await setDoc(doc(db,"tokens",token),{criadoEm:Date.now()});
        showT("Notificações ativadas com sucesso!");
      }else{
        alert("Não foi possível gerar o código de notificação (token vazio).");
      }
    }catch(error){
      console.error("Erro ao ativar notificações:",error);
      alert("Erro ao ativar notificações: "+error.message);
    }
  }

  useEffect(()=>{
    if(nome.trim().length<2){setSugestoes([]);return;}
    const q=nome.toLowerCase();
    setSugestoes(pacientes.filter(p=>p.nome.toLowerCase().includes(q)).slice(0,6));
    setSidx(-1);
  },[nome,pacientes]);

  function selPac(p){
    setNome(p.nome);setPacSel(p);setSugestoes([]);setSidx(-1);
    const tit=titulares.find(t=>t.pacienteId===p.id);
    if(tit){setTitularOpcao("outro");setTitularSel(tit);}
    else{setTitularOpcao("proprio");setTitularSel(null);}
    setTimeout(()=>document.getElementById("pag")?.focus(),50);
  }

  function hkd(e){
    if(!sugestoes.length)return;
    if(e.key==="ArrowDown"){e.preventDefault();setSidx(i=>Math.min(i+1,sugestoes.length-1));}
    if(e.key==="ArrowUp"){e.preventDefault();setSidx(i=>Math.max(i-1,0));}
    if(e.key==="Enter"&&sidx>=0){e.preventDefault();selPac(sugestoes[sidx]);}
    if(e.key==="Escape")setSugestoes([]);
  }

  async function registrar(){
    if(!nome||!pagamento){showT("Selecione o paciente e a forma de pagamento.","erro");return;}
    setSalvandoPag(true);
    const novo={data,nome,cpf:pacSel?.cpf||"",pagamento,valor:valor||"—",titularId:titularOpcao==="outro"?titularSel?.id:null,nfEmitida:false};
    const novoId=await addItem("reg",novo);
    const a=[{...novo,id:novoId},...registros];setRegistros(a);
    setNome("");setPacSel(null);setPagamento("");setValor("");setTitularOpcao("proprio");setTitularSel(null);
    nomeRef.current?.focus();showT("Pagamento registrado!");setSalvandoPag(false);
  }

  async function excluirReg(id,nome){
    if(!window.confirm(`Tem certeza que deseja excluir este pagamento de "${nome}"? Essa ação não pode ser desfeita.`))return;
    await deleteItem("reg",id);
    const a=registros.filter(x=>x.id!==id);
    setRegistros(a);
    showT("Pagamento excluído.");
  }

  async function salvarNovoPac(dados){
    setSalvandoPac(true);
    const novoId=await addItem("pac",dados);
    const a=[...pacientes,{id:novoId,...dados}].sort((a,b)=>a.nome.localeCompare(b.nome));
    setPacientes(a);setModalCad(false);showT("Paciente cadastrado!");setSalvandoPac(false);
  }

  async function salvarEdicaoPac(dadosEditados){
    const atualizado={...editandoPac,...dadosEditados};
    await updateItem("pac",atualizado.id,dadosEditados);
    setPacientes(pacientes.map(p=>p.id===atualizado.id?atualizado:p));
    setEditandoPac(null);
    showT("Cadastro atualizado.");
  }

  async function alterarProfissional(p,novoProf){
    await updateItem("pac",p.id,{profissional:novoProf});
    setPacientes(pacientes.map(x=>x.id===p.id?{...x,profissional:novoProf}:x));
    showT("Profissional alterado.");
  }

  async function inativarPac(p){
    await updateItem("pac",p.id,{inativo:true});
    setPacientes(pacientes.map(x=>x.id===p.id?{...x,inativo:true}:x));
    showT("Paciente inativado.");
  }

  async function reativarPac(p){
    await updateItem("pac",p.id,{inativo:false});
    setPacientes(pacientes.map(x=>x.id===p.id?{...x,inativo:false}:x));
    showT("Paciente reativado.");
  }

  async function marcarPacoteAvisado(p){
    await updateItem("pac",p.id,{avisarPacote:false});
    setPacientes(pacientes.map(x=>x.id===p.id?{...x,avisarPacote:false}:x));
  }

async function salvarEvento(){
    if(novoEvento.tipo==="sessao"&&!novoEvento.pacienteNome){showT("Selecione o paciente.","erro");return;}
    if(novoEvento.tipo==="pessoal"&&!novoEvento.descricao.trim()){showT("Descreva o compromisso.","erro");return;}

    const [dd,mm,yyyy]=novoEvento.data.split("/");
    if(!dd||!mm||!yyyy){showT("Data inválida.","erro");return;}
    const dataBase=new Date(Number(yyyy),Number(mm)-1,Number(dd));

    const recorrencia = novoEvento.tipo==="sessao" ? novoEvento.recorrencia : "avulsa";
    const intervaloDias = recorrencia==="semanal" ? 7 : recorrencia==="quinzenal" ? 14 : null;
    const grupoRecorrencia = intervaloDias ? `grp_${Date.now()}` : null;

    const datasParaCriar = [];
    if(intervaloDias){
      for(let i=0;i<52;i++){
        const d=new Date(dataBase);
        d.setDate(d.getDate()+i*intervaloDias);
        datasParaCriar.push(`${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`);
      }
    }else{
      datasParaCriar.push(novoEvento.data);
    }

    const eventosBase = datasParaCriar.map(dataEv=>({
      tipo:novoEvento.tipo,
      pacienteNome:novoEvento.pacienteNome,
      profissional:novoEvento.profissional,
      descricao:novoEvento.descricao,
      horario:novoEvento.horario,
      horarioFim:novoEvento.horarioFim,
      data:dataEv,
      modalidade:novoEvento.modalidade,
      recorrencia,
      grupoRecorrencia
    }));

    const ids = await Promise.all(eventosBase.map(dados=>addItem("age",dados)));
    const novosEventos = eventosBase.map((dados,i)=>({id:ids[i],...dados}));

    setAgenda([...agenda,...novosEventos]);
    setModalEvento(false);
    setNovoEvento({tipo:"sessao",pacienteNome:"",profissional:"diego",descricao:"",horario:"09:00",horarioFim:"10:00",data:novoEvento.data,modalidade:"presencial",recorrencia:"avulsa"});
    showT(intervaloDias ? `${novosEventos.length} sessões agendadas!` : "Evento adicionado à agenda!");
  }

  async function excluirEvento(id){
    const ev=agenda.find(e=>e.id===id);
    if(!ev)return;

    if(ev.grupoRecorrencia){
      const apagarTodas=window.confirm("Este evento faz parte de uma recorrência.\n\nClique OK para excluir esta E TODAS as sessões futuras desta recorrência.\nClique Cancelar para excluir SOMENTE esta sessão.");
      if(apagarTodas){
        const [dd,mm,yyyy]=ev.data.split("/");
        const dataEv=new Date(Number(yyyy),Number(mm)-1,Number(dd));
        const futuras=agenda.filter(e=>{
          if(e.grupoRecorrencia!==ev.grupoRecorrencia)return false;
          const [d2,m2,y2]=e.data.split("/");
          const dataE=new Date(Number(y2),Number(m2)-1,Number(d2));
          return dataE>=dataEv;
        });
        await Promise.all(futuras.map(f=>deleteItem("age",f.id)));
        const idsRemovidos=new Set(futuras.map(f=>f.id));
        setAgenda(agenda.filter(e=>!idsRemovidos.has(e.id)));
        showT(`${futuras.length} sessões removidas.`);
        return;
      }
    }else{
      if(!window.confirm("Tem certeza que deseja excluir este evento da agenda?"))return;
    }

    await deleteItem("age",id);
    setAgenda(agenda.filter(e=>e.id!==id));
    showT("Evento removido.");
  }

  async function salvarEdicaoEvento(){
    if(editandoEvento.tipo==="sessao"&&!editandoEvento.pacienteNome){showT("Selecione o paciente.","erro");return;}
    if(editandoEvento.tipo==="pessoal"&&!editandoEvento.descricao.trim()){showT("Descreva o compromisso.","erro");return;}
    await updateItem("age",editandoEvento.id,{
      tipo:editandoEvento.tipo,
      pacienteNome:editandoEvento.pacienteNome,
      profissional:editandoEvento.profissional,
      descricao:editandoEvento.descricao,
      horario:editandoEvento.horario,
      horarioFim:editandoEvento.horarioFim,
      data:editandoEvento.data,
      modalidade:editandoEvento.modalidade
    });
    setAgenda(agenda.map(ev=>ev.id===editandoEvento.id?editandoEvento:ev));
    setEditandoEvento(null);
    showT("Evento atualizado!");
  }

  async function registrarStatusSessao(status){
    const paciente = pacientes.find(p=>p.nome===editandoEvento.pacienteNome);
    if(!paciente){showT("Paciente não encontrado no cadastro.","erro");return;}

    if(!window.confirm(`Confirma registrar "${STATUS_SESSAO.find(s=>s.id===status)?.label}" para esta sessão?\n\nIsso vai atualizar o evento e criar uma anotação automática na ficha do paciente.`))return;

    await updateItem("age",editandoEvento.id,{status});
    setAgenda(agenda.map(ev=>ev.id===editandoEvento.id?{...ev,status}:ev));

    const [dd,mm,yyyy]=editandoEvento.data.split("/");
    const dataOrdenacao=(dd&&mm&&yyyy)?`${yyyy}-${mm}-${dd}`:"";
    let infoPacote="";
    if(paciente.tipoPagamento==="pacote4"||paciente.tipoPagamento==="pacote8"){
      const totalPacote=paciente.tipoPagamento==="pacote8"?8:4;
      const restanteAntes=paciente.sessoesRestantes ?? totalPacote;
      const numeroSessao=totalPacote-restanteAntes+1;
      infoPacote=` (Sessão ${numeroSessao}/${totalPacote} do pacote)`;
    }
    const dadosEvol={
      pacienteId:paciente.id,
      data:editandoEvento.data,
      texto:STATUS_TEXTO[status]+infoPacote,
      dataOrdenacao
    };
    const novoId=await addItem("evol",dadosEvol);
    setEvolucoes([...evolucoes,{id:novoId,...dadosEvol}]);

    const statusQueConsome=["compareceu","falta_sem_justificativa","remarcacao_fora_prazo"];
    let msgFinal="Status registrado e anotação criada na ficha!";
    if(statusQueConsome.includes(status) && (paciente.tipoPagamento==="pacote4"||paciente.tipoPagamento==="pacote8")){
      const atual=paciente.sessoesRestantes ?? 0;
      const novo=Math.max(0,atual-1);
      await updateItem("pac",paciente.id,{sessoesRestantes:novo});
      setPacientes(pacientes.map(x=>x.id===paciente.id?{...x,sessoesRestantes:novo}:x));
      msgFinal = novo===0
        ? "Status registrado! ⚠️ Pacote esgotado — renove na ficha do paciente."
        : `Status registrado! Restam ${novo} sessão(ões) no pacote.`;
    }

    setEditandoEvento(null);
    showT(msgFinal);
  }
const isMobile = window.innerWidth < 768;
  const titsPacSel=pacSel?titulares.filter(t=>t.pacienteId===pacSel.id):[];
 const ROOT={
  fontFamily:"system-ui, sans-serif",
  width:"100%",
  maxWidth:"100%",
  minHeight:"100vh",
  background:"#f4f6f0",
  padding: isMobile ? "12px" : "24px",
  overflowX:"hidden",
  boxSizing:"border-box"
};
  const CARD2={
  background:"#fff",
  borderRadius:14,
  padding: isMobile ? 12 : 24,
  marginBottom:20,
  boxShadow:"0 2px 12px rgba(0,40,20,0.07)",
  border:"1px solid #deeade"
}
  const LBS={display:"block",fontSize:12,fontWeight:600,color:"#4a6a5a",marginBottom:5,fontFamily:"sans-serif",textTransform:"uppercase",letterSpacing:"0.04em"};
  const INS={width:"100%",padding:"10px 14px",border:"1.5px solid #c8ddd0",borderRadius:8,fontSize:15,fontFamily:"sans-serif",outline:"none",boxSizing:"border-box",background:"#fafdfa",color:"#1a3a2a"};
const ABAS=[
{k:"dashboard",l:"Dashboard",icon:"dashboard"},
{k:"agenda",l:"Agenda",icon:"agenda"},
{k:"pagamentos",l:`Pagamentos (${registrosFiltrados.length})`,icon:"pagamentos"},
{k:"pacientes",l:`Pacientes (${pacientesAtivos.length})`,icon:"pacientes"},
{k:"inativados",l:`Inativados (${pacientesInativos.length})`,icon:"pacientes"},
{k:"titulares",l:`Titulares (${titulares.length})`,icon:"titulares"},
{k:"relatorio",l:"Relatório",icon:"relatorio"},
];
const ABAS_PRINCIPAIS=[
{k:"dashboard",l:"Dashboard",icon:"dashboard"},
{k:"agenda",l:"Agenda",icon:"agenda"},
{k:"pagamentos",l:"Pagamentos",icon:"pagamentos"},
{k:"pacientes",l:"Pacientes",icon:"pacientes"},
{k:"relatorio",l:"Relatório",icon:"relatorio"},
];
const ABAS_SECUNDARIAS=[
{k:"inativados",l:`Inativados (${pacientesInativos.length})`,icon:"pacientes"},
{k:"titulares",l:`Titulares (${titulares.length})`,icon:"titulares"},
];

  return(
    <div style={ROOT}>
      <Toast t={toast}/>
{detalhe&&<ModalFicha p={detalhe} titulares={titulares} registros={registros} evolucoes={evolucoes} setEvolucoes={setEvolucoes} showT={showT} pacientes={pacientes} setPacientes={setPacientes} onClose={()=>setDetalhe(null)}/>}      {modalCad&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"20px 16px",overflowY:"auto"}}>
        <div style={{width:"100%",maxWidth:540}}><FormPaciente onSalvo={salvarNovoPac} onVoltar={()=>setModalCad(false)} titulo="Novo paciente" salvando={salvandoPac}/></div>
      </div>}
      {editandoReg&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setEditandoReg(null)}>
        <div style={{background:"#fff",borderRadius:14,padding:28,width:"100%",maxWidth:420,boxShadow:"0 8px 40px rgba(0,0,0,0.2)"}} onClick={e=>e.stopPropagation()}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
            <h3 style={{margin:0,color:"#1a3a2a",fontSize:18,fontFamily:"Georgia,serif"}}>Editar pagamento</h3>
            <button onClick={()=>setEditandoReg(null)} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#888"}}>✕</button>
          </div>
          <div style={{marginBottom:12,fontFamily:"sans-serif",fontSize:14,color:"#1a3a2a",fontWeight:600}}>{editandoReg.nome}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px 14px",marginBottom:18}}>
            <div>
              <label style={LBS}>Data</label>
              <input style={INS} type="text" inputMode="numeric" maxLength={10} value={editandoReg.data} onChange={e=>setEditandoReg({...editandoReg,data:fData(e.target.value)})}/>
            </div>
            <div>
              <label style={LBS}>Valor (R$)</label>
              <input style={INS} value={editandoReg.valor==="—"?"":editandoReg.valor} onChange={e=>setEditandoReg({...editandoReg,valor:e.target.value||"—"})} placeholder="ex: 200,00"/>
            </div>
            <div style={{gridColumn:"1/-1"}}>
              <label style={LBS}>Forma de pagamento</label>
              <select style={{...INS,cursor:"pointer"}} value={editandoReg.pagamento} onChange={e=>setEditandoReg({...editandoReg,pagamento:e.target.value})}>
                {FORMAS.map(f=><option key={f}>{f}</option>)}
              </select>
            </div>
          </div>
          <button onClick={async()=>{await updateItem("reg",editandoReg.id,{data:editandoReg.data,pagamento:editandoReg.pagamento,valor:editandoReg.valor});setRegistros(registros.map(r=>r.id===editandoReg.id?editandoReg:r));setEditandoReg(null);showT("Pagamento atualizado!");}} style={{width:"100%",padding:13,background:"#2a7a4a",color:"#fff",border:"none",borderRadius:9,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"sans-serif"}}>✓ Salvar alterações</button>
        </div>
      </div>}

{editandoPac&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"20px 16px",overflowY:"auto"}}>
        <div style={{width:"100%",maxWidth:540}}><FormPaciente dadosIniciais={editandoPac} onSalvo={salvarEdicaoPac} onVoltar={()=>setEditandoPac(null)} titulo="Editar paciente" salvando={false} profissional={editandoPac.profissional}/></div>
      </div>}
      {isMobile ? (
        <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <button onClick={()=>setMenuMobileAberto(true)} style={{width:40,height:40,borderRadius:"50%",background:"#fff",border:"1px solid #E3E0D8",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
            <IconDash nome="hamburguer" color="#1C3D2E" size={18}/>
          </button>
          <div style={{textAlign:"center",flex:1}}>
            <img src={logoEspacoCiriani} alt="Espaço Ciriani" style={{width:40,height:40,marginBottom:2}}/>
            <h1 style={{margin:0,fontSize:18,fontWeight:600,color:"#1a3a2a",fontFamily:"Georgia,serif"}}>Espaço Ciriani</h1>
            <p style={{margin:0,fontSize:11,color:"#5a7a6a",fontFamily:"sans-serif"}}>Painel administrativo</p>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={ativarNotificacoes} style={{width:40,height:40,borderRadius:"50%",background:"#fff",border:"1px solid #E3E0D8",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
              <IconDash nome="sino" color="#1C3D2E" size={17}/>
            </button>
            <button onClick={onLogout} style={{width:40,height:40,borderRadius:"50%",background:"#fff",border:"1px solid #f5c6cb",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
              <IconDash nome="saida" color="#c0392b" size={17}/>
            </button>
          </div>
        </header>
      ) : null}
      {isMobile && (
        <div style={{display:"flex",gap:6,justifyContent:"center",marginBottom:18,flexWrap:"wrap"}}>
  {["todos","diego","rhania"].map(id=>{
    const ativo = filtroProf===id;
    const label = id==="todos" ? "Todos" : PROFISSIONAIS.find(p=>p.id===id)?.nome.split(" ")[0];
    return (
      <button
        key={id}
        onClick={()=>setFiltroProf(id)}
        style={{
          padding:"7px 14px",
          borderRadius:20,
          border:"none",
          cursor:"pointer",
          fontSize:12,
          fontWeight:700,
          fontFamily:"sans-serif",
          background: ativo ? "#1C3D2E" : "#fff",
          color: ativo ? "#fff" : "#5a7a6a",
          border: ativo ? "none" : "1.5px solid #c8ddd0",
        }}
      >{label}</button>
    );
  })}
</div>
      )}
      {!isMobile && (
      <header style={{
  display:"flex",
  flexDirection: "row",
  alignItems: "center",
  gap:16,
  marginBottom:24
}}>
        <img src={logoEspacoCiriani} alt="Espaço Ciriani" style={{width:38,height:38}}/>
        <div>
          <h1 style={{margin:0,fontSize:22,fontWeight:600,color:"#1a3a2a"}}>Espaço Ciriani</h1>
          <p style={{margin:0,fontSize:13,color:"#5a7a6a",fontFamily:"sans-serif"}}>Painel administrativo</p>
        </div>
        <div style={{display:"flex",gap:6,marginLeft:16,flexWrap:"wrap"}}>
  {["todos","diego","rhania"].map(id=>{
    const ativo = filtroProf===id;
    const label = id==="todos" ? "Todos" : PROFISSIONAIS.find(p=>p.id===id)?.nome.split(" ")[0];
    return (
      <button
        key={id}
        onClick={()=>setFiltroProf(id)}
        style={{
          padding:"7px 14px",
          borderRadius:20,
          border:"none",
          cursor:"pointer",
          fontSize:12,
          fontWeight:700,
          fontFamily:"sans-serif",
          background: ativo ? "#1C3D2E" : "#fff",
          color: ativo ? "#fff" : "#5a7a6a",
          border: ativo ? "none" : "1.5px solid #c8ddd0",
        }}
      >{label}</button>
    );
  })}
</div>
        <div style={{
  marginLeft:"auto",
  display:"flex",
  gap:10,
}}>
          <button onClick={onCadastro} style={{padding:"9px 16px",background:"#2a7a4a",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontSize:13,fontFamily:"sans-serif",fontWeight:600}}>📋 Formulário</button>
          <button onClick={ativarNotificacoes} style={{display:"flex",alignItems:"center",gap:7,padding:"9px 16px",background:"#fff",color:"#1C3D2E",border:"1.5px solid #c8ddd0",borderRadius:8,cursor:"pointer",fontSize:13,fontFamily:"sans-serif",fontWeight:600}}><IconDash nome="sino" color="#1C3D2E" size={16}/> Notificações</button>
          <button onClick={onLogout} style={{padding:"9px 16px",background:"#fff",color:"#c0392b",border:"1.5px solid #f5c6cb",borderRadius:8,cursor:"pointer",fontSize:13,fontFamily:"sans-serif",fontWeight:600}}>Sair</button>
        </div>
</header>
      )}
      {/* ABAS */}
<div style={{
  display:"flex",
  flexDirection: "row",
  gap:30,
  alignItems:"flex-start",
  width:"100%",
  maxWidth:"100%",
  boxSizing:"border-box"
}}>

 {!isMobile && (
 <div style={{
  width:190,
  maxWidth:190,
  boxSizing:"border-box",
  background:"#E7F2EC",
  border:"1px solid #D3E5DB",
  borderRadius:12,
  padding:16,
  position:"sticky",
  top:20,
}}>
    {ABAS.map(a=>{
  const ativo = aba===a.k;
  return (
    <button
      key={a.k}
      onClick={()=>setAba(a.k)}
      style={{
        display:"flex",
        alignItems:"center",
        gap:10,
        width:"100%",
        textAlign:"left",
        marginBottom:6,
        padding:"10px 12px",
        borderRadius:9,
        cursor:"pointer",
        fontSize:14,
        fontWeight: ativo ? 700 : 500,
        fontFamily:"sans-serif",
        background: ativo ? "#3D7A63" : "transparent",
        color: ativo ? "#fff" : "#3D5A4C",
        border:"none",
      }}
    >
      <IconAba nome={a.icon} color={ativo ? "#fff" : "#5C8A75"} size={17} />
      <span style={{flex:1}}>{a.l}</span>
    </button>
  );
})}
    <div style={{
      marginTop:18,
      paddingTop:14,
      borderTop:"1px solid #D3E5DB",
      display:"flex",
      alignItems:"center",
      gap:10,
    }}>
      <div style={{
        width:36,height:36,borderRadius:"50%",flexShrink:0,
        background:"#3D7A63",color:"#fff",
        display:"flex",alignItems:"center",justifyContent:"center",
        fontWeight:700,fontSize:13,fontFamily:"sans-serif",
      }}>DC</div>
      <div style={{minWidth:0}}>
        <div style={{fontFamily:"sans-serif",fontSize:13,fontWeight:700,color:"#1C3D2E",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>Diego Ciriani</div>
        <div style={{fontFamily:"sans-serif",fontSize:11,color:"#5C8A75"}}>Administrador</div>
      </div>
    </div>
  </div>
  )}

  <div style={{
  flex:1,
  width:"100%",
  minWidth:0,
  overflowX:"hidden",
  paddingBottom: isMobile ? 76 : 0
}}>
{aba==="agenda"&&<>
  <section style={CARD2}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:10}}>
      <h2 style={{margin:0,fontSize:17,fontWeight:700,color:"#1a3a2a"}}>Agenda</h2>
      <button onClick={()=>{setNovoEvento({...novoEvento,data:agendaData.toLocaleDateString("pt-BR")});setModalEvento(true);}} style={{padding:"8px 16px",background:"#2a7a4a",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontSize:13,fontFamily:"sans-serif",fontWeight:600}}>+ Novo evento</button>
    </div>

    <div style={{display:"flex",gap:6,marginBottom:18}}>
      {[["dia","Dia"],["semana","Semana"],["mes","Mês"]].map(([v,l])=>(
        <button key={v} onClick={()=>setAgendaVisao(v)} style={{padding:"7px 14px",borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"sans-serif",background:agendaVisao===v?"#2a7a4a":"#fff",color:agendaVisao===v?"#fff":"#4a6a5a",border:agendaVisao===v?"none":"1.5px solid #c8ddd0",fontWeight:agendaVisao===v?700:400}}>{l}</button>
      ))}
    </div>

    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18,flexWrap:"wrap",gap:10}}>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <button onClick={()=>{
          const dias = agendaVisao==="dia" ? 1 : agendaVisao==="semana" ? 7 : 30;
          setAgendaData(new Date(agendaData.getTime()-dias*86400000));
        }} style={{padding:"7px 12px",background:"#fff",border:"1.5px solid #c8ddd0",borderRadius:7,cursor:"pointer",fontSize:14,fontFamily:"sans-serif"}}>←</button>
        <div style={{fontFamily:"sans-serif",fontSize:15,fontWeight:700,color:"#1a3a2a",minWidth:160,textAlign:"center"}}>
          {agendaVisao==="dia" && agendaData.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"})}
          {agendaVisao==="semana" && "Semana de "+agendaData.toLocaleDateString("pt-BR",{day:"2-digit",month:"long"})}
          {agendaVisao==="mes" && agendaData.toLocaleDateString("pt-BR",{month:"long",year:"numeric"})}
        </div>
        <button onClick={()=>{
          const dias = agendaVisao==="dia" ? 1 : agendaVisao==="semana" ? 7 : 30;
          setAgendaData(new Date(agendaData.getTime()+dias*86400000));
        }} style={{padding:"7px 12px",background:"#fff",border:"1.5px solid #c8ddd0",borderRadius:7,cursor:"pointer",fontSize:14,fontFamily:"sans-serif"}}>→</button>
        <button onClick={()=>setAgendaData(new Date())} style={{padding:"7px 12px",background:"#e8f4ec",border:"1.5px solid #b0d8bc",borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"sans-serif",color:"#1a4a2a"}}>Hoje</button>
      </div>
    </div>

    {agendaVisao==="dia" && (() => {
      const dataStr=agendaData.toLocaleDateString("pt-BR");
      const eventosDoDia=agenda.filter(ev=>ev.data===dataStr);
      const horarios=[];
      for(let h=7;h<=21;h++) horarios.push(`${String(h).padStart(2,"0")}:00`);
      return (
        <div style={{display:"flex",flexDirection:"column"}}>
          {horarios.map(hr=>{
            const evDoHorario=eventosDoDia.find(ev=>ev.horario===hr);
            return (
              <div key={hr} style={{display:"flex",alignItems:"stretch",borderBottom:"1px solid #eef4ec",minHeight:52}}>
                <div style={{width:54,flexShrink:0,fontFamily:"sans-serif",fontSize:13,fontWeight:700,color:"#5a7a6a",paddingTop:10,textAlign:"right",paddingRight:10}}>{hr}</div>
                {evDoHorario
                  ? <div style={{flex:1,display:"flex",alignItems:"center",gap:14,padding:"8px 12px",margin:"4px 0",background: evDoHorario.tipo!=="sessao" ? "#f2f2f0" : evDoHorario.profissional==="rhania" ? "#F3EFFA" : "#f7faf8",borderRadius:8,border:`1px solid ${evDoHorario.tipo!=="sessao" ? "#d8d8d4" : evDoHorario.profissional==="rhania" ? "#D4C5F0" : "#e0ede5"}`}}>
                      <div style={{flex:1}}>
                        <div style={{fontFamily:"sans-serif",fontWeight:700,fontSize:14,color:"#1a3a2a"}}>
                          {evDoHorario.tipo==="sessao" ? evDoHorario.pacienteNome : evDoHorario.descricao}
                        </div>
                        <div style={{fontFamily:"sans-serif",fontSize:12,color:"#5a7a6a",marginTop:2}}>
                          {evDoHorario.tipo==="sessao" ? `Sessão ${evDoHorario.modalidade==="online"?"· Online":"· Presencial"}` : "Compromisso pessoal"} · {PROFISSIONAIS.find(p=>p.id===evDoHorario.profissional)?.nome}
                        </div>
                      </div>
                      <button onClick={()=>setEditandoEvento({...evDoHorario})} style={{background:"none",border:"none",color:"#1a3a6a",cursor:"pointer",fontSize:13,fontFamily:"sans-serif",marginRight:8}}>editar</button>
                      <button onClick={()=>excluirEvento(evDoHorario.id)} style={{background:"none",border:"none",color:"#c0392b",cursor:"pointer",fontSize:16,padding:"0 4px"}}>✕</button>
                    </div>
                  : <div onClick={()=>{setNovoEvento({...novoEvento,data:dataStr,horario:hr});setModalEvento(true);}} style={{flex:1,cursor:"pointer",borderRadius:8,margin:"4px 0"}} onMouseOver={e=>e.currentTarget.style.background="#f4f6f0"} onMouseOut={e=>e.currentTarget.style.background="transparent"}/>
                }
              </div>
            );
          })}
        </div>
      );
    })()}

    {agendaVisao==="semana" && (() => {
      const inicioSemana = new Date(agendaData);
      const diaSemana = inicioSemana.getDay();
      inicioSemana.setDate(inicioSemana.getDate()-diaSemana);
      const dias=[];
      for(let i=0;i<7;i++){
        const d=new Date(inicioSemana);
        d.setDate(d.getDate()+i);
        dias.push(d);
      }
      const horarios=[];
      for(let h=7;h<=21;h++) horarios.push(h);
      const ALTURA_HORA=56;

      function minutosDesde7h(horarioStr){
        const [h,m]=horarioStr.split(":").map(Number);
        return (h-7)*60+m;
      }

      return (
        <div style={{overflowX:"auto"}}>
          <div style={{display:"grid",gridTemplateColumns:"50px repeat(7,minmax(110px,1fr))",minWidth:850}}>
            <div/>
            {dias.map((d,i)=>{
              const ehHoje=d.toLocaleDateString("pt-BR")===new Date().toLocaleDateString("pt-BR");
              return (
                <div key={i} style={{textAlign:"center",paddingBottom:8,borderBottom:"2px solid #deeade"}}>
                  <div style={{fontFamily:"sans-serif",fontSize:11,fontWeight:700,color:"#5a7a6a",textTransform:"uppercase"}}>
                    {d.toLocaleDateString("pt-BR",{weekday:"short"}).replace(".","")}
                  </div>
                  <div style={{fontFamily:"sans-serif",fontSize:16,fontWeight:700,color: ehHoje ? "#fff" : "#1a3a2a",display:"inline-flex",alignItems:"center",justifyContent:"center",width:28,height:28,borderRadius:"50%",background: ehHoje ? "#2a7a4a" : "transparent",marginTop:2}}>
                    {d.getDate()}
                  </div>
                </div>
              );
            })}

            <div style={{position:"relative"}}>
              {horarios.map(h=>(
                <div key={h} style={{height:ALTURA_HORA,fontFamily:"sans-serif",fontSize:11,color:"#5a7a6a",textAlign:"right",paddingRight:6,borderTop:"1px solid #eef4ec",boxSizing:"border-box"}}>
                  {String(h).padStart(2,"0")}:00
                </div>
              ))}
            </div>

            {dias.map((d,i)=>{
              const dataStr=d.toLocaleDateString("pt-BR");
              const eventosDoDia=agenda.filter(ev=>ev.data===dataStr);
              return (
                <div key={i} style={{position:"relative",borderLeft:"1px solid #eef4ec"}}>
                  {horarios.map(h=>(
                    <div key={h} onClick={()=>{setNovoEvento({...novoEvento,data:dataStr,horario:`${String(h).padStart(2,"0")}:00`,horarioFim:`${String(h+1).padStart(2,"0")}:00`});setModalEvento(true);}} style={{height:ALTURA_HORA,borderTop:"1px solid #eef4ec",boxSizing:"border-box",cursor:"pointer"}} onMouseOver={e=>e.currentTarget.style.background="#f4f6f0"} onMouseOut={e=>e.currentTarget.style.background="transparent"}/>
                  ))}
                  {eventosDoDia.map(ev=>{
                    const inicioMin=minutosDesde7h(ev.horario);
                    const fimMin=ev.horarioFim ? minutosDesde7h(ev.horarioFim) : inicioMin+60;
                    const top=(inicioMin/60)*ALTURA_HORA;
                    const altura=Math.max(((fimMin-inicioMin)/60)*ALTURA_HORA,24);
                    return (
                      <div key={ev.id} onClick={()=>setEditandoEvento({...ev})} title="Clique para editar" style={{
                        position:"absolute", top, left:3, right:3, height:altura,
                        background: ev.tipo!=="sessao" ? "#8A8A85" : ev.profissional==="rhania" ? "#9B7EDE" : "#3D7A63",
                        borderRadius:6, padding:"3px 6px", overflow:"hidden", cursor:"pointer",
                        boxShadow:"0 1px 3px rgba(0,0,0,0.15)"
                      }}>
                        <div style={{fontFamily:"sans-serif",fontSize:11,fontWeight:700,color:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                          {ev.tipo==="sessao" ? ev.pacienteNome : ev.descricao}
                        </div>
                        <div style={{fontFamily:"sans-serif",fontSize:10,color:"rgba(255,255,255,0.85)"}}>
                          {ev.horario}{ev.horarioFim?` – ${ev.horarioFim}`:""}{ev.tipo==="sessao"&&ev.modalidade?` · ${ev.modalidade==="online"?"Online":"Presencial"}`:""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      );
    })()}

    {agendaVisao==="mes" && (() => {
      const ano=agendaData.getFullYear();
      const mes=agendaData.getMonth();
      const primeiroDia=new Date(ano,mes,1);
      const ultimoDia=new Date(ano,mes+1,0);
      const diaSemanaInicio=primeiroDia.getDay();
      const totalDias=ultimoDia.getDate();
      const celulas=[];
      for(let i=0;i<diaSemanaInicio;i++) celulas.push(null);
      for(let d=1;d<=totalDias;d++) celulas.push(new Date(ano,mes,d));

      return (
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6}}>
          {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map(d=>(
            <div key={d} style={{fontFamily:"sans-serif",fontSize:11,fontWeight:700,color:"#5a7a6a",textAlign:"center",paddingBottom:4}}>{d}</div>
          ))}
          {celulas.map((d,i)=>{
            if(!d) return <div key={i}/>;
            const dataStr=d.toLocaleDateString("pt-BR");
            const eventosDoDia=agenda.filter(ev=>ev.data===dataStr);
            const ehHoje=dataStr===new Date().toLocaleDateString("pt-BR");
            return (
              <div key={i} onClick={()=>{setAgendaData(d);setAgendaVisao("dia");}} style={{
                minHeight:64, padding:"6px 6px", borderRadius:8, cursor:"pointer",
                background: ehHoje ? "#e8f4ec" : "#f7faf8",
                border: ehHoje ? "1.5px solid #2a7a4a" : "1px solid #e0ede5"
              }}>
                <div style={{fontFamily:"sans-serif",fontSize:12,fontWeight:700,color: ehHoje ? "#1a4a2a" : "#1a3a2a",marginBottom:3}}>{d.getDate()}</div>
                {eventosDoDia.slice(0,2).map(ev=>(
                  <div key={ev.id} style={{fontFamily:"sans-serif",fontSize:10,color:"#fff",background: ev.tipo==="sessao" ? "#2a7a4a" : "#B9762F",borderRadius:4,padding:"1px 4px",marginBottom:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                    {ev.horario} {ev.tipo==="sessao" ? ev.pacienteNome : ev.descricao}
                  </div>
                ))}
                {eventosDoDia.length>2 && <div style={{fontFamily:"sans-serif",fontSize:10,color:"#5a7a6a"}}>+{eventosDoDia.length-2} mais</div>}
              </div>
            );
          })}
        </div>
      );
    })()}
  </section>
</>}

{modalEvento&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setModalEvento(false)}>
  <div style={{background:"#fff",borderRadius:14,padding:28,width:"100%",maxWidth:440,boxShadow:"0 8px 40px rgba(0,0,0,0.2)",maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
      <h3 style={{margin:0,color:"#1a3a2a",fontSize:18,fontFamily:"Georgia,serif"}}>Novo evento</h3>
      <button onClick={()=>setModalEvento(false)} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#888"}}>✕</button>
    </div>

    <div style={{display:"flex",gap:8,marginBottom:16}}>
      <button onClick={()=>setNovoEvento({...novoEvento,tipo:"sessao"})} style={{flex:1,padding:"9px 0",borderRadius:8,border: novoEvento.tipo==="sessao" ? "none" : "1.5px solid #c8ddd0",background: novoEvento.tipo==="sessao" ? "#2a7a4a" : "#fff",color: novoEvento.tipo==="sessao" ? "#fff" : "#4a6a5a",cursor:"pointer",fontSize:13,fontFamily:"sans-serif",fontWeight:600}}>Sessão</button>
      <button onClick={()=>setNovoEvento({...novoEvento,tipo:"pessoal"})} style={{flex:1,padding:"9px 0",borderRadius:8,border: novoEvento.tipo==="pessoal" ? "none" : "1.5px solid #c8ddd0",background: novoEvento.tipo==="pessoal" ? "#B9762F" : "#fff",color: novoEvento.tipo==="pessoal" ? "#fff" : "#4a6a5a",cursor:"pointer",fontSize:13,fontFamily:"sans-serif",fontWeight:600}}>Compromisso pessoal</button>
    </div>

    {novoEvento.tipo==="sessao"
      ? <div style={{marginBottom:14}}>
          <label style={LBS}>Paciente</label>
          <div style={{position:"relative"}}>
            <input style={INS} placeholder="Digite o nome para buscar..." autoComplete="off" value={novoEvento.pacienteNome} onChange={e=>{
              const v=e.target.value;
              setNovoEvento({...novoEvento,pacienteNome:v});
              if(v.trim().length<2){setSugestoesEvento([]);return;}
              const q=v.toLowerCase();
              setSugestoesEvento(pacientes.filter(p=>p.nome.toLowerCase().includes(q)).slice(0,6));
            }} onBlur={()=>setTimeout(()=>setSugestoesEvento([]),150)}/>
            {sugestoesEvento.length>0&&<ul style={{position:"absolute",top:"100%",left:0,right:0,background:"#fff",border:"1.5px solid #c8ddd0",borderRadius:8,zIndex:100,listStyle:"none",margin:0,padding:"4px 0",boxShadow:"0 8px 24px rgba(0,40,20,0.12)",maxHeight:180,overflowY:"auto"}}>
              {sugestoesEvento.map((p,i)=><li key={i} style={{padding:"9px 14px",cursor:"pointer",fontFamily:"sans-serif",fontSize:14}} onMouseDown={()=>{setNovoEvento({...novoEvento,pacienteNome:p.nome});setSugestoesEvento([]);}}>
                <span style={{fontWeight:600}}>{p.nome}</span><span style={{color:"#888",fontSize:12,marginLeft:8}}>{p.cpf}</span>
              </li>)}
            </ul>}
          </div>
        </div>
      : <div style={{marginBottom:14}}>
          <label style={LBS}>Descrição</label>
          <input style={INS} placeholder="Ex: Academia, Médico, Gravação" value={novoEvento.descricao} onChange={e=>setNovoEvento({...novoEvento,descricao:e.target.value})}/>
        </div>
    }

    {novoEvento.tipo==="sessao"&&<div style={{marginBottom:14}}>
      <label style={LBS}>Modalidade</label>
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>setNovoEvento({...novoEvento,modalidade:"presencial"})} style={{flex:1,padding:"9px 0",borderRadius:8,border: novoEvento.modalidade==="presencial" ? "none" : "1.5px solid #c8ddd0",background: novoEvento.modalidade==="presencial" ? "#1C3D2E" : "#fff",color: novoEvento.modalidade==="presencial" ? "#fff" : "#4a6a5a",cursor:"pointer",fontSize:13,fontFamily:"sans-serif",fontWeight:600}}>Presencial</button>
        <button onClick={()=>setNovoEvento({...novoEvento,modalidade:"online"})} style={{flex:1,padding:"9px 0",borderRadius:8,border: novoEvento.modalidade==="online" ? "none" : "1.5px solid #c8ddd0",background: novoEvento.modalidade==="online" ? "#1C3D2E" : "#fff",color: novoEvento.modalidade==="online" ? "#fff" : "#4a6a5a",cursor:"pointer",fontSize:13,fontFamily:"sans-serif",fontWeight:600}}>Online</button>
      </div>
    </div>}

    {novoEvento.tipo==="sessao"&&<div style={{marginBottom:14}}>
      <label style={LBS}>Recorrência</label>
      <select style={{...INS,cursor:"pointer"}} value={novoEvento.recorrencia} onChange={e=>setNovoEvento({...novoEvento,recorrencia:e.target.value})}>
        <option value="avulsa">Sessão avulsa</option>
        <option value="semanal">Semanal (toda semana, mesmo dia e horário)</option>
        <option value="quinzenal">Quinzenal (a cada 2 semanas)</option>
      </select>
    </div>}

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px 14px",marginBottom:14}}>
      <div style={{gridColumn:"1/-1"}}>
        <label style={LBS}>Data</label>
        <input style={INS} type="text" inputMode="numeric" placeholder="DD/MM/AAAA" maxLength={10} value={novoEvento.data} onChange={e=>setNovoEvento({...novoEvento,data:fData(e.target.value)})}/>
      </div>
      <div>
        <label style={LBS}>Horário início</label>
        <input style={INS} type="time" value={novoEvento.horario} onChange={e=>setNovoEvento({...novoEvento,horario:e.target.value})}/>
      </div>
      <div>
        <label style={LBS}>Horário término</label>
        <input style={INS} type="time" value={novoEvento.horarioFim} onChange={e=>setNovoEvento({...novoEvento,horarioFim:e.target.value})}/>
      </div>
    </div>

    <div style={{marginBottom:18}}>
      <label style={LBS}>Profissional</label>
      <select style={{...INS,cursor:"pointer"}} value={novoEvento.profissional} onChange={e=>setNovoEvento({...novoEvento,profissional:e.target.value})}>
        {PROFISSIONAIS.map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}
      </select>
    </div>

    <button onClick={salvarEvento} style={{width:"100%",padding:13,background:"#2a7a4a",color:"#fff",border:"none",borderRadius:9,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"sans-serif"}}>✓ Adicionar à agenda</button>
  </div>
</div>}
{editandoEvento&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setEditandoEvento(null)}>
  <div style={{background:"#fff",borderRadius:14,padding:28,width:"100%",maxWidth:440,boxShadow:"0 8px 40px rgba(0,0,0,0.2)",maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
      <h3 style={{margin:0,color:"#1a3a2a",fontSize:18,fontFamily:"Georgia,serif"}}>Editar evento</h3>
      <button onClick={()=>setEditandoEvento(null)} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#888"}}>✕</button>
    </div>

    <div style={{display:"flex",gap:8,marginBottom:16}}>
      <button onClick={()=>setEditandoEvento({...editandoEvento,tipo:"sessao"})} style={{flex:1,padding:"9px 0",borderRadius:8,border: editandoEvento.tipo==="sessao" ? "none" : "1.5px solid #c8ddd0",background: editandoEvento.tipo==="sessao" ? "#2a7a4a" : "#fff",color: editandoEvento.tipo==="sessao" ? "#fff" : "#4a6a5a",cursor:"pointer",fontSize:13,fontFamily:"sans-serif",fontWeight:600}}>Sessão</button>
      <button onClick={()=>setEditandoEvento({...editandoEvento,tipo:"pessoal"})} style={{flex:1,padding:"9px 0",borderRadius:8,border: editandoEvento.tipo==="pessoal" ? "none" : "1.5px solid #c8ddd0",background: editandoEvento.tipo==="pessoal" ? "#B9762F" : "#fff",color: editandoEvento.tipo==="pessoal" ? "#fff" : "#4a6a5a",cursor:"pointer",fontSize:13,fontFamily:"sans-serif",fontWeight:600}}>Compromisso pessoal</button>
    </div>

    {editandoEvento.tipo==="sessao"
      ? <div style={{marginBottom:14}}>
          <label style={LBS}>Paciente</label>
          <input style={INS} placeholder="Nome do paciente" value={editandoEvento.pacienteNome} onChange={e=>setEditandoEvento({...editandoEvento,pacienteNome:e.target.value})}/>
        </div>
      : <div style={{marginBottom:14}}>
          <label style={LBS}>Descrição</label>
          <input style={INS} placeholder="Ex: Academia, Médico, Gravação" value={editandoEvento.descricao} onChange={e=>setEditandoEvento({...editandoEvento,descricao:e.target.value})}/>
        </div>
    }

    {editandoEvento.tipo==="sessao"&&<div style={{marginBottom:14}}>
      <label style={LBS}>Modalidade</label>
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>setEditandoEvento({...editandoEvento,modalidade:"presencial"})} style={{flex:1,padding:"9px 0",borderRadius:8,border: editandoEvento.modalidade==="presencial" ? "none" : "1.5px solid #c8ddd0",background: editandoEvento.modalidade==="presencial" ? "#1C3D2E" : "#fff",color: editandoEvento.modalidade==="presencial" ? "#fff" : "#4a6a5a",cursor:"pointer",fontSize:13,fontFamily:"sans-serif",fontWeight:600}}>Presencial</button>
        <button onClick={()=>setEditandoEvento({...editandoEvento,modalidade:"online"})} style={{flex:1,padding:"9px 0",borderRadius:8,border: editandoEvento.modalidade==="online" ? "none" : "1.5px solid #c8ddd0",background: editandoEvento.modalidade==="online" ? "#1C3D2E" : "#fff",color: editandoEvento.modalidade==="online" ? "#fff" : "#4a6a5a",cursor:"pointer",fontSize:13,fontFamily:"sans-serif",fontWeight:600}}>Online</button>
      </div>
    </div>}

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px 14px",marginBottom:14}}>
      <div style={{gridColumn:"1/-1"}}>
        <label style={LBS}>Data</label>
        <input style={INS} type="text" inputMode="numeric" placeholder="DD/MM/AAAA" maxLength={10} value={editandoEvento.data} onChange={e=>setEditandoEvento({...editandoEvento,data:fData(e.target.value)})}/>
      </div>
      <div>
        <label style={LBS}>Horário início</label>
        <input style={INS} type="time" value={editandoEvento.horario} onChange={e=>setEditandoEvento({...editandoEvento,horario:e.target.value})}/>
      </div>
      <div>
        <label style={LBS}>Horário término</label>
        <input style={INS} type="time" value={editandoEvento.horarioFim} onChange={e=>setEditandoEvento({...editandoEvento,horarioFim:e.target.value})}/>
      </div>
    </div>

    <div style={{marginBottom:18}}>
      <label style={LBS}>Profissional</label>
      <select style={{...INS,cursor:"pointer"}} value={editandoEvento.profissional} onChange={e=>setEditandoEvento({...editandoEvento,profissional:e.target.value})}>
        {PROFISSIONAIS.map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}
      </select>
    </div>

    <button onClick={salvarEdicaoEvento} style={{width:"100%",padding:13,background:"#2a7a4a",color:"#fff",border:"none",borderRadius:9,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"sans-serif",marginBottom: editandoEvento.tipo==="sessao" ? 18 : 0}}>✓ Salvar alterações</button>

    {editandoEvento.tipo==="sessao"&&<div style={{borderTop:"1px solid #eef4ec",paddingTop:16}}>
      <label style={LBS}>Status da sessão</label>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:8}}>
        {STATUS_SESSAO.map(s=>(
          <button key={s.id} onClick={()=>registrarStatusSessao(s.id)} style={{
            padding:"10px 14px", borderRadius:8, cursor:"pointer",
            fontSize:13, fontFamily:"sans-serif", fontWeight:600, textAlign:"left",
            background: editandoEvento.status===s.id ? s.cor : "#f7faf8",
            color: editandoEvento.status===s.id ? "#fff" : "#1a3a2a",
            border: editandoEvento.status===s.id ? "none" : "1.5px solid #e0ede5"
          }}>{s.label}</button>
        ))}
      </div>
    </div>}
  </div>
</div>}
{aba==="dashboard"&&<>
  <section style={CARD2}>
  <h2 style={{
    margin:"0 0 20px",
    fontSize: isMobile ? 24 : 20,
    fontWeight:400,
    color:"#1C3D2E",
    fontFamily:"Georgia,serif"
  }}>
    Dashboard
  </h2>

  {/* CARDS DE MÉTRICA */}
  <div style={{
    display:"grid",
    gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(200px, 1fr))",
    gap:14,
    marginBottom:24
  }}>
    {[
      { label:"Total de Pacientes", sub:"Ativos", value: String(pacientesAtivos.length), icon:"pacientes", bg:"#E7F2EC", fg:"#3D7A63" },
      { label:"Atendimentos esta semana", sub:"Agendados", value: String(eventosEstaSemana.length), icon:"agenda", bg:"#E6EFFA", fg:"#4A90D9" },
      { label:"Receita da semana", sub:"Total", value: formatBRL(receitaSemana), icon:"cifrao", bg:"#EAF6EE", fg:"#3D9B6A" },
      { label:"Receita do mês", sub:"Total", value: formatBRL(receitaMes), icon:"carteira", bg:"#F0EAF8", fg:"#9B7FC4" },
    ].map((m,i)=>(
      <div key={i} style={{
        background:"#fff", borderRadius:14, border:"1px solid #E3E0D8",
        padding:"20px 18px", display:"flex", flexDirection:"column", alignItems:"center",
        textAlign:"center", gap:10, boxSizing:"border-box"
      }}>
        <div style={{
          width:48, height:48, borderRadius:"50%", background:m.bg, color:m.fg,
          display:"flex", alignItems:"center", justifyContent:"center"
        }}>
          <IconDash nome={m.icon} color={m.fg} size={22}/>
        </div>
        <span style={{fontFamily:"sans-serif",fontSize:13,fontWeight:600,color:"#5a7a6a",lineHeight:1.3}}>{m.label}</span>
        <span style={{fontFamily:"sans-serif",fontSize: isMobile?22:26,fontWeight:800,color:"#1C3D2E",letterSpacing:"-0.5px"}}>{m.value}</span>
        <span style={{fontFamily:"sans-serif",fontSize:12,fontWeight:600,color:"#9aa8a0"}}>{m.sub}</span>
      </div>
    ))}
  </div>

  {/* GRÁFICOS: ATENDIMENTOS NA SEMANA + POR MODALIDADE */}
  <div style={{
    display:"grid",
    gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(380px, 1fr))",
    gap:16,
    marginBottom:16
  }}>
    <div style={{background:"#fff", borderRadius:14, border:"1px solid #E3E0D8", padding:18}}>
      <h3 style={{fontFamily:"sans-serif",fontSize:14,fontWeight:700,color:"#1C3D2E",margin:"0 0 14px"}}>Atendimentos agendados na semana</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={atendimentosPorDiaSemana} margin={{top:10,right:10,left:-20,bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E3E0D8" vertical={false}/>
          <XAxis dataKey="dia" tick={{fontSize:12,fontFamily:"sans-serif",fill:"#6B7A72"}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fontSize:12,fontFamily:"sans-serif",fill:"#6B7A72"}} axisLine={false} tickLine={false} allowDecimals={false}/>
          <Tooltip contentStyle={{fontFamily:"sans-serif",fontSize:13,borderRadius:8,border:"1px solid #E3E0D8"}}/>
          <Line type="monotone" dataKey="qtd" stroke="#3D7A63" strokeWidth={2.5} dot={{r:4,fill:"#3D7A63"}} activeDot={{r:6}}/>
        </LineChart>
      </ResponsiveContainer>
    </div>

    <div style={{background:"#fff", borderRadius:14, border:"1px solid #E3E0D8", padding:18}}>
      <h3 style={{fontFamily:"sans-serif",fontSize:14,fontWeight:700,color:"#1C3D2E",margin:"0 0 14px"}}>Atendimentos por modalidade</h3>
      {dadosDonut.length===0 ? (
        <div style={{textAlign:"center",color:"#8aaa9a",fontFamily:"sans-serif",padding:"40px 0",fontSize:13}}>Sem dados suficientes ainda.</div>
      ) : (
        <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
          <ResponsiveContainer width="100%" minWidth={180} height={180} style={{flex:"1 1 220px"}}>
            <PieChart>
              <Pie data={dadosDonut} dataKey="qtd" nameKey="nome" innerRadius={48} outerRadius={75} paddingAngle={2}>
                {dadosDonut.map((d,i)=><Cell key={i} fill={d.cor}/>)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div style={{display:"flex",flexDirection:"column",gap:10,flex:"1 1 140px",minWidth:140}}>
            {dadosDonut.map((d,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontFamily:"sans-serif",fontSize:13}}>
                <span style={{width:10,height:10,minWidth:10,borderRadius:"50%",background:d.cor,flexShrink:0,display:"inline-block"}}/>
                <span style={{color:"#1C3D2E",fontWeight:600,whiteSpace:"nowrap"}}>{d.nome}</span>
                <span style={{color:"#6B7A72",whiteSpace:"nowrap"}}>{d.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  </div>

  {/* RECEITA ÚLTIMOS 7 DIAS */}
  <div style={{background:"#fff", borderRadius:14, border:"1px solid #E3E0D8", padding:18, marginBottom:16}}>
    <h3 style={{fontFamily:"sans-serif",fontSize:14,fontWeight:700,color:"#1C3D2E",margin:"0 0 14px"}}>Receita dos últimos 7 dias</h3>
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={receitaUltimos7Dias} margin={{top:10,right:10,left:-10,bottom:0}}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E3E0D8" vertical={false}/>
        <XAxis dataKey="dia" tick={{fontSize:12,fontFamily:"sans-serif",fill:"#6B7A72"}} axisLine={false} tickLine={false}/>
        <YAxis tick={{fontSize:12,fontFamily:"sans-serif",fill:"#6B7A72"}} axisLine={false} tickLine={false}/>
        <Tooltip formatter={(v)=>formatBRL(v)} contentStyle={{fontFamily:"sans-serif",fontSize:13,borderRadius:8,border:"1px solid #E3E0D8"}}/>
        <Bar dataKey="total" fill="#3D7A63" radius={[6,6,0,0]}/>
      </BarChart>
    </ResponsiveContainer>
  </div>

  {/* PRÓXIMOS ATENDIMENTOS + PAGAMENTOS PENDENTES */}
  <div style={{
    display:"grid",
    gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(320px, 1fr))",
    gap:16
  }}>
    <div style={{background:"#fff", borderRadius:14, border:"1px solid #E3E0D8", padding:18}}>
      <h3 style={{fontFamily:"sans-serif",fontSize:14,fontWeight:700,color:"#1C3D2E",margin:"0 0 14px"}}>Agenda do dia</h3>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {proximosAtendimentos.length===0 && (
          <div style={{textAlign:"center",color:"#8aaa9a",fontFamily:"sans-serif",padding:"20px 0",fontSize:13}}>Nenhum atendimento futuro agendado.</div>
        )}
        {proximosAtendimentos.map((ev,i)=>{
          const initials = (ev.pacienteNome||"?").split(" ").slice(0,2).map(n=>n[0]).join("").toUpperCase();
          return (
            <div key={i} style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:34,height:34,borderRadius:"50%",background:"#E7EFE9",color:"#3D7A63",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:12,fontFamily:"sans-serif",flexShrink:0}}>{initials}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:"sans-serif",fontSize:13,fontWeight:700,color:"#1C3D2E",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ev.pacienteNome}</div>
                <div style={{fontFamily:"sans-serif",fontSize:12,color:"#6B7A72"}}>{ev.data} • {ev.horario}</div>
              </div>
            </div>
          );
        })}
      </div>
      <button onClick={()=>setAba("agenda")} style={{marginTop:14,background:"none",border:"none",cursor:"pointer",color:"#3D7A63",fontFamily:"sans-serif",fontSize:13,fontWeight:700,padding:0}}>Ver agenda completa →</button>
    </div>

    <div style={{background:"#fff", borderRadius:14, border:"1px solid #E3E0D8", padding:18}}>
      <h3 style={{fontFamily:"sans-serif",fontSize:14,fontWeight:700,color:"#1C3D2E",margin:"0 0 14px"}}>Pagamentos recentes</h3>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {pagamentosPendentesDash.length===0 && (
          <div style={{textAlign:"center",color:"#8aaa9a",fontFamily:"sans-serif",padding:"20px 0",fontSize:13}}>Nenhuma NF pendente. 🎉</div>
        )}
        {pagamentosPendentesDash.map(r=>(
          <div key={r.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
            <span style={{fontFamily:"sans-serif",fontSize:13,fontWeight:600,color:"#1C3D2E",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.nome}</span>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontFamily:"sans-serif",fontSize:14,fontWeight:800,color:"#1C3D2E"}}>{r.valor!=="—" ? `R$ ${r.valor}` : "—"}</div>
              <div style={{fontFamily:"sans-serif",fontSize:10,fontWeight:700,color:"#B9762F"}}>NF PENDENTE</div>
            </div>
          </div>
        ))}
      </div>
      <button onClick={()=>{setAba("pagamentos");setTabPag("pendentes");}} style={{marginTop:14,background:"none",border:"none",cursor:"pointer",color:"#3D7A63",fontFamily:"sans-serif",fontSize:13,fontWeight:700,padding:0}}>Ver todos pagamentos →</button>
    </div>
  </div>
  </section>
</>}
{/* PAGAMENTOS */}
      {aba==="pagamentos"&&<>
        <section style={CARD2}>
          <h2 style={{margin:"0 0 18px",fontSize:17,fontWeight:700,color:"#1a3a2a"}}>Registrar pagamento</h2>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"14px 20px",marginBottom:20}}>
            <div style={{position:"relative",gridColumn:"1/-1"}}>
              <label style={LBS}>Paciente</label>
              <input ref={nomeRef} style={{...INS,fontSize:16,padding:"12px 16px"}} placeholder="Digite o nome para buscar..." value={nome} autoComplete="off" onChange={e=>{setNome(e.target.value);setPacSel(null);setTitularOpcao("proprio");setTitularSel(null);}} onKeyDown={hkd} onBlur={()=>setTimeout(()=>setSugestoes([]),150)}/>
              {sugestoes.length>0&&<ul style={{position:"absolute",top:"100%",left:0,right:0,background:"#fff",border:"1.5px solid #c8ddd0",borderRadius:8,zIndex:100,listStyle:"none",margin:0,padding:"4px 0",boxShadow:"0 8px 24px rgba(0,40,20,0.12)",maxHeight:220,overflowY:"auto"}}>
                {sugestoes.map((p,i)=><li key={i} style={{padding:"10px 16px",cursor:"pointer",display:"flex",gap:8,alignItems:"center",fontFamily:"sans-serif",fontSize:14,background:i===sidx?"#e8f4ec":"#fff"}} onMouseDown={()=>selPac(p)}>
                  <span style={{fontWeight:600}}>{p.nome}</span><span style={{color:"#888",fontSize:12}}>{p.cpf}</span>
                </li>)}
              </ul>}
            </div>
            {pacSel&&<div style={{gridColumn:"1/-1",background:"#e8f4ec",borderRadius:8,padding: isMobile ? "16px" : "10px 14px",fontFamily:"sans-serif",fontSize:13,color:"#1a4a2a"}}>
              ✓ <strong>{pacSel.nome}</strong> — CPF: {pacSel.cpf}{pacSel.tel1&&` · Tel: ${pacSel.tel1}`}
            </div>}
            {pacSel&&<div style={{gridColumn:"1/-1"}}>
              <label style={LBS}>Quem paga?</label>
              <div style={{display:"flex",gap:10,marginBottom:titularOpcao==="outro"?10:0}}>
                <label style={{display:"flex",alignItems:"center",gap:6,fontFamily:"sans-serif",fontSize:14,cursor:"pointer"}}>
                  <input type="radio" checked={titularOpcao==="proprio"} onChange={()=>{setTitularOpcao("proprio");setTitularSel(null);}} style={{accentColor:"#2a7a4a"}}/>
                  O próprio paciente
                </label>
                <label style={{display:"flex",alignItems:"center",gap:6,fontFamily:"sans-serif",fontSize:14,cursor:"pointer"}}>
                  <input type="radio" checked={titularOpcao==="outro"} onChange={()=>setTitularOpcao("outro")} style={{accentColor:"#2a7a4a"}}/>
                  Outro titular
                </label>
              </div>
              {titularOpcao==="outro"&&<>
                {titsPacSel.length>0
                  ?<select style={{...INS,marginTop:6}} value={titularSel?.id||""} onChange={e=>setTitularSel(titsPacSel.find(t=>t.id===e.target.value)||null)}>
                    <option value="">Selecione o titular...</option>
                    {titsPacSel.map(t=><option key={t.id} value={t.id}>{t.nome} — {t.cpf}</option>)}
                  </select>
                  :<div style={{background:"#fff3cd",borderRadius:7,padding:"10px 14px",fontFamily:"sans-serif",fontSize:13,color:"#856404",marginTop:6}}>
                    Nenhum titular cadastrado. Vá em <strong>Titulares</strong> para cadastrar.
                  </div>
                }
              </>}
            </div>}
            <div>
              <label style={LBS}>Forma de pagamento</label>
              <select id="pag" style={{...INS,cursor:"pointer"}} value={pagamento} onChange={e=>setPagamento(e.target.value)}>
                <option value="">Selecione...</option>
                {FORMAS.map(f=><option key={f}>{f}</option>)}
              </select>
            </div>
            <div><label style={LBS}>Data</label><input style={INS} type="text" inputMode="numeric" placeholder="DD/MM/AAAA" maxLength={10} value={data} onChange={e=>setData(fData(e.target.value))}/></div>
            <div><label style={LBS}>Valor (R$)</label><input style={INS} placeholder="ex: 200,00" value={valor} onChange={e=>setValor(e.target.value)}/></div>
          </div>
          <button onClick={registrar} disabled={salvandoPag} style={{width:"100%",padding:12,background:"#2a7a4a",color:"#fff",border:"none",borderRadius:10,fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"sans-serif",opacity:salvandoPag?0.7:1}}>
            {salvandoPag?"Salvando...":"✓ Registrar pagamento"}
          </button>
        </section>

        {registros.length>0&&<section style={CARD2}>
          <h2 style={{margin:"0 0 16px",fontSize:17,fontWeight:700,color:"#1a3a2a"}}>Últimos registros</h2>
          <div style={{overflowX:"auto"}}>
            <table style={{
  width:"100%",
  borderCollapse:"collapse",
  fontFamily:"sans-serif",
}}>
              <thead><tr>{["Data","Paciente","Pagamento","Valor",""].map(h=><th key={h} style={{textAlign:"left",padding:"10px 12px",fontSize:11,fontWeight:700,color:"#4a6a5a",borderBottom:"2px solid #deeade",textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
              <tbody>{registrosFiltrados.slice(0,20).map(r=><tr key={r.id}>
                <td style={{padding:"9px 12px",fontSize:13,borderBottom:"1px solid #eef4ec",whiteSpace:"nowrap"}}>{r.data}</td>
                <td style={{padding:"9px 12px",fontSize:13,borderBottom:"1px solid #eef4ec",fontWeight:600}}>{r.nome}</td>
                <td style={{padding:"9px 12px",fontSize:13,borderBottom:"1px solid #eef4ec"}}><span style={{...{padding:"3px 8px",borderRadius:20,fontSize:11,fontWeight:600},...chipColor(r.pagamento)}}>{r.pagamento}</span></td>
                <td style={{padding:"9px 12px",fontSize:13,borderBottom:"1px solid #eef4ec",fontWeight:600}}>{r.valor!=="—"?`R$ ${r.valor}`:"—"}</td>
                <td style={{padding:"9px 12px",borderBottom:"1px solid #eef4ec",whiteSpace:"nowrap"}}>
                  <button onClick={()=>setEditandoReg({...r})} style={{background:"none",border:"none",color:"#2a7a4a",cursor:"pointer",fontSize:14,marginRight:8}} title="Editar">✎</button>
                  <button onClick={()=>excluirReg(r.id,r.nome)} style={{background:"none",border:"none",color:"#c0392b",cursor:"pointer",fontSize:14}} title="Excluir">✕</button>
                </td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>}
        {registros.length===0&&<div style={{textAlign:"center",color:"#8aaa9a",fontFamily:"sans-serif",padding:40,fontSize:15}}>Nenhum pagamento registrado ainda.</div>}
      </>}

      
{aba==="pacientes"&&<section style={CARD2}>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
    <h2 style={{margin:0,fontSize:17,fontWeight:700,color:"#1a3a2a"}}>Pacientes cadastrados</h2>
    <button onClick={()=>setModalCad(true)} style={{padding:"8px 16px",background:"#2a7a4a",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontSize:13,fontFamily:"sans-serif",fontWeight:600}}>+ Cadastrar manual</button>
  </div>

  <input
    placeholder="Buscar por nome..."
    value={buscaPac}
    onChange={e=>setBuscaPac(e.target.value)}
    style={{width:"100%",padding:"10px 14px",borderRadius:8,border:"1.5px solid #dbe8df",fontSize:14,fontFamily:"sans-serif",marginBottom:16,boxSizing:"border-box"}}
  />

  {pacientesBuscados.length===0
    ?<div style={{textAlign:"center",color:"#8aaa9a",fontFamily:"sans-serif",padding:40,fontSize:15,lineHeight:1.8}}>Nenhum paciente encontrado.</div>
    :<div style={{display:"flex",flexDirection:"column",gap:10}}>
      {pacientesBuscados.map(p=>(
        <div key={p.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:"#f7faf8",borderRadius:10,border:"1px solid #e0ede5",flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:160}}>
            <div style={{fontWeight:700,fontSize:15,color:"#1a3a2a",display:"flex",alignItems:"center",gap:8}}>
              {p.nome}
              {p.avisarPacote&&<button onClick={()=>marcarPacoteAvisado(p)} title="Clique após avisar o paciente sobre o novo pacote" style={{background:"#fff3cd",border:"1px solid #ffe08a",borderRadius:20,padding:"2px 8px",cursor:"pointer",fontSize:11,fontWeight:600,color:"#856404",display:"inline-flex",alignItems:"center",gap:4}}>🔔 Avisar pacote</button>}
            </div>
            <div style={{fontSize:13,color:"#5a7a6a",fontFamily:"sans-serif",marginTop:2}}>CPF: {p.cpf}{p.tel1&&` · ${p.tel1}`}{p.cidade&&` · ${p.cidade}`}</div>
          </div>

          <select
            value={p.profissional||""}
            onChange={e=>alterarProfissional(p,e.target.value)}
            style={{padding:"6px 8px",borderRadius:6,border:"1px solid #c8ddd0",fontSize:12,fontFamily:"sans-serif",color:"#1a3a2a"}}
          >
            <option value="">Sem profissional</option>
            {PROFISSIONAIS.map(pr=><option key={pr.id} value={pr.id}>{pr.nome}</option>)}
          </select>

          <button onClick={()=>setDetalhe(p)} style={{padding:"6px 12px",background:"#e8f4ec",border:"1px solid #b0d8bc",borderRadius:6,cursor:"pointer",fontSize:12,fontFamily:"sans-serif",color:"#1a4a2a"}}>Ver ficha</button>
          <button onClick={()=>setEditandoPac(p)} style={{padding:"6px 12px",background:"#eaf0fb",border:"1px solid #b8cdf0",borderRadius:6,cursor:"pointer",fontSize:12,fontFamily:"sans-serif",color:"#1a3a6a"}}>Editar</button>
          <button onClick={()=>inativarPac(p)} style={{padding:"6px 12px",background:"#fbf0e3",border:"1px solid #e8cfa3",borderRadius:6,cursor:"pointer",fontSize:12,fontFamily:"sans-serif",color:"#8a5a1a"}}>Inativar</button>
          <button onClick={async()=>{if(!window.confirm(`Tem certeza que deseja excluir o paciente "${p.nome}"? Essa ação não pode ser desfeita.`))return;await deleteItem("pac",p.id);const a=pacientes.filter(x=>x.id!==p.id);setPacientes(a);showT("Paciente excluído.");}} style={{background:"none",border:"none",color:"#c0392b",cursor:"pointer",fontSize:16,padding:"0 4px"}}>✕</button>
        </div>
      ))}
    </div>
  }
</section>}

{aba==="inativados"&&<section style={CARD2}>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
    <h2 style={{margin:0,fontSize:17,fontWeight:700,color:"#1a3a2a"}}>Pacientes inativados</h2>
  </div>

  <input
    placeholder="Buscar por nome..."
    value={buscaPac}
    onChange={e=>setBuscaPac(e.target.value)}
    style={{width:"100%",padding:"10px 14px",borderRadius:8,border:"1.5px solid #dbe8df",fontSize:14,fontFamily:"sans-serif",marginBottom:16,boxSizing:"border-box"}}
  />

  {pacientesInativosBuscados.length===0
    ?<div style={{textAlign:"center",color:"#8aaa9a",fontFamily:"sans-serif",padding:40,fontSize:15,lineHeight:1.8}}>Nenhum paciente inativado.</div>
    :<div style={{display:"flex",flexDirection:"column",gap:10}}>
      {pacientesInativosBuscados.map(p=>(
        <div key={p.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:"#f5f5f3",borderRadius:10,border:"1px solid #e5e3df",flexWrap:"wrap",opacity:0.8}}>
          <div style={{flex:1,minWidth:160}}>
            <div style={{fontWeight:700,fontSize:15,color:"#5a5a5a"}}>{p.nome}</div>
            <div style={{fontSize:13,color:"#8a8a8a",fontFamily:"sans-serif",marginTop:2}}>CPF: {p.cpf}{p.tel1&&` · ${p.tel1}`}</div>
          </div>
          <button onClick={()=>setDetalhe(p)} style={{padding:"6px 12px",background:"#fff",border:"1px solid #d8d8d4",borderRadius:6,cursor:"pointer",fontSize:12,fontFamily:"sans-serif",color:"#5a5a5a"}}>Ver ficha</button>
          <button onClick={()=>reativarPac(p)} style={{padding:"6px 12px",background:"#e8f4ec",border:"1px solid #b0d8bc",borderRadius:6,cursor:"pointer",fontSize:12,fontFamily:"sans-serif",color:"#1a4a2a",fontWeight:600}}>Reativar</button>
        </div>
      ))}
    </div>
  }
</section>}

      {aba==="titulares"&&(
  <AbaTitulares
    titulares={titulares}
    setTitulares={setTitulares}
    pacientes={pacientes}
    showT={showT}
  />
)}

{aba==="relatorio"&&(
  <AbaRelatorio
    registros={registros}
    setRegistros={setRegistros}
    pacientes={pacientes}
    titulares={titulares}
  />
)}

</div>
</div>

{isMobile && (
  <nav style={{
    position:"fixed", bottom:0, left:0, right:0, zIndex:500,
    background:"#fff", borderTop:"1px solid #E3E0D8",
    display:"flex", justifyContent:"space-around",
    padding:"8px 4px calc(8px + env(safe-area-inset-bottom))",
  }}>
    {ABAS_PRINCIPAIS.map(a=>{
      const ativo = aba===a.k;
      return (
        <button key={a.k} onClick={()=>setAba(a.k)} style={{
          display:"flex", flexDirection:"column", alignItems:"center", gap:3,
          background:"none", border:"none", cursor:"pointer",
          color: ativo ? "#1C3D2E" : "#9aa8a0",
          flex:1, padding:"4px 2px",
        }}>
          <IconAba nome={a.icon} color={ativo ? "#1C3D2E" : "#9aa8a0"} size={20}/>
          <span style={{fontFamily:"sans-serif",fontSize:10,fontWeight: ativo ? 700 : 500}}>{a.l}</span>
        </button>
      );
    })}
  </nav>
)}

{isMobile && menuMobileAberto && (
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:1000}} onClick={()=>setMenuMobileAberto(false)}>
    <div style={{
      position:"absolute", top:0, left:0, bottom:0, width:260,
      background:"#fff", padding:20, boxSizing:"border-box",
      display:"flex", flexDirection:"column", gap:6,
    }} onClick={e=>e.stopPropagation()}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
        <img src={logoEspacoCiriani} alt="Espaço Ciriani" style={{width:34,height:34}}/>
        <span style={{fontFamily:"Georgia,serif",fontSize:17,fontWeight:600,color:"#1C3D2E"}}>Espaço Ciriani</span>
      </div>
      {ABAS_SECUNDARIAS.map(a=>{
        const ativo = aba===a.k;
        return (
          <button key={a.k} onClick={()=>{setAba(a.k);setMenuMobileAberto(false);}} style={{
            display:"flex", alignItems:"center", gap:10, width:"100%", textAlign:"left",
            padding:"10px 12px", borderRadius:9, cursor:"pointer", fontSize:14,
            fontWeight: ativo ? 700 : 500, fontFamily:"sans-serif",
            background: ativo ? "#E7F2EC" : "transparent",
            color: ativo ? "#1C3D2E" : "#3D5A4C", border:"none",
          }}>
            <IconAba nome={a.icon} color={ativo ? "#1C3D2E" : "#5C8A75"} size={17}/>
            <span style={{flex:1}}>{a.l}</span>
          </button>
        );
      })}
      <div style={{marginTop:"auto",paddingTop:14,borderTop:"1px solid #E3E0D8",display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:36,height:36,borderRadius:"50%",flexShrink:0,background:"#3D7A63",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:13,fontFamily:"sans-serif"}}>DC</div>
        <div>
          <div style={{fontFamily:"sans-serif",fontSize:13,fontWeight:700,color:"#1C3D2E"}}>Diego Ciriani</div>
          <div style={{fontFamily:"sans-serif",fontSize:11,color:"#5C8A75"}}>Administrador</div>
        </div>
      </div>
    </div>
  </div>
)}

</div>

);
}

// APP PRINCIPAL
export default function App(){
  const [tela,setTela]=useState("login");
  const [pacientes,setPacientes]=useState([]);
  const [registros,setRegistros]=useState([]);
  const [evolucoes,setEvolucoes]=useState([]);
  const [agenda,setAgenda]=useState([]);
  const [titulares,setTitulares]=useState([]);
  const [pronto,setPronto]=useState(false);
  const [salvandoCad,setSalvandoCad]=useState(false);
  const [cadastroOk,setCadastroOk]=useState(false);
  const [profEscolhido,setProfEscolhido]=useState(null);

  // Verifica autenticação Firebase ao carregar
  useEffect(()=>{
    // Se URL tem /cadastro, mostra formulário sem login
    if(window.location.pathname==="/cadastro"){
      setTela("cadastro");
      return;
    }
    const unsub = onAuthStateChanged(auth, (user)=>{
      if(user) setTela("painel");
    });
    return ()=>unsub();
  },[]);

  useEffect(()=>{
    if(tela==="painel"&&!pronto){
      (async()=>{
        const [p,r,t,e,ag]=await Promise.all([load("pac"),load("reg"),load("tit"),load("evol"),load("age")]);
        setPacientes(p);setRegistros(r);setTitulares(t);setEvolucoes(e);setAgenda(ag);setPronto(true);
      })();
    }
  },[tela]);
  function handleLogin(){setTela("painel");}

  function handleLogout(){
    // Firebase signOut handled
    setTela("login");setPronto(false);
  }

  async function handleSalvarCadastro(dados){
    setSalvandoCad(true);
    try{
      const resp = await fetch("/api/cadastro-paciente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados),
      });
      const json = await resp.json();
      if(!resp.ok || !json.ok){
        throw new Error(json.erro || "Erro ao salvar cadastro.");
      }
      setCadastroOk(true);
    }catch(e){
      console.error(e);
      alert("Erro ao salvar cadastro. Tente novamente.");
    }
    setSalvandoCad(false);
  }

  // Rota pública - página do paciente, sem login e sem carregar dados do painel
  if(window.location.pathname==="/avaliacao"){
    return <PaginaAvaliacaoPaciente/>;
  }

  if(tela==="login") return <Login onLogin={handleLogin}/>;

  // Rota pública - não precisa carregar dados
  if(window.location.pathname==="/cadastro"){
    if(cadastroOk) return(
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#f4f6f0"}}>
        <div style={{background:"#fff",borderRadius:16,padding:48,textAlign:"center",border:"1px solid #deeade",maxWidth:340}}>
          <div style={{fontSize:56,marginBottom:16}}>✅</div>
          <h2 style={{color:"#1a4a2a",margin:"0 0 10px",fontFamily:"Georgia,serif"}}>Cadastro realizado!</h2>
          <p style={{color:"#4a6a5a",fontFamily:"sans-serif",lineHeight:1.6}}>Dados enviados com sucesso.<br/>Obrigado!</p>
        </div>
      </div>
    );
    if(!profEscolhido) return <SeletorProfissional onEscolher={setProfEscolhido}/>;
    return <FormPaciente onSalvo={handleSalvarCadastro} onVoltar={()=>setProfEscolhido(null)} titulo="Espaço Ciriani" salvando={salvandoCad} profissional={profEscolhido}/>;
  }

  if(!pronto) return <div style={{display:"flex",justifyContent:"center",alignItems:"center",minHeight:"100vh",background:"#f4f6f0",fontFamily:"sans-serif",color:"#4a6a5a",fontSize:16}}>Carregando...</div>;

  if(tela==="cadastro"){
    if(cadastroOk)return(
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#f4f6f0"}}>
        <div style={{background:"#fff",borderRadius:16,padding:48,textAlign:"center",border:"1px solid #deeade",maxWidth:340}}>
          <div style={{fontSize:56,marginBottom:16}}>✅</div>
          <h2 style={{color:"#1a4a2a",margin:"0 0 10px",fontFamily:"Georgia,serif"}}>Cadastro realizado!</h2>
          <p style={{color:"#4a6a5a",fontFamily:"sans-serif",lineHeight:1.6}}>Dados salvos com sucesso.</p>

        </div>
      </div>
    );
    return <FormPaciente onSalvo={handleSalvarCadastro} onVoltar={()=>setTela("painel")} titulo="Espaço Ciriani" salvando={salvandoCad}/>;
  }

  return <Painel pacientes={pacientes} setPacientes={setPacientes} registros={registros} setRegistros={setRegistros} titulares={titulares} setTitulares={setTitulares} evolucoes={evolucoes} setEvolucoes={setEvolucoes} agenda={agenda} setAgenda={setAgenda} onCadastro={()=>{setCadastroOk(false);setTela("cadastro");}} onLogout={handleLogout}/>;
}
