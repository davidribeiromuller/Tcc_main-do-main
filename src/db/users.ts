import { db, isDbCachedOffline, markDbOffline, markDbOnline } from './index.ts';
import { users } from './schema.ts';
import { eq, sql } from 'drizzle-orm';
import {
  getOrCreateUserFallback,
  getUserByUidFallback,
  getUserByEmailFallback,
  updateUserByUidFallback,
  updateUserByIdFallback,
  listAllUsersFallback,
  deleteUserByIdFallback
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
    if (user && user.role === 'Funcionário' && user.email !== 'funcionario@helenawysocki.com') {
      const fixedResult = await db.update(users)
        .set({ role: 'Aluno', isAdmin: false, updatedAt: new Date() })
        .where(eq(users.uid, uid))
        .returning();
      markDbOnline();
      return fixedResult[0];
    }

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
      const user = await getUserByUid(uid);
      if (data.role === 'Funcionário' && user && user.email !== 'funcionario@helenawysocki.com') {
        updatedData.role = 'Aluno';
      }
      if (data.isAdmin === undefined) {
        if (updatedData.role === 'Diretor') {
          updatedData.isAdmin = true;
        } else if (user) {
          updatedData.isAdmin = user.isAdmin;
        }
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
  if (isDbCachedOffline()) {
    return updateUserByIdFallback(id, data);
  }
  try {
    const updatedData = { ...data };
    if (data.role !== undefined) {
      const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
      const user = result[0];
      if (data.role === 'Funcionário' && user && user.email !== 'funcionario@helenawysocki.com') {
        updatedData.role = 'Aluno';
      }
      if (data.isAdmin === undefined) {
        if (updatedData.role === 'Diretor') {
          updatedData.isAdmin = true;
        } else if (user) {
          updatedData.isAdmin = user.isAdmin;
        }
      }
    }
    const result = await db.update(users)
      .set({
        ...updatedData,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    markDbOnline();
    return result[0];
  } catch (error) {
    handleQueryError('updateUserById', error);
    markDbOffline();
    return updateUserByIdFallback(id, data);
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

export async function deleteUserById(id: number) {
  if (isDbCachedOffline()) {
    return deleteUserByIdFallback(id);
  }
  try {
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    markDbOnline();
    return result[0];
  } catch (error) {
    handleQueryError('deleteUserById', error);
    markDbOffline();
    try {
      return deleteUserByIdFallback(id);
    } catch (fallbackError) {
      console.error('Fallback error of deleteUserByIdFallback:', fallbackError);
      throw error;
    }
  }
}
