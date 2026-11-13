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
  /** Matrícula/RA fornecida pela instituição (vínculo escolar). */
  matricula?: string;
  /** E-mail pessoal de recuperação (não institucional). */
  personalEmail?: string;
  /** true quando a conta foi criada com senha provisória. */
  mustChangePassword?: boolean;
  /** Quando o vínculo CPF + matrícula foi confirmado. */
  linkVerifiedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  lastActiveAt?: string;
  lastLogin?: string;
}

export interface InstitutionalAccount {
  id: number;
  escolaId: number;
  escolaNome: string;
  escolaSlug?: string;
  identificador: string;
  email: string;
  password?: string;
  status: "ativo" | "bloqueado";
  accountStatus?: "active" | "suspended" | "revoked";
  verificationStatus?: "pending_verification" | "verified" | "rejected";
  verificationMethod?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  responsavel?: string;
  representativeName?: string;
  institutionalContact?: string;
  cargo?: string;
  criadoPor: string;
  createdAt: string;
  updatedAt?: string;
  lastLogin?: string;
  lastLoginAt?: string;
}

export interface SchoolAccountAuditLog {
  id: number;
  schoolId: number;
  accountId?: number;
  action: string;
  resource: string;
  details?: string;
  performedBy: string;
  performedAt: string;
}

export interface EventArchiveLog {
  id: number;
  processedAt: string;
  archivedCount: number;
  details: string;
  status: "success" | "error";
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

