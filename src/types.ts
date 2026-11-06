export interface User {
  id: number;
  uid: string;
  nome: string;
  email: string;
  password?: string;
  foto_perfil?: string;
  provider?: string;
  role?: string; // 'ADMIN', 'Diretor', 'Pedagogo(a)', 'Aluno', 'Funcionário', 'Professor', 'Escola', 'Convidado'
  ativo: boolean;
  isAdmin: boolean;
  isGuest?: boolean;
  escolaId?: number;
  escolaNome?: string;
  identificador?: string;
  cpf?: string;
  phone?: string;
  birthdate?: string;
  gender?: string;
  institution?: string;
  createdAt?: string;
  updatedAt?: string;
  lastActiveAt?: string;
  lastLogin?: string;
}

export interface InstitutionalAccount {
  id: number;
  escolaId: number;
  escolaNome: string;
  identificador: string;
  email: string;
  password?: string;
  status: "ativo" | "bloqueado";
  criadoPor: string;
  responsavel?: string;
  cargo?: string;
  createdAt: string;
  lastLogin?: string;
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
  city?: string | null; // 'Araucária' | 'Curitiba'
  schoolId?: number | null;
  schoolName?: string | null;
  category?: string | null;
  isArchived?: boolean;
  archivedAt?: string;
}

export interface EventParticipationHistory {
  id: string | number;
  userId: number | string;
  eventId: number;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  eventLocation: string;
  eventSchool: string;
  status: "Inscrito" | "Presente" | "Ausente" | "Concluído";
  enrolledAt: string;
}

export interface EventAttendanceAuthorization {
  id: string;
  eventId: number;
  studentUserId: string | number;
  studentName: string;
  studentSchool: string;
  studentClass?: string;
  guardianFullName: string;
  guardianRelationship: string;
  guardianContact?: string;
  authorizationText: string;
  consentVersion: string;
  declarationAccepted: boolean;
  signedAt: string;
  signaturePath: string;
  signatureDataUrl?: string;
  verificationMethod: string;
  verificationStatus: "pending_review" | "confirmed" | "authorized";
  status: "authorized" | "pending_signature" | "denied" | "revoked";
  eventSnapshot: {
    title: string;
    location: string;
    date: string;
    time: string;
    schoolName: string;
  };
  createdAt: string;
  updatedAt?: string;
  revokedAt?: string;
}

