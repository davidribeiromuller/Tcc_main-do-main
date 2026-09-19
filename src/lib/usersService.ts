import { getSupabaseClient, isSupabaseConfigured } from "./supabase.ts";
import { User } from "../types.ts";

/**
 * Converte um registro da tabela 'users' do Supabase para a interface User do frontend.
 */
export function mapSupabaseUserToUser(row: any): User {
  const isDiretor =
    row.role === "Diretor" ||
    row.is_admin === true ||
    row.isAdmin === true ||
    (typeof row.email === "string" && row.email.toLowerCase() === "diretoria@helenawysocki.com");

  const rawId = row.id;
  const numericId = typeof rawId === "number" ? rawId : parseInt(String(rawId), 10) || Date.now();

  return {
    id: numericId,
    uid: row.uid || `user-${numericId}`,
    nome: row.nome || (row.email ? row.email.split("@")[0].replace(/[._]/g, " ") : "Usuário Escolar"),
    email: (row.email || "").trim(),
    role: row.role || (isDiretor ? "Diretor" : "Aluno"),
    isAdmin: isDiretor,
    ativo: row.ativo !== false,
    foto_perfil: row.foto_perfil || "",
    provider: row.provider || "local",
    cpf: row.cpf || undefined,
    phone: row.phone || undefined,
    birthdate: row.birthdate || undefined,
    gender: row.gender || undefined,
    institution: row.institution || "Escola estadual Helena Wysocki",
    password: row.password || undefined,
    lastActiveAt: row.last_active_at || row.lastActiveAt || row.updated_at || row.created_at || new Date().toISOString(),
    lastLogin: row.last_login || row.lastLogin || row.created_at || new Date().toISOString(),
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString(),
  };
}

/**
 * Busca TODOS os usuários diretamente da tabela 'users' do Supabase.
 * Nunca utiliza usuários fictícios/mockados quando o banco estiver conectado.
 */
export async function fetchUsersDirectFromSupabase(): Promise<{ users: User[]; error: any }> {
  if (!isSupabaseConfigured()) {
    return {
      users: [],
      error: new Error("Supabase não configurado no cliente"),
    };
  }

  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, uid, nome, email, foto_perfil, provider, role, ativo, is_admin, cpf, phone, birthdate, gender, institution, last_active_at, last_login, created_at, updated_at")
      .order("id", { ascending: true });

    if (error) {
      console.warn("[usersService] Erro ao consultar tabela 'users':", error);
      return { users: [], error };
    }

    if (data && Array.isArray(data)) {
      const mappedUsers = data.map(mapSupabaseUserToUser);
      return { users: mappedUsers, error: null };
    }

    return { users: [], error: null };
  } catch (err: any) {
    console.error("[usersService] Exceção ao consultar tabela 'users':", err);
    return { users: [], error: err };
  }
}

/**
 * Atualiza os dados ou permissões de um usuário diretamente no Supabase.
 */
export async function updateUserDirectInSupabase(
  userId: number,
  updateData: Partial<User>
): Promise<{ user: User | null; error: any }> {
  if (!isSupabaseConfigured()) {
    return { user: null, error: new Error("Supabase não configurado") };
  }

  const supabase = getSupabaseClient();

  const payload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (updateData.role !== undefined) payload.role = updateData.role;
  if (updateData.isAdmin !== undefined) payload.is_admin = Boolean(updateData.isAdmin);
  if ((updateData as any).is_admin !== undefined) payload.is_admin = Boolean((updateData as any).is_admin);
  if (updateData.ativo !== undefined) payload.ativo = Boolean(updateData.ativo);
  if (updateData.nome !== undefined) payload.nome = updateData.nome.trim();
  if (updateData.email !== undefined) payload.email = updateData.email.trim();
  if (updateData.foto_perfil !== undefined) payload.foto_perfil = updateData.foto_perfil;
  if (updateData.cpf !== undefined) payload.cpf = updateData.cpf;
  if (updateData.phone !== undefined) payload.phone = updateData.phone;
  if (updateData.birthdate !== undefined) payload.birthdate = updateData.birthdate;
  if (updateData.gender !== undefined) payload.gender = updateData.gender;
  if (updateData.institution !== undefined) payload.institution = updateData.institution;
  if (updateData.lastActiveAt !== undefined) payload.last_active_at = updateData.lastActiveAt;

  try {
    let query = supabase.from("users").update(payload).eq("id", userId).select();
    const { data, error } = await query;

    if (error) {
      console.warn("[usersService] Erro ao atualizar por ID:", error);
      // Tentativa por email caso o id seja divergente
      if (updateData.email) {
        const { data: retryData, error: retryErr } = await supabase
          .from("users")
          .update(payload)
          .ilike("email", updateData.email.trim().toLowerCase())
          .select();

        if (!retryErr && retryData && retryData.length > 0) {
          return { user: mapSupabaseUserToUser(retryData[0]), error: null };
        }
      }
      return { user: null, error };
    }

    if (data && data.length > 0) {
      return { user: mapSupabaseUserToUser(data[0]), error: null };
    }

    return { user: null, error: new Error("Usuário não encontrado no banco") };
  } catch (err: any) {
    console.error("[usersService] Exceção ao atualizar usuário:", err);
    return { user: null, error: err };
  }
}

/**
 * Bloqueia um usuário (soft delete: ativo = false).
 */
export async function softDeleteUserDirectInSupabase(
  userId: number,
  email?: string
): Promise<{ success: boolean; error: any }> {
  const result = await updateUserDirectInSupabase(userId, {
    ativo: false,
    email: email,
  });
  return { success: !result.error, error: result.error };
}

/**
 * Desbloqueia um usuário (ativo = true).
 */
export async function unblockUserDirectInSupabase(
  userId: number,
  email?: string
): Promise<{ success: boolean; error: any }> {
  const result = await updateUserDirectInSupabase(userId, {
    ativo: true,
    email: email,
  });
  return { success: !result.error, error: result.error };
}

/**
 * Exclui definitivamente um usuário do banco de dados (DELETE).
 */
export async function permanentDeleteUserDirectInSupabase(
  userId: number,
  email?: string
): Promise<{ success: boolean; error: any }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: new Error("Supabase não configurado") };
  }

  const supabase = getSupabaseClient();

  try {
    const { error } = await supabase.from("users").delete().eq("id", userId);
    if (error && email) {
      const { error: retryErr } = await supabase.from("users").delete().ilike("email", email.trim().toLowerCase());
      if (retryErr) return { success: false, error: retryErr };
    } else if (error) {
      return { success: false, error };
    }
    return { success: true, error: null };
  } catch (err: any) {
    console.error("[usersService] Exceção ao excluir permanentemente:", err);
    return { success: false, error: err };
  }
}

/**
 * Busca usuário por e-mail no Supabase (case-insensitive).
 */
export async function findUserByEmailDirectInSupabase(email: string): Promise<User | null> {
  if (!isSupabaseConfigured() || !email) return null;

  const supabase = getSupabaseClient();
  try {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .ilike("email", email.trim().toLowerCase())
      .limit(1);

    if (error || !data || data.length === 0) return null;
    return mapSupabaseUserToUser(data[0]);
  } catch (err) {
    console.warn("[usersService] Erro ao buscar usuário por email:", err);
    return null;
  }
}

/**
 * Realiza autenticação local diretamente no Supabase por e-mail e senha.
 */
export async function authenticateUserDirectInSupabase(
  email: string,
  password?: string
): Promise<{ user: User | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { user: null, error: "Configuração do Supabase não inicializada." };
  }

  const cleanEmail = email.trim().toLowerCase();
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .ilike("email", cleanEmail)
      .limit(1);

    if (error) {
      console.warn("[usersService] Erro ao autenticar no Supabase:", error);
      return { user: null, error: "Erro de conexão ao consultar banco de dados." };
    }

    if (!data || data.length === 0) {
      return { user: null, error: "Usuário não encontrado no diretório escolar." };
    }

    const row = data[0];

    // Verificar se a conta está ativa
    if (row.ativo === false) {
      return { user: null, error: "Sua conta escolar está desativada ou bloqueada pela diretoria." };
    }

    // Verificar senha se o usuário tiver senha cadastrada
    if (row.password && password && row.password !== password) {
      return { user: null, error: "Credenciais inválidas. Verifique seu e-mail e a senha digitada." };
    }

    // Atualizar último acesso e atividade
    const nowIso = new Date().toISOString();
    try {
      await supabase
        .from("users")
        .update({
          last_login: nowIso,
          last_active_at: nowIso,
        })
        .eq("id", row.id);
    } catch (_) {}

    const mappedUser = mapSupabaseUserToUser({
      ...row,
      last_login: nowIso,
      last_active_at: nowIso,
    });

    return { user: mappedUser, error: null };
  } catch (err: any) {
    console.error("[usersService] Exceção ao autenticar:", err);
    return { user: null, error: err?.message || "Erro inesperado ao autenticar." };
  }
}

/**
 * Cria um novo usuário diretamente no Supabase (Cadastro escolar).
 */
export async function registerUserDirectInSupabase(
  userData: Partial<User> & { email: string; password?: string; nome: string }
): Promise<{ user: User | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { user: null, error: "Supabase não configurado." };
  }

  const cleanEmail = userData.email.trim().toLowerCase();
  const supabase = getSupabaseClient();

  try {
    // 1. Verificar se já existe
    const existing = await findUserByEmailDirectInSupabase(cleanEmail);
    if (existing) {
      return { user: null, error: "Este e-mail já está cadastrado no sistema escolar." };
    }

    const isDirector =
      userData.role === "Diretor" ||
      cleanEmail === "diretoria@helenawysocki.com";

    const insertRow: Record<string, any> = {
      uid: userData.uid || `local-uid-${Math.floor(Math.random() * 88888 + 10000)}`,
      nome: userData.nome.trim(),
      email: cleanEmail,
      password: userData.password || "123456",
      foto_perfil: userData.foto_perfil || "",
      provider: userData.provider || "local",
      role: userData.role || (isDirector ? "Diretor" : "Aluno"),
      ativo: true,
      is_admin: isDirector,
      cpf: userData.cpf || null,
      phone: userData.phone || null,
      birthdate: userData.birthdate || null,
      gender: userData.gender || null,
      institution: userData.institution || "Escola estadual Helena Wysocki",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_login: new Date().toISOString(),
      last_active_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from("users").insert([insertRow]).select();

    if (error) {
      console.error("[usersService] Erro ao inserir novo usuário:", error);
      return { user: null, error: "Erro ao gravar dados no banco: " + error.message };
    }

    if (data && data.length > 0) {
      return { user: mapSupabaseUserToUser(data[0]), error: null };
    }

    return { user: null, error: "Falha ao confirmar inserção no banco de dados." };
  } catch (err: any) {
    console.error("[usersService] Exceção ao registrar usuário:", err);
    return { user: null, error: err?.message || "Erro inesperado ao registrar usuário." };
  }
}

/**
 * Sincroniza um usuário do Google OAuth diretamente com a tabela 'users' do Supabase.
 * Se já existir, atualiza last_login e foto, preservando o role e status do banco.
 * Se não existir, cadastra no banco.
 */
export async function syncOAuthUserDirectInSupabase(oauthUser: {
  email: string;
  nome: string;
  foto_perfil?: string;
  uid: string;
}): Promise<{ user: User; error: any }> {
  const cleanEmail = oauthUser.email.trim().toLowerCase();
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();

  try {
    const existing = await findUserByEmailDirectInSupabase(cleanEmail);

    if (existing) {
      // Usuário já cadastrado no banco: manter sua role e status do banco!
      const updatePayload: Record<string, any> = {
        last_login: nowIso,
        last_active_at: nowIso,
        updated_at: nowIso,
      };
      if (oauthUser.foto_perfil && !existing.foto_perfil) {
        updatePayload.foto_perfil = oauthUser.foto_perfil;
      }
      if (oauthUser.uid && (!existing.uid || existing.uid.startsWith("local-"))) {
        updatePayload.uid = oauthUser.uid;
      }

      await supabase.from("users").update(updatePayload).eq("id", existing.id);

      return {
        user: {
          ...existing,
          foto_perfil: oauthUser.foto_perfil || existing.foto_perfil,
          lastLogin: nowIso,
          lastActiveAt: nowIso,
        },
        error: null,
      };
    }

    // Usuário novo autenticado via Google
    const isDirector = cleanEmail === "diretoria@helenawysocki.com" || cleanEmail.includes("diretor");
    const insertRow: Record<string, any> = {
      uid: oauthUser.uid || `google-${Date.now()}`,
      nome: oauthUser.nome,
      email: cleanEmail,
      foto_perfil: oauthUser.foto_perfil || "",
      provider: "google",
      role: isDirector ? "Diretor" : "Aluno",
      ativo: true,
      is_admin: isDirector,
      institution: "Escola estadual Helena Wysocki",
      created_at: nowIso,
      updated_at: nowIso,
      last_login: nowIso,
      last_active_at: nowIso,
    };

    const { data, error } = await supabase.from("users").insert([insertRow]).select();

    if (error || !data || data.length === 0) {
      console.warn("[usersService] Aviso ao criar usuário Google no banco:", error);
      return {
        user: mapSupabaseUserToUser({ id: Date.now(), ...insertRow }),
        error,
      };
    }

    return { user: mapSupabaseUserToUser(data[0]), error: null };
  } catch (err: any) {
    console.error("[usersService] Exceção ao sincronizar usuário OAuth:", err);
    return {
      user: mapSupabaseUserToUser({
        id: Date.now(),
        email: cleanEmail,
        nome: oauthUser.nome,
        foto_perfil: oauthUser.foto_perfil,
        uid: oauthUser.uid,
        role: "Aluno",
        ativo: true,
        is_admin: false,
      }),
      error: err,
    };
  }
}

/**
 * Atualiza o timestamp de atividade recente (heartbeat) do usuário no banco.
 */
export async function heartbeatUserDirectInSupabase(userIdOrEmail: number | string): Promise<void> {
  if (!isSupabaseConfigured() || !userIdOrEmail) return;

  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();

  try {
    if (typeof userIdOrEmail === "number") {
      await supabase.from("users").update({ last_active_at: nowIso }).eq("id", userIdOrEmail);
    } else {
      await supabase.from("users").update({ last_active_at: nowIso }).ilike("email", String(userIdOrEmail).trim().toLowerCase());
    }
  } catch (_) {}
}
