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

> **Enquanto a tabela estiver vazia, ninguém consegue concluir o cadastro.** Se a
> migration ainda não tiver sido aplicada no ambiente, `verifyInstitutionalLink` devolve
> `skipped: true` e o cadastro segue só com a validação de campos — para não travar o TCC.

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
