# 🎓 Aplicativo Escolar - Guia de Execução

Bem-vindo ao **Aplicativo Escolar**! Este é um sistema completo e moderno para gestão e interação de comunidade escolar (Alunos, Professores e Administradores), com feed de notícias, calendário de eventos, suporte, integração com Firebase e chat de IA.

---

## 🚀 Passo a Passo para Executar no Seu Computador (Local)

Para rodar o aplicativo localmente a partir do repositório clonado do GitHub, siga as etapas abaixo:

### 1. Pré-requisitos

Certifique-se de ter instalado em seu computador:
- **Node.js**: Versão 18.x ou superior ([Baixar Node.js](https://nodejs.org/))
- **Git**: ([Baixar Git](https://git-scm.com/))

---

### 2. Clonar o Repositório

Abra o terminal (Prompt de Comando, PowerShell ou Terminal do VS Code) e execute:

```bash
git clone <URL_DO_SEU_REPOSITORIO_GITHUB>
cd <NOME_DA_PASTA_DO_PROJETO>
```

---

### 3. Instalar as Dependências

Instale todos os pacotes necessários do projeto executando:

```bash
npm install
```

---

### 4. Configurar Variáveis de Ambiente (Opcional)

Se o projeto utilizar banco de dados PostgreSQL (Cloud SQL/Supabase) ou autenticação Firebase, crie um arquivo `.env` na raiz do projeto com base no arquivo `.env.example`:

```bash
cp .env.example .env
```

*(Obs: O aplicativo possui modo de contingência local automático/fallback caso as variáveis de banco de dados não estejam preenchidas no primeiro momento).*

---

### 5. Iniciar o Servidor de Desenvolvimento

Como o aplicativo é Full-Stack (frontend React em Vite + backend Node.js/Express em `server.ts`), inicie a aplicação com o comando:

```bash
npm run dev
```

Você verá uma mensagem no terminal indicando que o servidor está rodando:
```
Server running on http://localhost:3000
```

Abra o seu navegador e acesse: [http://localhost:3000](http://localhost:3000)

---

## 📦 Como Gerar a Versão de Produção (Build)

Se você for realizar a implantação em serviços de hospedagem na nuvem (como Render, Railway, Vercel ou Cloud Run):

1. **Construir a aplicação:**
   ```bash
   npm run build
   ```

2. **Iniciar em modo de produção:**
   ```bash
   npm start
   ```

---

## ❓ Solução de Problemas Frequentes

### 1. Tela branca ao rodar no GitHub Pages
O GitHub Pages apenas serve arquivos estáticos e não executa o servidor backend Node.js (`server.ts`). Para executar a aplicação completa com banco de dados e APIs:
- Siga os passos acima para rodá-la localmente (`npm run dev`), ou
- Hospede o projeto em uma plataforma com suporte a Node.js (ex: Render, Railway ou Google Cloud Run).

### 2. Erros de portas ocupadas
Se a porta `3000` estiver em uso por outro aplicativo em seu computador, feche a aplicação antiga ou altere a porta no arquivo `server.ts`.

---

## 🛠️ Tecnologias Utilizadas

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Motion (Framer Motion), Lucide React.
- **Backend**: Node.js, Express, TSX, ESBuild.
- **Autenticação e Dados**: Firebase Auth e Firestore / Fallback Local Storage / Drizzle ORM.
