# EloEscola — Correções aplicadas

> Registro do que foi feito e **como verificar**. Complementa o
> `DIAGNOSTICO_SUGESTOES_E_PENDENCIAS.md` (que descreve o diagnóstico original).

---

## 1. Bug de "Sugestões" (Edge Function) — já em produção

Corrigido direto no Supabase, sem depender de deploy do site:

- **Edge Function `ai-event-scout` v10**: o import precisa ser `npm:@supabase/supabase-js@2`.
  Com `jsr:` a função falhava no boot (`503 BOOT_ERROR`) — era essa a causa do
  "Failed to send a request to the Edge Function".
- `verify_jwt: false` (o app autentica na tabela `users`, não no Supabase Auth).
- Deduplicação sem `ON CONFLICT`, porque o índice de `fingerprint` é **parcial**.
- Removida a policy `allow_delete_suggestions` (`FOR DELETE USING (true)`).

**Verificação:** aba Sugestões → "Buscar novos eventos" insere e mostra o resumo sem erro.

---

## 2. Cadastro de conta escolar ("Criar conta")

### Causa do erro do print
No GitHub Pages não existe Express. `fetch("/api/auth/register")` recebia o `index.html`
com **status 200** (fallback de SPA), `res.ok` era `true`, `res.json()` falhava e o código
mostrava a mensagem genérica *"Este e-mail já está cadastrado ou ocorreu um erro ao registrar"*.
O fallback do Supabase **nunca** era alcançado.

### O que mudou

| Arquivo | O que faz agora |
|---|---|
| `src/lib/staticHosting.ts` **(novo)** | `isStaticHosting()` e `fetchJsonApi()`. Em host estático, devolve `null` sem tocar na rede; se vier HTML, também devolve `null`. |
| `src/App.tsx` | `handleRegister` usa `fetchJsonApi` e chama `registerSchoolAccount` (validação + vínculo + insert). |
| `src/lib/schoolAccountValidation.ts` **(novo)** | CPF com dígito verificador, matrícula, data de nascimento, e-mail institucional (bloqueia Gmail/Hotmail), e-mail pessoal e senha provisória. |
| `src/lib/schoolAccountService.ts` **(novo)** | `verifyInstitutionalLink()` + `registerSchoolAccount()`. Confere CPF + matrícula + escola antes de criar a conta. |
| `src/components/Register.tsx` | Novos campos **Matrícula/RA** e **E-mail pessoal**, erros por campo, dica sobre e-mail institucional. |
| `src/lib/usersService.ts` | Grava `matricula`, `personal_email`, `must_change_password`. Não vaza mais `error.message` cru (trata `23505` como duplicata). |
| `src/db/migrations/0007_school_student_linkage.sql` **(novo)** | Colunas novas em `users`, tabela `institutional_links` e função `verify_institutional_link()`. |

### Vínculo institucional
A `institutional_links` é a lista que a **secretaria carrega** antes de liberar os acessos
(CPF + matrícula + escola). Sem ela, qualquer pessoa que soubesse um e-mail
`@escola.pr.gov.br` entraria como aluno.

Para liberar um aluno, a escola insere a linha:

```sql
INSERT INTO public.institutional_links
  (institution, email_domain, cpf, matricula, nome_completo, birthdate, role, created_by)
VALUES
  ('Escola Estadual Helena Wysocki', 'escola.pr.gov.br',
   '52998224725', '2026-001234', 'Maria Silva', '2008-05-10', 'Aluno', 'secretaria');
```

> **Modelo alterado na Rodada 6 (ver abaixo):** o vínculo passou a ser **opcional**.
> O cadastro é aberto, e a `institutional_links` só entra quando a secretaria a preenche.

---

## 2b. Rodada 6 — cadastro aberto, RPC de vínculo corrigida e proteção de dados

### O que o print mostrava
A tela do print tinha só **Nascimento, Gênero e Instituição**, sem os campos Matrícula e
E-mail pessoal. Cruzando o horário do print (08:31 local) com o histórico de deploys,
o build no ar naquele momento era o de `f8d00c1` (02:25Z), **anterior** ao PR #10 (12:36Z).
Naquele build não existiam `staticHosting.ts` nem `schoolAccountService.ts`, então
`fetch("/api/auth/register")` recebia o `index.html` do GitHub Pages com status 200 e caía
na mensagem genérica. **Isso já estava corrigido** — era só um build antigo no navegador.

### Três defeitos reais encontrados ao investigar

| # | Defeito | Impacto | Correção |
|---|---|---|---|
| 1 | `verify_institutional_link` declarava `RETURNS public.institutional_links` (tipo composto) | Função SQL devolve **uma linha de NULLs** quando não acha nada. O cliente fazia `data[0]` e concluía `found: true` sem vínculo existir. Agora devolve `TABLE(institution, role)` → zero linhas. O cliente também exige `row.institution`. |
| 2 | Policies de `institutional_links` eram `USING (true)` para SELECT/INSERT/UPDATE com a chave **pública** | Qualquer visitante lia **CPF, matrícula, nome, data de nascimento e a senha provisória** de todos os alunos, e podia inserir/alterar linhas. Verificado com `SET ROLE anon`. | Policies removidas e `REVOKE ALL` da tabela para `anon`/`authenticated`. A conferência e a ativação passam por funções `SECURITY DEFINER`. |
| 3 | A senha digitada no cadastro não chegava ao banco | `registerUserDirectInSupabase` inseria `password` apenas se ela viesse… e o app autentica nessa coluna. Aluno criado com senha desconhecida. | A senha provisória agora é gravada; `must_change_password = true` continua. |

Ajuste adicional: `handleRegister` não limpava `loginError` após sucesso, então o `Register`
reintroduzia a mensagem antiga ao remontar (`registerError` → `useEffect` → `setError`).

### Modelo atual do cadastro (decisão do autor)
- **Aberto**: qualquer pessoa com e-mail institucional válido, CPF com dígito verificador,
  matrícula e e-mail pessoal cria a própria conta.
- **Vínculo opcional**: se a secretaria cadastrou CPF + matrícula em `institutional_links`,
  a matrícula é conferida e a `role` vem do vínculo. Se não cadastrou, entra como `Aluno`.
- Quem quiser o modelo fechado pode passar `requireLink: true` em `registerSchoolAccount`.

### Migration
`src/db/migrations/0008_open_school_registration.sql` — **aplicada** no projeto.

### Validação executada
- `verify_institutional_link` sem vínculo: **0 linhas** (antes: 1 linha de NULLs).
- Com vínculo: retorna `institution` e `role` corretamente.
- `SELECT` direto em `institutional_links` como `anon`: **permission denied**.
- Cadastro aberto como `anon` (`BEGIN`/`ROLLBACK`): insert OK com `role=Aluno`,
  `must_change_password=true`, instituição gravada. Banco conferido depois: 23 usuários,
  0 vínculos, nenhum registro de teste.
- Regras de campo: cadastro aberto **PASS** · e-mail duplicado **PASS** · Gmail recusado
  **PASS** · CPF inválido recusado **PASS**.
- `tsc --noEmit`: 0 erros · `npm run build`: ok (5,22 s) · `sync` e `bundle:edge:check`: ok.

### Verificação já feita
- `verify_institutional_link` pela chave anon: **200** com vínculo correto.
- Matrícula errada, CPF errado e escola errada: **bloqueados** (3/3).
- `INSERT` de usuário com matrícula + senha provisória: **201 Created**.
- 33/33 testes das validações; 7/7 do `fetchJsonApi`; 5/5 do fluxo de cadastro.

---

## 3. Não conseguia excluir o último evento

`loadEvents()` só aplicava a resposta quando a lista **não estava vazia**:

```ts
if (Array.isArray(incomingEvents) && incomingEvents.length > 0) { ... }
```

Ao excluir o último evento, as três fontes voltavam `[]`, nenhum ramo casava e
`setEvents([])` nunca era chamado — a tela continuava mostrando o evento apagado.

**Correção:** lista vazia agora é resultado válido e é aplicada. Falha de rede continua
mantendo o cache (para não sumir tudo quando a conexão cai).

---

## 4. Datas futuras

| Onde | Antes | Agora |
|---|---|---|
| `AdminPanel.tsx` (criar/editar) | sem campo de **Ano** — `year` travado em `new Date().getFullYear()` | seletor de ano (ano atual até +4) e validação no submit |
| `CalendarView.tsx` | sem campo de ano, sem validação | idem |
| `eventSuggestionsService.ts` | sem filtro de data | `isSuggestionInThePast()` oculta sugestões vencidas |

As regras estão em `src/lib/dateGuards.ts` **(novo)**:
`validateEventDate()`, `isPastDate()`, `getEventYearOptions()`.

Mensagem ao tentar data passada: *"A data do evento precisa ser de hoje em diante."*
O motor local e a Edge Function já geravam apenas datas futuras — nada mudou lá.

---

## 5. Sessão convidado mostrava nome aleatório

`src/lib/userDisplay.ts` **(novo)** centraliza a regra: se a sessão é de convidado
(`isGuest`, `role === "Convidado"`, `uid` começando com `guest-` ou e-mail
`visitante_123@…`), o nome é **"Convidado"** — nunca derivado do e-mail.

Pontos corrigidos:

- `Settings.tsx`: o placeholder literal `" Hudson W."` virou o nome real (ou "Convidado");
  "Editar Perfil" fica bloqueado para convidado, com aviso para criar conta.
- `MobileHeader.tsx` / `DesktopNavbar.tsx`: usavam `email.split("@")[0]` e exibiam
  `visitante_48213`. Agora usam o helper.
- `App.tsx` (`handleGuestLogin`): em hospedagem estática **não criava sessão nenhuma**
  (o `fetch` falhava silenciosamente). Agora monta a sessão no cliente com nome "Convidado".
- `App.tsx` (`handleLocalLogin`): **removido** o fallback que inventava conta a partir do
  e-mail digitado, com senha `senha123`. Agora mostra "Usuário não encontrado" e respeita
  conta bloqueada.

---

## 6. Painel de admin

- Faixa de **KPIs** no topo: contas totais, ativas, bloqueadas, alunos e eventos.
- Estado vazio da aba "Contas das Escolas" explicado (com aviso de que a rota
  `/api/admin/institutional-accounts` não existe em hospedagem estática).
- `loadInstitutionalAccounts` usa `fetchJsonApi` e não engole mais o erro em silêncio.

---

## Como testar localmente

```bash
npm run dev     # http://localhost:3000
```

Para simular o comportamento do GitHub Pages no seu computador:

```js
// no console do navegador
localStorage.setItem("ELOESCOLA_FORCE_STATIC", "1");
location.reload();
```

---

## Pendências conhecidas

- **Popular `institutional_links`**: sem isso o cadastro de aluno fica bloqueado
  na etapa do vínculo (por design).
- `school_accounts` / `/api/admin/institutional-accounts` só existem no Express;
  em produção a aba continua vazia até migrarmos a consulta para o Supabase.
- 17 senhas em texto claro e 12 policies `USING (true)` seguem como risco aberto.
  Recomendo rotacionar a chave Gemini ao final do TCC (ela apareceu no chat).

---

# Rodada 3 — Senha na ficha e reorganização do painel

## 7. Senha da conta visível para o administrador

Na **Ficha Cadastral** (botão "Visualizar" no painel), o admin agora vê a senha da conta:

- começa **mascarada** (`••••••••`), com botão de olho para revelar/ocultar;
- botão de **copiar** com confirmação visual (✓ por 2 s);
- aviso em âmbar: *"Visível apenas para administradores. Oriente o usuário a trocar no primeiro acesso."*;
- conta sem senha definida mostra "não definida" (6 das 23 contas estão assim — são as criadas
  via Google OAuth, que não têm senha local).

O campo já vinha do banco (`select("*")` em `users`), então não houve mudança de query —
confirmei que `password` chega no payload da API (206 com o campo presente).

> **Nota para o TCC:** como as senhas estão em texto claro, qualquer pessoa com a chave anon
> consegue lê-las direto da API. Exibir na ficha só torna visível um problema que já existia.
> O correto seria hash (bcrypt/argon2) + função RPC para o admin conferir/definir senha.

## 8. Scroll e organização do painel

### A causa do scroll quebrado
Havia **scroll duplo**: o `App.tsx` embrulhava o `AdminPanel` em `overflow-y-auto` e o próprio
painel também rolava — além de um `pb-56` (224 px de padding morto no fim) e containers internos
com `max-h-[620px]`/`max-h-[600px]` que cortavam a lista no meio.

**Correções**
- `App.tsx`: wrapper passou a `overflow-hidden` (cada área rola uma vez só).
- `AdminPanel`: `pb-56` → `pb-24`; removido todo `max-h` dos containers de lista.
- Cards: `grid-cols-1 sm:2 xl:3` e `gap-3`.

### Cabeçalho compacto
Título e badge menores (badge virou "Chefe ADM"), descrição em uma linha, e os 5 KPIs viraram
**pills em linha única** em vez de 5 cards grandes — o cabeçalho caiu de ~240 px para ~110 px.

### Card de usuário reorganizado
- faixa colorida no topo indicando estado (verde = você, vermelha = bloqueado);
- avatar 40 px, nome, e-mail e CPF agrupados;
- Cargo e Status na mesma faixa divisória;
- badges de estatísticas e os botões [Visualizar] [Ações] sempre alinhados na base;
- o card de **bloqueados** seguiu o mesmo padrão (antes usava `p-5` e outro espaçamento).

### Filtros
A barra de filtros virou um bloco com borda, alinhada à barra de busca, em vez de chips soltos.

## Validação
- `npx tsc --noEmit`: 0 erros · `npm run build`: ok
- Render do painel em DOM real (jsdom): 16/17 verificações — a única "falha" é esperada
  (a visão padrão é Tabela, então o teste alterna para Cartões antes de checar os cards).
- Confirmado no HTML renderizado: **6 cards** com o novo wrapper, KPIs, e o campo de senha
  mascarado que só revela ao clicar.
- `password` presente no payload do PostgREST (verificado via chamada real: status 206).

---

# Rodada 4 — Hierarquia de permissões: dados de usuário são exclusivos do Chefe

Regra de produto aplicada: **gestão de perfis e dados pessoais = Chefe Administrador**.
**Funcionário Administrador** pode apenas cadastrar **eventos** e **sugestões de eventos**.

## Matriz implementada

| Ação | Chefe | Funcionário |
|---|---|---|
| Ver ficha, CPF, telefone, senha | sim | **não** |
| Alterar permissão, editar, bloquear, desbloquear, excluir conta | sim | **não** |
| Ver diretório (nome, e-mail institucional, função, status) | sim | leitura |
| Criar evento / sugestão de evento | sim | **sim** |
| Editar/excluir evento | todos | só os próprios |

## Correções no frontend (`AdminPanel.tsx`)
- O botão **"Visualizar"** e o modal da ficha agora existem apenas dentro de `isChefe`. Para o
  funcionário, o rodapé do card mostra "Dados pessoais restritos ao Chefe Administrador".
- O bloco da **senha** na ficha ficou sob `{isChefe && ...}` — antes era visível a qualquer admin.
- **CPF** na tabela e nos cartões (2 visões × 2 pontos) passou a exigir `isChefe && u.cpf`.
- Busca por **CPF** só vale para o Chefe; para funcionários o placeholder e as mensagens de
  "nada encontrado" falam apenas em nome, e-mail, função e instituição. Sem isso, digitar números
  na busca funcionaria como oráculo para descobrir CPF.
- Banner da aba deixou de prometer "consulta ao diretório completo" e descreve o limite real.

## Defesa no cliente (`App.tsx`)
- Helper `ensureChefeAdmin(acao)` aplicado a `handleAdminUpdateUser`, `handleAdminDeleteUser`,
  `handleAdminUnblockUser` e `handleAdminPermanentDeleteUser`: se a UI for burlada, a ação é
  recusada com toast em vez de executar.

## Segurança do cache local (`src/lib/userCache.ts`, novo)
- `local_users_db` passou a ser gravado por `saveUsersCache()`, que remove **`password`, `cpf`,
  `phone` e `personalEmail`** antes de persistir. Antes, o cadastro gravava a senha em texto claro
  no `localStorage`, e a ficha a exibia a partir do cache.
- `readUsersCache()` higieniza na leitura: caches antigos já gravados são limpos automaticamente
  na próxima carga do app.
- O login offline não valida mais nada "por presença de e-mail": se havia senha digitada e nem o
  backend nem o Supabase a validaram, o acesso é recusado com aviso para conectar à internet
  (antes, o fallback autenticava só pelo e-mail encontrado no cache).

## Erros de runtime corrigidos
- **Excluir evento devolvia 500** em qualquer exclusão no modo JSON/offline. `deleteEventById`
  chamava `deleteEventByIdFallback` duas vezes: a segunda estourava
  `Evento não encontrado para excluir na memória` porque o item já havia saído. Agora o modo
  offline executa **uma única** exclusão (`src/db/events.ts`).
- **Datas passadas eram aceitas pela API**: `POST /api/events` com ano 2020 devolvia **201**.
  `validateEventDate` (`src/lib/dateGuards.ts`) agora roda em `POST` e `PUT /api/events/:id`,
  devolvendo 400. Antes a guarda existia só no formulário.

## Validação executada
- `npx tsc --noEmit`: **0 erros** · `npm run build`: **ok (4,81 s)** · motor local sincronizado.
- API real (Express em modo fallback JSON):
  - `DELETE /api/events/:id` → **200** (era 500); segunda exclusão → 404.
  - `POST /api/events` com `year: 2020` → **400** (era 201) com mensagem de validação.
  - Funcionário: `GET /api/users` não devolve `password`/`cpf`/`phone`; `PUT`, `block` e `DELETE`
    em `users` → **403**; `POST /api/events` → **201** (permitido).
  - Aluno: `POST /api/events` → **403**.
- Render do painel em jsdom (Chefe vs Funcionário): **13/13** verificações.
  Funcionário não vê "Visualizar", "Ações", senha, CPF nem telefone. Chefe abre a ficha, vê
  "Senha:" mascarada com `••••` e revela apenas ao clicar.
- Cache local: **7/7** — não grava senha/CPF/telefone/e-mail pessoal e higieniza caches legados.

## Risco residual (não resolvido nesta rodada)
- Senhas seguem em **texto claro** na coluna `users.password` (17 de 23 contas). A correção
  definitiva é hash + `must_change_password`, que exige migração e mudança no fluxo de login.
- Os handlers de `App.tsx` são defesa em profundidade: a autoridade real é o backend, que já
  responde 403 corretamente para funcionários.

---

# Rodada 5 — Contas de escola, filtros por localidade e IA que não repete

## 1. Conta administrativa de escola (não existia na interface)

O endpoint `POST /api/admin/institutional-accounts` existia desde antes, mas
**nunca houve botão nem modal** — o estado `showAddInstModal`/`newInstForm` estava
no componente e nunca era renderizado. Pior: no GitHub Pages o Express não existe,
então `/api/*` devolvia HTML com status 200 e o fluxo estava morto na versão publicada.

**Correções**
- Novo `src/lib/institutionalAdminService.ts`: valida o formulário e grava a conta
  **direto no Supabase** como usuário `role: "Escola"` — mesmo formato que o login
  institucional já consulta, então funciona no Pages e no ambiente local.
  Fallback pelo Express com detecção de HTML-200 para não confundir falha com sucesso.
- `AdminPanel`: botões "Nova conta" no cabeçalho e no estado vazio, e modal completo
  (escola entre as 6 de Araucária, identificador, e-mail, responsável, cargo, senha
  inicial) com erros por campo.
- `loadInstitutionalAccounts` passou a ler do banco quando o Express não responde,
  em vez de mostrar a aba vazia como se nenhuma escola tivesse conta.
- Texto do estado vazio deixou de sugerir cadastro automático (era enganoso).
- A conta é criada com `must_change_password = true` (a coluna já existia no banco).

Validado ponta a ponta: chefe cria → **201**; funcionário tenta → **403**;
login institucional com a conta criada → **200** com `role: "Escola"`.

## 2. Sugestões rejeitadas voltando (causa raiz confirmada nos dados)

Comparação entre as rejeições e as pendentes reais do banco:

| Rejeitada | Voltou como |
|---|---|
| "OBMEP 2027 - Primeira Fase" (2027-5-2) | "Prova da 1ª Fase da OBMEP 2027" (2027-5-2) |
| "Feira de Profissões da PUCPR" (2027-8-15) | "Feira de Profissões da PUCPR" (2027-7-12) |

O `fingerprint` era `título normalizado|ano-mês-dia|cidade`. A IA inventa variação de
título **e** de data, então cada tentativa gerava fingerprint novo e passava pelo
`upsert ... ignoreDuplicates`. A Edge Function também nunca consultava o histórico.

**Correções na Edge Function**
- **Memória de decisões**: lê as sugestões `rejected` e `approved` (500 mais recentes)
  e as `pending`, e descarta qualquer candidato equivalente.
- **Dedup semântica** (`mesmoEvento`) em vez de igualdade exata:
  - título com similaridade ≥ 0,85 vale com até **180 dias** de diferença (a data é
    chutada pela IA, não serve como critério principal);
  - título parecido (≥ 0,6) exige data dentro de **30 dias**;
  - **contenção** cobre "Vestibular UFPR 2027/2028" vs "... - Prova da 1ª Fase";
  - ordinais unificados ("1ª" = "primeira");
  - **ano explícito diferente nunca é o mesmo evento** (OBMEP 2027 ≠ OBMEP 2028).
- Resposta passou a informar `repetidas` e `bloqueadas_por_conteudo`, e a aba
  Sugestões explica ao admin *por que* nada entrou — antes só dizia "nenhuma sugestão nova".

## 3. Balada e rave não são permitidos

Prompt sozinho não garante nada, então o bloqueio é **determinístico** no código
(`src/lib/eventClassification.ts` + Edge Function + `server.ts`):
- termos barrados: balada, rave, boate, open bar, show, festival de música, micareta,
  carnaval, festa, bebida, álcool, entre outros;
- **exceções preservadas**: festa junina/julina, festival de dança, show de talentos,
  feira de ciências — eventos escolares clássicos que contêm os termos;
- o prompt da IA ganhou uma seção PROIBIDO explícita;
- a API Express devolve **400** ("Conteúdo não permitido em app escolar: balada").

## 4. Eventos de Curitiba e Araucária + filtros na aba Eventos

**Bug de dados encontrado:** `mapSupabaseEventoToEvent` e `mapSupabaseEventsTableToEvent`
**descartavam `city`, `category` e `schoolName`** ao converter para `Event`, embora o tipo
tivesse os campos e a tabela `eventos` gravasse `cidade`/`categoria`. O insert gravava e a
leitura jogava fora — por isso qualquer filtro por localidade sairia vazio.

**Correções**
- Os dois mapeadores passaram a preservar `city` (com inferência pelo local/endereço),
  `category`, `schoolName` e `isSchool`.
- `eventsService.ts` gravava `cidade: eventData.city || "Araucária"` — todo evento sem
  cidade virava Araucária silenciosamente. Agora grava `null` quando não dá para inferir.
- Filtros na aba Eventos: **Cidade** (Todas / Araucária / Curitiba) e **Tipo**
  (Todos / Escolar / Aberto ao público), com contador e "Limpar filtros".
- Cards ganharam badges de localidade e de tipo.
- Dado corrigido no banco: `eventos` id 1 tinha `categoria: "Araucária"` e
  `cidade: "Escolar"` (campos invertidos) — saneado para Escolar/Araucária.

**Decisão de produto (escolhida pelo usuário):** a home prioriza eventos escolares;
"não escolar" traz eventos abertos ao público de Curitiba e Araucária (vestibular, feira
de profissões, mostra cultural). A IA agora busca os dois tipos e marca `is_school`.

## Validação executada
- `npx tsc --noEmit`: **0 erros** · `npm run build`: **ok (6,30 s)** · motor local sincronizado.
- Classificação (`eventClassification`): **22/22** — cidade explícita/inferida, sem assumir
  Araucária por padrão, escolar vs público, bloqueio e exceções de conteúdo.
- Dedup com os **casos reais do banco**: **11/11**; falsos positivos: **7/7**
  (edições de anos diferentes, fases diferentes, disciplinas diferentes não se confundem).
- Validação do formulário de conta: **10/10**.
- Render dos filtros no Feed (jsdom): **21/21** — combinações de cidade, tipo, contador e limpar.
- Render do modal de conta no AdminPanel (jsdom): **16/16**.
- API real: balada/rave → **400**; festa junina → **201**; conta institucional chefe → **201**,
  funcionário → **403**, login institucional → **200**.
- Dedup contra os **9 registros reais** de `event_suggestions` (4 aprovadas + 5 rejeitadas):
  as 3 rejeitadas que o motor voltou a gerar (JEPS, ONHB, OBI) foram **bloqueadas**;
  aprovadas coincidentes também. Nenhuma rejeitada volta à fila.
- Bundle da Edge Function executado em `Deno` simulado: handler registrado, resposta **200**.

## Deploy da Edge Function (v12)
O painel do Supabase aceita **um único arquivo** por função, então os módulos da função
são achatados por `scripts/bundle-edge-function.mjs`:
- `index.ts` importa `./local_engine.ts`, que importa `./eventClassification.ts`;
- a v11 foi publicada **sem** esse achatamento e quebrou em runtime
  (`detectForbiddenContent is not defined`) — o motor local nunca rodava;
- o bundler agora resolve imports **recursivamente**, preserva imports de pacote
  (`npm:@supabase/supabase-js@2`), rejeita bundles com import sem definição e confere que
  `eventClassification.ts` da função está idêntico ao de `src/`;
- `index.ts` passou a **reutilizar** `detectForbiddenContent` em vez de manter uma cópia
  das listas (`TERMOS_PROIBIDOS` duplicado causava erro de símbolo repetido no bundle).

Comandos: `npm run bundle:edge` (gera) e `npm run bundle:edge:check` (valida, use no CI).
A versão em produção é a **v12, ACTIVE**, publicada com o bundle corrigido.

Como a function bundlada é válida foi verificada sem deploy: o bundle foi carregado num
`Deno` simulado, o handler registrou e respondeu **200** com `fontes: ["local_engine"]`.

## Pendências conhecidas
- `school_accounts` continua inexistente no banco; a solução atual usa `users` com
  `role: "Escola"`, que é o que o login já consulta.
- Senhas seguem em texto claro em `users.password` (risco herdado da rodada 3).

---

## 7. Painel de administração — largura ampliada e rolagem horizontal

### O que estava errado
- O conteúdo usava `max-w-6xl` (**1152 px**) enquanto o cabeçalho usava `max-w-7xl`.
  Em monitores grandes o painel ficava espremido e desalinhado do cabeçalho.
- O container raiz tinha **`overflow-x-hidden`** (linha 829). As tabelas de usuários
  e de ex-alunos têm 6 colunas com `min-w-[180px]` em várias células; em telas
  estreitas o conteúdo passava da largura e era **cortado**, deixando a última
  coluna ("Ações Administrativas") inacessível no celular.

### O que mudou
| Arquivo | Mudança |
|---|---|
| `src/components/AdminPanel.tsx` | Raiz troca `overflow-x-hidden` por `overflow-x-auto` + classe `admin-scroll-x`. Cabeçalho e conteúdo passam a usar `max-w-[110rem]` (1760 px), alinhados entre si. |
| `src/index.css` | Nova família `.admin-scroll-x`: barra horizontal visível (9 px, 12 px em toque), tema escuro, `overscroll-behavior-x: contain`. Nova `.admin-table` com `min-width: 46rem` para as colunas não serem esmagadas antes da rolagem entrar. |
| Tabelas de usuários e ex-alunos | Passam a usar `admin-table` em vez de `w-full ... border-collapse`. |
| Grids de cards | Usuários/bloqueados ganham `2xl:grid-cols-4`; eventos ganham `2xl:grid-cols-4`. Aproveitam a largura extra sem mudar o visual em telas menores. |

### Validação executada
- Render do painel em jsdom: **10/10** — raiz com `admin-scroll-x`, sem
  `overflow-x-hidden`, conteúdo em `max-w-[110rem]`, tabela com `admin-table`
  dentro de wrapper rolável, coluna "Ações Administrativas" presente, KPIs e abas
  renderizando.
- Regras CSS: **7/7** — `.admin-scroll-x` com `overflow-x: auto`, barra de 9 px
  (12 px em toque), `.admin-table` com `min-width: 46rem`, cobertura do tema escuro.
- Medição estrutural: 6 colunas na tabela, wrapper com `overflow-x-auto`,
  último cabeçalho = "Ações Administrativas".
- `tsc --noEmit`: 0 erros · `npm run build`: ok (5,01 s).

---

## 8. Sugestões (500) e localização do usuário

### 8.1 O 500 da Edge Function `ai-event-scout` — regressão da Rodada 5

O log do navegador mostrava:

```
POST .../functions/v1/ai-event-scout → 500 (Internal Server Error)
```

Causa reproduzida no banco:

```sql
INSERT ... ON CONFLICT (fingerprint) DO NOTHING;
-- ERROR: 42P10: there is no unique or exclusion constraint
--        matching the ON CONFLICT specification
```

O índice `idx_event_suggestions_fingerprint` é **parcial**
(`WHERE fingerprint IS NOT NULL`). O Postgres só aceita `ON CONFLICT (coluna)`
com constraint **completa** na coluna, então o `upsert(onConflict: "fingerprint")`
que eu havia reintroduzido na Rodada 5 derrubava a função. A versão anterior em
produção fazia deduplicação manual e não usava `upsert` — por isso funcionava.

**Correção** (`supabase/functions/ai-event-scout/index.ts`):
- gravação passa a ser `insert` simples — a deduplicação já ocorre em memória,
  comparando fingerprint **e** similaridade semântica (`mesmoEvento`), que é mais
  rigorosa que o índice;
- `23505` (corrida com outra execução) e `42P10` deixam de virar 500: a resposta
  é `200` com `inseridas: 0`, porque não é falha para o usuário;
- 500 permanece só para erro real de banco.

**Deploy: v13 ACTIVE.** Verificado executando o bundle num `Deno` simulado:
- insert normal → `200`, `inseridas: 3`
- duplicata `23505` → `200`, `success: true`, `inseridas: 0`
- erro real → `500`

### 8.2 Localização do cliente saindo errada ("aleatória")

Três defeitos distintos, todos corrigidos:

| # | Defeito | Efeito |
|---|---|---|
| 1 | Botões "Usar Centro de Araucária (Padrão)" em `EventDetail` e `MapView` gravavam `{-25.5925, -49.4085}` como se fosse a posição do cliente | Rota e distância partiam do centro da cidade em vez de onde a pessoa está |
| 2 | `App.tsx` restaurava `user_geolocation_coords` **sem validar a idade** (o `EventDetail` validava) | Abrir o app em outro lugar mantinha a coordenada de ontem como atual |
| 3 | `EventLocationModal` gravava `{lat,lng}` **sem carimbo de tempo**, e `maximumAge: 60000` aceitava leitura de 1 minuto | A posição recém-obtida era descartada na tela seguinte |

**Correção**: a regra passou a viver num único módulo, `src/lib/geolocation.ts`:

- `readSavedCoords()` — descarta posição vencida (>10 min), sem `ts`, malformada
  ou não numérica, e limpa o storage;
- `saveCoords()` / `clearSavedCoords()` — sempre com carimbo de tempo;
- `requestCurrentCoords()` — alta precisão (timeout 15 s, `maximumAge: 0`), e uma
  segunda tentativa com precisão menor **apenas** se a falha não foi permissão
  negada; nunca reaproveita posição do cache do navegador;
- `geolocationFalhou()` — type guard, porque o `tsconfig` não usa `strict` e a
  união não era estreitada.

Os botões de ponto fixo foram **removidos**. Se o GPS falhar, o app mostra o motivo
real (permissão negada / sinal / tempo) em vez de substituir a posição.

`App.tsx`, `EventDetail.tsx`, `MapView.tsx` e `EventLocationModal.tsx` passaram a
usar o módulo — não há mais `getCurrentPosition` nem gravação direta no storage
fora dele.

### Validação executada
- Geolocalização: **16/16** — posição recém-salva aceita, vencida (11 min)
  descartada e removida do storage, limite de 9 min aceito, sem `ts` descartada,
  lat não numérico descartado, JSON inválido não estoura; GPS: sucesso, timeout
  com 2ª tentativa, permissão negada sem insistir (1 chamada), indisponível sem
  inventar posição, `unsupported` sem geolocalização, `maximumAge: 0` respeitado.
- Nenhuma ocorrência de `maximumAge` > 0, de gravação direta em
  `user_geolocation_coords` ou de coordenada fixa como posição do usuário.
- Edge Function v13: os três cenários de gravação conferidos; bundle sincronizado.
- `tsc --noEmit`: 0 erros · `npm run build`: ok (5,43 s).

---

## 14. Rodada 10 — memória de rejeição, busca de endereço, exclusão e navegação

Cinco problemas relatados em uso real. Todos reproduzidos antes de corrigir.

### 14.1 Memória de rejeição: a IA repetia o que já tinha sido recusado

**Diagnóstico (com dados do banco, não suposição).** A Edge Function já lia o
histórico de `event_suggestions` e descartava repetições — mas o filtro comparava
**título + data** por similaridade de palavras (Jaccard ≥ 0,6). A IA reescreve o
título a cada chamada, então o mesmo evento voltava com outra roupa:

| Já decidido | Sugestão "nova" | Jaccard |
|---|---|---|
| Feira de Profissões da PUCPR | Feira de Cursos e Profissões da UFPR | 0,25 |
| Mostra de Inovação e Tecnologia de Araucária | Mostra de Ciência e Tecnologia da UTFPR | 0,33 |
| JEPS — Jogos Escolares do Paraná | Jogos Escolares do Paraná (Fase Municipal) | 0,50 |
| Feira de Ciências e Tecnologia da UTFPR | Mostra de Ciência e Tecnologia da UTFPR | 0,33 |

Todos abaixo do limiar. Baixar o limiar faria eventos diferentes colidirem.

Além disso o histórico era consultado **depois** de o motor local já ter gerado
os candidatos, então o catálogo fixo voltava inteiro em toda rodada.

**Correção** — `src/lib/rejectionMemory.ts` **(novo)**:

- extrai o **tópico** do evento (o assunto), ignorando ruído de vocabulário:
  conectivos, tipo de evento (`feira`/`mostra`/`olimpíada`) e qualificadores
  trocáveis (`nacional`, `municipal`, `1ª fase`, anos);
- dicionário de **sinônimos**: `ciências`/`inovação` → `ciencia`,
  `profissões`/`carreiras` → `profissao`, `informática`/`programação` → `computacao`;
- siglas (`OBMEP`, `JEPS`, `MOBFOG`) são preservadas como tópico;
- nomes de instituição (`UFPR`, `UTFPR`, `PUCPR`) **não** identificam evento —
  sem isso, rejeitar um vestibular esconderia a feira de cursos da mesma
  universidade;
- genéricos de app escolar (`escola`, `estudantil`, `alunos`) e cidades não
  entram como tópico.

Ligado em três pontos:
1. `runLocalEventEngine({ excludeTitles })` — a memória alimenta a geração na
   origem, então o catálogo fixo não devolve o que já foi decidido;
2. a Edge Function lê os títulos decididos **antes** de gerar e passa para o motor;
3. candidatos da IA passam pela mesma memória, sem exigir data próxima;
4. o prompt recebe a lista do que não repetir (reduz desperdício de vagas).

`npm run sync:rejection-memory` gera a cópia para o Deno
(`supabase/functions/ai-event-scout/rejectionMemory.ts`).

### 14.2 Exclusão de eventos: dizia "removido" sem remover

`deleteEventDirectInSupabase` marcava `anySuccess = true` sempre que o PostgREST
**não devolvia erro** — mas `DELETE` que não casa nenhuma linha também devolve
`error: null`. Resultado: apagar um id que existia só em `eventos` marcava
sucesso em `events` sem apagar nada, e a UI anunciava "Evento removido" com o
evento ainda na tela.

**Correção**: `.select("id")` e o sucesso passa a depender de **linhas realmente
removidas**. O mesmo defeito existia no `update` e foi corrigido do mesmo jeito.

### 14.3 O app voltava sozinho para a tela inicial

Duas causas independentes:

- **Excluir evento** chamava `setActiveScreen("feed")` nos dois caminhos de
  sucesso — o admin era expulso do painel a cada exclusão. Removido.
- **Recarregamento** caía em `splash` → `welcome`. O `deploy.yml` publica em
  `/Tcc_main-do-main/`, então `location.pathname` é `.../Tcc_main-do-main/admin`
  e nenhuma comparação com `/admin` casava. Corrigido desfazendo o `BASE_URL` e,
  quando a rota não é conhecida, restaurando a última tela da sessão
  (`sessionStorage.ultima_tela`).

### 14.4 Busca por endereço de rua

Não existia geocoding no projeto: "Localização / Endereço" era texto livre e o
evento era salvo **sem coordenadas** (o mapa estimava a posição por índice).

**Correção**:
- `src/lib/addressSearch.ts` **(novo)** — Nominatim/OpenStreetMap (gratuito, sem
  chave), restrito ao Brasil e enviesado para Araucária/Curitiba; cache em
  memória e fila de 1 req/s conforme a política de uso; geocoding reverso;
  **fallback** para o catálogo local de escolas se o serviço cair.
- `src/components/AddressSearchInput.tsx` **(novo)** — autocomplete com
  `debounce` de 600 ms, navegação por teclado (↑ ↓ Enter Esc), `aria-*` e
  rótulo associado. Substitui os dois campos de texto livre do `AdminPanel`.
- Colunas `lat`/`lng` criadas em `events` e `eventos` (mais `bairro` em
  `eventos`); gravação, atualização e leitura passaram a carregá-las.
- `MapView` passou a filtrar por endereço, bairro, CEP e cidade, com
  normalização (acento/caixa) e busca multi-palavra em qualquer ordem.

### 14.5 Modo escuro no painel

O painel já tinha todas as classes `dark:`, mas não havia como acionar o tema
estando nele — era preciso ir em Configurações. Adicionado alternador no
cabeçalho (props `theme`/`onToggleTheme`), com `aria-label` que reflete o estado.

### Validação executada

| Suíte | Resultado |
|---|---|
| Memória de rejeição (dados reais do banco + motor local) | 28/28 |
| Busca de endereço (geocoding, cache, erros, fallback) | 22/22 |
| Exclusão de eventos (inclui o bug original documentado) | 13/13 |
| Campo de endereço (jsdom: debounce, seleção, teclado, a11y) | 22/22 |
| Restauração de tela / GitHub Pages | 22/22 |
| Modo escuro no painel (jsdom + cobertura `dark:`) | 12/12 |

- Resposta **real** do Nominatim (`Rua das Flores, Araucária`) validada contra o
  parser: lat/lng, cidade e nome curto corretos.
- `tsc --noEmit`: 0 erros · `npm run build`: ok.
- Bundle da Edge Function: 71843 bytes, 5 módulos resolvidos, sem import órfão.

---

## 15. Rodada 11 — correção do 500, tema na introdução e acessibilidade por voz

### 15.1 O erro 500 persistente do `ai-event-scout`

Screenshot enviado pelo usuário:

```
ai-event-scout  400  (POST /functions/v1/ai-event-scout)
Could not find the 'is_school' column of 'event_suggestions' in the schema cache
```

**Causa raiz**: o motor local (`localEventEngine.ts`) marca cada candidato com
`is_school` — e isso está **certo**, é um conceito do domínio (evento escolar ×
aberto ao público), usado no filtro de localidade/escolaridade. O problema é que
`event_suggestions` **não tem essa coluna** (31 colunas, verificadas no banco).
O lote era enviado cru, o PostgREST respondia `PGRST204`, e o tratamento de erro
só conhecia `23505` (duplicata) e `42P10` — então a exceção virava **500**, a
fila de sugestões ficava vazia e todo mundo que abria a aba via o erro.

**Correção em três camadas** (sem remover nenhuma condicionalidade existente):

1. **Na fronteira de gravação** — `COLUNAS_EVENT_SUGGESTIONS` (as 23 colunas
   reais) + `sanearParaInsercao()`, que monta cada linha só com o que existe no
   banco. `is_school` continua no schema interno; é descartado apenas no
   `INSERT`.
2. **No tratamento de erro** — bloco para `PGRST204`/`schema cache` que devolve
   500 **legível** ("O banco recusou a gravação por uma coluna inexistente…") e
   registra em `console.error` a lista exata de colunas enviadas. Se o schema
   mudar de novo, o diagnóstico aparece na hora em vez de virar erro opaco.
3. **Nada do resto mudou**: aprovação humana, datas futuras, bloqueio de
   balada/rave, memória de rejeição e independência de `AI_MODEL` intactos.

**Verificação**: função v15 `ACTIVE`; reprodução local com `runLocalEventEngine`
encontrou `is_school` como campo inválido e confirmou **13/13 candidatos
preservados, 0 inválidos após sanitização**; `INSERT` real com as 23 colunas
executado dentro de transação e revertido (`ROLLBACK`) — aceito pelo banco.

### 15.2 Modo escuro na tela de introdução

A tela já tinha ~40 classes `dark:` prontas, mas o tema só chegava ao
`MobileHeader` e ao `AdminPanel`: para trocar antes do login era preciso entrar e
ir em Configurações. Adicionadas as props `theme`/`onToggleTheme` ao
`WelcomeScreen` e um botão Lua/Sol no cabeçalho, ao lado de "Entrar" — com
`aria-label` que reflete o estado e `title` em português.

### 15.3 Login Google

Já era enviado `prompt: "select_account"` desde a rodada anterior. O Google
decide o que listar conforme o navegador: o seletor mostra as contas **já
logadas naquele navegador**. Não é limitação do app, e não há como forçar a
listagem de contas fora da sessão do navegador — só entrando com "Usar outra
conta".

### 15.4 Acessibilidade por voz (escopo completo)

Antes: o assistente só funcionava por texto. Para quem tem dificuldade de
leitura, visão ou digitação, o app inteiro ficava inacessível.

**Arquivos novos**

- `src/lib/voiceAccessibility.ts` — falar (`speechSynthesis`), ouvir
  (`SpeechRecognition`) e `limparParaFala()`, que remove Markdown/emoji antes da
  leitura (senão o sintetizador fala "asterisco asterisco").
- `src/lib/voiceActions.ts` — interpreta a instrução (falada ou escrita) e a
  converte em ação: tema, navegação, leitura de tela, preenchimento de evento.
  Inclui `extrairCamposEvento` (título, data, hora, local, gratuito/pago) e
  `ehConfirmacao`.

**`AIChatAssistant.tsx`** ganhou: botão de microfone (só aparece se o navegador
suportar), leitura em voz alta por mensagem e automática (desligada por padrão),
texto parcial enquanto ouve, e botões Sim/Não para ações pendentes.

**`App.tsx`** monta o `ContextoAcoes` (`descreverTelaAtual`, navegação, tema,
pré-rascunho de evento). `descreverTelaAtual` monta o resumo falado a partir do
**estado** — não raspa o DOM, porque o leitor de tela do navegador já faz isso;
o que faltava era um resumo curto, com a informação que importa em cada tela.

**Decisões de segurança e privacidade**

- O microfone **só liga por toque** — exigência dos navegadores e garantia de
  que o usuário saiba que está sendo ouvido.
- A leitura automática começa **desligada**: falar sem pedir é invasivo em
  ambiente escolar.
- Ao abrir o microfone, qualquer leitura em andamento é interrompida; senão o
  assistente reconheceria a própria voz como comando.
- **Ações que gravam dados nunca executam direto.** "Crie um evento…" abre o
  formulário preenchido, pergunta antes e, mesmo confirmado, apenas prepara o
  cadastro — **publicar continua sendo um clique humano**. A regra de aprovação
  humana do projeto permanece inviolável.
- Confirmação ambígua conta como **não** ("não, pode deixar" não publica nada).

**Validação** — `test-round11.mjs`: **64/64**

| Grupo | Casos |
|---|---|
| Limpeza de Markdown para fala | 7 |
| Tema (claro/escuro/alternar) | 7 |
| Leitura de tela e parar leitura | 6 |
| Navegação | 7 |
| Criar evento exige confirmação | 9 |
| Extração de campos (variações de data/hora/local) | 10 |
| Confirmação (inclui negação com prioridade) | 9 |
| Execução respeita o estado do tema | 5 |
| Pergunta comum não vira ação | 4 |

`tsc --noEmit`: 0 erros · `npm run build`: ok.

---

## 16. Rodada 12 — mobile, comandos da IA, links de inscrição, presença e painel

### 16.1 "Erro ao confirmar presença" (e os 404 do console)

**Sintoma**: a screenshot do console mostra uma sequência de
`Failed to load resource: the server responded with a status of 404` em
`/api/events`, `/api/users/200/participations` e `/api/events/:id/...`.

**Causa raiz**: o app roda em **GitHub Pages (estático)** — não existe servidor
Express em produção. Todas as chamadas `/api/...` vão para uma rota que só
existe no `server.ts` local. Pior: a de participações **nem tabela tinha** no
banco (`event_participations` não existia), então a confirmação de presença
NUNCA funcionou em produção — só no `npm run dev`.

**Correção**:
- Tabela `event_participations` criada no Supabase, com restrição única
  `(user_id, event_id)` e RLS de leitura/escrita.
- `src/lib/participationsService.ts` **(novo)** — grava direto no Supabase,
  com fallback para o backend local e cópia em `localStorage`. A confirmação é
  **idempotente**: confirmar de novo devolve "já confirmada", não erro.
- `App.tsx` e `Settings.tsx` passaram a usar o serviço.
- As demais rotas `/api/*` (`events`, `authorizations`) agora passam por
  `fetchJsonApi`, que em hospedagem estática nem toca na rede — o console
  deixa de encher de 404 e o fallback do Supabase assume na hora.

### 16.2 Modo escuro removido do painel

A pedido: o alternador fica **apenas em Configurações e na tela de
introdução**. As classes `dark:` continuam no painel (ele segue o tema global),
mas não há mais botão ali.

### 16.3 Senha visível e editável na ficha do usuário

**Causa raiz**: o `SELECT` de `fetchUsersDirectFromSupabase` não incluía a
coluna `password`. O campo chegava `undefined` na interface e a ficha mostrava
"não definida" para todo mundo — mesmo com a senha gravada no banco.

**Correção**:
- `password` (e também `matricula`, `personal_email`, `must_change_password`,
  `link_verified_at`) incluída no `SELECT`.
- `updateUserDirectInSupabase` passou a aceitar `password`, **só gravando
  quando o valor não é vazio** — campo em branco nunca apaga a senha de
  ninguém.
- Botão de lápis na ficha abre o campo "Nova senha", com validação mínima de
  4 caracteres e confirmação visual.

### 16.4 O app "voltava para a tela de início do nada"

**Causa raiz (finalmente identificada)**: `handleAuthenticatedGoogleUser`
terminava com `setActiveScreen("feed")`. Esse handler é chamado em **todo**
evento de autenticação do Supabase — `SIGNED_IN`, `INITIAL_SESSION` e,
principalmente, **`TOKEN_REFRESHED`**, que acontece sozinho a cada ~50 minutos e
também quando a aba volta a ficar visível. Resultado: quem estava no meio do
cadastro de um evento era jogado ao mural sem ter feito nada.

**Correção**:
- O redirecionamento agora só acontece se a tela atual for uma **tela de
  entrada** (`splash`, `welcome`, `login`, `register`, `codeSent`).
  Quem já está navegando fica onde está.
- Restauração de tela no primeiro carregamento (uma única vez), a partir do
  `sessionStorage`, sem sobrescrever uma tela já navegada e ignorando telas que
  dependem de contexto (`schoolDetail`, `eventDetail`).

### 16.5 Design no mobile

Auditoria com foco nos problemas que realmente atrapalham no celular:

| Problema encontrado | Correção |
|---|---|
| Inputs com `text-xs` (12px) → **iOS dava zoom automático** ao focar, deslocando a tela | `font-size: 16px` em campos de formulário **abaixo de 640px**, via CSS |
| `100vh` no iOS inclui a barra de endereço → rodapé/nav escondidos | `min-height: 100dvh` |
| Painel com `overflow-x: auto !important` no container principal → **a página toda deslizava para o lado** e o cabeçalho `sticky` descolava | Rolagem horizontal só a partir de 768px; no celular, `overflow-x: hidden` (as tabelas e a barra de abas mantêm a rolagem própria) |
| Botões de ícone (olho, copiar, fechar) com ~24px → difíceis de acertar | mínimo de 40×40px em `@media (pointer: coarse)` |
| Textos longos (e-mail, URL) estourando a largura | `overflow-wrap: anywhere`; `html/body` com `overflow-x: hidden` |
| Notch do iPhone | `padding-bottom: env(safe-area-inset-bottom)` |

### 16.6 Repertório de comandos da IA ampliado

Antes, fora do servidor Express o assistente só sabia responder **três**
assuntos (escolas, eventos, "gratuito") — qualquer outra pergunta caía na
mesma resposta genérica.

`src/lib/assistantKnowledge.ts` **(novo)** traz um repertório que roda 100% no
navegador (sem chave, sem rede), com pontuação por palavras-chave:

| Tópico | Exemplo de pergunta |
|---|---|
| Escola específica (6) | "me fala da Helena Wysocki" |
| Telefones | "qual o telefone das escolas?" |
| Endereços / CEP | "onde fica a escola?" |
| Modalidades e cursos | "quais cursos técnicos têm?" |
| Cadastro e login | "como crio conta?" |
| Confirmar presença | "como confirmar presença?" |
| Eventos gratuitos / pagos | "tem evento grátis?" |
| Agenda | "o que tem no calendário?" |
| Escolar × aberto ao público | "o que é evento escolar?" |
| Autorização de responsável | "precisa de autorização?" |
| Acessibilidade | "tem modo escuro?" |
| Quem publica | "quem pode publicar?" |
| Sugestões/motor local | "como funcionam as sugestões?" |
| Serviços (transporte, merenda) | "como faço matrícula?" |
| Ajuda do assistente | "o que você faz?" |
| Saudações | "oi" |

Escolas específicas têm peso maior, então "telefone da Wysocki" traz o telefone
da escola e não a lista genérica.

### 16.7 Busca na internet pelo link de inscrição

`src/lib/eventLinksService.ts` **(novo)** — em três camadas:

1. **Catálogo curado** (sem rede, o mais confiável): OBMEP, OBI, ONHB, MOBFOG,
   OBA, OBQ, OBF, OBB, OLP, Vestibular UFPR/UTFPR, PUCPR, JEPS, JEBS, ENEM,
   SEED-PR, entre outros.
2. **Busca na internet** — API pública do DuckDuckGo (sem chave), com timeout
   de 4 s, filtrando domínios de terceiros (encurtadores, redes sociais,
   agregadores).
3. **Nada** — quando não acha, devolve `null` e a interface diz "sem link
   oficial encontrado — confirme na escola".

**Regra rígida: nunca inventar URL.** Um link errado manda o aluno para o site
errado — pior do que não ter link.

No painel (**Sugestões**), o botão **"Buscar links de inscrição"** preenche o
link de cada sugestão pendente, com selo **oficial** (catálogo) ou
**verificar** (busca na web), e o link abre em nova aba.

### Validação executada

| Suíte | Resultado |
|---|---|
| `test-round12.mjs` — links de inscrição + repertório do assistente | **32/32** |
| `test-round12b.mjs` — confirmação de presença (mock do Supabase, idempotência, offline) | **18/18** |
| `test-round12c.mjs` — regressão do redirecionamento / restauração de tela | **21/21** |
| `tsc --noEmit` | 0 erros |
| `npm run build` | ok (9.39 s) |
| Bundle da Edge Function | 75304 bytes, 5 imports, `is_school` e `schema cache` preservados |

**Pendência de deploy**: a melhoria do *prompt* da Edge Function (instrução
para devolver `website` de inscrição) está no repositório e no bundle
regenerado, mas **não foi publicada** — a rede deste ambiente bloqueia a API
do Supabase (`api.supabase.com` inacessível). O deploy pode ser feito pelo CLI
(`supabase functions deploy ai-event-scout`) ou pelo painel. A busca de links
**não depende disso**: ela roda no front-end, no botão do painel.

---

## 17. Rodada 13 — rolagem na introdução e volta ao dashboard

### 17.1 Rolar com o dedo na tela de introdução (mobile)

**Sintoma**: no celular, a tela inicial (dashboard) não rolava com o dedo — o
conteúdo de baixo (SOS, parceiros, rodapé) simplesmente não aparecia.

**Causa raiz**: o wrapper da tela no `App.tsx` tinha só `absolute inset-0`,
ou seja, a altura exata da viewport. O conteúdo interno usava `min-h-screen`
(100vh), que **não** cria rolagem: ele é cortado pelo pai. Não havia contêiner
com `overflow-y: auto`, então o gesto de arrastar não tinha o que rolar.

**Correção**:
- O wrapper da introdução passou a ser o contêiner de rolagem:
  `overflow-y-auto overscroll-y-contain welcome-scroll`.
- O conteúdo interno passou de `min-h-screen` para `min-h-full`, evitando
  somar 100vh ao conteúdo e criar um trecho em branco depois do rodapé.
- `.welcome-scroll` em `index.css`: `-webkit-overflow-scrolling: touch`
  (momentum no iOS), `touch-action: pan-y` e barra de rolagem visível apenas
  onde há mouse.

### 17.2 Login leva ao Mural, sem "voltar" para o login

A navegação pós-login passou a usar **`entrarNoApp()`**, que faz
`replaceState` em vez de `pushState`. Antes, o histórico empilhava a tela de
login; o botão "voltar" do navegador/celular devolvia o usuário ao formulário,
o que parece bug e obriga a refazer o login. Agora o login é substituído pelo
mural no histórico. Aplicado nos 6 caminhos de entrada (senha, institucional,
Google, funcionário, cadastro e fallback local).

### 17.3 Botão de voltar ao dashboard na tela inicial

Não havia caminho de volta ao dashboard a partir da introdução: o menu só
existe nas outras telas, e a introdução é a primeira coisa que aparece ao abrir
o app.

- `src/components/BackToDashboardButton.tsx` **(novo)** — botão flutuante no
  canto inferior esquerdo (o assistente ocupa o direito), com ícone de seta +
  rótulo. Aparece **só na introdução** e **só para quem tem dashboard**
  (usuário conectado com acesso administrativo). Visitante não vê nada.
- O rótulo muda conforme a origem: **"Voltar ao dashboard"** se o usuário veio
  do painel; **"Ir para o dashboard"** se chegou ali por outro caminho.
- A navegação usa `replaceState`, para a introdução não voltar a aparecer no
  histórico.

### 17.4 A seta do navegador e o "voltar" do celular

`src/lib/navigation.ts` **(novo)** centraliza as regras que estavam duplicadas
e divergentes entre o boot e o listener de `popstate`:

| Função | Responsabilidade |
|---|---|
| `removerBase` | desconta `/Tcc_main-do-main/` do caminho |
| `telaDoCaminho` | URL → tela |
| `resolverTelaInicial` | onde abrir no primeiro carregamento |
| `resolverTelaDoPopState` | destino ao apertar voltar/avançar |
| `destinoDoBotaoVoltar` | destino do botão flutuante |

**Regras que passaram a valer**:
1. O `state` do histórico manda, quando existe.
2. Sem `state`, a URL é lida **já sem o prefixo do GitHub Pages** — era aqui
   que a versão antiga falhava e devolvia o usuário ao mural.
3. Sem URL reconhecível, usa a última tela da sessão.
4. Só então cai no destino natural (`feed` logado / `welcome` deslogado).
5. Painel e Configurações **exigem sessão**: URL direta ou histórico com
   `admin` não devolve um painel vazio para quem saiu da conta.
6. Ao voltar, a tela restaurada também atualiza `ultima_tela`, mantendo
   coerência com o próximo recarregamento.

### Validação

| Suíte | Resultado |
|---|---|
| `test-round13.mjs` — navegação, popstate, permissões, botão de voltar | **31/31** |
| Verificação jsdom — `min-h-full` no conteúdo, botão só onde deve aparecer | 5/5 |
| `tsc --noEmit` | 0 erros |
| `npm run build` | ok (5.25 s) |

---

## 18. Rodada 14 — design mobile, cabeçalho duplicado e agenda pessoal

### 18.1 Cabeçalho duplicado na tela de eventos

**Sintoma**: no celular, a tela de Eventos mostrava **duas barras** no topo —
uma com "eloEscola / Mural & Eventos" + avatar (o `MobileHeader` global) e
outra logo abaixo com "Eventos" + lupa + botão + **outro** avatar de perfil.

**Causa**: o `Feed` tinha o próprio cabeçalho completo, herdado de quando era
a única tela do app. Depois que o `MobileHeader` global entrou, os dois
passaram a coexistir.

**Correção** — uma barra só:
- **Mobile**: título compacto + **lupa** + botão **"Compromisso"**. O avatar
  saiu (ele já está no `MobileHeader`).
- **Desktop**: versão completa com as mesmas ações.
- A lupa agora alterna o rótulo ("Pesquisar"/"Fechar busca") e o ícone vira X
  quando a busca está aberta — antes o botão ficava sem feedback visual.

### 18.2 Agenda pessoal

Novo recurso: o usuário pode cadastrar **compromissos próprios** (prova,
trabalho, reunião de família) sem sujar o mural público.

- `src/lib/personalEventsService.ts` **(novo)** — CRUD no Supabase
  (`personal_events`) com fallback local. Lista por dono (agenda) ou todos
  (painel).
- `src/components/PersonalEventModal.tsx` **(novo)** — bottom sheet no celular,
  diálogo no desktop. Campos: título, data, horário, local, tipo, detalhes,
  anotações e lembrete. Rodapé fixo para o botão "Salvar" não sair da tela.
- No `Feed`: seção **"Minha agenda"** acima do mural, com rolagem horizontal e
  botão de remover por item. Compromissos passados ficam esmaecidos no fim.

**Regras respeitadas**: só datas de hoje em diante (mesma regra dos eventos da
escola) e cada compromisso fica amarrado ao `owner_id` de quem criou.

### 18.3 Tabela no Painel ADM

Nova aba **"Agenda pessoal"** com **todos** os compromissos de **todos** os
usuários, cada um com seu dono:

| Coluna | Conteúdo |
|---|---|
| Compromisso | título + anotação |
| **Dono** | avatar com iniciais, nome e e-mail |
| Data | dd mmm aaaa + horário (marca "já passou") |
| Local | local ou cidade |
| Tipo | Pessoal, Estudo, Prova... |
| Ações | remover (com confirmação) |

Contador no botão da aba, busca por dono/título/cidade e botão de atualizar.
Abrir a aba carrega do banco; criar ou remover no Feed atualiza o painel via
contador (`recarregarPessoais`).

### 18.4 Design mobile — respiro em vez de tudo compacto

| Onde | Antes | Depois |
|---|---|---|
| Cabeçalho do Feed | `p-6` (24px em 360px de tela) | `px-4 py-3` |
| Filtros | `px-6` | `px-4`, duas linhas com `gap-3` |
| Cards | `h-44` fixo, `p-4` | `h-40` no mobile, `p-3.5`; título com `line-clamp-2` |
| Chips de filtro | `py-1.5` (~28px de alvo) | `py-2` no mobile (alvo confortável) |
| Configurações / Calendário | `p-6` | `px-4 py-4 sm:p-6` |
| Modal | diálogo centralizado | bottom sheet com alça e `max-h-[92dvh]` |

### Validação

| Suíte | Resultado |
|---|---|
| `test-round14.mjs` — CRUD, validações, isolamento por dono, ordenação e regressão do cabeçalho | **36/36** |
| jsdom — `PersonalEventModal` (abre, valida, salva, mês 0-indexado) | 9/9 |
| `tsc --noEmit` | 0 erros |
| `npm run build` | ok (5.86 s) |


---

## 20. Rodada 16 — redesenho da ABA de eventos

### 20.1 Correção de rota: os cards voltaram ao formato anterior

A rodada anterior interpretou "design dos eventos" como "design dos cards" e
trocou foto/título/data por um esquema de identidade por área. **Isso foi
revertido**: `src/lib/eventVisuals.ts` e `test-round15.mjs` foram removidos e o
card voltou ao formato que já existia (imagem no topo, título sobre o banner,
metadados embaixo).

O pedido era o **design da aba**, não dos cards.

### 20.2 O que mudou na aba

**Cabeçalho**
- Antes: título "Eventos" e uma linha fixa "Olá, David" que nunca mudava.
- Agora: o subtítulo é **informativo** — mostra a contagem real
  (`5 eventos`, `2 eventos · Curitiba`) e reflete o filtro ativo.
- Lupa e botão "Compromisso" alinhados à direita, com altura consistente
  (40px) e rótulo que alterna entre "Pesquisar" e "Fechar busca".

**Filtros**
- Antes: dois grupos em `flex-wrap` que, no celular, quebravam em 3–4 linhas e
  empurravam a grade para baixo.
- Agora: uma faixa única com **rolagem horizontal** (`FiltroGrupo` +
  `ChipFiltro`), rótulos curtos ("Aberto" em vez de "Aberto ao público"), chips
  de 32px com `aria-pressed` e um botão **Limpar** que só aparece quando há
  filtro ativo.

**Grade**
- `1 / 2 / 3 / 4` colunas (antes repetia `md:grid-cols-2`, que não fazia nada).
- Espaçamento `gap-3.5` no mobile (antes 6 = 24px, muito para tela estreita).

**Estado vazio**
- Antes: um ícone cinza e "Nenhum evento encontrado" — sendo que a lista
  *nunca* esteve vazia por busca; o texto não dizia o que fazer.
- Agora distingue os dois casos: **"Nenhum evento na agenda ainda"** (lista
  vazia de verdade) e **"Nada com esses filtros"** (busca/filtro sem
  resultado), cada um com as ações que fazem sentido ali: limpar filtros,
  limpar busca, criar compromisso ou atualizar.

**Campo de busca**
- Sobreviveu à reescrita (foi restaurado após o teste apontar a falta):
  aparece abaixo da barra, ocupa a largura toda e tem botão de limpar.

### 20.3 Validação

| Suíte | Resultado |
|---|---|
| `test-round16.mjs` — cards revertidos, cabeçalho, filtros, grade, estado vazio e render real | **39/39** |
| Regressão rodadas 11–14 | 181/181 |
| `tsc --noEmit` | 0 erros |
| `npm run build` | ok (6.39 s) |

---

## 21. Contas escolares: lista separada, criação funcionando e fim dos erros 405 (rodada 17)

**Relato:** *"não consigo adicionar, crie uma lista separada para contas escolares, e tudo mais"* — com o console cheio de `Failed to load resource: 405` em `/api/admin/institutuion_counts/991/verify`, `/api/events` e `/api/users/heartbeat`.

### 21.1 Por que não dava para adicionar

| Causa | Efeito |
|---|---|
| A conta institucional era gravada em `users` com `uid` fixo (`inst-<escola>`) | a segunda conta da **mesma escola** colidia em `users_uid_key`: `duplicate key value violates unique constraint` e o formulário não salvava |
| A aba lia `users` (fallback do Express) com `role="Escola"` | a gestão escolar aparecia misturada ao diretório de alunos e entrava nos contadores ("24 contas totais / 22 ativas") |
| Botões Verificar / Redefinir senha / Bloquear chamavam `/api/admin/institutional-accounts/...` | no GitHub Pages a rota não existe → **405**, nenhuma ação acontecia e o card continuava "Pendente" |
| O `select` de escola usava `email: f.email || ...` | ao trocar de escola o e-mail da escola anterior permanecia, criando credencial errada |
| A linha "Responsável" exibia `acc.cargo` de um campo que nunca era gravado | aparecia `Responsável: Elder ( )` — cargo vazio |

### 21.2 O que mudou

**Tabela própria — `public.school_accounts` (migration `0009_school_accounts_table.sql`)**
- Chave primária própria (`id SERIAL`), sem colidir com `users`.
- Guarda `school_id`, `school_slug`, `school_name`, `login_identifier`,
  `institutional_email`, `password`, `responsible_name`, `responsible_role`,
  `account_status` (`active`/`suspended`/`revoked`) e
  `verification_status` (`pending_verification`/`verified`/`revoked`).
- Unicidade **entre contas escolares** (`LOWER(login_identifier)` e
  `LOWER(institutional_email)`), então a mesma escola pode ter direção e
  coordenação com contas distintas.
- RLS ligada com as quatro políticas (SELECT/INSERT/UPDATE/DELETE), igual ao
  padrão do projeto (o app autentica na tabela, não no Supabase Auth).
- Migração idempotente das contas antigas de `users` com `role = 'Escola'`.

**`src/lib/schoolAccountsService.ts` (novo)** — lista, cria, autentica,
bloqueia/desbloqueia, verifica/revoga, redefine senha (com
`must_change_password = true`) e remove. Mensagem acionável quando a migration
ainda não foi aplicada. `src/lib/institutionalAdminService.ts` foi **removido**.

**Painel (`AdminPanel.tsx`)**
- Aba renomeada para **"Contas escolares das 6 escolas de Araucária"**, com
  resumo: contas, ativas, verificadas e **escolas sem conta**.
- Card mostra identificador, e-mail, **responsável com cargo** e **a senha**
  (o Chefe vê e altera, requisito do projeto), além de último acesso.
- Ações: Verificar/Revogar, **Alterar senha**, Bloquear/Desbloquear e Remover
  (com confirmação) — todas via Supabase, **nenhuma em `/api/`**.
- Erro de leitura aparece como aviso explicativo + "Tentar novamente", em vez
  de fingir lista vazia.

**Separação do diretório**
- `fetchUsersDirectFromSupabase` filtra `role = "Escola"` na origem: alunos e
  servidores na aba "Contas", gestão escolar na aba "Contas das Escolas".
- O login institucional (`App.tsx`) passou a autenticar em `school_accounts`,
  por identificador **ou** e-mail, e respeita o bloqueio da conta.

### 21.3 Validação

| Suíte | Resultado |
|---|---|
| `test-round17.mjs` — tabela, serviço, painel, separação e render real da aba | **49/49** |
| `test-round16.mjs` (jsdom) | 39/39 |
| Regressão 11–14 | 202/202 |
| `tsc --noEmit` | 0 erros |
| `npm run build` | ok (5.40 s) |

**Banco:** tabela criada e conta `helena.wysocki@escola.pr.gov.br` migrada
para a lista separada; nenhuma linha com `role = 'Escola'` restou em `users`.

---

## 22. Responsividade mobile, rolagem por toque e fim da matrícula (rodada 18)

**Relatos:** *"reajuste a responsividade do mobile, o design está tudo amontoado e feio, AJUSTE TUDO"*; *"não consigo dar scroll com o dedo se o dedo estiver em cima de algo"*; *"remova a opção de matrícula do cadastro"*.

### 22.1 A causa raiz da rolagem travada

| Causa | Efeito |
|---|---|
| `touch-action: pan-y` no **`body`** | o documento inteiro "reservava" o gesto vertical; o contêiner que rola de verdade (`.welcome-scroll`, telas `absolute inset-0 overflow-y-auto`) perdia o arrasto quando o dedo começava em cima de um card/imagem |
| `touch-action: pan-y` em **todas** as `.overflow-y-auto`/`.overflow-x-auto` | bloqueava rolagem horizontal nativa (faixa de filtros, agenda pessoal) e cortava o gesto em contêineres aninhados |
| Imagens arrastáveis + `select-none` em blocos grandes | o navegador mobile interpreta o toque como "arrastar elemento" e travar o gesto |
| `active:scale-[0.99]` nos cards | a escala disparava no início do gesto e dava sensação de travado |
| Carrossel com `onTouchEnd` retomando o autoplay | o trilho "brigava" com o dedo no meio da inércia |

**Correções**
- `body` e os contêineres de rolagem passam a usar `touch-action: manipulation` (pan livre em qualquer direção + pinch-zoom).
- Nova classe `.touch-scroll` aplicada em Feed, Calendário, Detalhe do evento, Configurações, Contato, Portal da Escola e Painel.
- `.scroll-x-snap` para as faixas horizontais (filtros, agenda pessoal, carrossel de escolas, faixa do calendário): `pan-x pan-y` + `scroll-snap` + `overscroll-behavior-x: contain`.
- Leaflet continua com `touch-action: none` **isolado** em `.touch-map` (o mapa precisa capturar o gesto).
- Imagens com `-webkit-user-drag: none`; carrossel retoma o autoplay 1,2 s depois do toque.

### 22.2 Respiro e densidade no mobile

- **Feed:** cabeçalho com `pt-3.5 pb-2.5`, título de 1,35 rem, botões 40×40 (o de compromisso vira ícone), grade `gap-4`, banner do card `h-36`, badges que não colidem com o preço, rodapé do card com respiro.
- **Painel ADM:** as 6 abas agora **rolam na horizontal** com snap, altura de toque `py-2` e `whitespace-nowrap` (antes ficavam espremidas numa linha só); o alternador Tabela/Cartões ocupa a linha toda no mobile; filtros com snapshot horizontal.
- **Calendário:** cabeçalho empilhado no mobile, grade com `gap-1`, dia sem `scale` no toque, padding `p-3.5`.
- **Detalhe do evento:** banner `h-48`, título `text-xl`, botão voltar com 36px.
- **Login/Cadastro:** cartões com `p-4` e `rounded-2xl` no mobile; Nascimento/Gênero empilham abaixo de 380px.
- **MobileHeader:** menu do usuário com `max-h-[70dvh]`, largura limitada à tela e itens de 44px; `safe-top` para o notch. Corrigido também o `xs:` (breakpoint inexistente no Tailwind 4) que nunca escondia os rótulos "Chefe"/"Admin".
- **Modais:** todos os overlays ganharam `overflow-y-auto` com `p-3` no mobile — antes os mais altos estouravam a tela e o botão de salvar ficava inacessível.
- **Barra inferior:** nova `.pb-bottom-nav` (safe-area + 5,5rem) substitui os `pb-24` fixos, que deixavam um vão morto no desktop.

### 22.3 Matrícula removida do cadastro

- Campo "Matrícula / RA" removido do formulário (estado, ícone `Hash` e validação).
- `validateSchoolRegistration` não exige mais matrícula; `SchoolRegistrationInput.matricula` passou a ser opcional.
- O vínculo escolar passa a ser conferido por **CPF + instituição** (`verifyInstitutionalLink` recebe `""`), sem quebrar contas já criadas.

### 22.4 Validação

| Suíte | Resultado |
|---|---|
| `test-round18.mjs` — rolagem, respiro, modais e matrícula | **50/50** |
| `test-round18-mobile.mjs` — render real em 390px (Feed, Cadastro, Painel) | **21/21** |
| `test-round17.mjs` | 49/49 |
| `test-round16.mjs` (jsdom) | 39/39 |
| Regressão 11–14 | 202/202 |
| `tsc --noEmit` | 0 erros |
| `npm run build` | ok (5.58 s) |

---

## 23. Rolagem do painel de administração: a página rola, não só a tabela (rodada 19)

**Relato:** *"no painel de adm o scroll ainda tá bugado, faça o que eu te pedi, reajuste para que a tela role, não apenas a tabela"*.

### 23.1 A causa (confirmada no código)

O contêiner raiz do painel declarava **duas classes contraditórias**:

```jsx
className="... admin-scrollable admin-scroll-x overflow-y-auto overflow-x-hidden ..."
```

```css
.admin-scrollable { overflow-y: auto !important; }  /* ?important */
.admin-scroll-x   { overflow-x: hidden; }            /* sem !important */
```

`overflow-x: hidden` sobrescrito por `overflow-x-hidden` do Tailwind (mesma
especificidade, ordem do arquivo) → o par ficava **`hidden` + `auto`**. O
navegador **promove** `hidden` para `auto` quando o outro eixo é `auto`, então
o painel inteiro virou um **scroller horizontal de 736px** (o `min-width: 46rem`
das tabelas). Resultado exato do relato: *"precisa clicar exatamente em cima
da tabela para dar scroll"* — o cabeçalho, a busca, os filtros e os cards
estavam num canvas mais largo que a tela, e o gesto vertical disputava com o
scroller horizontal.

### 23.2 O que mudou

- Raiz do painel: **sem `admin-scroll-x`** e **sem `overflow-x-hidden`**;
  agora `admin-page` + `overflow-y-auto` + **`overflow-x-clip`** (clip não cria
  scroller e portanto não é promovido para `auto`).
- `.admin-page { overflow-x: clip; overflow-y: auto; overscroll-behavior-y: contain }`
  — a página rola na vertical em qualquer ponto do conteúdo.
- `.admin-scroll-x` (a regra conflitante) **removida** do CSS.
- Nova `.admin-table-scroll` para os 3 blocos de tabela: `overflow-x: auto`,
  `overflow-y: hidden`, `touch-action: pan-x pan-y` e
  `overscroll-behavior: contain` — o gesto horizontal morre na tabela e não
  vaza para a página.
- `active:scale-95/98` do painel trocados por `.hover-only-scale`, que só
  escala com mouse (`@media (hover: hover) and (pointer: fine)`). No toque a
  escala cancelava o gesto.
- Botão flutuante do Assistente Elo: `bottom-24`, 44px e
  `touch-manipulation` no mobile — antes cobria o canto da lista e capturava
  o toque.

### 23.3 Validação

| Suíte | Resultado |
|---|---|
| `test-round19.mjs` — rolagem do painel (fonte + render jsdom) | **32/32** |
| `test-round18.mjs` / `test-round18-mobile.mjs` | 50/50 · 21/21 |
| `test-round17.mjs` / `test-round16.mjs` | 49/49 · 39/39 |
| Regressão 11–14 | 202/202 |
| `tsc --noEmit` / `npm run build` | 0 erros / ok (6.15 s) |

---

## 24. Scroll do painel no mobile: a raiz do problema era a ALTURA (rodada 20)

**Relato:** *"ainda não funciona, organize isso como eu já havia pedido e adicione o scroll solicitado"* — com print mostrando o conteúdo **cortado** atrás do menu inferior.

### 24.1 A causa de verdade

| Camada | Problema |
|---|---|
| `#app-root-container` (`.app-viewport`) | `height: 100%` de um pai sem altura resolvida → altura indefinida no mobile |
| wrapper da tela admin | `absolute inset-0` dentro de um pai `overflow-hidden`; sem altura certa, o conteúdo transborda em vez de rolar |
| raiz do painel | `h-full` **e** `flex-1` juntos, brigando; `admin-scrollable` forçava `overflow-y: auto !important` sem `min-height: 0` |

Com altura zerada/indefinida, `overflow-y: auto` **não tem o que rolar**: o conteúdo simplesmente cresce para fora e some atrás da barra inferior. Por isso a sensação de que "só a tabela rola" — as tabelas tinham scroller próprio e o resto não rolava nada.

### 24.2 Correções

- Raiz do app: `h-[100dvh] min-h-0 overflow-hidden` + `.app-viewport { height: 100dvh; max-height: 100dvh }` com fallback `@supports not`.
- Tela do painel: de `absolute inset-0` para **`flex-1 min-h-0`** (filho do flex, com altura previsível).
- Raiz do painel: `admin-page flex-1 min-h-0 overflow-y-auto overflow-x-clip` — sem `h-full`, sem `admin-scrollable`, sem `!important` em `overflow-y`.
- `.admin-page { min-height: 0; touch-action: pan-y }`: encolhe no flex e o gesto vertical é dele.
- Cabeçalho do painel **deixou de ser sticky** (ocupava ~240px no celular: título + badge + subtítulo + 6 abas + KPIs + busca + alternador + filtros).

### 24.3 Organização do cabeçalho (o "amontoado")

| Elemento | Antes | Depois |
|---|---|---|
| título + badge | quebravam em 2 linhas | mesma linha, título truncado ("Painel de Controle") |
| subtítulo | sempre visível (2 linhas no mobile) | `hidden sm:block` |
| KPIs | `flex-wrap` → 2-3 linhas (~120px) | **faixa única** com rolagem horizontal e snap |
| badges do card | quebravam e empurravam os botões | faixa única, `whitespace-nowrap` |
| status | "🟢 Ativo (Online)" estourava | "Ativo" / "Online" / "Bloqueado" |
| aviso inferior | último item ficava sob a barra | `.pb-bottom-nav` com 6,5rem + `scroll-padding-bottom` |

### 24.4 Validação

| Suíte | Resultado |
|---|---|
| `test-round20.mjs` — altura, cadeia de flex, cabeçalho e render real | **40/40** |
| `test-round19.mjs` (ajustado: `pan-y` só em contêiner vertical) | 32/32 |
| `test-round18.mjs` / `test-round18-mobile.mjs` | 50/50 · 21/21 |
| `test-round17.mjs` / `test-round16.mjs` | 49/49 · 39/39 |
| Regressão 11–14 | 202/202 |
| `tsc --noEmit` / `npm run build` | 0 erros / ok (4.17 s) |

---

## 25. Rodada 21 — rolagem normal de aplicativo (o documento é o scroller)

**Pedido:** *"agora nao consigo nem srollar a tela, refaca novamente, coloque um scroll normal de aplicativo onde rola a tela inteira"*.

### 25.1 Por que as rodadas 19 e 20 falharam

As duas tentativas anteriores trataram o sintoma (`overflow`) sem mudar o modelo. O app tinha uma **cadeia de altura travada** com um scroller por tela:

```
html/body { height: 100% }
  #root { height: 100% }
    .app-viewport { height: 100dvh; overflow: hidden }
      wrapper da tela { absolute inset-0 }
        tela { overflow-y: auto }   ← scroller interno
          tabela { overflow-x: auto }  ← scroller dentro do scroller
```

Cada camada nova adicionava um scroller aninhado. Quando o dedo encostava num elemento que não rolava, o gesto morria ali — e a tela inteira ficava imóvel. Não existe ajuste de classe que conserte isso: era preciso remover os scrollers internos.

### 25.2 Modelo novo (definitivo)

**Um único scroller: o documento (`html`).** As telas são blocos de conteúdo comuns; as barras ficam fixas por cima, como em qualquer app.

| Camada | Antes | Agora |
|---|---|---|
| `html` | `height: 100%` | `min-height: 100dvh` + `overflow-y: auto` + `overflow-x: clip` |
| `body` | `height: 100%` | `min-height: 100dvh`, `overflow-y: visible`, `overflow-x: clip` |
| `#root` | `height: 100%` | sem altura (cresce com o conteúdo) |
| `.app-viewport` | `height: 100dvh; overflow: hidden` | `min-height: 100dvh`, sem `overflow` |
| `#app-root-container` | `h-[100dvh] … overflow-hidden` | `min-h-[100dvh]`, sem `overflow-hidden` |
| wrapper do shell | `h-full … overflow-hidden` | `min-h-[100dvh] flex flex-col` |
| telas | `absolute inset-0 overflow-y-auto` | `.app-screen` (bloco normal) |
| Feed / Agenda / Ajustes / Apoio / Detalhe / Portal | `h-full overflow-y-auto` | `w-full pb-bottom-nav` |
| Painel de administração | `flex-1 min-h-0 overflow-y-auto` | `w-full overflow-x-clip pb-bottom-nav` |
| Login / Cadastro / Recuperação | `min-h-full … overflow-y-auto` | `min-h-[100dvh]` |
| Splash | `absolute inset-0` | `fixed inset-0` (overlay real) |

### 25.3 Detalhes que fazem funcionar no celular

- **`overflow-x: clip` (nunca `hidden`)** no `html`/`body`: `hidden` no X obriga o navegador a promover `overflow-y: visible` para `auto`, criando um scroller extra no `body` — que, sem altura, não rola nada.
- **Nenhum `overflow-y: auto` dentro de tela**: nenhuma camada intermediária rouba o gesto. A rolagem horizontal continua isolada apenas em `.admin-table-scroll` e nas faixas `.scroll-x-snap`.
- **Troca de tela volta ao topo** (`useEffect` em `[activeScreen]` → `window.scrollTo(0,0)`), já que a rolagem agora é global.
- **Barras fixas sem sobreposição**: `MobileHeader` subiu para `z-[60]`; no mobile, `.app-screen .sticky { top: 2.75rem }` impede que o cabeçalho interno (Feed, Agenda, Detalhe) suba por baixo dela, e `scroll-padding-top/bottom` no `html` respeita as duas barras.
- **`.pb-bottom-nav` (6,5rem)** garante que o último item nunca fica atrás da barra inferior.
- **Mapa** mantém `h-[calc(100dvh-4rem)]` (tela cheia, gesto do Leaflet é intencional).

### 25.4 Validação

| Suíte | Resultado |
|---|---|
| `test-round21.mjs` (novo) — documento scroller, zero scroller interno, barras e render real | **43/43** |
| `test-round20.mjs` (atualizado: só organização/respiro) | 35/35 |
| `test-round19.mjs` — tabelas isoladas | 32/32 |
| `test-round18.mjs` / `18-mobile` | 50/50 · 21/21 |
| `test-round17.mjs` / `16` / `14` / `13` / `12`s / `11`s | 49 · 39 · 36 · 31 · 32+18+21 · 64 |
| `tsc --noEmit` / `npm run build` | 0 erros / ok (4,98 s) |

---

## 26. Rodada 22 — o que ainda travava o dedo no painel

**Pedido:** *"ainda nao funciona o scroll da tela do painel de adm mobile"* (3ª tentativa).

A rodada 21 mudou o modelo (documento é o scroller), mas deixou dois **travamentos reais de navegador mobile**:

### 26.1 `overflow` na raiz do documento — o pior deles

```css
html { overflow-x: clip; overflow-y: auto; }   /* ❌ rodada 21 */
body { overflow-x: clip; overflow-y: visible; }
```

No **Safari do iOS** o `overflow` do elemento raiz **propaga para a viewport**. Com `clip` (ou com o par `hidden`/`auto`), o documento perde a rolagem vertical: a tela fica imóvel, exatamente o novo relato. A regra agora é: **`html` e `body` não declaram `overflow` nenhum.**

| Antes | Depois |
|---|---|
| `html { overflow-x: clip; overflow-y: auto }` | `html { min-height: 100dvh; touch-action: pan-y pinch-zoom }` |
| `body { overflow-x: clip; overflow-y: visible }` | `body { min-height: 100dvh; touch-action: pan-y pinch-zoom }` |
| — | `#root { overflow-x: clip }` (div comum: seguro) |

O `touch-action: pan-y pinch-zoom` na raiz é intencional e **não** é o `pan-y` global proibido da rodada 18: como a página agora é o scroller, é ela que precisa aceitar o arrasto vertical; o horizontal fica livre para as faixas.

### 26.2 `overscroll-behavior` engolindo o gesto vertical

| Regra | Antes | Depois |
|---|---|---|
| `.overflow-y-auto, .overflow-x-auto, .scrollable-content` | `overscroll-behavior-y: contain` | *(removido)* |
| `.admin-table-scroll` | `overscroll-behavior: contain` (2 eixos) | `overscroll-behavior-x: contain` |
| `.scroll-x-snap` | `overscroll-behavior-x: contain` | mantido |
| `.admin-page` | — | `overscroll-behavior-x: contain` + `max-width: 100vw` + `touch-action: pan-y pinch-zoom` |

Numa faixa horizontal, `contain` nos dois eixos **impede a cadeia de rolagem de subir para a página**: arrastar o dedo para cima em cima das abas/filtros/KPIs não rolava nada. Agora o confinamento é só no eixo X.

### 26.3 Limpeza

- `.admin-scrollable` (código morto, com `overflow-y: auto !important`) **removida** do CSS — era a origem histórica do scroller duplicado do painel.

### 26.4 Validação

| Suíte | Resultado |
|---|---|
| `test-round22.mjs` (novo) — raiz sem `overflow`, overscroll por eixo, painel sem scroller | **27/27** |
| `test-round21.mjs` (atualizado) | 41/41 |
| `test-round20.mjs` / `test-round19.mjs` / `18-mobile` | 35/35 · 32/32 · 21/21 |
| `18` / `17` / `16` / `14` / `13` / `12`s / `11` | 50 · 49 · 39 · 36 · 31 · 32+18+21 · 64 |
| `tsc --noEmit` / `npm run build` | 0 erros / ok (5,21 s) |

---

## 27. Rodada 23 — padrão aplicado a TODAS as telas

**Pedido:** *"FUNCIONOU, APLIQUE EM TODAS AS TELAS AGORA"*.

O padrão aprovado no painel (rodadas 21/22) virou regra global. Regra de ouro, por tela:

1. **A página rola.** Nenhuma tela monta scroller vertical próprio (`overflow-y-auto` / `h-full` na raiz).
2. **Raiz do documento sem `overflow`** (`html`/`body`) — no Safari iOS `overflow` na raiz propaga para a viewport e mata a rolagem.
3. **Scroller interno só em duas situações:** modal (`fixed inset-0` + `max-h-*`) e faixa horizontal.
4. **`touch-action: none` só no mapa.** `overscroll-behavior` só no eixo X.
5. **`.pb-bottom-nav`** em toda tela sob a barra inferior; `pb-8` nas telas sem barra.

### 27.1 O que foi ajustado nesta rodada

| Arquivo | Ajuste |
|---|---|
| `SchoolsCatalog.tsx` | raiz `max-w-6xl … py-6` (sem respiro inferior) → wrapper `w-full pb-bottom-nav` + container interno |
| `SchoolDetail.tsx` | idem: wrapper `w-full pb-bottom-nav` para o conteúdo não terminar sob a barra |
| `WelcomeScreen.tsx` | `overflow-x-hidden` → `overflow-x-clip` (o par `hidden` promove o Y para `auto` e cria scroller) |
| `Login.tsx` / `PasswordRecovery.tsx` | `pb-8` garantindo respiro inferior no mobile |
| `MapView.tsx` | altura `calc(100dvh - 4.5rem)` casando com a MobileHeader (2,75rem + borda) |
| `AdminPanel.tsx` / `App.tsx` | comentários obsoletos sobre `absolute inset-0` / scroller interno removidos (não descreviam mais o código) |

### 27.2 Auditoria automática (nova suíte)

`test-round23.mjs` varre **13 telas** e falha se qualquer uma:

- montar scroller vertical na raiz;
- usar `h-full`/`h-screen`/`h-[100dvh]` fixo na raiz;
- tiver `overflow-y-auto` fora de modal ou faixa horizontal;
- declarar `touch-action: none` fora do mapa;
- usar `overflow-x-hidden` no lugar de `clip`;
- não reservar espaço para a barra inferior.

### 27.3 Validação

| Suíte | Resultado |
|---|---|
| `test-round23.mjs` (novo, 13 telas auditadas) | **142/142** |
| `22` / `21` / `20` / `19` / `18-mobile` | 27 · 41 · 35 · 32 · 21 |
| `18` / `17` / `16` / `14` / `13` / `12`s / `11` / `11b` | 50 · 49 · 39 · 36 · 31 · 32+18+21 · 64 · 5 |
| `tsc --noEmit` / `npm run build` | 0 erros / ok (6,41 s) |
| Dev server: todos os 18 componentes | compilam (HTTP 200) |

---

## 28. Rodada 24 — carrossel de escolas com rolagem contínua

**Pedido:** *"reajuste a rolagem automatica, para um pouco mais rapida, e ela nao vai de escola em escola, e uma barra continua, mas pode ser controlada de escola em escola pela flechinha, apos 2-3 segundos faca voltar a rolar automaticamente"*.

### 28.1 Como era

`setInterval` de **4,5 s** trocando `currentIndex` → o trilho pulava de card em card, com `scroll-behavior: smooth` e `snap-x snap-mandatory` reforçando o salto. Resultado visual: parado, salto, parado, salto.

### 28.2 Como ficou

| Aspecto | Antes | Depois |
|---|---|---|
| Movimento | `setInterval` 4,5 s por card | **`requestAnimationFrame` contínuo** |
| Velocidade | 1 card a cada 4,5 s (com salto) | **88 px/s ≈ 4 s por card, sem salto** |
| Snap | `snap-x snap-mandatory` | removido (+ `scrollSnapType: none` inline) |
| Flechas | trocavam `currentIndex` | rolagem suave de **exatamente 1 card** |
| Retomada após interação | 1,2 s (só no `touchend`) | **2,5 s**, para gesto, roda, teclado e flecha |
| Fim da lista | voltava ao índice 0 (pulo visível) | lista duplicada + correção de `scrollLeft` (**laço invisível**) |
| Preferência do sistema | ignorada | respeita `prefers-reduced-motion` |

### 28.3 Detalhes técnicos

- **Delta limitado a 50 ms** por frame: voltar de uma aba em segundo plano não causa salto de centenas de pixels.
- **`acumuladoRef`**: acumula a fração de pixel (a 60 fps o passo é ~1,47 px) para o movimento não "engasgar".
- **Laço**: o trilho renderiza a lista **duas vezes**; ao passar da largura de uma volta, `scrollLeft` é subtraído dessa largura — o conteúdo é idêntico, então não há salto perceptível.
- **Pausa por hover** continua (desktop); ao sair do ponteiro, o movimento volta.
- **`scrollProgramaticoRef`** impede que o "empurrão" das flechas conte como gesto do usuário e pause o loop por engano.
- **Indicadores** acompanham o trilho via listener de `scroll` com `requestAnimationFrame` (sem re-render a cada frame).

### 28.4 Validação

| Suíte | Resultado |
|---|---|
| `test-round24.mjs` (novo) | **40/40** |
| `23` / `22` / `21` / `20` / `19` / `18` / `18-mobile` | 142 · 27 · 41 · 35 · 32 · 50 · 21 |
| `17` / `16` / `14` / `13` / `12`s / `11` | 49 · 39 · 36 · 31 · 32+18+21 · 64 |
| `tsc --noEmit` / `npm run build` | 0 erros / ok (5,29 s) |

---

## 29. Rodada 25 — salvar perfil sem erro, com aprovação de ADM

**Relato:** *"ao alterar o perfil, da erro e volta para o perfil antes da alteração, conserte isso para que as informações substituidas precisem de uma confirmação de um funcionario adm, mas coisas como telefone para contato e foto de perfil possam ser alteradas sem confrimação de adm"* (com print do toast *"Falha ao salvar perfil. O estado anterior foi restaurado"*).

### 29.1 Causa raiz do erro

`handleUpdateProfile` (`src/App.tsx`) chamava **`PUT /api/users/profile`** — backend Express que **não é publicado** no GitHub Pages (o deploy envia apenas `dist/` + `404.html`). Como `getAuthToken()` devolve `null` (o app não usa Supabase Auth nem Firebase), `res` ficava `null`, o código caía no `catch`, executava `setCurrentUser(previousUser)` e mostrava o toast de erro. **Nada era enviado ao banco.**

Dois agravantes corrigidos de passagem:

| Problema | Correção |
|---|---|
| Fallback do update usava **e-mail** como identificador, coluna sem índice único → podia não achar ninguém ou atualizar várias linhas | Fallback passa a usar **`uid`** (`UNIQUE NOT NULL`); e-mail virou campo alterável, não identificador |
| `Cargo` e `Instituição` eram `select` livres → usuário podia se promover a Diretor sozinho | Esses campos agora entram na fila de aprovação |

### 29.2 Duas vias (regra pedida)

| Campo | Via | Quando vale |
|---|---|---|
| Foto de perfil | livre | na hora |
| Telefone para contato | livre | na hora |
| Nome, e-mail, CPF, data de nascimento, gênero, instituição, cargo | **aprovação de ADM** | depois da confirmação |

- `src/lib/profileChangeService.ts` (novo) concentra a regra: `CAMPOS_COM_APROVACAO`, `CAMPOS_LIVRES`, `calcularAlteracoes` (diff real, ignorando o que não mudou), `separarAlteracoes`, `salvarCamposLivres`, `criarSolicitacaoDePerfil`, `aprovarSolicitacaoDePerfil`, `rejeitarSolicitacaoDePerfil`.
- `handleUpdateProfile` agora usa Supabase direto, aplica só o que mudou e dá feedback honesto: uma mensagem por via, nunca "tudo salvo" pela metade. Em erro, o formulário **continua aberto** com o que foi digitado.
- `Settings`: aviso no topo do formulário + selo **"imediato"** em foto/telefone e **"requer ADM"** nos demais campos; botão vira "Enviando..." e fica desabilitado durante o envio.

### 29.3 Painel ADM: nova aba "Alterações de perfil"

`src/components/ProfileChangesTab.tsx` lista as solicitações com filtro **Pendentes / Aprovadas / Rejeitadas**, mostra o **diff campo a campo (antes → depois)**, autor e data, e oferece **Aprovar** (aplica no perfil e recarrega o diretório) ou **Rejeitar** (pede motivo, arquiva, sem tocar no perfil). Botões visíveis apenas para Chefe ADM e Funcionário ADM.

Aprovação é **atômica**: a solicitação é reivindicada com `status = pending` no `WHERE` (evita aprovação dupla em duas abas); se a escrita no perfil falhar, a solicitação volta para `pending` — o pedido nunca se perde.

### 29.4 Banco

Nova tabela **`public.profile_change_requests`** (id, user_id, user_uid, user_nome, requested_changes jsonb, previous_values jsonb, status, created_at, reviewed_at, reviewed_by, rejection_reason), 2 índices, RLS ligado e 3 policies. Migração versionada em `supabase/migrations/20261118_profile_change_requests.sql` (idempotente).

### 29.5 Validação

| Suíte | Resultado |
|---|---|
| `test-round25.mjs` (novo, regras e contrato) | **44/44** |
| `test-round25-render.mjs` (novo, render real) | **10/10** |
| `test-round25-integration.mjs` (novo, banco real) | auto-ignorado no sandbox (sem rede a `*.supabase.co`); rodar localmente |
| `24` / `23` / `22` / `21` / `20` / `19` / `18` / `18-mobile` | 40 · 142 · 27 · 41 · 35 · 32 · 50 · 21 |
| `17` / `16` / `14` / `13` / `12`s / `11` | 49 · 39 · 36 · 31 · 32+18+21 · 64 |
| `tsc --noEmit` / `npm run build` | 0 erros / ok (6,12 s) |

---

## 30. Rodada 26 — mural de eventos, links da IA e ficha da escola

Três pedidos: (1) o mural de eventos do painel com o desenho de referência;
(2) verificar a busca de links das sugestões da IA; (3) ver e editar o perfil
da escola na área de contas escolares.

### 30.1 Mural de eventos (aba Eventos do painel)

- **Grade elástica**: `repeat(auto-fill, minmax(min(100%, 17.5rem), 1fr))` no lugar
  de `grid-cols-1 md:2 lg:3 2xl:4`. Os cards passam a ocupar a largura
  disponível (sem vazio à direita quando a lista é curta) e `min(100%, …)`
  impede rolagem horizontal no celular.
- Card no padrão de referência: imagem `h-32` com gradiente `from-black/70`,
  **Gratuito** verde no canto superior esquerdo, **data sobre a imagem** com
  ícone de calendário, **título em até 2 linhas com altura estável**,
  **cidade** com `MapPin` (antes repetia o endereço completo), e a faixa
  `Comunidade Escolar • Org: <escola>`.
- Rodapé: **Ver** (cinza) + **Autorizações** (verde, `ShieldCheck`) à esquerda,
  **Editar** (azul) + lixeira à direita; quem não pode editar vê o cadeado
  "Criado por outro admin".
- `city` vazio cai para a última parte do endereço (`cidadeDoEvento`);
  organizador vem de `schoolName` → `schoolRole` → escola de `schoolId`
  (`organizadorDoEvento`).

### 30.2 Busca de links das sugestões da IA — o bug real

A camada 1 (catálogo curado) comparava `entrada.padrao.test(titulo)` — **regex
sem acento contra o título com acento**. "Olimpíada Brasileira de **Física**",
"de **Astronomia**", "de **Informática**", "**História**" nunca casavam; sobrava
a camada 2, a Instant Answer API do DuckDuckGo, que responde para quase nenhum
termo. Resultado: quase todo evento caía em "nenhum link encontrado".

Medição antes/depois com 11 títulos reais: **3 acertos → 11 acertos**.

- `normalizar()` agora remove acento, pontuação e colapsa espaços.
- `casarPadrao()` testa o padrão contra o título original **e** normalizado
  (siglas entre parênteses como `(OBF)` também entram).
- Camada 2 passou a **pontuar** os candidatos (`pontuarCandidato`) pela
  semelhança entre as palavras do título e os pedaços do domínio, com bônus para
  siglas curtas e para `.org/.edu/.gov.br`. Só aceita candidato com relevância
  mínima — resultado irrelevante é pior que nenhum.
- Quando não há link, o resultado traz **`termoBusca`** e a interface mostra
  **"Procurar na web"** (uma busca no Google, nunca uma URL de evento
  inventada). A regra herdada **"nunca inventar URL" continua valendo**.

### 30.3 Contas escola: ver perfil e editar informações

- Novo `src/lib/schoolProfilesService.ts`: `carregarEscolas`, `salvarPerfilEscola`
  (upsert por `slug`), `mesclarPerfil` (campo vazio no banco **não** apaga o dado
  estático), `paraEditavel` e as listas de campos do formulário.
- Novo `src/components/SchoolProfileModal.tsx`: ficha completa (brasão, nome,
  tipo, rede, NRE, endereço, CEP, bairro, cidade/UF, telefone, e-mail,
  coordenadas, modalidades, destaques, infraestrutura, histórico, fonte) com
  **modo edição** somente para o Chefe Administrador; listas editadas item a
  item; rolagem no corpo com teto `max-h-[92dvh]` (sem scroll duplo).
- Na ficha da conta escolar entraram os botões **Ver perfil** e **Editar**
  (o segundo já abre no formulário).
- A edição **chega ao aluno**: `App.tsx` carrega `carregarEscolas()` e passa a
  lista mesclada para `SchoolsCatalog` e para o detalhe da escola.
- Banco: tabela **`public.school_profiles`** (migração
  `supabase/migrations/20261119_school_profiles.sql`, idempotente), 1 índice,
  RLS ligado e 3 policies (leitura pública; escrita pela interface do painel).

### 30.4 Validação

| Suíte | Resultado |
|---|---|
| `test-round26.mjs` (novo) | **84/84** |
| `test-round26-render.mjs` (novo, jsdom: leitura, edição, permissão) | **21/21** |
| `25-render` / `25` / `24` / `23` / `22` | 10 · 44 · 40 · 142 · 27 |
| `21` / `20` / `19` / `18`+`18-mobile` / `17` | 41 · 35 · 32 · 50+21 · 49 |
| `16` / `14` / `13` / `12`+`12b`+`12c` / `11` | 39 · 36 · 31 · 32+18+21 · 64 |
| `tsc --noEmit` / `npm run build` | 0 erros / ok |

**Como verificar à mão:** painel → aba **Eventos** (cards com imagem, selo
Gratuito, data sobre a imagem, cidade, faixa da escola e os quatro botões) →
aba **Contas escolares** → **Ver perfil** (ficha só leitura) → **Editar** →
trocar telefone → **Salvar informações** → abrir a aba **Escolas** do app do
aluno e conferir o telefone novo. Na aba **Sugestões**, "Buscar links de
inscrição" agora resolve as olimpíadas pelo catálogo e mostra **Procurar na
web** quando não houver site oficial.
