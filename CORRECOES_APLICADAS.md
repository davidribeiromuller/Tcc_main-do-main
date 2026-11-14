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
