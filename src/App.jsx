import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, orderBy, serverTimestamp } from "firebase/firestore";

// ── FIREBASE AUTH ────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDZvF5sKBaGwt9rGJc2awfgQV6qPeeqpBM",
  authDomain: "consultorio-diego.firebaseapp.com",
  projectId: "consultorio-diego",
  storageBucket: "consultorio-diego.firebasestorage.app",
  messagingSenderId: "891539781587",
  appId: "1:891539781587:web:da680d4fdd59e8aac1a126"
};
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// ── HELPERS ──────────────────────────────────────────────────────────────────
const fCPF = r => { const d = r.replace(/\D/g,"").slice(0,11); return d.replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d{1,2})$/,"$1-$2"); };
const fTel = r => { const d = r.replace(/\D/g,"").slice(0,11); return d.length<=10?d.replace(/(\d{2})(\d{4})(\d{0,4})/,"($1) $2-$3").replace(/-$/,""):d.replace(/(\d{2})(\d{5})(\d{0,4})/,"($1) $2-$3").replace(/-$/,""); };
const fData = r => { const d = r.replace(/\D/g,"").slice(0,8); return d.replace(/(\d{2})(\d)/,"$1/$2").replace(/(\d{2})(\d)/,"$1/$2"); };
const fCEP = r => { const d=r.replace(/\D/g,"").slice(0,8); return d.replace(/(\d{5})(\d{0,3})/,"$1-$2").replace(/-$/,""); };
const HOJE = () => new Date().toLocaleDateString("pt-BR");
const FORMAS = ["Pix","Cartão de Débito","Cartão de Crédito","Dinheiro"];
const PARENTESCOS = ["Mãe","Pai","Filho(a)","Cônjuge / Parceiro(a)","Irmão / Irmã","Avô / Avó","Tio(a)","Primo(a)","Amigo(a)","Outro"];
const OBRIG_PAC = ["nome","cpf","nascimento","tel1","emergNome","emergParentesco","emergTel","cep","logradouro","numero","bairro","cidade","estado"];
const OBRIG_TIT = ["nome","cpf"];
const VAZIO_PAC = {nome:"",cpf:"",nascimento:"",tel1:"",emergNome:"",emergParentesco:"",emergTel:"",cep:"",logradouro:"",numero:"",complemento:"",bairro:"",cidade:"",estado:"",profissional:""};

function chipColor(p){
  if(p==="Pix")return{background:"#d4edda",color:"#155724"};
  if(p==="Dinheiro")return{background:"#fff3cd",color:"#856404"};
  if(p?.includes("Débito"))return{background:"#cce5ff",color:"#004085"};
  if(p?.includes("Crédito"))return{background:"#f8d7da",color:"#721c24"};
  return{background:"#e2e3e5",color:"#383d41"};
}

// ── STORAGE ───────────────────────────────────────────────────────────────────
// ── FIRESTORE ─────────────────────────────────────────────────────────────────
const COLECOES = { pac: "pacientes", reg: "pagamentos", tit: "titulares", evol: "evolucoes" };

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
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"linear-gradient(135deg,#1a4a2a 0%,#2a7a4a 100%)"}}>
      <div style={{background:"#fff",borderRadius:20,padding:"48px 40px",width:"100%",maxWidth:400,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{fontSize:48,marginBottom:12}}>🧠</div>
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

const PROFISSIONAIS = [
  { id: "diego", nome: "Diego Ciriani", titulo: "Psicólogo" },
  { id: "rhania", nome: "Rhania Mulia", titulo: "Psicóloga" },
];

function SeletorProfissional({ onEscolher }) {
  return (
    <div style={{fontFamily:"Georgia,serif",maxWidth:420,margin:"0 auto",padding:"60px 20px",minHeight:"100vh",background:"#f4f6f0",display:"flex",flexDirection:"column",justifyContent:"center"}}>
      <div style={{textAlign:"center",marginBottom:32}}>
        <div style={{fontSize:40,marginBottom:10}}>🧠</div>
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
        <div style={{fontSize:36}}>🧠</div>
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
function ModalFicha({p,titulares,registros,evolucoes,setEvolucoes,onClose}){
  const [abaModal,setAbaModal]=useState("dados");
  const [filtroAno,setFiltroAno]=useState("todos");
  const [filtroMes,setFiltroMes]=useState("todos");
  const Row=({l,v})=>v?<div style={{display:"flex",gap:12,padding:"8px 0",borderBottom:"1px solid #eef4ec",fontFamily:"sans-serif"}}><span style={{fontSize:11,fontWeight:700,color:"#4a6a5a",textTransform:"uppercase",width:110,flexShrink:0}}>{l}</span><span style={{fontSize:14,color:"#1a3a2a"}}>{v}</span></div>:null;
  const tits=titulares.filter(t=>t.pacienteId===p.id);
  const atendimentosPac=evolucoes.filter(ev=>ev.pacienteId===p.id).sort((a,b)=>(b.dataOrdenacao||"").localeCompare(a.dataOrdenacao||""));
  const hoje=new Date();
  const dataHojeStr=`${String(hoje.getDate()).padStart(2,"0")}/${String(hoje.getMonth()+1).padStart(2,"0")}/${hoje.getFullYear()}`;
  const [novaDataEv,setNovaDataEv]=useState(dataHojeStr);
  const [novoTextoEv,setNovoTextoEv]=useState("");
  const [salvandoEv,setSalvandoEv]=useState(false);
  const [editandoEvId,setEditandoEvId]=useState(null);
  const [textoEdit,setTextoEdit]=useState("");
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
          {[["dados","📋 Dados"],["pagamentos",`💳 Pagamentos (${pagsPaciente.length})`],["atendimentos",`📝 Atendimentos (${atendimentosPac.length})`]].map(([v,l])=>(
            <button key={v} onClick={()=>setAbaModal(v)} style={{padding:"7px 14px",borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"sans-serif",background:abaModal===v?"#2a7a4a":"#f4f6f0",color:abaModal===v?"#fff":"#4a6a5a",border:"none",fontWeight:abaModal===v?700:400}}>{l}</button>
          ))}
        </div>

        {abaModal==="dados"&&<>
          <div style={{fontSize:11,fontWeight:700,color:"#2a5a3a",fontFamily:"sans-serif",textTransform:"uppercase",marginBottom:8}}>Dados pessoais</div>
          <Row l="CPF" v={p.cpf}/><Row l="Nascimento" v={p.nascimento}/><Row l="Telefone" v={p.tel1}/>
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
          <div style={{textAlign:"right",fontFamily:"sans-serif",fontSize:14,fontWeight:700,color:"#1a4a2a",borderTop:"1px solid #eef4ec",paddingTop:10}}>
                Total: R$ {totalFiltrado.toFixed(2).replace(".",",")}
              </div>
            </>
          }
        </>}
        
        ← AQUI NO MEIO, cole o bloco da aba de atendimentos
        
      </div>
    </div>
  );
}
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

  const regsBase=pacSel?registros.filter(r=>r.nome===pacSel.nome):registros;
  const regsOrdenados=[...regsBase].sort((a,b)=>a.nome.localeCompare(b.nome)||a.data.localeCompare(b.data));
  const regs=regsOrdenados.filter(r=>{
    if(filtroNF==="pendente") return !r.nfEmitida;
    if(filtroNF==="emitida") return r.nfEmitida;
    return true;
  });
  const pendentes=registros.filter(r=>!r.nfEmitida).length;

function exportarCSV(){
  if(!regs.length)return;

  const linhas=regs.map(r=>{
    const pac=pacientes.find(p=>p.nome===r.nome);
    const tit=pac?titulares.find(t=>t.pacienteId===pac.id):null;
    const valorNum=r.valor!=="—"?parseFloat(r.valor.replace(",",".")):0;

    return [
  r.nome,
  pac?.cpf||r.cpf||"",
  tit?tit.nome:"",
  tit?tit.cpf:"",
  r.pagamento.toUpperCase().replace("CARTÃO DE ",""),
  valorNum > 0 ? `R$ ${valorNum.toFixed(2).replace(".", ",")}` : "",
  r.nfEmitida ? "EMITIDA" : "PENDENTE"
];
  });

  const header=[
    "PACIENTE",
    "CPF PACIENTE",
    "TITULAR",
    "CPF TITULAR",
    "FORMA DE PAGAMENTO",
    "VALOR",
    "STATUS NF"
  ];

  const ws=XLSX.utils.aoa_to_sheet([header,...linhas]);

  ws["!cols"]=[
    {wch:28},
    {wch:16},
    {wch:22},
    {wch:16},
    {wch:18},
    {wch:12},
    {wch:15}
  ];

  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,"Pagamentos");

  const mes=new Date()
    .toLocaleDateString("pt-BR",{month:"2-digit",year:"numeric"})
    .replace("/","-");

  XLSX.writeFile(wb,`notas-fiscais-${mes}.xlsx`);
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
    pagamentos:<><rect x="2.5" y="5.5" width="19" height="13" rx="2.2" {...st}/><line x1="2.5" y1="9.5" x2="21.5" y2="9.5" {...st}/></>,
    pacientes:<><circle cx="12" cy="8" r="3.5" {...st}/><path d="M5 20c0-3.5 3-6.5 7-6.5s7 3 7 6.5" {...st}/></>,
    titulares:<><path d="M6 2.5h9l3 3v16H6z" {...st}/><line x1="9" y1="9" x2="15" y2="9" {...st}/><line x1="9" y1="13" x2="15" y2="13" {...st}/><line x1="9" y1="17" x2="13" y2="17" {...st}/></>,
    relatorio:<><line x1="5" y1="20" x2="5" y2="11" {...st}/><line x1="12" y1="20" x2="12" y2="6" {...st}/><line x1="19" y1="20" x2="19" y2="14" {...st}/><line x1="3" y1="20" x2="21" y2="20" {...st}/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24">{paths[nome]}</svg>;
}
// ── PAINEL ────────────────────────────────────────────────────────────────────
function Painel({pacientes,setPacientes,registros,setRegistros,titulares,setTitulares,evolucoes,setEvolucoes,onCadastro,onLogout}){
  const [aba,setAba]=useState("dashboard");
  const [filtroProf,setFiltroProf]=useState("todos");
  const [buscaPac,setBuscaPac]=useState("");
const [editandoPac,setEditandoPac]=useState(null);
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
  const nomeRef=useRef(null);

  function showT(msg,tipo="ok"){setToast({msg,tipo});setTimeout(()=>setToast(null),2500);}

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

  async function excluirReg(id){await deleteItem("reg",id);const a=registros.filter(x=>x.id!==id);setRegistros(a);}

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
{k:"pagamentos",l:`Pagamentos (${registrosFiltrados.length})`,icon:"pagamentos"},
{k:"pacientes",l:`Pacientes (${pacientesAtivos.length})`,icon:"pacientes"},
{k:"inativados",l:`Inativados (${pacientesInativos.length})`,icon:"pacientes"},
{k:"titulares",l:`Titulares (${titulares.length})`,icon:"titulares"},
{k:"relatorio",l:"Relatório",icon:"relatorio"},
];

  return(
    <div style={ROOT}>
      <Toast t={toast}/>
{detalhe&&<ModalFicha p={detalhe} titulares={titulares} registros={registros} evolucoes={evolucoes} setEvolucoes={setEvolucoes} onClose={()=>setDetalhe(null)}/>}      {modalCad&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"20px 16px",overflowY:"auto"}}>
        <div style={{width:"100%",maxWidth:540}}><FormPaciente onSalvo={salvarNovoPac} onVoltar={()=>setModalCad(false)} titulo="Novo paciente" salvando={salvandoPac}/></div>
      </div>}

{editandoPac&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"20px 16px",overflowY:"auto"}}>
        <div style={{width:"100%",maxWidth:540}}><FormPaciente dadosIniciais={editandoPac} onSalvo={salvarEdicaoPac} onVoltar={()=>setEditandoPac(null)} titulo="Editar paciente" salvando={false} profissional={editandoPac.profissional}/></div>
      </div>}
      <header style={{
  display:"flex",
  flexDirection: isMobile ? "column" : "row",
  alignItems: isMobile ? "flex-start" : "center",
  gap:16,
  marginBottom:24
}}>
        <div style={{fontSize:38}}>🧠</div>
        <div>
          <h1 style={{margin:0,fontSize:22,fontWeight:600,color:"#1a3a2a"}}>Espaço Ciriani</h1>
          <p style={{margin:0,fontSize:13,color:"#5a7a6a",fontFamily:"sans-serif"}}>Painel administrativo</p>
        </div>
        <div style={{display:"flex",gap:6,marginLeft: isMobile ? 0 : 16,flexWrap:"wrap"}}>
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
  marginLeft: isMobile ? 0 : "auto",
  display:"flex",
  gap:10,
  width: isMobile ? "100%" : "auto"
}}>
          <button onClick={onCadastro} style={{padding:"9px 16px",background:"#2a7a4a",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontSize:13,fontFamily:"sans-serif",fontWeight:600}}>📋 Formulário</button>
          <button onClick={onLogout} style={{padding:"9px 16px",background:"#fff",color:"#c0392b",border:"1.5px solid #f5c6cb",borderRadius:8,cursor:"pointer",fontSize:13,fontFamily:"sans-serif",fontWeight:600}}>Sair</button>
        </div>
</header>
      {/* ABAS */}
<div style={{
  display:"flex",
  flexDirection: isMobile ? "column" : "row",
  gap:30,
  alignItems:"flex-start",
  width:"100%",
  maxWidth:"100%",
  boxSizing:"border-box"
}}>

 <div style={{
  width: isMobile ? "100%" : 190,
  maxWidth: isMobile ? "100%" : 190,
  boxSizing:"border-box",
  background:"#1C3D2E",
  border:"1px solid #1C3D2E",
  borderRadius:12,
  padding:16,
  position: isMobile ? "relative" : "sticky",
top: isMobile ? 0 : 20,
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
        color: ativo ? "#fff" : "#5a7a6a",
        border:"none",
      }}
    >
      <IconAba nome={a.icon} color={ativo ? "#fff" : "#7FA08E"} size={17} />
      <span style={{flex:1}}>{a.l}</span>
    </button>
  );
})}
  </div>

  <div style={{
  flex:1,
  width:"100%",
  minWidth:0,
  overflowX:"hidden"
}}>
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

  <div style={{
    display:"grid",
    gridTemplateColumns:"1fr 1fr",
    gap:12,
    marginBottom:24
  }}>
    {[
      { label:"Pacientes",    value: pacientesFiltrados.length, accent:"#3D7A63" },
      { label:"Pagamentos",   value: registrosFiltrados.length, accent:"#3D7A63" },
      { label:"NF pendentes", value: String(registrosFiltrados.filter(r=>!r.nfEmitida).length).padStart(2,"0"), accent:"#B9762F" },
      { label:"Receita",      value: `R$ ${registrosFiltrados.filter(r=>r.valor&&r.valor!=="—").reduce((t,r)=>t+parseFloat(String(r.valor).replace(",",".")),0).toLocaleString("pt-BR",{minimumFractionDigits:2})}`, accent:"#3D7A63" },
    ].map((m,i)=>{
      const len=String(m.value).length;
      const fontSize = len<=2?28:len<=4?24:len<=7?19:16;
      return (
        <div key={i} style={{
          background:"#fff", borderRadius:14, border:"1px solid #E3E0D8",
          padding:"18px 18px 16px", minHeight:88,
          display:"flex", flexDirection:"column",
          position:"relative", boxSizing:"border-box"
        }}>
          <div style={{position:"absolute",top:0,left:0,bottom:0,width:4,background:m.accent,borderRadius:"14px 0 0 14px"}}/>
          <span style={{
            display:"inline-block", width:"fit-content",
            fontFamily:"sans-serif", fontSize:"12px", fontWeight:600,
            color:"#6B7A72", paddingLeft:8, whiteSpace:"nowrap",
            lineHeight:"15px", marginBottom:10
          }}>{m.label}</span>
          <span style={{
            display:"block",
            fontFamily:"sans-serif", fontSize:`${fontSize}px`, fontWeight:800,
            color: m.accent==="#B9762F" ? "#B9762F" : "#1C3D2E",
            paddingLeft:8, letterSpacing:"-0.5px", lineHeight:1,
            whiteSpace:"nowrap"
          }}>{m.value}</span>
        </div>
      );
    })}
  </div>

  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
    <h3 style={{fontFamily:"sans-serif",fontSize:15,fontWeight:700,color:"#1C3D2E",margin:0}}>
      Pagamentos
    </h3>
    <div style={{display:"flex",gap:6}}>
      <button
        onClick={()=>setTabPag("recentes")}
        style={{
          fontFamily:"sans-serif", fontSize:11, fontWeight:700, padding:"5px 11px",
          borderRadius:20, border:"none", cursor:"pointer",
          background: tabPag==="recentes" ? "#1C3D2E" : "#fff",
          color: tabPag==="recentes" ? "#fff" : "#6B7A72"
        }}
      >Recentes</button>
      <button
        onClick={()=>setTabPag("pendentes")}
        style={{
          fontFamily:"sans-serif", fontSize:11, fontWeight:700, padding:"5px 11px",
          borderRadius:20, border:"none", cursor:"pointer",
          background: tabPag==="pendentes" ? "#B9762F" : "#fff",
          color: tabPag==="pendentes" ? "#fff" : "#6B7A72"
        }}
      >Pendentes ({registrosFiltrados.filter(r=>!r.nfEmitida).length})</button>
    </div>
  </div>

  <div style={{display:"flex",flexDirection:"column",gap:8}}>
    {(tabPag==="pendentes" ? registrosFiltrados.filter(r=>!r.nfEmitida) : registrosFiltrados.slice(0,5)).map(r=>{
      const initials = r.nome.split(" ").slice(0,2).map(n=>n[0]).join("").toUpperCase();
      return (
        <div key={r.id} style={{
          background:"#fff", borderRadius:12, border:"1px solid #E3E0D8",
          padding:"14px 16px", display:"flex", alignItems:"center", gap:14
        }}>
          <div style={{
            width:38, height:38, borderRadius:"50%", flexShrink:0,
            background:"#E7EFE9", color:"#3D7A63",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontWeight:700, fontSize:13, fontFamily:"sans-serif"
          }}>{initials}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:"sans-serif",fontSize:14,fontWeight:700,color:"#1C3D2E",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.nome}</div>
            <div style={{fontFamily:"sans-serif",fontSize:12,color:"#6B7A72",marginTop:2}}>{r.pagamento}</div>
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{fontFamily:"sans-serif",fontSize:15,fontWeight:800,color:"#1C3D2E"}}>
              {r.valor!=="—" ? `R$ ${r.valor}` : "—"}
            </div>
            <div style={{
              fontFamily:"sans-serif", fontSize:10, fontWeight:700, letterSpacing:"0.4px",
              color: r.nfEmitida ? "#3D7A63" : "#B9762F", marginTop:3
            }}>
              {r.nfEmitida ? "NF EMITIDA" : "NF PENDENTE"}
            </div>
          </div>
        </div>
      );
    })}
    {registros.length===0 && (
      <div style={{textAlign:"center",color:"#8aaa9a",fontFamily:"sans-serif",padding:30,fontSize:14}}>
        Nenhum pagamento registrado ainda.
      </div>
    )}
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
                <td style={{padding:"9px 12px",borderBottom:"1px solid #eef4ec"}}><button onClick={()=>excluirReg(r.id)} style={{background:"none",border:"none",color:"#c0392b",cursor:"pointer",fontSize:14}}>✕</button></td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>}
        {registros.length===0&&<div style={{textAlign:"center",color:"#8aaa9a",fontFamily:"sans-serif",padding:40,fontSize:15}}>Nenhum pagamento registrado ainda.</div>}
      </>}

      {/* ════════════════════════════════════════════════════════════════════
   PARTE E — Substitui TODO o bloco {aba==="pacientes"&&<section...>}
   pelo bloco abaixo, que já inclui busca + ações + nova aba Inativados.
   ════════════════════════════════════════════════════════════════════ */}

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
            <div style={{fontWeight:700,fontSize:15,color:"#1a3a2a"}}>{p.nome}</div>
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
          <button onClick={async()=>{await deleteItem("pac",p.id);const a=pacientes.filter(x=>x.id!==p.id);setPacientes(a);showT("Removido.");}} style={{background:"none",border:"none",color:"#c0392b",cursor:"pointer",fontSize:16,padding:"0 4px"}}>✕</button>
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
</div>

);
}

// APP PRINCIPAL
export default function App(){
  const [tela,setTela]=useState("login");
  const [pacientes,setPacientes]=useState([]);
  const [registros,setRegistros]=useState([]);
  const [evolucoes,setEvolucoes]=useState([]);
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
        const [p,r,t,e]=await Promise.all([load("pac"),load("reg"),load("tit"),load("evol")]);
        setPacientes(p);setRegistros(r);setTitulares(t);setEvolucoes(e);setPronto(true);
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
      await addItem("pac",dados);
      setCadastroOk(true);
    }catch(e){
      console.error(e);
      alert("Erro ao salvar cadastro. Tente novamente.");
    }
    setSalvandoCad(false);
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

  return <Painel pacientes={pacientes} setPacientes={setPacientes} registros={registros} setRegistros={setRegistros} titulares={titulares} setTitulares={setTitulares} evolucoes={evolucoes} setEvolucoes={setEvolucoes} onCadastro={()=>{setCadastroOk(false);setTela("cadastro");}} onLogout={handleLogout}/>;
}
