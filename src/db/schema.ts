import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp, boolean, numeric } from 'drizzle-orm/pg-core';

// Define the 'users' table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  nome: text('nome'),
  email: text('email').notNull(),
  password: text('password'),
  foto_perfil: text('foto_perfil'),
  provider: text('provider'), // 'google', 'escola', or 'local'
  role: text('role'), // 'ADMIN', 'Diretor', 'Pedagogo(a)', 'Aluno', 'Responsáveis', etc.
  ativo: boolean('ativo').default(true).notNull(),
  isAdmin: boolean('is_admin').default(false).notNull(),
  cpf: text('cpf'),
  phone: text('phone'),
  birthdate: text('birthdate'),
  gender: text('gender'),
  institution: text('institution').default('Escola estadual Helena Wysocki'),
  lastActiveAt: timestamp('last_active_at').defaultNow(),
  lastLogin: timestamp('last_login').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Define the 'events' table
export const events = pgTable('events', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  location: text('location').notNull(),
  day: integer('day').notNull(),
  month: integer('month').notNull(), // 0-indexed (0 = Jan, 11 = Dec)
  year: integer('year').notNull(),
  time: text('time').default('18:00').notNull(),
  isPaid: boolean('is_paid').default(false).notNull(),
  price: text('price'),
  requirements: text('requirements'), // Comma-separated or JSON string
  website: text('website'),
  image: text('image'),
  creatorId: integer('creator_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
});

// Define the 'eventos' table (Portuguese Supabase table)
export const eventos = pgTable('eventos', {
  id: serial('id').primaryKey(),
  titulo: text('titulo'),
  descricao: text('descricao'),
  categoria: text('categoria'),
  cidade: text('cidade'),
  local: text('local'),
  endereco: text('endereco'),
  dataInicio: timestamp('data_inicio'),
  dataFim: timestamp('data_fim'),
  organizador: text('organizador'),
  publicoAlvo: text('publico_alvo'),
  precisaPagar: boolean('precisa_pagar').default(false),
  valor: numeric('valor'),
  inscricoesAbertas: boolean('inscricoes_abertas').default(true),
  linkInscricao: text('link_inscricao'),
  vagas: integer('vagas'),
  imagem: text('imagem'),
  criadoEm: timestamp('criado_em').defaultNow(),
});

// Define relationships for the 'users' table.
export const usersRelations = relations(users, ({ many }) => ({
  events: many(events),
}));

// Define relationships for the 'events' table.
export const eventsRelations = relations(events, ({ one }) => ({
  creator: one(users, {
    fields: [events.creatorId],
    references: [users.id],
  }),
}));
