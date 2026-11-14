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
