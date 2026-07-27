// ============================================================================
//  AbaDocumentos.jsx
//  Espaço Ciriani | Documentos (Atestado / Declaração de comparecimento)
// ----------------------------------------------------------------------------
//  Uso: dentro da aba "Atendimentos" da ficha do paciente:
//
//    <AbaDocumentos paciente={paciente} showT={showT} />
//
//  - Assinatura + carimbo ficam configurados uma vez (por profissional) e
//    são aplicados automaticamente conforme o profissional do paciente.
//  - Gera um arquivo HTML pra baixar (mesmo padrão do Contrato: abre no
//    navegador, "Imprimir → Salvar como PDF").
//  - Guarda histórico na coleção "documentos" (pacienteId, tipo, dados,
//    criadoEm) — aparece embaixo do formulário.
// ============================================================================

import { useState, useEffect } from "react";
import { collection, addDoc, getDocs, doc, getDoc, setDoc, deleteDoc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import logoEspacoCiriani from "./assets/logo-espaco-ciriani.png";

// ---------------------------------------------------------------------------
//  AJUSTE AQUI: IDs dos profissionais, tem que bater com o campo
//  "profissional" salvo em cada paciente (confirma com o array PROFISSIONAIS
//  do App.jsx)
// ---------------------------------------------------------------------------
const ID_DIEGO = "diego";
const ID_RHANIA = "rhania";

// ---------------------------------------------------------------------------
//  Lista curada dos CID-10 mais comuns na prática psicológica (capítulo F —
//  transtornos mentais e comportamentais — mais alguns Z relevantes).
//  Não é exaustiva: confere sempre o código antes de usar no documento.
// ---------------------------------------------------------------------------
const CIDS_COMUNS = [
  { codigo: "F32.0", nome: "Episódio depressivo leve" },
  { codigo: "F32.1", nome: "Episódio depressivo moderado" },
  { codigo: "F32.2", nome: "Episódio depressivo grave sem sintomas psicóticos" },
  { codigo: "F32.9", nome: "Episódio depressivo não especificado" },
  { codigo: "F33.0", nome: "Transtorno depressivo recorrente, episódio atual leve" },
  { codigo: "F33.1", nome: "Transtorno depressivo recorrente, episódio atual moderado" },
  { codigo: "F33.2", nome: "Transtorno depressivo recorrente, episódio atual grave sem sintomas psicóticos" },
  { codigo: "F34.1", nome: "Distimia (transtorno depressivo persistente)" },
  { codigo: "F34.0", nome: "Ciclotimia" },
  { codigo: "F31.0", nome: "Transtorno afetivo bipolar, episódio atual hipomaníaco" },
  { codigo: "F31.1", nome: "Transtorno afetivo bipolar, episódio atual maníaco sem sintomas psicóticos" },
  { codigo: "F31.3", nome: "Transtorno afetivo bipolar, episódio atual depressão leve ou moderada" },
  { codigo: "F41.0", nome: "Transtorno de pânico (ansiedade paroxística episódica)" },
  { codigo: "F41.1", nome: "Transtorno de ansiedade generalizada" },
  { codigo: "F41.2", nome: "Transtorno misto ansioso e depressivo" },
  { codigo: "F40.0", nome: "Agorafobia" },
  { codigo: "F40.1", nome: "Fobia social" },
  { codigo: "F42", nome: "Transtorno obsessivo-compulsivo" },
  { codigo: "F42.0", nome: "TOC — predomínio de pensamentos/ruminações obsessivas" },
  { codigo: "F42.1", nome: "TOC — predomínio de comportamentos compulsivos (rituais)" },
  { codigo: "F43.0", nome: "Reação aguda ao stress" },
  { codigo: "F43.1", nome: "Transtorno de estresse pós-traumático (TEPT)" },
  { codigo: "F43.2", nome: "Transtorno de adaptação" },
  { codigo: "F43.20", nome: "Transtorno de adaptação — reação depressiva breve" },
  { codigo: "F43.21", nome: "Transtorno de adaptação — reação depressiva prolongada" },
  { codigo: "F43.25", nome: "Transtorno de adaptação — reação mista ansiosa e depressiva" },
  { codigo: "F44", nome: "Transtornos dissociativos (de conversão)" },
  { codigo: "F45.0", nome: "Transtorno de somatização" },
  { codigo: "F45.2", nome: "Transtorno hipocondríaco" },
  { codigo: "F50.0", nome: "Anorexia nervosa" },
  { codigo: "F50.2", nome: "Bulimia nervosa" },
  { codigo: "F50.8", nome: "Compulsão alimentar / outros transtornos alimentares" },
  { codigo: "F51.0", nome: "Insônia não orgânica" },
  { codigo: "F60.2", nome: "Transtorno de personalidade antissocial" },
  { codigo: "F60.3", nome: "Transtorno de personalidade emocionalmente instável (borderline)" },
  { codigo: "F60.5", nome: "Transtorno de personalidade anancástica (obsessivo-compulsiva)" },
  { codigo: "F60.6", nome: "Transtorno de personalidade ansiosa (esquiva)" },
  { codigo: "F60.7", nome: "Transtorno de personalidade dependente" },
  { codigo: "F90.0", nome: "TDAH (distúrbio de atividade e da atenção)" },
  { codigo: "F84.0", nome: "Autismo infantil (TEA)" },
  { codigo: "F84.5", nome: "Síndrome de Asperger" },
  { codigo: "F70", nome: "Retardo mental leve" },
  { codigo: "F20", nome: "Esquizofrenia" },
  { codigo: "F25", nome: "Transtorno esquizoafetivo" },
  { codigo: "F10.1", nome: "Uso nocivo de álcool" },
  { codigo: "F10.2", nome: "Síndrome de dependência do álcool" },
  { codigo: "F12.1", nome: "Uso nocivo de canabinoides" },
  { codigo: "F19.1", nome: "Uso nocivo de múltiplas drogas" },
  { codigo: "F63.0", nome: "Jogo patológico" },
  { codigo: "F93.0", nome: "Transtorno de ansiedade de separação" },
  { codigo: "F94.0", nome: "Mutismo eletivo" },
  { codigo: "F98.0", nome: "Enurese não orgânica" },
  { codigo: "Z73.0", nome: "Esgotamento profissional (burnout)" },
  { codigo: "Z63.0", nome: "Problemas de relacionamento com cônjuge/parceiro" },
  { codigo: "Z61", nome: "Problemas relacionados a eventos negativos na infância" },
];

function normalizar(txt) {
  return (txt || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // remove acentos, pra "depressao" achar "depressão"
}

const CX = { background: "#fff", borderRadius: 10, padding: 16, border: "1px solid #e0ede5", marginBottom: 12 };
const BTN = { padding: "9px 18px", background: "#2a7a4a", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: "sans-serif", fontWeight: 600 };
const BTN_SEC = { padding: "9px 18px", background: "#fff", color: "#4a6a5a", border: "1.5px solid #c8ddd0", borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: "sans-serif" };
const LB = { display: "block", fontSize: 11, fontWeight: 700, color: "#4a6a5a", marginBottom: 5, fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.04em" };
const IN = { width: "100%", padding: "10px 12px", border: "1.5px solid #c8ddd0", borderRadius: 8, fontSize: 14, fontFamily: "sans-serif", boxSizing: "border-box", background: "#fafdfa", color: "#1a3a2a" };
const TA = { ...IN, minHeight: 110, resize: "vertical", lineHeight: 1.5 };

function hoje() {
  return new Date().toLocaleDateString("pt-BR");
}

// recorta o excesso de fundo branco/transparente ao redor do desenho,
// deixando só a assinatura ou o carimbo de verdade (sem a folha em volta)
function recortarEspacoBranco(canvas) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const dados = ctx.getImageData(0, 0, width, height).data;
  const limiar = 245; // acima disso é considerado "quase branco"

  let minX = width, minY = height, maxX = 0, maxY = 0;
  let achouAlgo = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = dados[i], g = dados[i + 1], b = dados[i + 2], a = dados[i + 3];
      const eFundo = a < 10 || (r > limiar && g > limiar && b > limiar);
      if (!eFundo) {
        achouAlgo = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!achouAlgo) return canvas; // não achou nada, devolve como veio

  const folga = 6; // uma respirada pequena ao redor do que sobrou
  minX = Math.max(0, minX - folga);
  minY = Math.max(0, minY - folga);
  maxX = Math.min(width - 1, maxX + folga);
  maxY = Math.min(height - 1, maxY + folga);

  const recortado = document.createElement("canvas");
  recortado.width = maxX - minX + 1;
  recortado.height = maxY - minY + 1;
  const ctxRecortado = recortado.getContext("2d");
  ctxRecortado.fillStyle = "#fff";
  ctxRecortado.fillRect(0, 0, recortado.width, recortado.height);
  ctxRecortado.drawImage(canvas, minX, minY, recortado.width, recortado.height, 0, 0, recortado.width, recortado.height);
  return recortado;
}

function redimensionarImagem(file, larguraMax = 480) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, larguraMax / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const canvasRecortado = recortarEspacoBranco(canvas);
        resolve(canvasRecortado.toDataURL("image/png"));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// busca o logo do projeto e converte pra base64, pra ficar embutido no
// arquivo baixado (funciona mesmo offline, sem depender do site estar no ar)
let logoBase64Cache = null;
async function obterLogoBase64() {
  if (logoBase64Cache) return logoBase64Cache;
  try {
    const resp = await fetch(logoEspacoCiriani);
    const blob = await resp.blob();
    logoBase64Cache = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return logoBase64Cache;
  } catch (e) {
    console.error("Não consegui carregar o logo:", e);
    return null;
  }
}

async function baixarHtml(nomeArquivo, corpoHtml) {
  const logo = await obterLogoBase64();
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${nomeArquivo}</title>
<style>
  body{font-family:"Times New Roman",Times,serif;font-variant-numeric:lining-nums tabular-nums;background:#f4f6f0;margin:0;padding:24px 16px;color:#1a3a2a;line-height:1.7;}
  .folha{background:#fff;max-width:720px;margin:0 auto;padding:48px 44px;border-radius:6px;border:1px solid #deeade;display:flex;flex-direction:column;min-height:900px;box-sizing:border-box;}
  .conteudo{flex:1;}
  .cabecalho{display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:36px;padding-bottom:20px;border-bottom:1px solid #e3ede6;}
  .cabecalho img{width:44px;height:44px;flex-shrink:0;}
  .cabecalho h2{font-size:18px;margin:0;letter-spacing:0.02em;}
  .titulo{text-align:center;font-size:16px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 30px;}
  .corpo{font-size:15px;text-align:justify;}
  .corpo p{margin:0 0 16px;}
  .data-local{margin-top:36px;font-size:14px;}
  .assinaturas{display:flex;flex-direction:column;align-items:center;margin-top:10px;gap:2px;}
  .bloco-assinatura-carimbo{display:flex;align-items:center;justify-content:center;gap:4px;}
  .bloco-assinatura-carimbo img.assinatura{max-height:320px;max-width:600px;display:block;}
  .bloco-assinatura-carimbo img.carimbo{max-height:130px;max-width:220px;display:block;}
  .linha-nome{border-top:1px solid #444;padding-top:6px;margin-top:2px;font-size:13px;min-width:260px;text-align:center;}
  .rodape{margin-top:40px;padding-top:16px;border-top:1px solid #e3ede6;text-align:center;font-size:11px;color:#7a9488;line-height:1.6;}
  @media print{body{background:#fff;padding:0;}.folha{border:none;max-width:none;padding:0;}}
</style>
</head>
<body>
<div class="folha">
  <div class="conteudo">
    <div class="cabecalho">
      ${logo ? `<img src="${logo}" alt="Espaço Ciriani"/>` : ""}
      <h2>Espaço Ciriani</h2>
    </div>
    ${corpoHtml}
  </div>
  <div class="rodape">
    R. Piauí, 1657 — Santa Maria, Uberaba - MG, 38050-460 — (34) 99141-2984
  </div>
</div>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nomeArquivo}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
//  Configuração de assinatura + carimbo (uma vez por profissional)
// ---------------------------------------------------------------------------
function ConfigurarAssinaturas({ onFechar, showT }) {
  const [profissionalAtivo, setProfissionalAtivo] = useState(ID_DIEGO);
  const [dados, setDados] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, "configuracoes", "assinaturas"));
      setDados(snap.exists() ? snap.data() : {});
      setCarregando(false);
    })();
  }, []);

  const atual = dados[profissionalAtivo] || { nomeCompleto: "", crp: "", assinatura: "", carimbo: "" };

  const atualizarCampo = (campo, valor) => {
    setDados((prev) => ({ ...prev, [profissionalAtivo]: { ...atual, [campo]: valor } }));
  };

  const escolherImagem = async (campo, file) => {
    if (!file) return;
    try {
      const base64 = await redimensionarImagem(file, campo === "assinatura" ? 900 : 480);
      atualizarCampo(campo, base64);
    } catch {
      showT("Não consegui ler a imagem.", "erro");
    }
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      await setDoc(doc(db, "configuracoes", "assinaturas"), dados);
      showT("Assinaturas salvas!");
      onFechar();
    } catch {
      showT("Erro ao salvar.", "erro");
    }
    setSalvando(false);
  };

  if (carregando) return <div style={CX}>Carregando...</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#1a3a2a", fontFamily: "sans-serif" }}>
          Configurar assinatura e carimbo
        </h4>
        <button onClick={onFechar} style={BTN_SEC}>← Voltar</button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setProfissionalAtivo(ID_DIEGO)}
          style={profissionalAtivo === ID_DIEGO ? BTN : BTN_SEC}
        >
          Diego
        </button>
        <button
          onClick={() => setProfissionalAtivo(ID_RHANIA)}
          style={profissionalAtivo === ID_RHANIA ? BTN : BTN_SEC}
        >
          Rhania
        </button>
      </div>

      <div style={CX}>
        <label style={LB}>Nome completo (como aparece no documento)</label>
        <input
          style={{ ...IN, marginBottom: 12 }}
          value={atual.nomeCompleto || ""}
          onChange={(e) => atualizarCampo("nomeCompleto", e.target.value)}
          placeholder="Ex: Diego Ciriani Alves Junqueira de Araujo"
        />
        <label style={LB}>CRP</label>
        <input
          style={IN}
          value={atual.crp || ""}
          onChange={(e) => atualizarCampo("crp", e.target.value)}
          placeholder="Ex: 04/44668"
        />
      </div>

      <div style={CX}>
        <label style={LB}>Assinatura (imagem)</label>
        {atual.assinatura && (
          <img src={atual.assinatura} alt="Assinatura" style={{ maxHeight: 80, display: "block", marginBottom: 8, border: "1px solid #eee", borderRadius: 6, background: "#fff" }} />
        )}
        <input type="file" accept="image/*" onChange={(e) => escolherImagem("assinatura", e.target.files?.[0])} />
      </div>

      <div style={CX}>
        <label style={LB}>Carimbo (imagem)</label>
        {atual.carimbo && (
          <img src={atual.carimbo} alt="Carimbo" style={{ maxHeight: 100, display: "block", marginBottom: 8, border: "1px solid #eee", borderRadius: 6, background: "#fff" }} />
        )}
        <input type="file" accept="image/*" onChange={(e) => escolherImagem("carimbo", e.target.files?.[0])} />
      </div>

      <button onClick={salvar} disabled={salvando} style={{ ...BTN, width: "100%", padding: 12 }}>
        {salvando ? "Salvando..." : "✓ Salvar"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Formulário do Atestado Psicológico
// ---------------------------------------------------------------------------
function FormularioAtestado({ paciente, assinaturas, onGerado, showT }) {
  const [fundamentacao, setFundamentacao] = useState("");
  const [cid, setCid] = useState("");
  const [sugestoesCid, setSugestoesCid] = useState([]);
  const [dias, setDias] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [mostrarExemplo, setMostrarExemplo] = useState(false);
  const [gerando, setGerando] = useState(false);

  const profId = paciente.profissional === ID_RHANIA ? ID_RHANIA : ID_DIEGO;
  const prof = assinaturas[profId] || {};

  const buscarCid = (termo) => {
    setCid(termo);
    const q = normalizar(termo);
    if (q.length < 2) {
      setSugestoesCid([]);
      return;
    }
    const encontrados = CIDS_COMUNS.filter(
      (c) => normalizar(c.nome).includes(q) || normalizar(c.codigo).startsWith(q)
    ).slice(0, 8);
    setSugestoesCid(encontrados);
  };

  const escolherCid = (c) => {
    setCid(`${c.codigo} — ${c.nome}`);
    setSugestoesCid([]);
  };

  const gerar = async () => {
    if (!fundamentacao.trim()) {
      showT("Escreve a fundamentação clínica antes de gerar.", "erro");
      return;
    }
    if (!prof.assinatura) {
      showT("Configura a assinatura desse profissional antes de gerar (botão no topo).", "erro");
      return;
    }

    setGerando(true);
    try {
      const dadosDoc = {
        pacienteId: paciente.id,
        pacienteNome: paciente.nome,
        tipo: "atestado",
        fundamentacao: fundamentacao.trim(),
        cid: cid.trim(),
        dias: dias.trim(),
        dataInicio: dataInicio.trim(),
        profissionalId: profId,
        profissionalNome: prof.nomeCompleto || "",
        criadoEm: serverTimestamp(),
      };
      await addDoc(collection(db, "documentos"), dadosDoc);

      const corpo = `
        <div class="titulo">Atestado Psicológico</div>
        <div class="corpo">
          <p>Atesto, para os devidos fins, que <strong>${paciente.nome}</strong>, portador(a) do CPF <strong>${paciente.cpf || "—"}</strong>, esteve sob acompanhamento psicológico neste serviço.</p>
          <p>${fundamentacao.trim()}</p>
          ${cid.trim() ? `<p>CID: ${cid.trim()}</p>` : ""}
          ${dias.trim() ? `<p>Recomendo afastamento de suas atividades pelo período de ${dias.trim()} dia(s)${dataInicio.trim() ? `, a partir de ${dataInicio.trim()}` : ""}.</p>` : ""}
        </div>
        <div class="data-local">Uberaba, ${hoje()}.</div>
        <div class="assinaturas">
          <div class="bloco-assinatura-carimbo">
            <img class="assinatura" src="${prof.assinatura}" alt="Assinatura"/>
            ${prof.carimbo ? `<img class="carimbo" src="${prof.carimbo}" alt="Carimbo"/>` : ""}
          </div>
          <div class="linha-nome">${prof.nomeCompleto || ""}${prof.crp ? ` — CRP ${prof.crp}` : ""}</div>
        </div>
      `;
      await baixarHtml(`Atestado-${paciente.nome.replace(/\s+/g, "-")}`, corpo);
      showT("Atestado gerado e salvo no histórico!");
      setFundamentacao("");
      setCid("");
      setDias("");
      setDataInicio("");
      onGerado();
    } catch (e) {
      showT("Erro ao gerar o atestado.", "erro");
    }
    setGerando(false);
  };

  return (
    <div>
      <button onClick={() => setMostrarExemplo((v) => !v)} style={{ ...BTN_SEC, marginBottom: 12 }}>
        {mostrarExemplo ? "▾" : "▸"} Ver exemplo (dados fictícios)
      </button>

      {mostrarExemplo && (
        <div style={{ ...CX, background: "#fffbe8", border: "1px solid #f0dfa0", fontSize: 13, fontFamily: "sans-serif", lineHeight: 1.6, color: "#5a4a1a" }}>
          <strong>Exemplo — não copie, é só referência de como fundamentar:</strong>
          <p style={{ marginTop: 8 }}>
            "Fulano da Silva Souza, CPF 123.456.789-00, esteve sob acompanhamento psicológico neste
            serviço, apresentando quadro compatível com Transtorno de Ansiedade Generalizada, o que
            justifica o afastamento de suas atividades pelo período indicado, com vistas à
            preservação de sua saúde mental e adequado prosseguimento do tratamento."
          </p>
          <p style={{ margin: 0, fontStyle: "italic" }}>
            CID (exemplo): F41.1 · Dias (exemplo): 5 · Início (exemplo): 25/07/2026
          </p>
        </div>
      )}

      <label style={LB}>Fundamentação clínica (obrigatório — baseado em avaliação/prontuário)</label>
      <textarea
        style={{ ...TA, marginBottom: 12 }}
        value={fundamentacao}
        onChange={(e) => setFundamentacao(e.target.value)}
        placeholder="Descreve o quadro clínico que fundamenta este atestado..."
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
        <div style={{ position: "relative" }}>
          <label style={LB}>CID (opcional)</label>
          <input
            style={IN}
            value={cid}
            onChange={(e) => buscarCid(e.target.value)}
            onBlur={() => setTimeout(() => setSugestoesCid([]), 150)}
            placeholder="Digite o nome, ex: depressão"
            autoComplete="off"
          />
          {sugestoesCid.length > 0 && (
            <ul
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                minWidth: 280,
                background: "#fff",
                border: "1.5px solid #c8ddd0",
                borderRadius: 8,
                zIndex: 50,
                listStyle: "none",
                margin: 0,
                padding: "4px 0",
                boxShadow: "0 8px 24px rgba(0,40,20,0.12)",
                maxHeight: 240,
                overflowY: "auto",
              }}
            >
              {sugestoesCid.map((c) => (
                <li
                  key={c.codigo}
                  onMouseDown={() => escolherCid(c)}
                  style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, fontFamily: "sans-serif" }}
                >
                  <strong>{c.codigo}</strong> — {c.nome}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <label style={LB}>Dias de afastamento</label>
          <input style={IN} value={dias} onChange={(e) => setDias(e.target.value)} placeholder="Ex: 5" />
        </div>
        <div>
          <label style={LB}>Início do afastamento</label>
          <input style={IN} value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} placeholder="DD/MM/AAAA" />
        </div>
      </div>

      <button onClick={gerar} disabled={gerando} style={{ ...BTN, width: "100%", padding: 12 }}>
        {gerando ? "Gerando..." : "📄 Gerar e baixar atestado"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Formulário da Declaração de Comparecimento
// ---------------------------------------------------------------------------
function FormularioDeclaracao({ paciente, assinaturas, onGerado, showT }) {
  const [quem, setQuem] = useState("paciente"); // "paciente" | "acompanhante"
  const [nomeAcompanhante, setNomeAcompanhante] = useState("");
  const [dataComparecimento, setDataComparecimento] = useState(hoje());
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFim, setHoraFim] = useState("");
  const [gerando, setGerando] = useState(false);

  const profId = paciente.profissional === ID_RHANIA ? ID_RHANIA : ID_DIEGO;
  const prof = assinaturas[profId] || {};

  const gerar = async () => {
    if (quem === "acompanhante" && !nomeAcompanhante.trim()) {
      showT("Informa o nome do acompanhante.", "erro");
      return;
    }
    if (!prof.assinatura) {
      showT("Configura a assinatura desse profissional antes de gerar (botão no topo).", "erro");
      return;
    }

    setGerando(true);
    try {
      const dadosDoc = {
        pacienteId: paciente.id,
        pacienteNome: paciente.nome,
        tipo: "declaracao",
        quem,
        nomeAcompanhante: nomeAcompanhante.trim(),
        dataComparecimento,
        horaInicio,
        horaFim,
        profissionalId: profId,
        profissionalNome: prof.nomeCompleto || "",
        criadoEm: serverTimestamp(),
      };
      await addDoc(collection(db, "documentos"), dadosDoc);

      const quemTexto =
        quem === "paciente"
          ? `<strong>${paciente.nome}</strong>`
          : `<strong>${nomeAcompanhante.trim()}</strong>, na condição de acompanhante de <strong>${paciente.nome}</strong>,`;

      const horarioTexto =
        horaInicio && horaFim
          ? ` no horário de ${horaInicio} às ${horaFim}`
          : horaInicio
          ? ` a partir das ${horaInicio}`
          : "";

      const corpo = `
        <div class="titulo">Declaração de Comparecimento</div>
        <div class="corpo">
          <p>Declaro, para os devidos fins, que ${quemTexto} esteve presente nesta clínica no dia
          <strong>${dataComparecimento}</strong>${horarioTexto}, para fins de atendimento psicológico.</p>
        </div>
        <div class="data-local">Uberaba, ${hoje()}.</div>
        <div class="assinaturas">
          <div class="bloco-assinatura-carimbo">
            <img class="assinatura" src="${prof.assinatura}" alt="Assinatura"/>
            ${prof.carimbo ? `<img class="carimbo" src="${prof.carimbo}" alt="Carimbo"/>` : ""}
          </div>
          <div class="linha-nome">${prof.nomeCompleto || ""}${prof.crp ? ` — CRP ${prof.crp}` : ""}</div>
        </div>
      `;
      await baixarHtml(`Declaracao-${paciente.nome.replace(/\s+/g, "-")}`, corpo);
      showT("Declaração gerada e salva no histórico!");
      setNomeAcompanhante("");
      setHoraInicio("");
      setHoraFim("");
      onGerado();
    } catch (e) {
      showT("Erro ao gerar a declaração.", "erro");
    }
    setGerando(false);
  };

  return (
    <div>
      <div style={{ ...CX, background: "#eef6f1", border: "1px solid #b0d8bc", fontSize: 12, fontFamily: "sans-serif", color: "#1a4a2a" }}>
        Lembrete: esse documento não pode conter sintomas, diagnóstico ou qualquer detalhe clínico —
        só a confirmação de presença.
      </div>

      <label style={LB}>Quem compareceu?</label>
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "sans-serif", fontSize: 13, cursor: "pointer" }}>
          <input type="radio" checked={quem === "paciente"} onChange={() => setQuem("paciente")} />
          O próprio paciente
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "sans-serif", fontSize: 13, cursor: "pointer" }}>
          <input type="radio" checked={quem === "acompanhante"} onChange={() => setQuem("acompanhante")} />
          Um acompanhante
        </label>
      </div>

      {quem === "acompanhante" && (
        <div style={{ marginBottom: 14 }}>
          <label style={LB}>Nome do acompanhante</label>
          <input style={IN} value={nomeAcompanhante} onChange={(e) => setNomeAcompanhante(e.target.value)} />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
        <div>
          <label style={LB}>Data</label>
          <input style={IN} value={dataComparecimento} onChange={(e) => setDataComparecimento(e.target.value)} placeholder="DD/MM/AAAA" />
        </div>
        <div>
          <label style={LB}>Horário início (opcional)</label>
          <input style={IN} value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} placeholder="Ex: 14:00" />
        </div>
        <div>
          <label style={LB}>Horário fim (opcional)</label>
          <input style={IN} value={horaFim} onChange={(e) => setHoraFim(e.target.value)} placeholder="Ex: 15:00" />
        </div>
      </div>

      <button onClick={gerar} disabled={gerando} style={{ ...BTN, width: "100%", padding: 12 }}>
        {gerando ? "Gerando..." : "📄 Gerar e baixar declaração"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Componente principal
// ---------------------------------------------------------------------------
export function AbaDocumentos({ paciente, showT }) {
  const [aba, setAba] = useState("atestado"); // "atestado" | "declaracao"
  const [configurando, setConfigurando] = useState(false);
  const [assinaturas, setAssinaturas] = useState({});
  const [historico, setHistorico] = useState([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(true);

  const carregarAssinaturas = async () => {
    const snap = await getDoc(doc(db, "configuracoes", "assinaturas"));
    setAssinaturas(snap.exists() ? snap.data() : {});
  };

  const carregarHistorico = async () => {
    setCarregandoHistorico(true);
    try {
      const q = query(collection(db, "documentos"), where("pacienteId", "==", paciente.id));
      const snap = await getDocs(q);
      const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      lista.sort((a, b) => (b.criadoEm?.toMillis?.() || 0) - (a.criadoEm?.toMillis?.() || 0));
      setHistorico(lista);
    } catch (e) {
      console.error(e);
    }
    setCarregandoHistorico(false);
  };

  const excluirDocumento = async (id) => {
    const ok = window.confirm("Apagar este documento do histórico? Não dá pra desfazer.");
    if (!ok) return;
    try {
      await deleteDoc(doc(db, "documentos", id));
      setHistorico((prev) => prev.filter((h) => h.id !== id));
      showT("Documento apagado.");
    } catch (e) {
      showT("Erro ao apagar o documento.", "erro");
    }
  };

  useEffect(() => {
    carregarAssinaturas();
    carregarHistorico();
  }, [paciente.id]);

  if (configurando) {
    return <ConfigurarAssinaturas onFechar={() => { setConfigurando(false); carregarAssinaturas(); }} showT={showT} />;
  }

  const rotuloTipo = { atestado: "📋 Atestado", declaracao: "📅 Declaração de comparecimento" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setAba("atestado")} style={aba === "atestado" ? BTN : BTN_SEC}>📋 Atestado</button>
          <button onClick={() => setAba("declaracao")} style={aba === "declaracao" ? BTN : BTN_SEC}>📅 Declaração</button>
        </div>
        <button onClick={() => setConfigurando(true)} style={BTN_SEC}>⚙️ Assinaturas</button>
      </div>

      {aba === "atestado" && (
        <FormularioAtestado paciente={paciente} assinaturas={assinaturas} onGerado={carregarHistorico} showT={showT} />
      )}
      {aba === "declaracao" && (
        <FormularioDeclaracao paciente={paciente} assinaturas={assinaturas} onGerado={carregarHistorico} showT={showT} />
      )}

      <div style={{ marginTop: 22, borderTop: "1px solid #eef4ec", paddingTop: 14 }}>
        <div style={LB}>Histórico de documentos</div>
        {carregandoHistorico && <p style={{ fontFamily: "sans-serif", fontSize: 13, color: "#8aaa9a" }}>Carregando...</p>}
        {!carregandoHistorico && historico.length === 0 && (
          <p style={{ fontFamily: "sans-serif", fontSize: 13, color: "#8aaa9a" }}>Nenhum documento gerado ainda.</p>
        )}
        {!carregandoHistorico &&
          historico.map((h) => (
            <div key={h.id} style={{ ...CX, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a3a2a", fontFamily: "sans-serif" }}>
                  {rotuloTipo[h.tipo] || h.tipo}
                </div>
                <div style={{ fontSize: 12, color: "#5a7a6a", fontFamily: "sans-serif", marginTop: 2 }}>
                  {h.criadoEm?.toDate ? h.criadoEm.toDate().toLocaleString("pt-BR") : ""}
                  {h.profissionalNome ? ` · ${h.profissionalNome}` : ""}
                </div>
              </div>
              <button
                onClick={() => excluirDocumento(h.id)}
                style={{ background: "none", border: "none", color: "#c0392b", cursor: "pointer", fontSize: 12, fontFamily: "sans-serif" }}
              >
                🗑 excluir
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
