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
