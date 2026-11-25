/**
 * Diretório de usuários — fonte de verdade em produção.
 *
 * HISTÓRICO DO PROBLEMA (rodada 39, relatado pelo autor do TCC):
 *
 *   "entre com conta adm, e não apareceu [o painel]"
 *
 * O painel abria, mas com um diretório que não era o do Supabase. A causa:
 * `src/db/users.ts` falava Postgres/Drizzle e, quando não havia
 * `DATABASE_URL` (o caso do deploy, que usa Supabase via REST), caía em
 * `fallbackStore` — um JSON local com 5 usuários de demonstração. Então:
 *
 *   - o painel listava "Diretoria Helena Wysocki" com id 9901 e senha
 *     `senha123`, que NÃO são os dados do banco (lá o id é 2);
 *   - qualquer alteração feita no painel era gravada no JSON do processo e
 *     desaparecia no próximo deploy (o contêiner é imutável);
 *   - o registro `/api/admin/audit` e as sugestões respondiam 503 porque só
 *     existiam no Supabase.
 *
 * Este módulo inverte a ordem: **Supabase primeiro** quando a chave de
 * serviço existe (é o ambiente de produção), e o Postgres/Drizzle/JSON fica
 * como alternativa para quem roda o banco local.
 *
 * Ele também é o único lugar que decide "onde ficam os usuários", para que
 * `users.ts`, `server.ts` e os middlewares não repitam a regra.
 */
import { getSaasAdminClient, isSaasBackendConfigured } from "../lib/saasStore.ts";
import type { User } from "../types.ts";

/**
 * Erro de indisponibilidade do banco.
 *
 * Sem esta distinção, uma falha de rede do servidor até o Supabase chegava ao
 * login como `TypeError: fetch failed` dentro de um 500 — texto de programador
 * numa tela de usuário. Quem chama traduz este erro em 503 + código
 * `SAAS_UNREACHABLE`, que é o contrato já usado pelas outras rotas SaaS.
 */
export class ErroBancoIndisponivel extends Error {
  readonly code = "SAAS_UNREACHABLE";
  constructor(causa: string) {
    super(
      "O banco de dados não respondeu. Verifique se o projeto Supabase está ativo e se o " +
        `servidor tem saída de rede até ele. (${causa})`
    );
    this.name = "ErroBancoIndisponivel";
  }
}

const PADRAO_REDE = /fetch failed|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNREFUSED|network|socket|other side closed/i;

/**
 * Traduz uma falha de consulta no erro certo.
 *
 * São DOIS caminhos, e é preciso cobrir os dois: o `supabase-js` às vezes
 * rejeita a promise (DNS, TLS) e às vezes **resolve** com `{ error }` —
 * quando ele mesmo captura a falha de `fetch`. Na primeira versão eu só
 * tratava a rejeição, e o login continuou devolvendo 500 com
 * "TypeError: fetch failed" dentro do texto.
 */
function erroDeConsulta(causa: any, contexto: string): Error {
  const msg = String(causa?.message || causa || "");
  if (PADRAO_REDE.test(msg)) return new ErroBancoIndisponivel(`${contexto}: ${msg}`);
  return new Error(`Falha ao ${contexto} no Supabase: ${msg}`);
}

function traduzirFalha(erro: any, contexto: string): never {
  const msg = String(erro?.message || erro || "");
  throw PADRAO_REDE.test(msg) ? new ErroBancoIndisponivel(`${contexto}: ${msg}`) : erro;
}

/** `true` quando o Supabase é a fonte de verdade do diretório de usuários. */
export function usaSupabaseComoFonte(): boolean {
  return isSaasBackendConfigured();
}

/**
 * Linha crua de `users` → objeto do app.
 *
 * Mantido no mesmo formato que `src/lib/usersService.ts#mapSupabaseUserToUser`
 * devolve, para que o painel receba os mesmos nomes de campo venha a linha de
 * onde vier (Supabase aqui, Drizzle no caminho local).
 */
function mapearLinha(row: any): User {
  const isDiretor = row.role === "Diretor" || row.is_admin === true || row.isAdmin === true;
  const idNumerico =
    typeof row.id === "number" ? row.id : parseInt(String(row.id), 10) || Date.now();

  return {
    id: idNumerico,
    uid: row.uid || `user-${idNumerico}`,
    nome: row.nome || (row.email ? String(row.email).split("@")[0] : "Usuário Escolar"),
    email: String(row.email || "").trim(),
    role: row.role || (isDiretor ? "Diretor" : "Aluno"),
    isAdmin: isDiretor,
    ativo: row.ativo !== false,
    foto_perfil: row.foto_perfil || "",
    provider: row.provider || "local",
    cpf: row.cpf || undefined,
    phone: row.phone || undefined,
    birthdate: row.birthdate || undefined,
    gender: row.gender || undefined,
    institution: row.institution || undefined,
    matricula: row.matricula || undefined,
    personalEmail: row.personal_email || undefined,
    mustChangePassword: row.must_change_password === true,
    linkVerifiedAt: row.link_verified_at || undefined,
    password: row.password || undefined,
    lastActiveAt: row.last_active_at || row.updated_at || row.created_at || undefined,
    lastLogin: row.last_login || row.created_at || undefined,
    createdAt: row.created_at || undefined,
    updatedAt: row.updated_at || undefined,
  } as User;
}

/** Todas as linhas de `users` no Supabase (ordem estável por id). */
export async function listarUsuariosDoSupabase(): Promise<User[] | null> {
  const cliente = getSaasAdminClient();
  if (!cliente) return null;

  const { data, error } = await cliente
    .from("users")
    .select("*")
    .order("id", { ascending: true })
    .then((r) => r, (e) => traduzirFalha(e, "listar usuários"));
  if (error) {
    /*
      Não engolimos o erro: devolver `[]` aqui é o que fazia o painel parecer
      vazio "de verdade". Quem chama decide mostrar a falha.
    */
    throw erroDeConsulta(error, "listar usuários");
  }
  return (data || []).map(mapearLinha);
}

/** Localiza uma conta do diretório por e-mail (comparação sem caixa). */
export async function buscarUsuarioNoSupabasePorEmail(email: string): Promise<User | null> {
  const cliente = getSaasAdminClient();
  if (!cliente) return null;

  const limpo = (email || "").trim().toLowerCase();
  if (!limpo) return null;

  const { data, error } = await cliente
    .from("users")
    .select("*")
    .ilike("email", limpo)
    .limit(1)
    .then((r) => r, (e) => traduzirFalha(e, "buscar por e-mail"));

  if (error) {
    throw erroDeConsulta(error, "buscar usuário");
  }
  const linha = (data || [])[0];
  return linha ? mapearLinha(linha) : null;
}

/** Localiza uma conta do diretório por `uid`. */
export async function buscarUsuarioNoSupabasePorUid(uid: string): Promise<User | null> {
  const cliente = getSaasAdminClient();
  if (!cliente || !uid) return null;

  const { data, error } = await cliente
    .from("users")
    .select("*")
    .eq("uid", uid)
    .limit(1)
    .then((r) => r, (e) => traduzirFalha(e, "buscar por uid"));
  if (error) {
    throw erroDeConsulta(error, "buscar usuário");
  }
  const linha = (data || [])[0];
  return linha ? mapearLinha(linha) : null;
}

/** Localiza uma conta do diretório por id numérico. */
export async function buscarUsuarioNoSupabasePorId(id: number): Promise<User | null> {
  const cliente = getSaasAdminClient();
  if (!cliente || !Number.isFinite(id)) return null;

  const { data, error } = await cliente
    .from("users")
    .select("*")
    .eq("id", id)
    .limit(1)
    .then((r) => r, (e) => traduzirFalha(e, "buscar por id"));
  if (error) {
    throw erroDeConsulta(error, "buscar usuário");
  }
  const linha = (data || [])[0];
  return linha ? mapearLinha(linha) : null;
}

/**
 * Atualiza uma conta do diretório no Supabase.
 *
 * Só as colunas conhecidas passam — o painel envia objetos com campos de
 * interface (`isAdmin`, `createdAt`…) que não existem na tabela. Mandá-los
 * crus faria o PostgREST recusar a requisição inteira.
 */
export async function atualizarUsuarioNoSupabase(
  idOuEmail: number | string,
  dados: Partial<User> & Record<string, any>
): Promise<User | null> {
  const cliente = getSaasAdminClient();
  if (!cliente) return null;

  const atualizacao: Record<string, any> = {};
  const mapa: Record<string, string> = {
    nome: "nome",
    email: "email",
    role: "role",
    ativo: "ativo",
    foto_perfil: "foto_perfil",
    provider: "provider",
    cpf: "cpf",
    phone: "phone",
    birthdate: "birthdate",
    gender: "gender",
    institution: "institution",
    matricula: "matricula",
    personal_email: "personal_email",
    must_change_password: "must_change_password",
    password: "password",
  };

  for (const [chaveApp, coluna] of Object.entries(mapa)) {
    if (dados[chaveApp] !== undefined) atualizacao[coluna] = dados[chaveApp];
  }
  // `isAdmin` é o nome de interface; a coluna real é `is_admin`.
  if (dados.isAdmin !== undefined) atualizacao.is_admin = Boolean(dados.isAdmin);
  if (dados.is_admin !== undefined) atualizacao.is_admin = Boolean(dados.is_admin);

  if (Object.keys(atualizacao).length === 0) return null;
  atualizacao.updated_at = new Date().toISOString();

  let consulta = cliente.from("users").update(atualizacao);
  consulta =
    typeof idOuEmail === "number"
      ? consulta.eq("id", idOuEmail)
      : consulta.ilike("email", String(idOuEmail).trim().toLowerCase());

  const { data, error } = await consulta
    .select()
    .then((r) => r, (e) => traduzirFalha(e, "atualizar usuário"));
  if (error) {
    throw erroDeConsulta(error, "atualizar usuário");
  }
  const linha = (data || [])[0];
  return linha ? mapearLinha(linha) : null;
}

/**
 * Cria uma conta no diretório do Supabase.
 *
 * Chamado por `getOrCreateUser` (login Google e cadastro público). Antes,
 * essas rotas escalavam até o `fallbackStore` e a conta nascia no JSON local
 * do processo: o usuário "criava a conta", entrava, e no deploy seguinte ela
 * não existia mais. Em produção, criar usuário tem que criar linha em `users`.
 */
export async function criarUsuarioNoSupabase(
  dados: Partial<User> & Record<string, any>
): Promise<User | null> {
  const cliente = getSaasAdminClient();
  if (!cliente) return null;

  const linha: Record<string, any> = {
    uid: dados.uid,
    nome: dados.nome || String(dados.email || "").split("@")[0],
    email: String(dados.email || "").trim().toLowerCase(),
    role: dados.role || "Aluno",
    ativo: dados.ativo !== false,
    is_admin: Boolean(dados.isAdmin ?? dados.is_admin ?? false),
    foto_perfil: dados.foto_perfil || "",
    provider: dados.provider || "local",
    cpf: dados.cpf || null,
    phone: dados.phone || null,
    birthdate: dados.birthdate || null,
    gender: dados.gender || null,
    institution: dados.institution || null,
    matricula: dados.matricula || null,
    personal_email: dados.personal_email || null,
    must_change_password: dados.must_change_password === true,
    password: dados.password || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await cliente
    .from("users")
    .insert(linha)
    .select()
    .then(
      (r) => r,
      (e) => traduzirFalha(e, "criar usuário")
    );

  if (error) {
    throw erroDeConsulta(error, "criar usuário");
  }
  const criada = (data || [])[0];
  return criada ? mapearLinha(criada) : null;
}
