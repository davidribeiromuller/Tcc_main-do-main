import { Event, User } from "../types";

const today = new Date();
const currentYear = today.getFullYear();
const currentMonth = today.getMonth(); // 0-indexed

export const defaultEvents: Event[] = [
  {
    id: 9901,
    title: "Feira de Ciências e Tecnologia",
    location: "Auditório Principal • Bloco A (Helena Wysocki)",
    day: 15,
    month: currentMonth,
    year: currentYear,
    time: "09:00",
    isPaid: false,
    price: null,
    requirements: "Entrada livre para estudantes de todas as séries.",
    website: "https://escola.gamechangers.com.br",
    image: "https://images.unsplash.com/photo-1507537297725-24a1c029d3ca?w=600&auto=format&fit=crop",
    lat: -25.4385,
    lng: -49.1925,
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
    lat: -25.4390,
    lng: -49.1932,
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
    lat: -25.4379,
    lng: -49.1918,
    creatorId: 9901,
    createdAt: new Date().toISOString()
  },
  {
    id: 9904,
    title: "Palestra: Introdução à IA Generativa",
    location: "Teatro Municipal de Pinhais",
    day: 18,
    month: (currentMonth + 1) % 12,
    year: currentMonth === 11 ? currentYear + 1 : currentYear,
    time: "19:00",
    isPaid: true,
    price: "R$ 15,00",
    requirements: "Inscrição online antecipada.",
    website: "https://escola.gamechangers.com.br",
    image: "https://images.unsplash.com/photo-1591453089816-0fbb971b454c?w=600&auto=format&fit=crop",
    lat: -25.4412,
    lng: -49.1876,
    creatorId: 9901,
    createdAt: new Date().toISOString()
  }
];

export const defaultUsers: User[] = [
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
