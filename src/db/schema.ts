import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp, boolean, numeric, jsonb } from 'drizzle-orm/pg-core';

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

// Define the 'instituicoes' table for schools in Araucária
export const instituicoes = pgTable('instituicoes', {
  id: serial('id').primaryKey(),
  nome: text('nome').notNull(),
  slug: text('slug').notNull().unique(),
  tipo: text('tipo'),
  endereco: text('endereco'),
  bairro: text('bairro'),
  cidade: text('cidade').default('Araucária'),
  cep: text('cep'),
  telefone: text('telefone'),
  email: text('email'),
  descricao: text('descricao'),
  status: text('status').default('ativo'),
  imagem: text('imagem'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Define the 'contas_institucionais' table managed by ADM Chefe
export const contasInstitucionais = pgTable('contas_institucionais', {
  id: serial('id').primaryKey(),
  escolaId: integer('escola_id').references(() => instituicoes.id),
  escolaNome: text('escola_nome').notNull(),
  identificador: text('identificador').notNull().unique(),
  email: text('email').notNull(),
  passwordHash: text('password_hash'),
  status: text('status').default('ativo').notNull(),
  criadoPor: text('criado_por').default('ADM Chefe'),
  createdAt: timestamp('created_at').defaultNow(),
  lastLogin: timestamp('last_login'),
});

// Define the 'historico_eventos' table for archived events (preservation after 48h)
export const historicoEventos = pgTable('historico_eventos', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').notNull(),
  titulo: text('titulo').notNull(),
  descricao: text('descricao'),
  dataTexto: text('data_texto'),
  horario: text('horario'),
  local: text('local'),
  escolaResponsavel: text('escola_responsavel'),
  cidade: text('cidade'),
  categoria: text('categoria'),
  arquivadoEm: timestamp('arquivado_em').defaultNow(),
});

// Define user event participation records (preserves attendance history)
export const participacoesEventos = pgTable('participacoes_eventos', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  eventId: integer('event_id').notNull(),
  eventoTitulo: text('evento_titulo').notNull(),
  eventoData: text('evento_data'),
  eventoHorario: text('evento_horario'),
  eventoLocal: text('evento_local'),
  eventoInstituicao: text('evento_instituicao'),
  status: text('status').default('Inscrito').notNull(), // 'Inscrito', 'Presente', 'Ausente', 'Concluído'
  inscritoEm: timestamp('inscrito_em').defaultNow(),
});

// Define the 'event_attendance_authorizations' table for digital parental consent
export const eventAttendanceAuthorizations = pgTable('event_attendance_authorizations', {
  id: text('id').primaryKey(),
  eventId: integer('event_id').notNull(),
  studentUserId: text('student_user_id').notNull(),
  studentName: text('student_name').notNull(),
  studentSchool: text('student_school'),
  studentClass: text('student_class'),
  guardianFullName: text('guardian_full_name').notNull(),
  guardianRelationship: text('guardian_relationship').notNull(),
  guardianContact: text('guardian_contact'),
  authorizationText: text('authorization_text').notNull(),
  consentVersion: text('consent_version').default('v1.0-2026').notNull(),
  declarationAccepted: boolean('declaration_accepted').default(true).notNull(),
  signedAt: timestamp('signed_at').defaultNow().notNull(),
  signaturePath: text('signature_path').notNull(),
  verificationMethod: text('verification_method').default('digital_handwritten_signature').notNull(),
  verificationStatus: text('verification_status').default('confirmed').notNull(),
  status: text('status').default('authorized').notNull(), // 'authorized', 'pending_signature', 'denied', 'revoked'
  eventSnapshot: jsonb('event_snapshot'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  revokedAt: timestamp('revoked_at'),
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

