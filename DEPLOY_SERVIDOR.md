# DEPLOY DO SERVIDOR — fazer o painel ADM funcionar de verdade

**Projeto:** eloEscola · **Data:** 2026-11-11 · **Rodada:** 38

---

## 1. Por que o painel não funciona no GitHub Pages

O repositório é publicado hoje em **um único lugar**: GitHub Pages
(`.github/workflows/deploy.yml`). Pages é hospedagem **estática** — serve
arquivos, não executa Node.

O painel administrativo depende do servidor porque:

- só o servidor tem a `SUPABASE_SECRET_KEY`, e as tabelas sensíveis
  (`users`, `school_accounts`, `event_suggestions`, `deleted_events`,
  `profile_change_requests`, `platform_audit_logs`) têm RLS fechada para o
  navegador;
- operações como redefinir senha, impersonar e excluir definitivamente não
  podem sair do cliente.

Ou seja: **enquanto só existir o Pages, o painel não abre de verdade.** Isso é
consequência direta da decisão de arquitetura da rodada 35 (painel no servidor),
não um bug.

Duas opções, e as duas podem coexistir:

| Opção | O que ganha | O que perde |
|---|---|---|
| **A. Servir tudo pelo Node** (recomendado) | app + API na mesma origem; painel completo; sem CORS | precisa de um host que rode Node |
| **B. Manter o Pages como vitrine** | demonstração estática continua no ar | painel e login por senha ficam fora |

A configuração abaixo faz **A**, sem tocar no Pages. As duas convivem.

---

## 2. O que já está pronto no repositório

O build de produção **já serve app e API na mesma origem** — verificado:

```
GET /           200  eloEscola
GET /admin      200  eloEscola
GET /master     200  eloEscola
GET /planos     200  eloEscola
GET /api/health 200
POST /api/auth/local-login-password  200 (Diretor, com token)
```

Arquivos adicionados para o deploy:

| Arquivo | Para que serve |
|---|---|
| `Dockerfile` | build em 2 etapas (compila, depois só runtime), roda como usuário `node`, healthcheck real |
| `.dockerignore` | impede que `.env`, `node_modules`, `.git` e os JSON de fallback entrem na imagem |
| `railway.json` | builder Docker + healthcheck `/api/health` |
| `render.yaml` | mesmo serviço, formato do Render |

---

## 3. Variáveis de ambiente — atenção ao par obrigatório

> ⚠️ **O erro mais comum ao configurar:** `isSaasBackendConfigured()` exige
> **`SUPABASE_URL` *e* `SUPABASE_SECRET_KEY`**. Configurar só a chave secreta
> deixa o painel em `503 SAAS_NOT_CONFIGURED` — o servidor não descobre a URL
> sozinho no backend.

### 3.1 Obrigatórias

| Variável | Valor | Observação |
|---|---|---|
| `SUPABASE_URL` | `https://jaoheenjltzzglfncgfq.supabase.co` | **não esqueça esta** |
| `SUPABASE_SECRET_KEY` | chave `sb_secret_…` do painel do Supabase | **só no servidor** |
| `SESSION_SECRET` | 32+ caracteres aleatórios | `openssl rand -hex 32`. Sem ela, todo login dá 503 |

### 3.2 Recomendadas

| Variável | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `PLATFORM_OWNER_EMAILS` | e-mail de quem acessa `/master` |
| `ALLOWED_ORIGINS` | domínio público do serviço |
| `TRUST_PROXY` | `1` (Railway/Render põem proxy na frente) |
| `PUBLIC_APP_URL` | URL pública (links de e-mail) |

### 3.3 Só para o build (não são runtime)

`VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` são "assadas" no bundle
durante `npm run build`. Use a chave **publicável**, nunca a secreta.

### 3.4 O que NÃO colocar

`BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` criam administrador. Se o
banco já tem a Diretoria, **não configure** — do contrário um segundo Chefe
aparece. Elas existem para o primeiro acesso em banco vazio.

---

## 4. Passo a passo — Railway (mais rápido)

1. Crie o projeto em [railway.app](https://railway.app) e aponte para
   `davidribeiromuller/Tcc_main-do-main`, branch `main`.
2. O Railway detecta o `Dockerfile` (o `railway.json` já força `DOCKERFILE`).
3. Em **Variables**, adicione as três obrigatórias da §3.1.
4. Em **Settings → Networking**, gere o domínio público.
5. Depois do primeiro deploy, confirme:

```bash
curl https://SEU-DOMINIO/api/health
curl https://SEU-DOMINIO/api/db-status
```

`/api/db-status` precisa devolver **`saasConfigured: true`**. Se vier `false`,
falta `SUPABASE_SECRET_KEY`.

6. Abra `https://SEU-DOMINIO/admin` e entre com a conta administrativa que já
   existe.

## 5. Passo a passo — Render

`render.yaml` já descreve o serviço. No painel: **New → Blueprint →** aponte
para o repositório. O Render pede os valores marcados com `sync: false`
(`SUPABASE_SECRET_KEY`, `PLATFORM_OWNER_EMAILS`).

## 6. Passo a passo — Docker, em qualquer host

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://jaoheenjltzzglfncgfq.supabase.co \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
  -t eloescola .

docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e SUPABASE_URL=https://jaoheenjltzzglfncgfq.supabase.co \
  -e SUPABASE_SECRET_KEY=sb_secret_... \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  -e PLATFORM_OWNER_EMAILS=seu@email.com \
  eloescola
```

---

## 7. Checklist pós-deploy

```
[ ] GET /                 → 200, carrega o app
[ ] GET /admin            → 200 (SPA resolvido)
[ ] GET /api/health       → 200 {"...": "..."}
[ ] GET /api/db-status    → saasConfigured: true
[ ] login de Diretoria    → 200 + token
[ ] aba Usuários          → lista vem preenchida (não vazia)
[ ] aba Sugestões         → 46 sugestões (dado real do banco)
[ ] aba Excluídos         → 11 eventos
[ ] aba Auditoria         → abre sem erro
[ ] /master               → 403 se o e-mail não estiver em PLATFORM_OWNER_EMAILS
```

Se alguma aba vier vazia, **não conclua que não há dados**: abra o diagnóstico
no topo do painel. Ele agora distingue "sem chave", "banco fora de alcance" e
"realmente vazio".

---

## 8. O que foi validado e o que não foi

**Validado neste ambiente:**

- `npm run build` gera `dist/server.cjs` + `dist/index.html`
- `node dist/server.cjs` com `NODE_ENV=production` serve app e API na mesma origem
- `npm ci --omit=dev` (o passo do Dockerfile) instala e o servidor sobe **só com
  dependências de produção**
- login de administrador retorna token nesse build

**NÃO validado aqui, e por quê:**

- **A imagem Docker não foi construída** — não há Docker neste sandbox. O
  Dockerfile replica exatamente os passos que testei acima, mas a construção da
  imagem só será confirmada no primeiro deploy.
- **Não há acesso de rede a `*.supabase.co`** neste ambiente, então as abas que
  dependem do banco não trouxeram dados aqui (respondem `503 SAAS_UNREACHABLE`,
  com código, não lista vazia). No host de deploy, com rede, elas funcionam.
- **Não configurei as variáveis no host** — isso exige acesso à conta do
  provedor, que é sua.

---

## 9. Passo que depende de você

Eu montei toda a configuração, mas **não posso criar a conta nem colar a chave
secreta** no seu provedor. O que falta é:

1. criar o serviço no Railway/Render (ou rodar o `docker run` da §6);
2. colar as três variáveis obrigatórias;
3. me dizer a URL — eu confiro `/api/db-status`, o login e as abas.

Se preferir, também posso adicionar um workflow do GitHub Actions que faça o
deploy automático a cada push na `main` (Railway e Render já fazem isso sozinhos
ao conectar o repositório).
