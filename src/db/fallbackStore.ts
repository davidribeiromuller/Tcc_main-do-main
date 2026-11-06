import { Event, User, InstitutionalAccount, EventParticipationHistory, EventAttendanceAuthorization } from '../types.ts';
import fs from 'fs';
import path from 'path';

// Define JSON directory and file paths
const DB_DIR = path.join(process.cwd(), 'src/db');
const EVENTS_FILE = path.join(DB_DIR, 'fallback_events.json');
const USERS_FILE = path.join(DB_DIR, 'fallback_users.json');
const ACCOUNTS_FILE = path.join(DB_DIR, 'fallback_institutional_accounts.json');
const ARCHIVE_FILE = path.join(DB_DIR, 'fallback_event_history.json');
const PARTICIPATIONS_FILE = path.join(DB_DIR, 'fallback_participations.json');
const AUTHORIZATIONS_FILE = path.join(DB_DIR, 'fallback_authorizations.json');

// Ensure database directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Default updated authentic events for Araucária and Curitiba (Nov/Dec 2026)
const defaultEvents: Event[] = [
  {
    id: 1001,
    title: "Feira de Ciências e Tecnologia das Escolas de Araucária",
    location: "Parque Cachoeira • Pavilhão de Eventos, Araucária/PR",
    day: 14,
    month: 10, // Novembro (0-indexed: 10)
    year: 2026,
    time: "09:00",
    isPaid: false,
    price: null,
    requirements: "Entrada livre para estudantes de todas as séries, professores e famílias.",
    website: "https://araucaria.pr.gov.br",
    image: "https://images.unsplash.com/photo-1507537297725-24a1c029d3ca?w=600&auto=format&fit=crop",
    lat: -25.5862,
    lng: -49.4048,
    city: "Araucária",
    category: "Feira & Ciência",
    schoolName: "Rede Estadual e Municipal de Araucária",
    creatorId: 9901,
    createdAt: new Date().toISOString()
  },
  {
    id: 1002,
    title: "Festival Estudantil de Arte, Música e Teatro de Araucária",
    location: "Teatro da Praça • Centro, Araucária/PR",
    day: 20,
    month: 10,
    year: 2026,
    time: "14:00",
    isPaid: false,
    price: null,
    requirements: "Apresentações teatrais, dança e corais estudantis abertos à comunidade.",
    website: "https://araucaria.pr.gov.br",
    image: "https://images.unsplash.com/photo-1460723237483-7a6dc9d0b212?w=600&auto=format&fit=crop",
    lat: -25.5932,
    lng: -49.4072,
    city: "Araucária",
    category: "Cultura",
    schoolName: "Secretaria de Cultura e Educação",
    creatorId: 9901,
    createdAt: new Date().toISOString()
  },
  {
    id: 1003,
    title: "Torneio Intercolegial de Futsal e Voleibol de Araucária",
    location: "CSU - Centro Social Urbano • Bairro Fazenda Velha, Araucária/PR",
    day: 25,
    month: 10,
    year: 2026,
    time: "08:30",
    isPaid: false,
    price: null,
    requirements: "Etapa classificatória entre colégios estaduais. Torcida bem-vinda!",
    website: null,
    image: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600&auto=format&fit=crop",
    lat: -25.5815,
    lng: -49.3995,
    city: "Araucária",
    category: "Esporte",
    schoolName: "Núcleo de Educação Física Escolar",
    creatorId: 9901,
    createdAt: new Date().toISOString()
  },
  {
    id: 1004,
    title: "Feira da Agricultura Familiar, Educação do Campo e Sustentabilidade",
    location: "C.E. do Campo Guajuvira • Rua Pedro Czanovski, 511, Guajuvira",
    day: 28,
    month: 10,
    year: 2026,
    time: "09:00",
    isPaid: false,
    price: null,
    requirements: "Mostra agroecológica, sementes tradicionais e almoço comunitário do campo.",
    website: null,
    image: "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=600&auto=format&fit=crop",
    lat: -25.6835,
    lng: -49.5212,
    city: "Araucária",
    category: "Comunidade",
    schoolName: "Colégio Estadual do Campo Guajuvira",
    creatorId: 9901,
    createdAt: new Date().toISOString()
  },
  {
    id: 1005,
    title: "Mostra Paranaense de Robótica e Tecnologias Criativas",
    location: "Colégio Estadual Professor Júlio Szymanski • Centro, Araucária/PR",
    day: 2,
    month: 11, // Dezembro
    year: 2026,
    time: "10:00",
    isPaid: false,
    price: null,
    requirements: "Oficinas práticas de robótica, sensores Arduino e impressão 3D.",
    website: "https://seed.pr.gov.br",
    image: "https://images.unsplash.com/photo-1581092335397-9583fe92d232?w=600&auto=format&fit=crop",
    lat: -25.5908,
    lng: -49.4068,
    city: "Araucária",
    category: "Feira & Ciência",
    schoolName: "C.E. Prof. Júlio Szymanski",
    creatorId: 9901,
    createdAt: new Date().toISOString()
  },
  {
    id: 1006,
    title: "Feira de Carreiras, Profissões e Universidades de Curitiba",
    location: "UTFPR - Campus Central • Av. Sete de Setembro, 3165, Curitiba/PR",
    day: 5,
    month: 11,
    year: 2026,
    time: "09:00",
    isPaid: false,
    price: null,
    requirements: "Orientação vocacional para estudantes do Ensino Médio de toda a RMC.",
    website: "https://utfpr.edu.br",
    image: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=600&auto=format&fit=crop",
    lat: -25.4385,
    lng: -49.2690,
    city: "Curitiba",
    category: "Acadêmico",
    schoolName: "UTFPR / Ensino Superior",
    creatorId: 9901,
    createdAt: new Date().toISOString()
  },
  {
    id: 1007,
    title: "Circuito Cultural Maker e Oficinas Digitais da Juventude",
    location: "MuMA - Portão Cultural • Av. República Argentina, 3430, Curitiba/PR",
    day: 10,
    month: 11,
    year: 2026,
    time: "13:30",
    isPaid: false,
    price: null,
    requirements: "Oficinas gratuitas de artes digitais, design gráfico e produção cultural.",
    website: "https://fundacaoculturaldecuritiba.com.br",
    image: "https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=600&auto=format&fit=crop",
    lat: -25.4745,
    lng: -49.2934,
    city: "Curitiba",
    category: "Cultura & Tecnologia",
    schoolName: "Fundação Cultural de Curitiba",
    creatorId: 9901,
    createdAt: new Date().toISOString()
  },
  {
    id: 1008,
    title: "Olimpíada de Iniciação Científica e Matemática da Região Metropolitana",
    location: "Colégio Estadual do Paraná (CEP) • Av. João Gualberto, 250, Curitiba/PR",
    day: 14,
    month: 11,
    year: 2026,
    time: "08:30",
    isPaid: false,
    price: null,
    requirements: "Apresentação dos projetos premiados das escolas de Araucária e Curitiba.",
    website: "https://cep.pr.gov.br",
    image: "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=600&auto=format&fit=crop",
    lat: -25.4215,
    lng: -49.2662,
    city: "Curitiba",
    category: "Acadêmico",
    schoolName: "Colégio Estadual do Paraná",
    creatorId: 9901,
    createdAt: new Date().toISOString()
  }
];

// Default institutional accounts for the 6 Araucaria schools
const defaultInstitutionalAccounts: InstitutionalAccount[] = [
  {
    id: 1,
    escolaId: 1,
    escolaNome: "Colégio Estadual Professor Júlio Szymanski",
    identificador: "escola.szymanski",
    email: "aucjulio@seed.pr.gov.br",
    password: "senhaInstitucional123",
    status: "ativo",
    criadoPor: "ADM Chefe",
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString()
  },
  {
    id: 2,
    escolaId: 2,
    escolaNome: "Colégio Estadual Professora Helena Wysocki",
    identificador: "escola.wysocki",
    email: "auchelena@seed.pr.gov.br",
    password: "senhaInstitucional123",
    status: "ativo",
    criadoPor: "ADM Chefe",
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString()
  },
  {
    id: 3,
    escolaId: 3,
    escolaNome: "Colégio Estadual Professora Maria da Graça Siqueira Silva e Lima",
    identificador: "escola.mariadagraca",
    email: "aucmariagssilva@seed.pr.gov.br",
    password: "senhaInstitucional123",
    status: "ativo",
    criadoPor: "ADM Chefe",
    createdAt: new Date().toISOString()
  },
  {
    id: 4,
    escolaId: 4,
    escolaNome: "Colégio Estadual do Campo Guajuvira",
    identificador: "escola.guajuvira",
    email: "aucguajuvira@seed.pr.gov.br",
    password: "senhaInstitucional123",
    status: "ativo",
    criadoPor: "ADM Chefe",
    createdAt: new Date().toISOString()
  },
  {
    id: 5,
    escolaId: 5,
    escolaNome: "Colégio Estadual Professora Marilze da Luz Brand",
    identificador: "escola.marilze",
    email: "aucmarilzeluzbrand@seed.pr.gov.br",
    password: "senhaInstitucional123",
    status: "ativo",
    criadoPor: "ADM Chefe",
    createdAt: new Date().toISOString()
  },
  {
    id: 6,
    escolaId: 6,
    escolaNome: "Colégio Estadual Cecília Meireles",
    identificador: "escola.cecilia",
    email: "aucceciliameireles@seed.pr.gov.br",
    password: "senhaInstitucional123",
    status: "ativo",
    criadoPor: "ADM Chefe",
    createdAt: new Date().toISOString()
  }
];

// Default fallback users
const defaultUsers: User[] = [
  {
    id: 9901,
    uid: "fallback-admin-uid",
    nome: "Administração eloEscola",
    email: "diretoria@helenawysocki.com",
    password: "senha123",
    foto_perfil: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150",
    provider: "local",
    role: "Diretor",
    ativo: true,
    isAdmin: true,
    institution: "eloEscola",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 9902,
    uid: "fallback-funcionario-uid",
    nome: "Coordenação Pedagógica",
    email: "funcionario@helenawysocki.com",
    password: "senha123",
    foto_perfil: "https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=150",
    provider: "local",
    role: "Funcionário",
    ativo: true,
    isAdmin: false,
    institution: "eloEscola",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 5256,
    uid: "8JwejrxI50Xrk5MPrdUjh34cZT03",
    email: "muller.david@escola.pr.gov.br",
    nome: "DAVID RIBEIRO MULLER",
    foto_perfil: "https://lh3.googleusercontent.com/a/ACg8ocJ-HH2qfcPJF-MXYvyCcI1miq5d9iNYAq2TKqvL8ZE1KiphwiGM=s96-c",
    provider: "google",
    role: "Aluno",
    ativo: true,
    isAdmin: false,
    institution: "Colégio Estadual Professor Júlio Szymanski",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 10000,
    uid: "tldTqxnmlHMAa9oYNUPHO72AlgB3",
    email: "davidribeiromuller2009@gmail.com",
    nome: "David Ribeiro Müller",
    foto_perfil: "https://lh3.googleusercontent.com/a/ACg8ocLBADHr-NaZCSwyxCQNN1iBqMwvhKmnsXZxNWp8wrtPqdyAyLP1=s96-c",
    provider: "google",
    role: "Diretor",
    ativo: true,
    isAdmin: true,
    institution: "eloEscola",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

// Load / Initialize events list
export let fallbackEvents: Event[] = [];
try {
  if (fs.existsSync(EVENTS_FILE)) {
    const raw = fs.readFileSync(EVENTS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      fallbackEvents = parsed;
    } else {
      fallbackEvents = [...defaultEvents];
      fs.writeFileSync(EVENTS_FILE, JSON.stringify(fallbackEvents, null, 2), 'utf-8');
    }
  } else {
    fallbackEvents = [...defaultEvents];
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(fallbackEvents, null, 2), 'utf-8');
  }
} catch (err) {
  console.error("Error loading fallback events file, using memory storage:", err);
  fallbackEvents = [...defaultEvents];
}

// Load / Initialize users list
export let fallbackUsers: User[] = [];
try {
  if (fs.existsSync(USERS_FILE)) {
    const raw = fs.readFileSync(USERS_FILE, 'utf-8');
    fallbackUsers = JSON.parse(raw);
    
    // Ensure all default users are present with passwords and sanitize roles
    let updated = false;
    for (const defU of defaultUsers) {
      const existingIndex = fallbackUsers.findIndex(u => u.email === defU.email);
      if (existingIndex === -1) {
        fallbackUsers.push(defU);
        updated = true;
      } else {
        const existing = fallbackUsers[existingIndex];
        if (!existing.password) {
          existing.password = defU.password;
          updated = true;
        }
        if (existing.role !== defU.role) {
          existing.role = defU.role;
          updated = true;
        }
        if (existing.isAdmin !== defU.isAdmin) {
          existing.isAdmin = defU.isAdmin;
          updated = true;
        }
      }
    }

    // Safety: ensure director emails have admin privileges enabled
    for (const u of fallbackUsers) {
      const cleanEmail = (u.email || '').toLowerCase().trim();
      if (cleanEmail === 'diretoria@helenawysocki.com' || cleanEmail === 'davidribeiromuller2009@gmail.com') {
        if (!u.isAdmin) {
          u.isAdmin = true;
          updated = true;
        }
        if (u.role !== 'Diretor') {
          u.role = 'Diretor';
          updated = true;
        }
      }
    }

    if (updated) {
      fs.writeFileSync(USERS_FILE, JSON.stringify(fallbackUsers, null, 2), 'utf-8');
    }
  } else {
    fallbackUsers = [...defaultUsers];
    fs.writeFileSync(USERS_FILE, JSON.stringify(fallbackUsers, null, 2), 'utf-8');
  }
} catch (err) {
  console.error("Error loading fallback users file, using memory storage:", err);
  fallbackUsers = [...defaultUsers];
}

// Load / Initialize Institutional Accounts
export let fallbackInstitutionalAccounts: InstitutionalAccount[] = [];
try {
  if (fs.existsSync(ACCOUNTS_FILE)) {
    const raw = fs.readFileSync(ACCOUNTS_FILE, 'utf-8');
    fallbackInstitutionalAccounts = JSON.parse(raw);
  } else {
    fallbackInstitutionalAccounts = [...defaultInstitutionalAccounts];
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(fallbackInstitutionalAccounts, null, 2), 'utf-8');
  }
} catch (err) {
  fallbackInstitutionalAccounts = [...defaultInstitutionalAccounts];
}

// Load / Initialize Event History (Archived events)
export let fallbackEventHistory: Event[] = [];
try {
  if (fs.existsSync(ARCHIVE_FILE)) {
    const raw = fs.readFileSync(ARCHIVE_FILE, 'utf-8');
    fallbackEventHistory = JSON.parse(raw);
  } else {
    fallbackEventHistory = [];
    fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(fallbackEventHistory, null, 2), 'utf-8');
  }
} catch (err) {
  fallbackEventHistory = [];
}

// Load / Initialize Participations
export let fallbackParticipations: EventParticipationHistory[] = [];
try {
  if (fs.existsSync(PARTICIPATIONS_FILE)) {
    const raw = fs.readFileSync(PARTICIPATIONS_FILE, 'utf-8');
    fallbackParticipations = JSON.parse(raw);
  } else {
    fallbackParticipations = [];
    fs.writeFileSync(PARTICIPATIONS_FILE, JSON.stringify(fallbackParticipations, null, 2), 'utf-8');
  }
} catch (err) {
  fallbackParticipations = [];
}

// Helper write methods
function saveEvents() {
  try {
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(fallbackEvents, null, 2), 'utf-8');
  } catch (err) {
    console.error("Error saving fallback events to JSON file:", err);
  }
}

function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(fallbackUsers, null, 2), 'utf-8');
  } catch (err) {
    console.error("Error saving fallback users to JSON file:", err);
  }
}

function saveInstitutionalAccounts() {
  try {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(fallbackInstitutionalAccounts, null, 2), 'utf-8');
  } catch (err) {
    console.error("Error saving institutional accounts to file:", err);
  }
}

function saveEventHistory() {
  try {
    fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(fallbackEventHistory, null, 2), 'utf-8');
  } catch (err) {
    console.error("Error saving event history to file:", err);
  }
}

function saveParticipations() {
  try {
    fs.writeFileSync(PARTICIPATIONS_FILE, JSON.stringify(fallbackParticipations, null, 2), 'utf-8');
  } catch (err) {
    console.error("Error saving participations to file:", err);
  }
}

// Load / Initialize Authorizations
export let fallbackAuthorizations: EventAttendanceAuthorization[] = [];
try {
  if (fs.existsSync(AUTHORIZATIONS_FILE)) {
    const raw = fs.readFileSync(AUTHORIZATIONS_FILE, 'utf-8');
    fallbackAuthorizations = JSON.parse(raw);
  } else {
    fallbackAuthorizations = [];
    fs.writeFileSync(AUTHORIZATIONS_FILE, JSON.stringify(fallbackAuthorizations, null, 2), 'utf-8');
  }
} catch (err) {
  fallbackAuthorizations = [];
}

function saveAuthorizations() {
  try {
    fs.writeFileSync(AUTHORIZATIONS_FILE, JSON.stringify(fallbackAuthorizations, null, 2), 'utf-8');
  } catch (err) {
    console.error("Error saving authorizations to file:", err);
  }
}

// --- AUTOMATIC 48-HOUR EVENT EXPIRATION & HISTORY PRESERVATION ROUTINE ---
export function archiveAndPruneExpiredEvents(): { prunedCount: number; preservedCount: number } {
  const now = new Date();
  const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
  let prunedCount = 0;

  const remainingEvents: Event[] = [];

  for (const event of fallbackEvents) {
    let [hours, minutes] = [18, 0];
    if (event.time && event.time.includes(':')) {
      const parts = event.time.split(':');
      hours = parseInt(parts[0], 10) || 18;
      minutes = parseInt(parts[1], 10) || 0;
    }

    const eventEndDate = new Date(event.year, event.month, event.day, hours, minutes);
    const timeSinceEnd = now.getTime() - eventEndDate.getTime();

    // If event concluded more than 48 hours ago:
    if (timeSinceEnd > FORTY_EIGHT_HOURS_MS) {
      prunedCount++;
      // 1. Preserve in historical archive if not already archived
      const alreadyArchived = fallbackEventHistory.some(h => h.id === event.id);
      if (!alreadyArchived) {
        fallbackEventHistory.push({
          ...event,
          isArchived: true,
          archivedAt: new Date().toISOString()
        });
      }

      // 2. Ensure all participations referencing this event have preserved snapshot details
      for (const p of fallbackParticipations) {
        if (p.eventId === event.id) {
          if (!p.eventTitle) p.eventTitle = event.title;
          if (!p.eventLocation) p.eventLocation = event.location;
          if (!p.eventDate) p.eventDate = `${event.day}/${event.month + 1}/${event.year}`;
          if (!p.eventTime) p.eventTime = event.time;
          if (!p.eventSchool) p.eventSchool = event.schoolName || event.location;
        }
      }
    } else {
      remainingEvents.push(event);
    }
  }

  if (prunedCount > 0) {
    fallbackEvents = remainingEvents;
    saveEvents();
    saveEventHistory();
    saveParticipations();
    console.log(`[EventLifecycle] Rotina automática: ${prunedCount} evento(s) encerrados há mais de 48h foram arquivados e removidos da tabela operacional com integridade preservada.`);
  }

  return { prunedCount, preservedCount: fallbackEventHistory.length };
}

// Run cleanup immediately on load
archiveAndPruneExpiredEvents();

// --- EVENT OPERATIONS ---

export function listAllEventsFallback(): Event[] {
  // Always ensure cleanup is evaluated before returning operational events
  archiveAndPruneExpiredEvents();
  return [...fallbackEvents].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    if (a.month !== b.month) return a.month - b.month;
    return a.day - b.day;
  });
}

export function createNewEventFallback(data: Partial<Event>): Event {
  const newEvent: Event = {
    id: data.id || Math.floor(Math.random() * 10000) + 1000,
    title: data.title || "Evento Escolar",
    location: data.location || "Araucária/PR",
    day: Number(data.day) || new Date().getDate(),
    month: Number(data.month) ?? new Date().getMonth(),
    year: Number(data.year) || new Date().getFullYear(),
    time: data.time || '14:00',
    isPaid: !!data.isPaid,
    price: data.price || null,
    requirements: data.requirements || null,
    website: data.website || null,
    image: data.image || "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600",
    lat: data.lat || null,
    lng: data.lng || null,
    city: data.city || "Araucária",
    category: data.category || "Geral",
    schoolId: data.schoolId || null,
    schoolName: data.schoolName || null,
    creatorId: data.creatorId || null,
    createdAt: new Date().toISOString()
  };

  fallbackEvents.push(newEvent);
  saveEvents();
  return newEvent;
}

export function updateEventByIdFallback(id: number, data: Partial<Event>): Event {
  const index = fallbackEvents.findIndex(e => e.id === id);
  if (index === -1) {
    throw new Error('Evento não encontrado para atualizar na memória');
  }
  fallbackEvents[index] = {
    ...fallbackEvents[index],
    ...data,
  };
  saveEvents();
  return fallbackEvents[index];
}

export function deleteEventByIdFallback(id: number): Event {
  const index = fallbackEvents.findIndex(e => e.id === id);
  if (index === -1) {
    throw new Error('Evento não encontrado para excluir na memória');
  }
  const deletedEvent = fallbackEvents[index];
  
  // Preserve in history before hard operational deletion
  const alreadyArchived = fallbackEventHistory.some(h => h.id === id);
  if (!alreadyArchived) {
    fallbackEventHistory.push({
      ...deletedEvent,
      isArchived: true,
      archivedAt: new Date().toISOString()
    });
    saveEventHistory();
  }

  fallbackEvents.splice(index, 1);
  saveEvents();
  return deletedEvent;
}

// --- PARTICIPATIONS & HISTORY OPERATIONS ---

export function recordParticipationFallback(
  userIdOrObj: string | number | {
    userId: string | number;
    eventId: number;
    eventTitle?: string;
    eventLocation?: string;
    eventDate?: string;
    eventTime?: string;
    status?: "Inscrito" | "Presente" | "Ausente" | "Concluído";
    confirmedAt?: string;
  },
  eventIdArg?: number,
  statusArg: "Inscrito" | "Presente" | "Ausente" | "Concluído" = "Inscrito"
): EventParticipationHistory {
  let userId: string;
  let eventId: number;
  let status: "Inscrito" | "Presente" | "Ausente" | "Concluído" = statusArg;
  let customTitle: string | undefined;
  let customLocation: string | undefined;
  let customDate: string | undefined;
  let customTime: string | undefined;

  if (typeof userIdOrObj === "object" && userIdOrObj !== null) {
    userId = String(userIdOrObj.userId);
    eventId = userIdOrObj.eventId;
    if (userIdOrObj.status) status = userIdOrObj.status;
    customTitle = userIdOrObj.eventTitle;
    customLocation = userIdOrObj.eventLocation;
    customDate = userIdOrObj.eventDate;
    customTime = userIdOrObj.eventTime;
  } else {
    userId = String(userIdOrObj);
    eventId = eventIdArg || 0;
  }

  const existing = fallbackParticipations.find(p => String(p.userId) === userId && p.eventId === eventId);
  
  // Find event details from either active events or archived history
  const ev = fallbackEvents.find(e => e.id === eventId) || fallbackEventHistory.find(e => e.id === eventId);

  if (existing) {
    existing.status = status;
    saveParticipations();
    return existing;
  }

  const newPart: EventParticipationHistory = {
    id: `part-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    userId: userId,
    eventId: eventId,
    eventTitle: customTitle || ev?.title || "Evento Escolar",
    eventDate: customDate || (ev ? `${ev.day}/${ev.month + 1}/${ev.year}` : new Date().toLocaleDateString('pt-BR')),
    eventTime: customTime || ev?.time || "14:00",
    eventLocation: customLocation || ev?.location || "Campus Escolar",
    eventSchool: ev?.schoolName || "eloEscola",
    status: status,
    enrolledAt: new Date().toISOString()
  };

  fallbackParticipations.push(newPart);
  saveParticipations();
  return newPart;
}

export function listUserParticipationsFallback(userId: string | number): EventParticipationHistory[] {
  const strUserId = String(userId);
  return fallbackParticipations.filter(p => String(p.userId) === strUserId);
}

export function listArchivedEventsFallback(): Event[] {
  return [...fallbackEventHistory];
}

// --- INSTITUTIONAL ACCOUNTS OPERATIONS (ADM CHEFE ONLY) ---

export function listInstitutionalAccountsFallback(): InstitutionalAccount[] {
  return [...fallbackInstitutionalAccounts];
}

export function createInstitutionalAccountFallback(data: {
  escolaId: number;
  escolaNome: string;
  identificador: string;
  email: string;
  password?: string;
  criadoPor?: string;
  responsavel?: string;
  cargo?: string;
}): InstitutionalAccount {
  const existing = fallbackInstitutionalAccounts.find(
    a => a.identificador.toLowerCase() === data.identificador.toLowerCase() ||
         a.email.toLowerCase() === data.email.toLowerCase()
  );

  if (existing) {
    throw new Error("Já existe uma conta institucional com este identificador ou e-mail.");
  }

  const newAccount: InstitutionalAccount = {
    id: Date.now(),
    escolaId: data.escolaId,
    escolaNome: data.escolaNome,
    identificador: data.identificador.toLowerCase().trim(),
    email: data.email.toLowerCase().trim(),
    password: data.password || "senhaInicial123",
    status: "ativo",
    criadoPor: data.criadoPor || "ADM Chefe",
    responsavel: data.responsavel,
    cargo: data.cargo,
    createdAt: new Date().toISOString()
  };

  fallbackInstitutionalAccounts.push(newAccount);
  saveInstitutionalAccounts();
  return newAccount;
}

export function toggleInstitutionalAccountFallback(id: number): InstitutionalAccount {
  const index = fallbackInstitutionalAccounts.findIndex(a => a.id === id);
  if (index === -1) {
    throw new Error("Conta institucional não encontrada.");
  }
  const current = fallbackInstitutionalAccounts[index];
  current.status = current.status === "ativo" ? "bloqueado" : "ativo";
  saveInstitutionalAccounts();
  return current;
}

export function resetInstitutionalPasswordFallback(id: number, newPassword: string): InstitutionalAccount {
  const index = fallbackInstitutionalAccounts.findIndex(a => a.id === id);
  if (index === -1) {
    throw new Error("Conta institucional não encontrada.");
  }
  fallbackInstitutionalAccounts[index].password = newPassword;
  saveInstitutionalAccounts();
  return fallbackInstitutionalAccounts[index];
}

export function deleteInstitutionalAccountFallback(id: number): InstitutionalAccount {
  const index = fallbackInstitutionalAccounts.findIndex(a => a.id === id);
  if (index === -1) {
    throw new Error("Conta institucional não encontrada.");
  }
  const deleted = fallbackInstitutionalAccounts.splice(index, 1)[0];
  saveInstitutionalAccounts();
  return deleted;
}

export function authenticateInstitutionalAccountFallback(identificadorOrEmail: string, password: string): InstitutionalAccount | null {
  const cleanId = (identificadorOrEmail || '').toLowerCase().trim();
  const account = fallbackInstitutionalAccounts.find(
    a => (a.identificador.toLowerCase() === cleanId || a.email.toLowerCase() === cleanId)
  );

  if (!account) return null;
  if (account.status === "bloqueado") {
    throw new Error("Esta conta institucional está desativada ou bloqueada pela administração.");
  }

  if (account.password === password) {
    account.lastLogin = new Date().toISOString();
    saveInstitutionalAccounts();
    return account;
  }

  return null;
}

// --- USER OPERATIONS ---

export function normalizePhoneDigits(phone: string): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
}

export function getUserByPhoneFallback(phone: string): User | undefined {
  const norm = normalizePhoneDigits(phone);
  if (!norm) return undefined;
  return fallbackUsers.find(u => {
    if (!u.phone) return false;
    const userNorm = normalizePhoneDigits(u.phone);
    return userNorm === norm || (userNorm.length >= 10 && norm.length >= 10 && userNorm.slice(-9) === norm.slice(-9));
  });
}

export function getOrCreateUserFallback(
  uidOrData: string | { uid: string; email: string; nome?: string; foto_perfil?: string; provider?: string },
  emailArg?: string,
  nomeArg?: string,
  fotoPerfilArg?: string,
  providerArg?: string,
  roleArg?: string,
  passwordArg?: string
): User {
  let uid: string;
  let email: string;
  let nome: string | undefined;
  let fotoPerfil: string | undefined;
  let provider: string | undefined;
  let role: string | undefined;
  let password: string | undefined;

  if (typeof uidOrData === "object" && uidOrData !== null) {
    uid = uidOrData.uid;
    email = uidOrData.email;
    nome = uidOrData.nome;
    fotoPerfil = uidOrData.foto_perfil;
    provider = uidOrData.provider;
  } else {
    uid = String(uidOrData);
    email = emailArg || "";
    nome = nomeArg;
    fotoPerfil = fotoPerfilArg;
    provider = providerArg;
    role = roleArg;
    password = passwordArg;
  }

  const existing = fallbackUsers.find(
    u => (uid && u.uid === uid) || (email && u.email && u.email.toLowerCase() === email.toLowerCase())
  );
  if (existing) {
    existing.lastActiveAt = new Date().toISOString();
    existing.lastLogin = new Date().toISOString();
    if (password) existing.password = password;
    saveUsers();
    return existing;
  }

  const cleanEmail = (email || '').toLowerCase().trim();
  const isDirector = cleanEmail === 'diretoria@helenawysocki.com' || cleanEmail === 'davidribeiromuller2009@gmail.com';

  const newUser: User = {
    id: Math.floor(Math.random() * 10000) + 1000,
    uid: uid,
    email: email,
    password: password,
    nome: nome || (email ? email.split('@')[0] : 'Usuário'),
    foto_perfil: fotoPerfil || '',
    provider: provider || 'local',
    role: isDirector ? 'Diretor' : (role || 'Aluno'),
    ativo: true,
    isAdmin: isDirector,
    institution: 'eloEscola',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    lastLogin: new Date().toISOString()
  };

  fallbackUsers.push(newUser);
  saveUsers();
  return newUser;
}

export function listAllUsersFallback(): User[] {
  return [...fallbackUsers];
}

export function getUserByEmailFallback(email: string): User | undefined {
  if (!email) return undefined;
  return fallbackUsers.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
}

export function getUserByIdFallback(id: number): User | undefined {
  return fallbackUsers.find(u => u.id === id);
}

export function getUserByUidFallback(uid: string): User | undefined {
  return fallbackUsers.find(u => u.uid === uid);
}

export function updateUserByIdFallback(id: number, data: Partial<User>, email?: string | null): User {
  let index = fallbackUsers.findIndex(u => u.id === id);
  if (index === -1 && email) {
    index = fallbackUsers.findIndex(u => u.email && u.email.toLowerCase() === email.toLowerCase());
  }
  if (index === -1) throw new Error("Usuário não encontrado");
  fallbackUsers[index] = { ...fallbackUsers[index], ...data, updatedAt: new Date().toISOString() };
  saveUsers();
  return fallbackUsers[index];
}

export function updateUserByUidFallback(uid: string, data: Partial<User>): User {
  const index = fallbackUsers.findIndex(u => u.uid === uid);
  if (index === -1) {
    if (data.email) {
      const emailIndex = fallbackUsers.findIndex(u => u.email && u.email.toLowerCase() === data.email!.toLowerCase());
      if (emailIndex !== -1) {
        fallbackUsers[emailIndex] = { ...fallbackUsers[emailIndex], ...data, uid, updatedAt: new Date().toISOString() };
        saveUsers();
        return fallbackUsers[emailIndex];
      }
    }
    throw new Error("Usuário não encontrado por UID");
  }
  fallbackUsers[index] = { ...fallbackUsers[index], ...data, updatedAt: new Date().toISOString() };
  saveUsers();
  return fallbackUsers[index];
}

export function updateUserPasswordFallback(userIdOrEmail: number | string, newPassword: string): User {
  let user: User | undefined;
  if (typeof userIdOrEmail === 'number') {
    user = fallbackUsers.find(u => u.id === userIdOrEmail);
  } else {
    user = fallbackUsers.find(u => u.email && u.email.toLowerCase() === String(userIdOrEmail).toLowerCase());
  }
  if (!user) throw new Error("Usuário não encontrado");
  user.password = newPassword;
  user.updatedAt = new Date().toISOString();
  saveUsers();
  return user;
}

export function blockUserByIdFallback(id: number, email?: string | null): User {
  let user = fallbackUsers.find(u => u.id === id);
  if (!user && email) {
    user = fallbackUsers.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
  }
  if (!user) throw new Error("Usuário não encontrado");
  user.ativo = false;
  saveUsers();
  return user;
}

export function unblockUserByIdFallback(id: number, email?: string | null): User {
  let user = fallbackUsers.find(u => u.id === id);
  if (!user && email) {
    user = fallbackUsers.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
  }
  if (!user) throw new Error("Usuário não encontrado");
  user.ativo = true;
  saveUsers();
  return user;
}

export function deleteUserByIdFallback(id: number, email?: string | null): User {
  let index = fallbackUsers.findIndex(u => u.id === id);
  if (index === -1 && email) {
    index = fallbackUsers.findIndex(u => u.email && u.email.toLowerCase() === email.toLowerCase());
  }
  if (index === -1) {
    // Return dummy deleted if not found to avoid crashing caller
    return { id, uid: `deleted-${id}`, email: email || "", nome: "Usuário Excluído", role: "Aluno", ativo: false, isAdmin: false };
  }
  const deleted = fallbackUsers.splice(index, 1)[0];
  saveUsers();
  return deleted;
}

export function deleteUserPermanentlyByIdFallback(id: number, email?: string | null): User {
  return deleteUserByIdFallback(id, email);
}

// --- DIGITAL PARENTAL ATTENDANCE AUTHORIZATIONS ---
export function createAuthorizationFallback(data: {
  id?: string;
  eventId: number;
  studentUserId: string | number;
  studentName: string;
  studentSchool?: string;
  studentClass?: string;
  guardianFullName: string;
  guardianRelationship: string;
  guardianContact?: string;
  authorizationText: string;
  consentVersion?: string;
  declarationAccepted?: boolean;
  signedAt?: string;
  signaturePath: string;
  signatureDataUrl?: string;
  verificationMethod?: string;
  verificationStatus?: "pending_review" | "confirmed" | "authorized";
  status?: "authorized" | "pending_signature" | "denied" | "revoked";
  eventSnapshot: {
    title: string;
    location: string;
    date: string;
    time: string;
    schoolName: string;
  };
}): EventAttendanceAuthorization {
  const now = new Date().toISOString();
  const id = data.id || `auth-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // Check if an authorization already exists for this student and event
  const existingIdx = fallbackAuthorizations.findIndex(
    a => String(a.studentUserId) === String(data.studentUserId) && Number(a.eventId) === Number(data.eventId)
  );

  const authRecord: EventAttendanceAuthorization = {
    id,
    eventId: Number(data.eventId),
    studentUserId: String(data.studentUserId),
    studentName: data.studentName,
    studentSchool: data.studentSchool || "Colégio Estadual de Araucária",
    studentClass: data.studentClass || "Geral",
    guardianFullName: data.guardianFullName,
    guardianRelationship: data.guardianRelationship,
    guardianContact: data.guardianContact || "",
    authorizationText: data.authorizationText,
    consentVersion: data.consentVersion || "v1.0-2026",
    declarationAccepted: data.declarationAccepted !== false,
    signedAt: data.signedAt || now,
    signaturePath: data.signaturePath,
    signatureDataUrl: data.signatureDataUrl,
    verificationMethod: data.verificationMethod || "digital_handwritten_signature",
    verificationStatus: data.verificationStatus || "confirmed",
    status: data.status || "authorized",
    eventSnapshot: data.eventSnapshot,
    createdAt: now,
    updatedAt: now,
  };

  if (existingIdx !== -1) {
    fallbackAuthorizations[existingIdx] = authRecord;
  } else {
    fallbackAuthorizations.unshift(authRecord);
  }

  saveAuthorizations();
  return authRecord;
}

export function getAuthorizationByStudentAndEventFallback(
  studentUserId: string | number,
  eventId: number
): EventAttendanceAuthorization | null {
  const found = fallbackAuthorizations.find(
    a => String(a.studentUserId) === String(studentUserId) && Number(a.eventId) === Number(eventId) && a.status !== "revoked"
  );
  return found || null;
}

export function listAuthorizationsByEventFallback(eventId: number): EventAttendanceAuthorization[] {
  return fallbackAuthorizations.filter(a => Number(a.eventId) === Number(eventId));
}

export function listAuthorizationsByStudentFallback(studentUserId: string | number): EventAttendanceAuthorization[] {
  return fallbackAuthorizations.filter(a => String(a.studentUserId) === String(studentUserId));
}

export function listAllAuthorizationsFallback(): EventAttendanceAuthorization[] {
  return [...fallbackAuthorizations];
}

export function revokeAuthorizationFallback(id: string, reason?: string): EventAttendanceAuthorization {
  const index = fallbackAuthorizations.findIndex(a => a.id === id);
  if (index === -1) throw new Error("Autorização não encontrada");
  fallbackAuthorizations[index].status = "revoked";
  fallbackAuthorizations[index].revokedAt = new Date().toISOString();
  saveAuthorizations();
  return fallbackAuthorizations[index];
}

