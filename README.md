# 🎓 Aplicativo Escolar (eloEscola) - Guia de Execução

Bem-vindo ao **eloEscola**! Este é um sistema completo e moderno para gestão e interação da comunidade escolar (Alunos, Professores e Administradores), com feed de notícias, calendário de eventos, suporte, integração com Firebase e chat de IA.

> **✨ Compatibilidade Total (Full-Stack + GitHub Pages / Estático)**:  
> O aplicativo possui detecção automática e resiliência:
> - **Com Servidor Node.js (`server.ts`)**: Executa todas as APIs Express com sincronização em tempo real.
> - **Modo Estático (GitHub Pages / Vercel / Netlify / Sem Servidor)**: O aplicativo ativa automaticamente o modo de contingência em `localStorage`. Todas as funcionalidades (feed de eventos, agenda, login, cadastro de alunos/diretores e chat com assistente) funcionam 100% no navegador mesmo sem servidor backend ativo!

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

Se o projeto utilizar banco de dados PostgreSQL ou autenticação Firebase, crie um arquivo `.env` na raiz do projeto com base no arquivo `.env.example`:

```bash
cp .env.example .env
```

*(Obs: O aplicativo possui modo de contingência local automático/fallback caso as variáveis de banco de dados não estejam preenchidas).*

---

### 5. Iniciar a Aplicação Localmente

Como o aplicativo é Full-Stack (frontend React em Vite + backend Node.js/Express em `server.ts`), inicie a aplicação com o comando:

```bash
npm run dev
```

Você verá a mensagem no terminal:
```
Server running on http://localhost:3000
```

Abra o seu navegador e acesse: [http://localhost:3000](http://localhost:3000)

---

## 🌐 Publicação no GitHub Pages (100% Automático via GitHub Actions)

O projeto já inclui um fluxo de trabalho automatizado em `.github/workflows/deploy.yml`.

Para ativar a publicação automática no GitHub:
1. No seu repositório no GitHub, clique na aba **Settings** (Configurações).
2. No menu lateral esquerdo, clique em **Pages** (em "Code and automation").
3. Em **Build and deployment** > **Source**, mude de *"Deploy from a branch"* para **`GitHub Actions`**.
4. Pronto! O GitHub irá compilar o Vite automaticamente e publicar seu site em poucos segundos com um link ativo (ex: `https://seu-usuario.github.io/seu-repositorio/`).

---

## 💻 Como Rodar o Projeto no Seu Computador (Clone do GitHub)

Se você clonou o repositório para o seu computador:

1. **Instale as dependências:**
   ```bash
   npm install
   ```

2. **Inicie o servidor de desenvolvimento:**
   ```bash
   npm run dev
   ```
   Acesse no navegador: `http://localhost:3000`

3. **Ou teste o build de produção localmente:**
   ```bash
   npm run build
   npm run preview
   ```

---

## 📦 Implantação Full-Stack na Nuvem (Render / Railway / Cloud Run)

Para rodar o servidor Node.js com persistência em nuvem:

1. **Build de produção:**
   ```bash
   npm run build
   ```
2. **Iniciar o servidor:**
   ```bash
   npm start
   ```

---

## 🛠️ Tecnologias Utilizadas

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Motion (Framer Motion), Lucide React.
- **Backend**: Node.js, Express, TSX, ESBuild.
- **Armazenamento e Resiliência**: Firebase Auth / Local Storage Fallback / Drizzle ORM.
