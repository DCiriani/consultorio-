import { useState, useEffect, useRef } from "react";
import { collection, getDocs, doc, getDoc, setDoc, query, where } from "firebase/firestore";
import { db } from "./firebase";

const CX={background:"#fff",borderRadius:10,padding:16,border:"1px solid #e0ede5",marginBottom:12};
const BTN={padding:"9px 18px",background:"#2a7a4a",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontSize:13,fontFamily:"sans-serif",fontWeight:600};
const BTN_SEC={padding:"9px 18px",background:"#fff",color:"#4a6a5a",border:"1.5px solid #c8ddd0",borderRadius:8,cursor:"pointer",fontSize:13,fontFamily:"sans-serif"};
const LB={display:"block",fontSize:11,fontWeight:700,color:"#4a6a5a",marginBottom:5,fontFamily:"sans-serif",textTransform:"uppercase",letterSpacing:"0.04em"};

function limparHtmlContrato(html){
  if(!html)return "";
  const doc=new DOMParser().parseFromString(html,"text/html");
  const permitidas=["B","STRONG","I","EM","U","MARK","UL","OL","LI","P","BR","DIV","H1","H2","H3","H4","SPAN","HR"];
  function limpar(no){
    Array.from(no.childNodes).forEach(filho=>{
      if(filho.nodeType===1){
        if(!permitidas.includes(filho.tagName)){
          while(filho.firstChild)no.insertBefore(filho.firstChild,filho);
          no.removeChild(filho);
          return;
        }
        Array.from(filho.attributes).forEach(attr=>{
          const nome=attr.name.toLowerCase();
          const negrito = nome==="style" && /font-weight\s*:\s*(bold|[6-9]00)/i.test(attr.value);
          const sublinhado = nome==="style" && /text-decoration[^;]*underline/i.test(attr.value);
          if(negrito||sublinhado){
            filho.setAttribute("style",(negrito?"font-weight:700;":"")+(sublinhado?"text-decoration:underline;":""));
          }else{
            filho.removeAttribute(attr.name);
          }
        });
        limpar(filho);
      }else if(filho.nodeType===8){
        no.removeChild(filho);
      }
    });
  }
  limpar(doc.body);
  return doc.body.innerHTML;
}

function textoPuro(html){
  if(!html)return "";
  const d=document.createElement("div");
  d.innerHTML=html;
  return d.textContent||"";
}

export function AbaContrato({pacienteId,pacienteNome,showT}){
  const [contratos,setContratos]=useState([]);
  const [carregando,setCarregando]=useState(true);
  const [gerando,setGerando]=useState(false);
  const [linkGerado,setLinkGerado]=useState("");
  const [modoEdicao,setModoEdicao]=useState(false);
  const [modeloTexto,setModeloTexto]=useState("");
  const [salvandoModelo,setSalvandoModelo]=useState(false);
  const [detalhe,setDetalhe]=useState(null);
  const editorRef=useRef(null);

  async function carregarContratos(){
    setCarregando(true);
    try{
      const q=query(collection(db,"contratos"),where("pacienteId","==",pacienteId));
      const snap=await getDocs(q);
      const lista=snap.docs.map(d=>({id:d.id,...d.data()}));
      lista.sort((a,b)=>(b.criadoEm||"").localeCompare(a.criadoEm||""));
      setContratos(lista);
    }catch(e){ console.error(e); }
    setCarregando(false);
  }

  useEffect(()=>{ carregarContratos(); },[pacienteId]);

  async function abrirEdicaoModelo(){
    try{
      const snap=await getDoc(doc(db,"configuracoes","modeloContrato"));
      const texto=snap.exists()?(snap.data().texto||""):"";
      setModeloTexto(texto);
      setModoEdicao(true);
      setTimeout(()=>{ if(editorRef.current)editorRef.current.innerHTML=texto; },0);
    }catch(e){
      showT("Não foi possível carregar o modelo.","erro");
    }
  }

  async function salvarModelo(){
    if(!textoPuro(modeloTexto).trim()){ showT("O contrato não pode ficar vazio.","erro"); return; }
    setSalvandoModelo(true);
    try{
      const ref=doc(db,"configuracoes","modeloContrato");
      const atual=await getDoc(ref);
      const versao=atual.exists()?((atual.data().versao||1)+1):1;
      await setDoc(ref,{texto:modeloTexto,versao,atualizadoEm:new Date().toISOString()});
      showT("Modelo de contrato salvo!");
      setModoEdicao(false);
    }catch(e){
      showT("Erro ao salvar o modelo.","erro");
    }
    setSalvandoModelo(false);
  }

  function formatar(comando){
    const el=editorRef.current;
    if(!el)return;
    el.focus();
    if(comando==="marcador") document.execCommand("hiliteColor",false,"#fff3a3");
    else document.execCommand(comando,false,null);
    setModeloTexto(el.innerHTML);
  }

  function colar(e){
    e.preventDefault();
    const html=e.clipboardData.getData("text/html");
    const txt=e.clipboardData.getData("text/plain");
    if(html) document.execCommand("insertHTML",false,limparHtmlContrato(html));
    else document.execCommand("insertText",false,txt);
    if(editorRef.current) setModeloTexto(editorRef.current.innerHTML);
  }

  async function gerarLink(){
    setGerando(true);
    setLinkGerado("");
    try{
      const resp=await fetch("/api/contrato-gerar",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({pacienteId,pacienteNome})
      });
      const data=await resp.json();
      if(!resp.ok||data.erro){
        showT(data.erro||"Não foi possível gerar o link.","erro");
      }else{
        const url=`${window.location.origin}/contrato?token=${data.token}`;
        setLinkGerado(url);
        await carregarContratos();
        showT("Link gerado!");
      }
    }catch{
      showT("Erro de conexão.","erro");
    }
    setGerando(false);
  }

  function copiarLink(){
    navigator.clipboard.writeText(linkGerado);
    showT("Link copiado!");
  }

  function abrirWhatsApp(){
    const msg=encodeURIComponent(`Olá! Segue o link do termo de adesão para leitura e assinatura:\n\n${linkGerado}`);
    window.open(`https://wa.me/?text=${msg}`,"_blank");
  }

  const btnFmt={padding:"5px 10px",borderRadius:6,border:"1px solid #c8ddd0",background:"#fff",cursor:"pointer",fontSize:13};

  if(modoEdicao){
    return (
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
          <h4 style={{margin:0,fontSize:15,fontWeight:700,color:"#1a3a2a",fontFamily:"sans-serif"}}>Editar modelo do contrato</h4>
          <button onClick={()=>setModoEdicao(false)} style={BTN_SEC}>Cancelar</button>
        </div>

        <p style={{fontSize:12,color:"#5a7a6a",fontFamily:"sans-serif",marginTop:0,marginBottom:10,lineHeight:1.5}}>
          Cole aqui o texto do contrato (pode colar direto do Word ou Google Docs, mantendo a formatação).
          Contratos já assinados não serão alterados — cada um guarda a versão que a pessoa aceitou.
        </p>

        <div style={{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap"}}>
          <button type="button" onClick={()=>formatar("bold")} style={{...btnFmt,fontWeight:700}}>N</button>
          <button type="button" onClick={()=>formatar("underline")} style={{...btnFmt,textDecoration:"underline"}}>S</button>
          <button type="button" onClick={()=>formatar("insertUnorderedList")} style={btnFmt}>• Lista</button>
          <button type="button" onClick={()=>formatar("removeFormat")} style={{...btnFmt,color:"#8a8a85"}}>Limpar</button>
        </div>

        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={e=>setModeloTexto(e.currentTarget.innerHTML)}
          onPaste={colar}
          style={{width:"100%",minHeight:300,maxHeight:460,overflowY:"auto",padding:"12px 14px",borderRadius:8,border:"1.5px solid #dbe8df",fontSize:14,fontFamily:"sans-serif",boxSizing:"border-box",marginBottom:12,lineHeight:1.6,outline:"none",background:"#fafdfa"}}
        />

        <button onClick={salvarModelo} disabled={salvandoModelo} style={{...BTN,width:"100%",padding:12,fontSize:15,opacity:salvandoModelo?0.7:1}}>
          {salvandoModelo?"Salvando...":"✓ Salvar modelo"}
        </button>
      </div>
    );
  }

  if(detalhe){
    return (
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
          <h4 style={{margin:0,fontSize:15,fontWeight:700,color:"#1a3a2a",fontFamily:"sans-serif"}}>Contrato assinado</h4>
          <button onClick={()=>setDetalhe(null)} style={BTN_SEC}>← Voltar</button>
        </div>

        <div style={{...CX,background:"#f0faf4",border:"1px solid #b0d8bc"}}>
          <div style={{fontSize:13,fontFamily:"sans-serif",color:"#1a3a2a",lineHeight:1.8}}>
            <div><strong>Assinado por:</strong> {detalhe.assinatura?.nomeCompleto}</div>
            <div><strong>CPF informado:</strong> {detalhe.assinatura?.cpf}</div>
            <div><strong>Data e hora:</strong> {detalhe.assinadoEm ? new Date(detalhe.assinadoEm).toLocaleString("pt-BR") : "—"}</div>
            <div><strong>IP de origem:</strong> {detalhe.evidencias?.ip||"—"}</div>
            <div><strong>Integridade do texto:</strong> {detalhe.evidencias?.hashConfere ? "✅ confere" : "⚠️ divergente"}</div>
          </div>
        </div>

        {detalhe.assinatura?.imagemBase64&&
          <div style={CX}>
            <div style={LB}>Assinatura</div>
            <img src={detalhe.assinatura.imagemBase64} alt="Assinatura" style={{maxWidth:"100%",border:"1px solid #e0ede5",borderRadius:8,background:"#fff"}}/>
          </div>
        }

        <div style={CX}>
          <div style={LB}>Texto assinado</div>
          <div style={{maxHeight:360,overflowY:"auto",fontSize:13,fontFamily:"sans-serif",lineHeight:1.6,color:"#1a3a2a"}}
            dangerouslySetInnerHTML={{__html:limparHtmlContrato(detalhe.textoContrato||"")}}/>
        </div>

        <div style={{fontSize:11,color:"#8aaa9a",fontFamily:"sans-serif",lineHeight:1.5}}>
          Código de verificação (SHA-256): {detalhe.hashContrato}
        </div>
      </div>
    );
  }

  const assinados=contratos.filter(c=>c.status==="assinado");
  const pendentes=contratos.filter(c=>c.status!=="assinado");

  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        <button onClick={gerarLink} disabled={gerando} style={{...BTN,opacity:gerando?0.7:1}}>
          {gerando?"Gerando...":"+ Gerar link de assinatura"}
        </button>
        <button onClick={abrirEdicaoModelo} style={BTN_SEC}>✎ Editar modelo</button>
      </div>

      {linkGerado&&
        <div style={{...CX,background:"#e8f4ec",border:"1px solid #b0d8bc"}}>
          <div style={LB}>Link gerado</div>
          <div style={{fontSize:12,fontFamily:"monospace",color:"#1a4a2a",wordBreak:"break-all",marginBottom:10,background:"#fff",padding:"8px 10px",borderRadius:6,border:"1px solid #c8ddd0"}}>{linkGerado}</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button onClick={copiarLink} style={BTN}>📋 Copiar link</button>
            <button onClick={abrirWhatsApp} style={{...BTN,background:"#25D366"}}>Enviar no WhatsApp</button>
          </div>
          <p style={{fontSize:11,color:"#4a6a5a",fontFamily:"sans-serif",margin:"10px 0 0",lineHeight:1.5}}>
            Este link é único e pessoal. Envie apenas para {pacienteNome}.
          </p>
        </div>
      }

      {carregando
        ? <div style={{textAlign:"center",color:"#8aaa9a",fontFamily:"sans-serif",padding:20,fontSize:13}}>Carregando...</div>
        : <>
          {assinados.length>0&&<>
            <div style={{...LB,marginTop:8}}>Contratos assinados ({assinados.length})</div>
            {assinados.map(c=>(
              <div key={c.id} style={{...CX,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:160}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#1a3a2a",fontFamily:"sans-serif"}}>
                    ✅ {c.assinatura?.nomeCompleto||"Assinado"}
                  </div>
                  <div style={{fontSize:12,color:"#5a7a6a",fontFamily:"sans-serif",marginTop:2}}>
                    {c.assinadoEm ? new Date(c.assinadoEm).toLocaleString("pt-BR") : ""}
                  </div>
                </div>
                <button onClick={()=>setDetalhe(c)} style={BTN_SEC}>Ver contrato</button>
              </div>
            ))}
          </>}

          {pendentes.length>0&&<>
            <div style={{...LB,marginTop:14}}>Links pendentes ({pendentes.length})</div>
            {pendentes.map(c=>(
              <div key={c.id} style={{...CX,background:"#fff7e8",border:"1px solid #e8cfa3",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:160}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#8a5a1a",fontFamily:"sans-serif"}}>⏳ Aguardando assinatura</div>
                  <div style={{fontSize:12,color:"#8a7a5a",fontFamily:"sans-serif",marginTop:2}}>
                    Gerado em {c.criadoEm ? new Date(c.criadoEm).toLocaleString("pt-BR") : ""}
                  </div>
                </div>
                <button onClick={()=>{
                  const url=`${window.location.origin}/contrato?token=${c.token}`;
                  navigator.clipboard.writeText(url);
                  showT("Link copiado!");
                }} style={BTN_SEC}>Copiar link</button>
              </div>
            ))}
          </>}

          {contratos.length===0&&
            <div style={{textAlign:"center",color:"#8aaa9a",fontFamily:"sans-serif",padding:"20px 0",fontSize:13,lineHeight:1.6}}>
              Nenhum contrato gerado para este paciente.<br/>
              Clique em "Gerar link de assinatura" para começar.
            </div>
          }
        </>
      }
    </div>
  );
}
