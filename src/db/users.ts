import { db, isDbCachedOffline, markDbOffline, markDbOnline } from './index.ts';
import { users, events } from './schema.ts';
import { eq, sql } from 'drizzle-orm';
import {
  getOrCreateUserFallback,
  getUserByUidFallback,
  getUserByEmailFallback,
  updateUserByUidFallback,
  updateUserByIdFallback,
  listAllUsersFallback,
  deleteUserByIdFallback,
  blockUserByIdFallback,
  unblockUserByIdFallback
} from './fallbackStore.ts';

const handleQueryError = (opsName: string, error: any) => {
  const errMsg = String(error?.message || '').toLowerCase();
  const isConnError = errMsg.includes('timeout') || errMsg.includes('connection') || errMsg.includes('econnrefused') || errMsg.includes('terminated') || errMsg.includes('failed query');
  if (isConnError) {
    console.warn(`[Database Fallback] Postgres is unreachable during ${opsName} query. Serviced user request gracefully from local JSON store.`);
  } else {
    console.error(`Error in ${opsName} query, falling back to in-memory store:`, error);
  }
};

export async function getOrCreateUser(
  uid: string,
  email: string,
  nome?: string,
  fotoPerfil?: string,
  provider: string = 'google',
  role?: string,
  password?: string
) {
  if (isDbCachedOffline()) {
    return getOrCreateUserFallback(uid, email, nome, fotoPerfil, provider, role, password);
  }
  try {
    const cleanEmail = (email || '').trim().toLowerCase();

    // 1. Check if user already exists by UID
    const isDirector = cleanEmail === 'diretoria@helenawysocki.com' || cleanEmail === 'davidribeiromuller2009@gmail.com';
    const existingByUid = await getUserByUid(uid);
    if (existingByUid) {
      const updated = await updateUserByUid(uid, {
        email: cleanEmail || existingByUid.email,
        provider: provider || existingByUid.provider,
        ...(password ? { password } : {}),
        ...(fotoPerfil ? { foto_perfil: fotoPerfil } : {}),
        ...(nome ? { nome } : {}),
        role: isDirector ? 'Diretor' : existingByUid.role,
        isAdmin: isDirector || existingByUid.isAdmin,
        lastActiveAt: new Date(),
        lastLogin: new Date(),
      });
      markDbOnline();
      return updated || existingByUid;
    }

    // 2. Check if user already exists by Email (e.g. registered locally first, now logging in with Google)
    if (cleanEmail) {
      const existingByEmail = await getUserByEmail(cleanEmail);
      if (existingByEmail) {
        // Update user's UID and provider to match new login credentials
        const updated = await updateUserById(existingByEmail.id, {
          uid,
          provider,
          ...(password ? { password } : {}),
          ...(fotoPerfil ? { foto_perfil: fotoPerfil } : {}),
          ...(nome ? { nome } : {}),
          role: isDirector ? 'Diretor' : existingByEmail.role,
          isAdmin: isDirector || existingByEmail.isAdmin,
          lastActiveAt: new Date(),
          lastLogin: new Date(),
        });
        markDbOnline();
        return updated || existingByEmail;
      }
    }

    // 3. Otherwise, create a new user record
    const isFuncionario = cleanEmail === 'funcionario@helenawysocki.com';

    const defaultRole = isDirector ? 'Diretor' : (isFuncionario ? 'Funcionário' : (role || 'Aluno'));
    const isAdmin = isDirector;

    const result = await db.insert(users)
      .values({
        uid,
        email: cleanEmail,
        password,
        nome: nome || cleanEmail.split('@')[0],
        foto_perfil: fotoPerfil || '',
        provider,
        role: defaultRole,
        ativo: true,
        isAdmin: isAdmin,
        lastActiveAt: new Date(),
        lastLogin: new Date(),
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: cleanEmail,
          password: password !== undefined ? password : sql`password`,
          nome: sql`COALESCE(${users.nome}, ${nome || cleanEmail.split('@')[0]})`,
          foto_perfil: sql`COALESCE(${users.foto_perfil}, ${fotoPerfil || ''})`,
          role: isDirector ? 'Diretor' : (role === 'Diretor' ? 'Aluno' : sql`${users.role}`),
          isAdmin: isDirector,
          lastActiveAt: new Date(),
          lastLogin: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();

    const user = result[0];
    markDbOnline();
    return user;
  } catch (error) {
    handleQueryError('getOrCreateUser', error);
    markDbOffline();
    return getOrCreateUserFallback(uid, email, nome, fotoPerfil, provider, role, password);
  }
}

export async function getUserByUid(uid: string) {
  if (isDbCachedOffline()) {
    return getUserByUidFallback(uid);
  }
  try {
    const result = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    markDbOnline();
    return result[0] || null;
  } catch (error) {
    handleQueryError('getUserByUid', error);
    markDbOffline();
    return getUserByUidFallback(uid);
  }
}

export async function getUserByEmail(email: string) {
  const cleanEmail = (email || "").trim().toLowerCase();
  if (!cleanEmail) return null;
  if (isDbCachedOffline()) {
    return getUserByEmailFallback(cleanEmail);
  }
  try {
    const result = await db.select().from(users).where(sql`LOWER(${users.email}) = ${cleanEmail}`).limit(1);
    markDbOnline();
    return result[0] || null;
  } catch (error) {
    handleQueryError('getUserByEmail', error);
    markDbOffline();
    return getUserByEmailFallback(cleanEmail);
  }
}

export async function updateUserByUid(uid: string, data: any) {
  if (isDbCachedOffline()) {
    return updateUserByUidFallback(uid, data);
  }
  try {
    const updatedData = { ...data };
    if (data.role !== undefined) {
      const cleanRole = String(data.role).trim();
      const lower = cleanRole.toLowerCase();
      if (lower === 'diretor' || lower === 'chefe administrador' || lower === 'chefe admin') {
        updatedData.role = 'Diretor';
        if (data.isAdmin === undefined) updatedData.isAdmin = true;
      } else if (lower === 'funcionário' || lower === 'funcionario' || lower === 'funcionário administrador' || lower === 'funcionario administrador') {
        updatedData.role = 'Funcionário';
        if (data.isAdmin === undefined) updatedData.isAdmin = false;
      } else {
        updatedData.role = cleanRole;
        if (data.isAdmin === undefined) updatedData.isAdmin = false;
      }
    }
    const result = await db.update(users)
      .set({
        ...updatedData,
        updatedAt: new Date(),
      })
      .where(eq(users.uid, uid))
      .returning();
    markDbOnline();
    return result[0];
  } catch (error) {
    handleQueryError('updateUserByUid', error);
    markDbOffline();
    return updateUserByUidFallback(uid, data);
  }
}

export async function updateUserById(id: number, data: any) {
  const cleanEmail = data?.email ? String(data.email).trim().toLowerCase() : null;
  const isSafeInteger = Number.isInteger(id) && id > 0 && id <= 2147483647;

  if (isDbCachedOffline()) {
    return updateUserByIdFallback(id, data, cleanEmail);
  }
  try {
    const updatedData = { ...data };
    if (data.role !== undefined) {
      const cleanRole = String(data.role).trim();
      const lower = cleanRole.toLowerCase();
      if (lower === 'diretor' || lower === 'chefe administrador' || lower === 'chefe admin') {
        updatedData.role = 'Diretor';
        if (data.isAdmin === undefined) updatedData.isAdmin = true;
      } else if (lower === 'funcionário' || lower === 'funcionario' || lower === 'funcionário administrador' || lower === 'funcionario administrador') {
        updatedData.role = 'Funcionário';
        if (data.isAdmin === undefined) updatedData.isAdmin = false;
      } else {
        updatedData.role = cleanRole;
        if (data.isAdmin === undefined) updatedData.isAdmin = false;
      }
    }

    let updatedRecord: any = null;

    // 1. Tentar atualizar por ID caso seja um inteiro válido do Postgres
    if (isSafeInteger) {
      const result = await db.update(users)
        .set({
          ...updatedData,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id))
        .returning();
      if (result && result.length > 0) {
        updatedRecord = result[0];
      }
    }

    // 2. Se não atualizou por ID ou o ID não era um inteiro válido de 32 bits, buscar e atualizar por e-mail
    if (!updatedRecord && cleanEmail) {
      const resultByEmail = await db.update(users)
        .set({
          ...updatedData,
          updatedAt: new Date(),
        })
        .where(sql`LOWER(${users.email}) = ${cleanEmail}`)
        .returning();

      if (resultByEmail && resultByEmail.length > 0) {
        updatedRecord = resultByEmail[0];
      }
    }

    // 3. Se ainda não encontrado no banco Postgres e temos e-mail, inserir novo registro no banco
    if (!updatedRecord && cleanEmail) {
      try {
        const inserted = await db.insert(users).values({
          ...updatedData,
          email: cleanEmail,
          nome: data.nome || 'Usuário',
          role: updatedData.role || 'Aluno',
          isAdmin: Boolean(updatedData.isAdmin),
          ativo: data.ativo !== false,
          createdAt: new Date(),
          updatedAt: new Date(),
        }).returning();
        if (inserted && inserted.length > 0) {
          updatedRecord = inserted[0];
        }
      } catch (insertErr) {
        console.warn('[Database] Could not auto-insert user during updateUserById:', insertErr);
      }
    }

    if (updatedRecord) {
      markDbOnline();
      return updatedRecord;
    }

    // Fallback se não retornou registro
    return updateUserByIdFallback(id, data, cleanEmail);
  } catch (error: any) {
    console.warn('[Database] Error in updateUserById, falling back to local memory store:', error?.message);
    return updateUserByIdFallback(id, data, cleanEmail);
  }
}

export async function listAllUsers() {
  if (isDbCachedOffline()) {
    return listAllUsersFallback();
  }
  try {
    const result = await db.select().from(users).orderBy(sql`created_at DESC`);
    markDbOnline();
    return result;
  } catch (error) {
    handleQueryError('listAllUsers', error);
    markDbOffline();
    return listAllUsersFallback();
  }
}

export async function blockUserById(id: number, email?: string) {
  const cleanEmail = email ? String(email).trim().toLowerCase() : null;
  const isSafeInteger = Number.isInteger(id) && id > 0 && id <= 2147483647;

  try {
    blockUserByIdFallback(id, cleanEmail);
  } catch (e) {}

  if (isDbCachedOffline()) {
    return blockUserByIdFallback(id, cleanEmail);
  }
  try {
    if (isSafeInteger) {
      const result = await db.update(users)
        .set({ ativo: false, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();
      if (result.length > 0) {
        markDbOnline();
        return result[0];
      }
    }
    if (cleanEmail) {
      const result = await db.update(users)
        .set({ ativo: false, updatedAt: new Date() })
        .where(sql`LOWER(${users.email}) = ${cleanEmail}`)
        .returning();
      if (result.length > 0) {
        markDbOnline();
        return result[0];
      }
    }
    return blockUserByIdFallback(id, cleanEmail);
  } catch (error) {
    return blockUserByIdFallback(id, cleanEmail);
  }
}

export async function unblockUserById(id: number, email?: string) {
  const cleanEmail = email ? String(email).trim().toLowerCase() : null;
  const isSafeInteger = Number.isInteger(id) && id > 0 && id <= 2147483647;

  try {
    unblockUserByIdFallback(id, cleanEmail);
  } catch (e) {}

  if (isDbCachedOffline()) {
    return unblockUserByIdFallback(id, cleanEmail);
  }
  try {
    if (isSafeInteger) {
      const result = await db.update(users)
        .set({ ativo: true, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();
      if (result.length > 0) {
        markDbOnline();
        return result[0];
      }
    }
    if (cleanEmail) {
      const result = await db.update(users)
        .set({ ativo: true, updatedAt: new Date() })
        .where(sql`LOWER(${users.email}) = ${cleanEmail}`)
        .returning();
      if (result.length > 0) {
        markDbOnline();
        return result[0];
      }
    }
    return unblockUserByIdFallback(id, cleanEmail);
  } catch (error) {
    return unblockUserByIdFallback(id, cleanEmail);
  }
}

export async function deleteUserPermanentlyById(id: number, email?: string) {
  const cleanEmail = email ? String(email).trim().toLowerCase() : null;
  const isSafeInteger = Number.isInteger(id) && id > 0 && id <= 2147483647;

  // Always clean fallback store as well for immediate consistency
  try {
    deleteUserByIdFallback(id, cleanEmail);
  } catch (e) {}

  if (isDbCachedOffline()) {
    return deleteUserByIdFallback(id, cleanEmail);
  }
  try {
    let targetId: number | null = isSafeInteger ? id : null;
    if (!targetId && cleanEmail) {
      const found = await db.select().from(users).where(sql`LOWER(${users.email}) = ${cleanEmail}`).limit(1);
      if (found.length > 0) {
        targetId = found[0].id;
      }
    }

    if (targetId) {
      // 1. Unlink any events created by this user to avoid FK constraint violations
      try {
        await db.update(events).set({ creatorId: null }).where(eq(events.creatorId, targetId));
      } catch (unlinkErr) {
        console.warn('[Database] Could not unlink events for user', targetId, unlinkErr);
      }

      // 2. Delete user from Supabase / Postgres table
      const result = await db.delete(users).where(eq(users.id, targetId)).returning();
      if (result.length > 0) {
        markDbOnline();
        return result[0];
      }
    }

    if (cleanEmail) {
      const result = await db.delete(users).where(sql`LOWER(${users.email}) = ${cleanEmail}`).returning();
      if (result.length > 0) {
        markDbOnline();
        return result[0];
      }
    }

    return deleteUserByIdFallback(id, cleanEmail);
  } catch (error) {
    return deleteUserByIdFallback(id, cleanEmail);
  }
}

export async function deleteUserById(id: number, email?: string) {
  // Deleting from admin dashboard soft-deletes / blocks user so they appear in "Contas bloqueadas"
  return blockUserById(id, email);
}
