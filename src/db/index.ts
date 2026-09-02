import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;
import * as schema from './schema.ts';

// Offline cache mechanism with exponential backoff to prevent long hanging connection timeouts
let isDbOffline = false;
let lastDbCheck = 0;
let consecutiveFailures = 0;

export function getOfflineRetryMs(): number {
  // Base is 15 seconds. Increase exponentially with consecutive failures (up to ~16 minutes)
  const factor = Math.min(consecutiveFailures, 6); // 2^6 = 64
  return 15000 * Math.pow(2, factor);
}

export function hasValidDbConfig(): boolean {
  const supabaseUrl = process.env.SUPABASE_DB_URL;
  const dbUrl = process.env.DATABASE_URL;
  
  const hasValidSupabaseUrl = !!(supabaseUrl && (supabaseUrl.startsWith('postgres://') || supabaseUrl.startsWith('postgresql://')));
  const hasValidDbUrl = !!(dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://')));

  if (hasValidSupabaseUrl || hasValidDbUrl) {
    return true;
  }
  return !!process.env.SQL_HOST;
}

export function isDbCachedOffline(): boolean {
  if (!hasValidDbConfig()) {
    return true; // No valid database configured, stay offline to bypass timeouts
  }
  if (isDbOffline) {
    const now = Date.now();
    const retryMs = getOfflineRetryMs();
    if (now - lastDbCheck < retryMs) {
      return true;
    }
  }
  return false;
}

export function markDbOffline() {
  consecutiveFailures++;
  const wasOffline = isDbOffline;
  isDbOffline = true;
  lastDbCheck = Date.now();
  
  if (!wasOffline) {
    const nextRetryMin = (getOfflineRetryMs() / 1000 / 60).toFixed(1);
    console.warn(`[Database] SQL connection failure. Database marked OFFLINE/UNREACHABLE. Routing queries to fallback memory store for next ${nextRetryMin} minutes.`);
  }
}

export function markDbOnline() {
  consecutiveFailures = 0;
  if (isDbOffline) {
    isDbOffline = false;
    console.info('[Database] SQL connection successfully recovered. Database marked ONLINE.');
  }
}

// Function to create a new connection pool with persistent keep-alive
export const createPool = () => {
  const supabaseUrl = process.env.SUPABASE_DB_URL || process.env.SUPABASE_DATABASE_URL || process.env.POSTGRES_URL;
  const dbUrl = process.env.DATABASE_URL || process.env.DIRECT_URL;
  
  const hasValidSupabaseUrl = !!(supabaseUrl && (supabaseUrl.startsWith('postgres://') || supabaseUrl.startsWith('postgresql://')));
  const hasValidDbUrl = !!(dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://')));

  const baseConfig = {
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  };

  if (hasValidSupabaseUrl) {
    return new Pool({
      ...baseConfig,
      connectionString: supabaseUrl,
      ssl: { rejectUnauthorized: false } // Required for Supabase SSL connections
    });
  }
  if (hasValidDbUrl) {
    return new Pool({
      ...baseConfig,
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false } // Required for Supabase SSL connections
    });
  }
  return new Pool({
    ...baseConfig,
    host: process.env.SQL_HOST || '127.0.0.1',
    user: process.env.SQL_USER || 'postgres',
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME || 'postgres',
  });
};

// Create a pool instance.
export const pool = createPool();

// Prevent unhandled pool-level errors from crashing the application
pool.on('error', (err) => {
  console.error('[Database Pool] Unexpected error on idle SQL client:', err.message || err);
  markDbOffline();
});

// Periodic background heartbeat to ensure constant Supabase/PostgreSQL connectivity
let heartbeatInterval: NodeJS.Timeout | null = null;
let lastHeartbeatLatencyMs = 0;
let lastSuccessfulHeartbeat = 0;

export function startHeartbeatMonitor() {
  if (heartbeatInterval) return;
  
  heartbeatInterval = setInterval(async () => {
    if (!hasValidDbConfig()) return;
    const start = Date.now();
    try {
      await pool.query('SELECT 1 as ping;');
      lastHeartbeatLatencyMs = Date.now() - start;
      lastSuccessfulHeartbeat = Date.now();
      markDbOnline();
    } catch (err: any) {
      console.warn('[Database Heartbeat] Ping failed, attempting auto-recovery:', err.message || err);
      markDbOffline();
    }
  }, 25000); // Ping every 25 seconds to prevent idle disconnects
}

export function getDbHealthStats() {
  return {
    isOffline: isDbOffline,
    consecutiveFailures,
    lastLatencyMs: lastHeartbeatLatencyMs,
    lastSuccessfulHeartbeat: lastSuccessfulHeartbeat ? new Date(lastSuccessfulHeartbeat).toISOString() : null,
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
    hasValidConfig: hasValidDbConfig()
  };
}

// Start background heartbeat immediately
startHeartbeatMonitor();

// Initialize Drizzle with the pool and schema.
export const db = drizzle(pool, { schema });

// Auto-initialize tables in Supabase / Postgres if they do not exist at startup
export async function initializeDatabase() {
  if (!hasValidDbConfig()) {
    console.info('[Database] No persistent SQL database configured or invalid connection string. Operating in fallback JSON mode.');
    isDbOffline = true;
    return;
  }
  try {
    const client = await pool.connect();
    try {
      console.log('[Database] Testing connection...');
      await client.query('SELECT 1;');
      
      console.log('[Database] Synchronizing Postgres tables with database...');
      
      try {
        // Ensure tables exist
        await client.query(`
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            uid TEXT NOT NULL UNIQUE,
            nome TEXT,
            email TEXT NOT NULL,
            password TEXT,
            foto_perfil TEXT,
            provider TEXT,
            role TEXT,
            ativo BOOLEAN DEFAULT TRUE NOT NULL,
            is_admin BOOLEAN DEFAULT FALSE NOT NULL,
            cpf TEXT,
            phone TEXT,
            birthdate TEXT,
            gender TEXT,
            institution TEXT DEFAULT 'Escola estadual Helena Wysocki',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          );
        `);

        await client.query(`
          CREATE TABLE IF NOT EXISTS events (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            location TEXT NOT NULL,
            day INTEGER NOT NULL,
            month INTEGER NOT NULL,
            year INTEGER NOT NULL,
            time TEXT DEFAULT '18:00' NOT NULL,
            is_paid BOOLEAN DEFAULT FALSE NOT NULL,
            price TEXT,
            requirements TEXT,
            website TEXT,
            image TEXT,
            creator_id INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT NOW()
          );
        `);
        
        // Dynamically append columns to existing installations if the table already existed
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT;`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS cpf TEXT;`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS birthdate TEXT;`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT;`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS institution TEXT DEFAULT 'Escola estadual Helena Wysocki';`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS foto_perfil TEXT;`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS provider TEXT;`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT;`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;`);

        // Dynamically append columns to events table if it already existed
        await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS time TEXT DEFAULT '18:00';`);
        await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT FALSE;`);
        await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS price TEXT;`);
        await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS requirements TEXT;`);
        await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS website TEXT;`);
        await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS image TEXT;`);
        try {
          await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS creator_id INTEGER REFERENCES users(id);`);
        } catch (fkErr: any) {
          // If foreign key reference fails because users table is being updated, ignore or log
          console.warn("[Database Init] Could not add creator_id reference column to events:", fkErr.message || fkErr);
        }
        
        // Seed default corporate accounts
        await client.query(`
          INSERT INTO users (uid, email, password, nome, foto_perfil, provider, role, ativo, is_admin, institution)
          VALUES (
            'fallback-admin-uid', 
            'diretoria@helenawysocki.com', 
            'senha123', 
            'Diretoria Helena Wysocki', 
            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', 
            'local', 
            'Diretor', 
            true, 
            true, 
            'Escola estadual Helena Wysocki'
          )
          ON CONFLICT (uid) DO UPDATE SET password = 'senha123', role = 'Diretor', is_admin = true;
        `);

        await client.query(`
          INSERT INTO users (uid, email, password, nome, foto_perfil, provider, role, ativo, is_admin, institution)
          VALUES (
            'fallback-funcionario-uid', 
            'funcionario@helenawysocki.com', 
            'senha123', 
            'Funcionário Helena Wysocki', 
            'https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=150', 
            'local', 
            'Funcionário', 
            true, 
            false, 
            'Escola estadual Helena Wysocki'
          )
          ON CONFLICT (uid) DO UPDATE SET password = 'senha123', role = 'Funcionário', is_admin = false;
        `);

        await client.query(`
          INSERT INTO users (uid, email, password, nome, foto_perfil, provider, role, ativo, is_admin, institution)
          VALUES (
            'fallback-cliente-uid', 
            'cliente@helenawysocki.com', 
            'senha123', 
            'Cliente Visitante', 
            'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150', 
            'local', 
            'Cliente', 
            true, 
            false, 
            'Escola estadual Helena Wysocki'
          )
          ON CONFLICT (uid) DO UPDATE SET password = 'senha123', role = 'Cliente', is_admin = false;
        `);

        // Check and seed default school events if events table is empty
        const eventsCountCheck = await client.query('SELECT COUNT(*) as count FROM events;');
        const eventCount = parseInt(eventsCountCheck.rows[0]?.count || '0');
        if (eventCount === 0) {
          console.log('[Database] events table is empty. Seeding default school events...');
          
          const adminCheck = await client.query("SELECT id FROM users WHERE uid = 'fallback-admin-uid' LIMIT 1;");
          const adminId = adminCheck.rows[0] ? adminCheck.rows[0].id : null;
          
          const today = new Date();
          const currentYear = today.getFullYear();
          const currentMonth = today.getMonth(); // 0-indexed
          const nextMonth = (currentMonth + 1) % 12;
          const nextMonthYear = currentMonth === 11 ? currentYear + 1 : currentYear;

          await client.query(`
            INSERT INTO events (title, location, day, month, year, time, is_paid, price, requirements, website, image, creator_id)
            VALUES 
              (
                'Feira de Ciências e Tecnologia', 
                'Auditório Principal • Bloco A', 
                15, 
                ${currentMonth}, 
                ${currentYear}, 
                '09:00', 
                false, 
                NULL, 
                'Entrada livre para estudantes de todas as séries.', 
                'https://escola.gamechangers.com.br', 
                'https://images.unsplash.com/photo-1507537297725-24a1c029d3ca?w=600&auto=format&fit=crop',
                ${adminId ? adminId : 'NULL'}
              ),
              (
                'Campeonato de Game Design', 
                'Laboratório de Informática Sandbox', 
                22, 
                ${currentMonth}, 
                ${currentYear}, 
                '14:00', 
                false, 
                NULL, 
                'Traga seu notebook ou utilize as máquinas do laboratório.', 
                'https://escola.gamechangers.com.br', 
                'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600&auto=format&fit=crop',
                ${adminId ? adminId : 'NULL'}
              ),
              (
                'Workshop de Programação Web com React', 
                'Sala Multimeios • Bloco C', 
                5, 
                ${nextMonth}, 
                ${nextMonthYear}, 
                '10:30', 
                false, 
                NULL, 
                'Noções básicas de HTML e CSS.', 
                'https://escola.gamechangers.com.br', 
                'https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=600&auto=format&fit=crop',
                ${adminId ? adminId : 'NULL'}
              ),
              (
                'Palestra: Introdução à IA Generativa', 
                'Teatro Municipal', 
                18, 
                ${nextMonth}, 
                ${nextMonthYear}, 
                '19:00', 
                true, 
                'R$ 15,00', 
                'Inscrição online antecipada.', 
                'https://escola.gamechangers.com.br', 
                'https://images.unsplash.com/photo-1591453089816-0fbb971b454c?w=600&auto=format&fit=crop',
                ${adminId ? adminId : 'NULL'}
              );
          `);
          console.log('[Database] Default school events seeded successfully in Postgres.');
        }
        
        console.log('[Database] All table structures verified/created successfully.');
        markDbOnline();
      } catch (ddlErr: any) {
        if (ddlErr.message && ddlErr.message.includes('permission denied')) {
          console.info('[Database] DDL creation skipped due to read/write restricted credentials. Checking table availability...');
          
          // Verify if tables are already created (e.g. by previous admin executions)
          const tablesCheck = await client.query(`
            SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('users', 'events');
          `);
          
          const foundTables = tablesCheck.rows.map((row: any) => row.tablename);
          if (foundTables.includes('users') && foundTables.includes('events')) {
            console.info('[Database] Verified that tables "users" and "events" already exist. Database marked ONLINE.');
            markDbOnline();
          } else {
            console.error('[Database] Tables are missing and application user cannot create them:', ddlErr.message);
            markDbOffline();
          }
        } else {
          throw ddlErr;
        }
      }
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('[Database] Connection test / auto-migration failed:', err.message || err);
    markDbOffline();
  }
}

// Fire off database check instantly so it resolves in the background
initializeDatabase().catch((e) => {
  console.error('[Database] Unexpected bootstrap error:', e);
});


