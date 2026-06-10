# 📋 Consultório — App de Pagamentos

App para registro de pagamentos e cadastro de pacientes, com exportação para planilha .xlsx.

---

## 🚀 Como colocar no ar (passo a passo)

### PASSO 1 — Criar conta no Firebase (banco de dados gratuito)

1. Acesse [https://console.firebase.google.com](https://console.firebase.google.com)
2. Clique em **"Criar um projeto"**
3. Dê um nome (ex: `consultorio-diego`) e clique em Continuar
4. Desative o Google Analytics (não precisa) → **Criar projeto**
5. No menu lateral, clique em **Firestore Database**
6. Clique em **"Criar banco de dados"**
7. Escolha **Modo de teste** → Avançar → escolha a região `us-east1` → Concluir

### PASSO 2 — Pegar as credenciais do Firebase

1. No menu lateral, clique na engrenagem ⚙️ → **Configurações do projeto**
2. Role até **"Seus aplicativos"** → clique no ícone `</>`  (Web)
3. Dê um apelido (ex: `consultorio`) → Registrar app
4. Você verá um bloco de código com `firebaseConfig`. **Copie esses valores.**

### PASSO 3 — Colar as credenciais no app

Abra o arquivo `src/firebase.js` e substitua os valores:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",           // ← cole aqui
  authDomain: "consultorio-diego.firebaseapp.com",
  projectId: "consultorio-diego",
  storageBucket: "consultorio-diego.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123",
};
```

### PASSO 4 — Criar conta no Vercel (hospedagem gratuita)

1. Acesse [https://vercel.com](https://vercel.com) → **Sign Up**
2. Entre com sua conta GitHub (crie uma se não tiver em [github.com](https://github.com))

### PASSO 5 — Subir o projeto no GitHub

1. Acesse [https://github.com/new](https://github.com/new)
2. Crie um repositório chamado `consultorio-pagamentos` (privado)
3. No terminal da sua máquina (ou use o GitHub Desktop):

```bash
cd consultorio-pagamentos
git init
git add .
git commit -m "primeiro commit"
git remote add origin https://github.com/SEU_USUARIO/consultorio-pagamentos.git
git push -u origin main
```

### PASSO 6 — Publicar no Vercel

1. No Vercel, clique em **"Add New Project"**
2. Importe o repositório `consultorio-pagamentos`
3. Clique em **Deploy** (as configurações são detectadas automaticamente)
4. Em ~1 minuto, seu app estará no ar com um link tipo:
   `https://consultorio-pagamentos.vercel.app`

### PASSO 7 — Adicionar na tela do celular

**No iPhone (Safari):**
1. Abra o link no Safari
2. Toque no botão de compartilhar (quadrado com seta)
3. Role e toque em **"Adicionar à Tela de Início"**
4. Toque em **Adicionar** — aparece como ícone na tela inicial!

**No Android (Chrome):**
1. Abra o link no Chrome
2. Toque no menu ⋮ (três pontinhos)
3. Toque em **"Adicionar à tela inicial"**

---

## 📱 Como usar

| Rota | Para quem |
|------|-----------|
| `seusite.vercel.app/` | Você (painel do psicólogo) |
| `seusite.vercel.app/cadastro` | Link que você envia ao paciente |

---

## 🛠 Rodar localmente (opcional)

```bash
npm install
npm run dev
```

Acesse `http://localhost:5173`

---

## 📂 Estrutura do projeto

```
consultorio/
├── src/
│   ├── main.jsx        # Roteador principal
│   ├── Painel.jsx      # Tela do psicólogo
│   ├── Cadastro.jsx    # Formulário do paciente
│   ├── firebase.js     # ← COLE SUAS CREDENCIAIS AQUI
│   ├── db.js           # Funções de banco de dados
│   ├── utils.js        # Helpers e estilos
│   └── Toast.jsx       # Notificações
├── public/
│   └── manifest.json   # Configuração PWA
├── index.html
├── vite.config.js
├── vercel.json
└── package.json
```
