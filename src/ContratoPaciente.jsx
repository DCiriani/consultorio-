import { useState, useEffect, useRef } from "react";
import logoEspacoCiriani from "./assets/logo-espaco-ciriani.png";

const fCPFc = r => { const d = r.replace(/\D/g,"").slice(0,11); return d.replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d{1,2})$/,"$1-$2"); };

export function PaginaContratoPaciente(){
  const [carregando,setCarregando]=useState(true);
  const [erro,setErro]=useState("");
  const [contrato,setContrato]=useState(null);
  const [nomeCompleto,setNomeCompleto]=useState("");
  const [cpf,setCpf]=useState("");
  const [cidade,setCidade]=useState("");
  const [aceito,setAceito]=useState(false);
  const [enviando,setEnviando]=useState(false);
  const [concluido,setConcluido]=useState(false);
  const [temAssinatura,setTemAssinatura]=useState(false);

  const canvasRef=useRef(null);
  const desenhandoRef=useRef(false);

  const token = new URLSearchParams(window.location.search).get("token");
  const dataHoje = new Date().toLocaleDateString("pt-BR");

  useEffect(()=>{
    if(!token){ setErro("Link inválido."); setCarregando(false); return; }
    (async()=>{
      try{
        const resp=await fetch(`/api/contrato-buscar?token=${encodeURIComponent(token)}`);
        const data=await resp.json();
        if(!resp.ok||data.erro){ setErro(data.erro||"Não foi possível carregar o contrato."); }
        else{
          setContrato(data);
          if(data.status==="assinado") setConcluido(true);
          if(data.pacienteNome) setNomeCompleto(data.pacienteNome);
        }
      }catch{
        setErro("Erro de conexão. Tente novamente.");
      }
      setCarregando(false);
    })();
  },[token]);

  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas)return;
    const ratio=window.devicePixelRatio||1;
    const largura=canvas.offsetWidth;
    const altura=180;
    canvas.width=largura*ratio;
    canvas.height=altura*ratio;
    canvas.style.height=altura+"px";
    const ctx=canvas.getContext("2d");
    ctx.scale(ratio,ratio);
    ctx.lineWidth=2.2;
    ctx.lineCap="round";
    ctx.lineJoin="round";
    ctx.strokeStyle="#1a3a2a";
  },[contrato,concluido]);

  function posicao(e){
    const canvas=canvasRef.current;
    const rect=canvas.getBoundingClientRect();
    const ponto = e.touches ? e.touches[0] : e;
    return { x: ponto.clientX-rect.left, y: ponto.clientY-rect.top };
  }

  function iniciarTraco(e){
    e.preventDefault();
    desenhandoRef.current=true;
    const ctx=canvasRef.current.getContext("2d");
    const {x,y}=posicao(e);
    ctx.beginPath();
    ctx.moveTo(x,y);
  }

  function desenhar(e){
    if(!desenhandoRef.current)return;
    e.preventDefault();
    const ctx=canvasRef.current.getContext("2d");
    const {x,y}=posicao(e);
    ctx.lineTo(x,y);
    ctx.stroke();
    setTemAssinatura(true);
  }

  function pararTraco(){ desenhandoRef.current=false; }

  function limparAssinatura(){
    const canvas=canvasRef.current;
    const ctx=canvas.getContext("2d");
    ctx.clearRect(0,0,canvas.width,canvas.height);
    setTemAssinatura(false);
  }

  async function enviarAssinatura(){
    if(!nomeCompleto.trim()){ alert("Informe seu nome completo."); return; }
    if(cpf.replace(/\D/g,"").length!==11){ alert("Informe um CPF válido."); return; }
    if(!cidade.trim()){ alert("Informe a cidade."); return; }
    if(!temAssinatura){ alert("Assine no campo indicado."); return; }
    if(!aceito){ alert("Marque a declaração de ciência e aceite."); return; }

    setEnviando(true);
    try{
      const assinaturaBase64=canvasRef.current.toDataURL("image/png");
      const resp=await fetch("/api/contrato-assinar",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({token,nomeCompleto,cpf,cidade,assinaturaBase64})
      });
      const data=await resp.json();
      if(!resp.ok||data.erro){ alert(data.erro||"Não foi possível registrar a assinatura."); }
      else{ setConcluido(true); }
    }catch{
      alert("Erro de conexão. Tente novamente.");
    }
    setEnviando(false);
  }

  const FUNDO={minHeight:"100vh",background:"#f4f6f0",padding:"24px 16px",boxSizing:"border-box",fontFamily:"sans-serif"};
  const CAIXA={background:"#fff",borderRadius:14,padding:"28px 24px",maxWidth:720,margin:"0 auto",border:"1px solid #deeade",boxSizing:"border-box"};
  const LB={display:"block",fontSize:12,fontWeight:700,color:"#4a6a5a",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.04em"};
  const IN={width:"100%",padding:"11px 14px",border:"1.5px solid #c8ddd0",borderRadius:8,fontSize:15,boxSizing:"border-box",background:"#fafdfa",color:"#1a3a2a",outline:"none"};

  if(carregando) return <div style={{...FUNDO,display:"flex",alignItems:"center",justifyContent:"center",color:"#4a6a5a"}}>Carregando contrato...</div>;

  if(erro) return (
    <div style={FUNDO}>
      <div style={{...CAIXA,textAlign:"center"}}>
        <div style={{fontSize:44,marginBottom:12}}>⚠️</div>
        <h2 style={{color:"#c0392b",margin:"0 0 8px",fontFamily:"Georgia,serif"}}>{erro}</h2>
        <p style={{color:"#5a7a6a",fontSize:14,margin:0}}>Entre em contato com o psicólogo para receber um novo link.</p>
      </div>
    </div>
  );

  if(concluido) return (
    <div style={FUNDO}>
      <div style={{...CAIXA,textAlign:"center"}}>
        <div style={{fontSize:52,marginBottom:14}}>✅</div>
        <h2 style={{color:"#1a4a2a",margin:"0 0 10px",fontFamily:"Georgia,serif"}}>Contrato assinado!</h2>
        <p style={{color:"#4a6a5a",fontSize:14,lineHeight:1.6,margin:0}}>
          Seu aceite foi registrado com sucesso.<br/>
          Uma cópia ficará arquivada no seu prontuário.
        </p>
      </div>
    </div>
  );

  return (
    <div style={FUNDO}>
      <div style={CAIXA}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <img src={logoEspacoCiriani} alt="Espaço Ciriani" style={{width:48,height:48}}/>
          <h1 style={{margin:"8px 0 2px",fontSize:20,fontWeight:700,color:"#1a3a2a",fontFamily:"Georgia,serif"}}>Termo de Adesão</h1>
          <p style={{margin:0,fontSize:13,color:"#5a7a6a"}}>Leia com atenção antes de assinar</p>
        </div>

        <div style={{
          maxHeight:420, overflowY:"auto", padding:"16px 18px",
          background:"#fafdfa", border:"1.5px solid #dbe8df", borderRadius:10,
          fontSize:14, lineHeight:1.65, color:"#1a3a2a", marginBottom:22,
        }} dangerouslySetInnerHTML={{__html: contrato?.textoContrato || ""}}/>

        <div style={{marginBottom:14}}>
          <label style={LB}>Nome completo</label>
          <input value={nomeCompleto} onChange={e=>setNomeCompleto(e.target.value)} placeholder="Seu nome completo" style={IN}/>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"14px",marginBottom:14}}>
          <div>
            <label style={LB}>CPF</label>
            <input value={cpf} onChange={e=>setCpf(fCPFc(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" style={IN}/>
          </div>
          <div>
            <label style={LB}>Cidade</label>
            <input value={cidade} onChange={e=>setCidade(e.target.value)} placeholder="Sua cidade" style={IN}/>
          </div>
        </div>

        <div style={{marginBottom:18,fontSize:13,color:"#5a7a6a"}}>
          Data: <strong style={{color:"#1a3a2a"}}>{dataHoje}</strong>
        </div>

        <div style={{marginBottom:18}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
            <label style={{fontSize:12,fontWeight:700,color:"#4a6a5a",textTransform:"uppercase",letterSpacing:"0.04em"}}>Sua assinatura</label>
            <button type="button" onClick={limparAssinatura} style={{background:"none",border:"none",color:"#c0392b",cursor:"pointer",fontSize:12,padding:0}}>limpar</button>
          </div>
          <canvas
            ref={canvasRef}
            onMouseDown={iniciarTraco} onMouseMove={desenhar} onMouseUp={pararTraco} onMouseLeave={pararTraco}
            onTouchStart={iniciarTraco} onTouchMove={desenhar} onTouchEnd={pararTraco}
            style={{width:"100%",border:"1.5px dashed #c8ddd0",borderRadius:10,background:"#fff",touchAction:"none",display:"block",cursor:"crosshair"}}
          />
          <p style={{fontSize:12,color:"#8aaa9a",margin:"6px 0 0"}}>Assine com o dedo (celular) ou com o mouse.</p>
        </div>

        {contrato?.assinaturaPsicologo&&
          <div style={{marginBottom:20,paddingTop:16,borderTop:"1px solid #eef4ec",textAlign:"center"}}>
            <img src={contrato.assinaturaPsicologo} alt="Assinatura do psicólogo" style={{maxWidth:240,maxHeight:80,display:"block",margin:"0 auto 4px"}}/>
            <div style={{borderTop:"1px solid #8aaa9a",display:"inline-block",paddingTop:6,fontSize:12,color:"#4a6a5a",minWidth:220}}>
              Diego Ciriani - Psicólogo<br/>CRP 04/44668
            </div>
          </div>
        }

        <label style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:20,cursor:"pointer",fontSize:13,color:"#1a3a2a",lineHeight:1.55}}>
          <input type="checkbox" checked={aceito} onChange={e=>setAceito(e.target.checked)} style={{accentColor:"#2a7a4a",marginTop:3,flexShrink:0,width:16,height:16}}/>
          <span>Declaro que li, compreendi e tive oportunidade de esclarecer dúvidas sobre os acordos deste Termo de Adesão, e aceito as condições descritas neste documento.</span>
        </label>

        <button onClick={enviarAssinatura} disabled={enviando}
          style={{width:"100%",padding:14,background:"#2a7a4a",color:"#fff",border:"none",borderRadius:10,fontSize:16,fontWeight:700,cursor:enviando?"default":"pointer",opacity:enviando?0.7:1}}>
          {enviando?"Registrando...":"✓ Assinar contrato"}
        </button>

        <p style={{textAlign:"center",fontSize:11,color:"#8aaa9a",marginTop:14,marginBottom:0,lineHeight:1.5}}>
          Ao assinar, serão registrados data, hora e informações técnicas de acesso<br/>para fins de comprovação do aceite.
        </p>
      </div>
    </div>
  );
}
