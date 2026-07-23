import { useState, useEffect, useRef } from "react";
import logoEspacoCiriani from "./assets/logo-espaco-ciriani.png";

const fCPFc = r => { const d = r.replace(/\D/g,"").slice(0,11); return d.replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d{1,2})$/,"$1-$2"); };

const DESTAQUES = [
  {
    titulo: "Remarcação",
    texto: "Caso seja necessário remarcar uma sessão, avisar a assistente Maria pelo telefone (34) 9 9141-2984 com 4 horas de antecedência; caso contrário, a sessão deverá ser paga ou descontada do pacote."
  },
  {
    titulo: "Comparecimento",
    texto: "As sessões agendadas entre paciente e psicólogo serão cumpridas nos horários combinados, sem necessidade de confirmação prévia a cada semana."
  },
  {
    titulo: "Sigilo das Informações",
    texto: "Fique tranquilo. A privacidade de todas as comunicações entre paciente e psicólogo é protegida pelo Código de Ética profissional."
  },
];

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
  const [dadosAssinado,setDadosAssinado]=useState(null);

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

  function baixarCopia(){
    const d = dadosAssinado;
    if(!d) return;

    const destaquesHtml = DESTAQUES.map(x=>`
      <div class="destaque">
        <div class="destaque-titulo">${x.titulo}</div>
        <div class="destaque-texto">${x.texto}</div>
      </div>`).join("");

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Termo de Adesão - ${d.nomeCompleto}</title>
<style>
  body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#f4f6f0;margin:0;padding:24px 16px;color:#1a3a2a;line-height:1.6;}
  .folha{background:#fff;max-width:760px;margin:0 auto;padding:36px 32px;border-radius:14px;border:1px solid #deeade;}
  h1{font-family:Georgia,serif;font-size:22px;text-align:center;margin:0 0 4px;}
  .sub{text-align:center;font-size:13px;color:#5a7a6a;margin:0 0 28px;}
  .caixa-destaques{background:#eef6f1;border:1px solid #b0d8bc;border-radius:12px;padding:20px 22px;margin-bottom:30px;}
  .caixa-destaques h2{font-size:15px;margin:0 0 14px;color:#1a4a2a;text-transform:uppercase;letter-spacing:.04em;}
  .destaque{margin-bottom:14px;}
  .destaque:last-child{margin-bottom:0;}
  .destaque-titulo{font-weight:700;font-size:14px;color:#1a4a2a;margin-bottom:2px;}
  .destaque-texto{font-size:13.5px;color:#2a4a3a;}
  .conteudo{font-size:14px;}
  .assinaturas{display:flex;gap:24px;flex-wrap:wrap;justify-content:space-around;align-items:flex-end;margin-top:40px;padding-top:8px;}
  .assinatura{text-align:center;flex:1 1 220px;min-width:200px;}
  .assinatura img{max-width:100%;max-height:90px;display:block;margin:0 auto 4px;}
  .linha{border-top:1px solid #8aaa9a;padding-top:6px;font-size:12.5px;color:#4a6a5a;}
  .evidencias{margin-top:32px;padding-top:16px;border-top:1px solid #eef4ec;font-size:11.5px;color:#6a8a7a;line-height:1.7;}
  .evidencias strong{color:#4a6a5a;}
  @media print{body{background:#fff;padding:0;}.folha{border:none;border-radius:0;max-width:none;padding:0;}}
</style>
</head>
<body>
<div class="folha">
  <h1>Termo de Adesão</h1>
  <p class="sub">Diego Ciriani - Psicólogo | CRP 04/44668</p>

  <div class="caixa-destaques">
    <h2>Pontos de destaque do contrato</h2>
    ${destaquesHtml}
  </div>

  <div class="conteudo">${d.textoContrato}</div>

  <div class="assinaturas">
    <div class="assinatura">
      <img src="${d.assinaturaPaciente}" alt="Assinatura">
      <div class="linha">${d.nomeCompleto}<br>${d.cidade}, ${d.dataAssinatura}</div>
    </div>
    <div class="assinatura">
      ${d.assinaturaPsicologo?`<img src="${d.assinaturaPsicologo}" alt="Assinatura">`:`<div style="height:90px"></div>`}
      <div class="linha">Diego Ciriani - Psicólogo<br>CRP 04/44668</div>
    </div>
  </div>

  <div class="evidencias">
    <strong>Registro do aceite:</strong><br>
    Assinado por ${d.nomeCompleto} - CPF ${d.cpf}<br>
    Data e hora: ${d.dataHoraCompleta}<br>
    Local informado: ${d.cidade}
  </div>
</div>
</body>
</html>`;

    const blob = new Blob([html], {type:"text/html;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Termo-de-Adesao-${d.nomeCompleto.replace(/\s+/g,"-")}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
      else{
        const quando = data.assinadoEm ? new Date(data.assinadoEm) : new Date();
        setDadosAssinado({
          nomeCompleto: nomeCompleto.trim(),
          cpf: fCPFc(cpf),
          cidade: cidade.trim(),
          dataAssinatura: quando.toLocaleDateString("pt-BR"),
          dataHoraCompleta: quando.toLocaleString("pt-BR"),
          textoContrato: contrato?.textoContrato || "",
          assinaturaPaciente: assinaturaBase64,
          assinaturaPsicologo: contrato?.assinaturaPsicologo || "",
        });
        setConcluido(true);
      }
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
        <p style={{color:"#4a6a5a",fontSize:14,lineHeight:1.6,margin:"0 0 22px"}}>
          Seu aceite foi registrado com sucesso.<br/>
          Uma cópia ficará arquivada no seu prontuário.
        </p>

        {dadosAssinado
          ? <>
              <button onClick={baixarCopia}
                style={{width:"100%",padding:13,background:"#1a4a8a",color:"#fff",border:"none",borderRadius:10,fontSize:15,fontWeight:700,cursor:"pointer"}}>
                ↓ Baixar minha cópia
              </button>
              <p style={{fontSize:12,color:"#8aaa9a",margin:"12px 0 0",lineHeight:1.5}}>
                O arquivo abre em qualquer navegador.<br/>
                Para salvar em PDF, abra e use a opção Imprimir → Salvar como PDF.
              </p>
            </>
          : <p style={{fontSize:13,color:"#8aaa9a",margin:0,lineHeight:1.5}}>
              Este contrato já foi assinado anteriormente.<br/>
              Solicite uma cópia ao psicólogo, se precisar.
            </p>
        }
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

        <div style={{background:"#eef6f1",border:"1px solid #b0d8bc",borderRadius:12,padding:"16px 18px",marginBottom:20}}>
          <div style={{fontSize:12,fontWeight:700,color:"#1a4a2a",textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:12}}>Pontos de destaque</div>
          {DESTAQUES.map((x,i)=>(
            <div key={i} style={{marginBottom:i===DESTAQUES.length-1?0:12}}>
              <div style={{fontWeight:700,fontSize:13.5,color:"#1a4a2a",marginBottom:2}}>{x.titulo}</div>
              <div style={{fontSize:13,color:"#2a4a3a",lineHeight:1.55}}>{x.texto}</div>
            </div>
          ))}
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
