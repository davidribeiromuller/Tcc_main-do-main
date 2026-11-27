# Comunicados e cancelamento de eventos

Duas funcionalidades independentes do módulo comercial, entregues na rodada 46.

## 1. Cancelar evento

### Por que cancelar é diferente de excluir

Excluir apaga o registro. Quem já tinha se inscrito abre o evento e encontra
nada — não descobre que foi cancelado, nem por quê. Cancelar mantém o evento
visível, marcado, com o motivo escrito.

### Onde está

- **Tela do evento** (`EventDetail`): botão **Cancelar** (âmbar) ao lado de
  Editar e Excluir, visível para quem pode editar o evento.
- O modal pede o motivo (opcional, mas recomendado).
- Depois de cancelado, a tela mostra uma faixa no topo:
  "Este evento foi cancelado" + o motivo + o botão **Reativar evento**.

### Como é gravado

`status = 'canceled'` nas tabelas `events` **e** `eventos` (o banco tem as duas
em paralelo). O motivo vai anexado ao final de `requirements`, na forma
`CANCELADO: <motivo>`. Não foi necessária migration: `requirements` já existe
nas duas tabelas e é texto livre.

Reativar volta `status = 'ativo'`.

### Limitação conhecida

O cancelamento é aplicado onde o evento está gravado. Eventos que existem
apenas no catálogo local (`localEventCatalog.ts`) não têm linha no banco e
portanto não podem ser cancelados — a operação devolve "nenhum evento com id X
foi encontrado", em vez de fingir sucesso.

## 2. Comunicados

### O problema que existia

`schoolNewsStore.ts` gravava comunicado **só em `localStorage`**. Consequências:

1. Publicar um comunicado mostrava o aviso **apenas no aparelho de quem
   publicou**. Nenhum aluno, nenhum outro professor via.
2. O POST ia para `/api/school-portal/:id/news`, rota que **não existe** no
   GitHub Pages (hospedagem estática). O servidor devolvia o `index.html` com
   status 200 e o `res.json()` estourava — era a origem do alerta
   "Não foi possível carregar as informações".
3. "Comunicado para todas as escolas" era impossível por construção: não havia
   onde guardar um comunicado que não pertencesse a uma escola.

### Como funciona agora

| Tabela | Papel |
|---|---|
| `school_announcements` | o comunicado |
| `announcement_notifications` | a notificação por público |

`school_id` **nulo** significa comunicado **global** — aparece em todas as
escolas e na aba "Comunicados da rede".

**Público-alvo** (`audience`), escolhido no formulário em "Notificar":

- `all` — todos, inclusive visitantes sem conta
- `students` — alunos
- `staff` — funcionários e professores
- `families` — responsáveis e famílias
- `admins` — direção e administração

### Prazo de vida

Regra do produto: **2 dias**, configurável.

- O prazo conta a partir da **publicação** quando o comunicado é avulso.
- Conta a partir do **encerramento do evento** quando o comunicado está ligado
  a um evento (`event_ends_at`). Um aviso sobre a feira de ciências não deve
  sumir antes de a feira acontecer.
- `expires_at = null` significa "não expira".

Quando vence, `expirar_comunicados()` muda `status` para `deleted`. **Nada é
apagado fisicamente** — o histórico e a auditoria ficam preservados.

```sql
select public.expirar_comunicados();
```

Para agendar diariamente:

```sql
select cron.schedule(
  'expirar-comunicados',
  '0 4 * * *',
  $$ select public.expirar_comunicados(); $$
);
```

### Onde aparece

- **Portal da escola** (`/escolas/:slug`): comunicados da escola + os globais.
- **Escolas → aba "Comunicados da rede"**: comunicados globais e de todas as
  escolas, com a origem marcada, filtro "Só os gerais" e a data de expiração.

### Permissões

`anon` pode **ler** comunicado publicado e não vencido. `anon` **não pode
escrever** — e a chave publicável está no bundle, então escrita liberada ali
significaria qualquer visitante publicando aviso em nome de uma escola.

A escrita passa pela Edge Function **`announcements-api`** (publicada, ACTIVE),
que usa a chave de serviço e decide a autorização no servidor:

| Ação | Quem pode |
|---|---|
| Publicar comunicado da escola | `school_admin` ou `school_staff` daquela escola |
| Publicar comunicado para toda a rede | proprietário (`PLATFORM_OWNER_EMAILS`) |
| Alterar / excluir | direção da escola do comunicado, ou o proprietário |
| Ler | qualquer pessoa (comunicado publicado e não vencido) |

Deploy:

```bash
supabase functions deploy announcements-api --no-verify-jwt
```

`verify_jwt=false` é necessário porque `/public` e `/publicar` autenticam
por conta própria (`auth.getUser`), e `/public` precisa funcionar sem login.

### Rotina de expiração

```bash
curl -X POST "https://jaoheenjltzzglfncgfq.supabase.co/functions/v1/announcements-api/lifecycle/expire" \
  -H "Authorization: Bearer <service_role>"
```

Para agendar diariamente:

```sql
select cron.schedule(
  'expirar-comunicados',
  '0 4 * * *',
  $$
    select net.http_post(
      url := 'https://jaoheenjltzzglfncgfq.supabase.co/functions/v1/announcements-api/lifecycle/expire',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $$
);
```

> A leitura já filtra vencidos, então sem o cron nada vaza — o cron apenas
> mantém o `status` do banco coerente.

## 3. Testes

`test-round46-comunicados-cancelamento.mjs` — 44 verificações.
Bateria completa: 29 suítes, 0 falhas.
