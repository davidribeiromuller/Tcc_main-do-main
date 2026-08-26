import { Event, User } from '../types.ts';
import fs from 'fs';
import path from 'path';

// Define JSON directory and file paths
const DB_DIR = path.join(process.cwd(), 'src/db');
const EVENTS_FILE = path.join(DB_DIR, 'fallback_events.json');
const USERS_FILE = path.join(DB_DIR, 'fallback_users.json');

// Ensure database directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Get current date details to keep the default events fresh and exciting
const today = new Date();
const currentYear = today.getFullYear();
const currentMonth = today.getMonth(); // 0-indexed

// Default fallback events
const defaultEvents: Event[] = [
  {
    id: 9901,
    title: "Feira de Ciências e Tecnologia",
    location: "Auditório Principal • Bloco A",
    day: 15,
    month: currentMonth,
    year: currentYear,
    time: "09:00",
    isPaid: false,
    price: null,
    requirements: "Entrada livre para estudantes de todas as séries.",
    website: "https://escola.gamechangers.com.br",
    image: "https://images.unsplash.com/photo-1507537297725-24a1c029d3ca?w=600&auto=format&fit=crop",
    creatorId: 9901,
    createdAt: new Date().toISOString()
  },
  {
    id: 9902,
    title: "Campeonato de Game Design",
    location: "Laboratório de Informática Sandbox",
    day: 22,
    month: currentMonth,
    year: currentYear,
    time: "14:00",
    isPaid: false,
    price: null,
    requirements: "Traga seu notebook ou utilize as máquinas do laboratório.",
    website: "https://escola.gamechangers.com.br",
    image: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600&auto=format&fit=crop",
    creatorId: 9901,
    createdAt: new Date().toISOString()
  },
  {
    id: 9903,
    title: "Workshop de Programação Web com React",
    location: "Sala Multimeios • Bloco C",
    day: 5,
    month: (currentMonth + 1) % 12,
    year: currentMonth === 11 ? currentYear + 1 : currentYear,
    time: "10:30",
    isPaid: false,
    price: null,
    requirements: "Noções básicas de HTML e CSS.",
    website: "https://escola.gamechangers.com.br",
    image: "https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=600&auto=format&fit=crop",
    creatorId: 9901,
    createdAt: new Date().toISOString()
  },
  {
    id: 9904,
    title: "Palestra: Introdução à IA Generativa",
    location: "Teatro Municipal",
    day: 18,
    month: (currentMonth + 1) % 12,
    year: currentMonth === 11 ? currentYear + 1 : currentYear,
    time: "19:00",
    isPaid: true,
    price: "R$ 15,00",
    requirements: "Inscrição online antecipada.",
    website: "https://escola.gamechangers.com.br",
    image: "https://images.unsplash.com/photo-1591453089816-0fbb971b454c?w=600&auto=format&fit=crop",
    creatorId: 9901,
    createdAt: new Date().toISOString()
  }
];

// Default fallback users
const defaultUsers: User[] = [
  {
    id: 9901,
    uid: "fallback-admin-uid",
    nome: "Diretoria Helena Wysocki",
    email: "diretoria@helenawysocki.com",
    password: "senha123",
    foto_perfil: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150",
    provider: "local",
    role: "Diretor",
    ativo: true,
    isAdmin: true,
    institution: "Escola estadual Helena Wysocki",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 9902,
    uid: "fallback-funcionario-uid",
    nome: "Funcionário Helena Wysocki",
    email: "funcionario@helenawysocki.com",
    password: "senha123",
    foto_perfil: "https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=150",
    provider: "local",
    role: "Funcionário",
    ativo: true,
    isAdmin: false,
    institution: "Escola estadual Helena Wysocki",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 9903,
    uid: "fallback-cliente-uid",
    nome: "Cliente Visitante",
    email: "cliente@helenawysocki.com",
    password: "senha123",
    foto_perfil: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150",
    provider: "local",
    role: "Cliente",
    ativo: true,
    isAdmin: false,
    institution: "Escola estadual Helena Wysocki",
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
    institution: "Escola estadual Helena Wysocki",
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
    institution: "Escola estadual Helena Wysocki",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

// Load / Initialize events list
export let fallbackEvents: Event[] = [];
try {
  if (fs.existsSync(EVENTS_FILE)) {
    const raw = fs.readFileSync(EVENTS_FILE, 'utf-8');
    fallbackEvents = JSON.parse(raw);
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
    
    // Ensure all default users are present with passwords
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

// Helpers to save database back to file system
function saveEvents() {
  try {
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(fallbackEvents, null, 2), 'utf-8');
  } catch (err) {
    console.error("Error saving fallback events file:", err);
  }
}

function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(fallbackUsers, null, 2), 'utf-8');
  } catch (err) {
    console.error("Error saving fallback users file:", err);
  }
}

// --- FALLBACK USER OPERATIONS ---

export function getOrCreateUserFallback(
  uid: string,
  email: string,
  nome?: string,
  fotoPerfil?: string,
  provider: string = 'google',
  role?: string,
  password?: string
): User {
  const cleanEmail = (email || '').trim().toLowerCase();

  let existingUser = fallbackUsers.find(u => u.uid === uid);
  if (!existingUser && cleanEmail) {
    existingUser = fallbackUsers.find(u => u.email.toLowerCase() === cleanEmail);
  }
  
  if (existingUser) {
    existingUser.uid = uid;
    existingUser.email = cleanEmail || existingUser.email;
    existingUser.provider = provider;
    if (password) {
      existingUser.password = password;
    }
    if (fotoPerfil && !existingUser.foto_perfil) {
      existingUser.foto_perfil = fotoPerfil;
    }
    if (nome && (!existingUser.nome || existingUser.nome === existingUser.email.split('@')[0])) {
      existingUser.nome = nome;
    }
    existingUser.updatedAt = new Date().toISOString();
    
    // Safety check for existing user roles in fallback
    if (existingUser.role === 'Funcionário' && existingUser.email !== 'funcionario@helenawysocki.com') {
      existingUser.role = 'Aluno';
      existingUser.isAdmin = false;
    }
    
    saveUsers();
    return existingUser;
  }

  const isFirstUser = fallbackUsers.length === 0;
  let targetRole = role || (isFirstUser ? 'Diretor' : 'Aluno');
  
  // Strict restriction: Only funcionario@helenawysocki.com can have the "Funcionário" role
  if (targetRole === 'Funcionário' && cleanEmail !== 'funcionario@helenawysocki.com') {
    targetRole = isFirstUser ? 'Diretor' : 'Aluno';
  }
  const isAdmin = targetRole === 'Diretor' || isFirstUser;

  const newUser: User = {
    id: Math.floor(Math.random() * 10000) + 1000,
    uid,
    email: cleanEmail,
    password,
    nome: nome || cleanEmail.split('@')[0],
    foto_perfil: fotoPerfil || '',
    provider,
    role: targetRole,
    ativo: true,
    isAdmin: isAdmin,
    institution: "Escola estadual Helena Wysocki",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  fallbackUsers.push(newUser);
  saveUsers();
  return newUser;
}

export function getUserByUidFallback(uid: string): User | null {
  return fallbackUsers.find(u => u.uid === uid) || null;
}

export function getUserByEmailFallback(email: string): User | null {
  const clean = (email || "").trim().toLowerCase();
  if (!clean) return null;
  return fallbackUsers.find(u => (u.email || "").trim().toLowerCase() === clean) || null;
}

export function updateUserByUidFallback(uid: string, data: any): User {
  const index = fallbackUsers.findIndex(u => u.uid === uid);
  if (index === -1) {
    throw new Error('Usuário não encontrado para atualizar na memória');
  }
  const updatedData = { ...data };
  if (data.role !== undefined) {
    const user = fallbackUsers[index];
    if (data.role === 'Funcionário' && user.email !== 'funcionario@helenawysocki.com') {
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
  const updatedUser = {
    ...fallbackUsers[index],
    ...updatedData,
    updatedAt: new Date().toISOString()
  };
  fallbackUsers[index] = updatedUser;
  saveUsers();
  return updatedUser;
}

export function updateUserByIdFallback(id: number, data: any): User {
  const index = fallbackUsers.findIndex(u => u.id === id);
  if (index === -1) {
    throw new Error('Usuário não encontrado por ID para atualizar na memória');
  }
  const updatedData = { ...data };
  if (data.role !== undefined) {
    const user = fallbackUsers[index];
    if (data.role === 'Funcionário' && user.email !== 'funcionario@helenawysocki.com') {
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
  const updatedUser = {
    ...fallbackUsers[index],
    ...updatedData,
    updatedAt: new Date().toISOString()
  };
  fallbackUsers[index] = updatedUser;
  saveUsers();
  return updatedUser;
}

export function listAllUsersFallback(): User[] {
  return [...fallbackUsers].sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA;
  });
}

export function deleteUserByIdFallback(id: number): User {
  const index = fallbackUsers.findIndex(u => u.id === id);
  if (index === -1) {
    throw new Error('Usuário não encontrado para deletar na memória');
  }
  const deletedUser = fallbackUsers[index];
  fallbackUsers.splice(index, 1);
  saveUsers();
  return deletedUser;
}

// --- FALLBACK EVENT OPERATIONS ---

export function listAllEventsFallback(): Event[] {
  return [...fallbackEvents].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    if (a.month !== b.month) return b.month - a.month;
    return b.day - a.day;
  });
}

export function createNewEventFallback(data: {
  title: string;
  location: string;
  day: number;
  month: number;
  year: number;
  time?: string;
  isPaid?: boolean;
  price?: string | null;
  requirements?: string | null;
  website?: string | null;
  image?: string | null;
  creatorId?: number;
}): Event {
  const newEvent: Event = {
    id: Math.floor(Math.random() * 10000) + 1000,
    title: data.title,
    location: data.location,
    day: Number(data.day),
    month: Number(data.month),
    year: Number(data.year),
    time: data.time || '18:00',
    isPaid: !!data.isPaid,
    price: data.price || null,
    requirements: data.requirements || null,
    website: data.website || null,
    image: data.image || "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=400",
    creatorId: data.creatorId || null,
    createdAt: new Date().toISOString()
  };

  fallbackEvents.push(newEvent);
  saveEvents();
  return newEvent;
}

export function deleteEventByIdFallback(id: number): Event {
  const index = fallbackEvents.findIndex(e => e.id === id);
  if (index === -1) {
    throw new Error('Evento não encontrado para excluir na memória');
  }
  const deletedEvent = fallbackEvents[index];
  fallbackEvents.splice(index, 1);
  saveEvents();
  return deletedEvent;
}
