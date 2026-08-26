export interface User {
  id: number;
  uid: string;
  nome: string;
  email: string;
  password?: string;
  foto_perfil?: string;
  provider?: string;
  role?: string;
  ativo: boolean;
  isAdmin: boolean;
  cpf?: string;
  phone?: string;
  birthdate?: string;
  gender?: string;
  institution?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Event {
  id: number;
  title: string;
  location: string;
  day: number;
  month: number;
  year: number;
  time: string;
  isPaid: boolean;
  price?: string | null;
  requirements?: string | null;
  description?: string | null;
  creatorRole?: string | null;
  website?: string | null;
  image?: string | null;
  lat?: number | null;
  lng?: number | null;
  creatorId?: number | null;
  createdAt?: string;
}
