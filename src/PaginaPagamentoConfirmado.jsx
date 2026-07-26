// ============================================================================
//  PaginaPagamentoConfirmado.jsx
//  Espaço Ciriani | Tela pública pós-pagamento (rota /pagamento-confirmado)
// ----------------------------------------------------------------------------
//  Uso: adiciona no roteador (App.jsx), junto das outras rotas públicas:
//
//    if(window.location.pathname==="/pagamento-confirmado"){
//      return <PaginaPagamentoConfirmado/>;
//    }
//
//  Página estática, sem login, sem link nenhum de volta pro painel — só
//  a confirmação. É pra onde a InfinityPay redireciona o paciente depois
//  do pagamento (em vez de cair na tela de login do psicólogo).
// ============================================================================

import logoEspacoCiriani from "./assets/logo-espaco-ciriani.png";

export function PaginaPagamentoConfirmado() {
  return (
    <div style={estilos.fundo}>
      <div style={estilos.caixa}>
        <img src={logoEspacoCiriani} alt="Espaço Ciriani" style={estilos.logo} />
        <div style={estilos.icone}>✅</div>
        <h1 style={estilos.titulo}>Pagamento confirmado!</h1>
        <p style={estilos.texto}>
          Obrigado. Seu pagamento foi recebido com sucesso.
        </p>
      </div>
    </div>
  );
}

const estilos = {
  fundo: {
    minHeight: "100vh",
    background: "#f4f6f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    fontFamily: "sans-serif",
  },
  caixa: {
    background: "#fff",
    borderRadius: 16,
    padding: "48px 36px",
    textAlign: "center",
    border: "1px solid #deeade",
    maxWidth: 380,
  },
  logo: { width: 44, height: 44, marginBottom: 16 },
  icone: { fontSize: 52, marginBottom: 14 },
  titulo: { color: "#1a4a2a", margin: "0 0 10px", fontFamily: "Georgia,serif", fontSize: 22 },
  texto: { color: "#4a6a5a", lineHeight: 1.6, margin: 0, fontSize: 14 },
};
