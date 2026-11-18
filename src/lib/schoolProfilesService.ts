import { getSupabaseClient, isSupabaseConfigured } from "./supabase.ts";
import { ARAUCARIA_SCHOOLS, type SchoolProfile } from "./schoolsData.ts";

/**
 * Perfis institucionais editáveis (rodada 26).
 * ---------------------------------------------------------------------------
 * Os dados das 6 escolas viviam em `schoolsData.ts` — constantes compiladas.
 * A área "Contas escolares" do painel mostrava a conta de acesso, mas não
 * havia como **ver nem corrigir** as informações da escola (telefone, e-mail,
 * endereço, modalidades, histórico...).
 *
 * Aqui as informações passam a ter duas camadas:
 *
 *  1. **base estática** (`ARAUCARIA_SCHOOLS`) — o retrato verificado do TCC,
 *     sempre disponível, mesmo offline;
 *  2. **override editável** (tabela `school_profiles`) — o que o Chefe
 *     Administrador corrigir no painel.
 *
 * O resultado é a mescla das duas: campo vazio no banco não apaga o dado
 * estático. Assim, editar é opcional e nunca deixa a escola sem informação.
 */

export interface PerfilEditavel {
  slug: string;
  name?: string;
  shortName?: string;
  type?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  address?: string;
  cep?: string;
  phone?: string;
  email?: string;
  website?: string;
  network?: string;
  nre?: string;
  modalities?: string[];
  historicalOverview?: string;
  pedagogicalHighlights?: string[];
  infrastructure?: string[];
  latitude?: number | null;
  longitude?: number | null;
  image?: string;
}

/** Campos de texto simples do formulário, com o rótulo exibido. */
export const CAMPOS_ESCOLA: Array<{
  campo: keyof PerfilEditavel;
  rotulo: string;
  tipo?: "text" | "email" | "tel" | "textarea" | "url";
  placeholder?: string;
  largo?: boolean;
}> = [
  { campo: "name", rotulo: "Nome oficial", placeholder: "Colégio Estadual Professor..." },
  { campo: "shortName", rotulo: "Nome curto", placeholder: "C.E. Prof. ..." },
  { campo: "type", rotulo: "Tipo de instituição", placeholder: "Colégio Estadual (Ensino Médio)" },
  { campo: "network", rotulo: "Rede de ensino", placeholder: "Rede Estadual de Ensino do Paraná" },
  { campo: "nre", rotulo: "NRE", placeholder: "NRE Área Metropolitana Sul" },
  { campo: "neighborhood", rotulo: "Bairro", placeholder: "Centro" },
  { campo: "city", rotulo: "Cidade", placeholder: "Araucária" },
  { campo: "state", rotulo: "UF", placeholder: "PR" },
  { campo: "address", rotulo: "Endereço", placeholder: "Rua ..., 000", largo: true },
  { campo: "cep", rotulo: "CEP", placeholder: "83700-000" },
  { campo: "phone", rotulo: "Telefone", tipo: "tel", placeholder: "(41) 3642-0000" },
  { campo: "email", rotulo: "E-mail institucional", tipo: "email", placeholder: "escola@seed.pr.gov.br" },
  { campo: "website", rotulo: "Site oficial (opcional)", tipo: "url", placeholder: "https://..." },
];

/** Campos de lista (um item por linha no formulário). */
export const CAMPOS_LISTA_ESCOLA: Array<{ campo: keyof PerfilEditavel; rotulo: string }> = [
  { campo: "modalities", rotulo: "Modalidades de ensino (uma por linha)" },
  { campo: "pedagogicalHighlights", rotulo: "Destaques pedagógicos (um por linha)" },
  { campo: "infrastructure", rotulo: "Infraestrutura (um por linha)" },
];

/** Converte a linha do banco para o formato editável. */
function mapPerfil(row: any): PerfilEditavel {
  const lista = (valor: unknown): string[] | undefined => {
    if (Array.isArray(valor)) return valor.map(String).filter(Boolean);
    return undefined;
  };
  return {
    slug: row.slug,
    name: row.name || undefined,
    shortName: row.short_name || undefined,
    type: row.type || undefined,
    neighborhood: row.neighborhood || undefined,
    city: row.city || undefined,
    state: row.state || undefined,
    address: row.address || undefined,
    cep: row.cep || undefined,
    phone: row.phone || undefined,
    email: row.email || undefined,
    website: row.website || undefined,
    network: row.network || undefined,
    nre: row.nre || undefined,
    modalities: lista(row.modalities),
    historicalOverview: row.historical_overview || undefined,
    pedagogicalHighlights: lista(row.pedagogical_highlights),
    infrastructure: lista(row.infrastructure),
    latitude: typeof row.latitude === "number" ? row.latitude : null,
    longitude: typeof row.longitude === "number" ? row.longitude : null,
    image: row.image || undefined,
  };
}

/**
 * Mescla o perfil estático com o que estiver editado no banco.
 * Campo ausente/vazio no banco NÃO apaga o dado estático.
 */
export function mesclarPerfil(
  base: SchoolProfile,
  override: PerfilEditavel | null | undefined
): SchoolProfile {
  if (!override) return base;

  const texto = (novo?: string, antigo?: string) => {
    const n = (novo || "").trim();
    return n ? n : antigo;
  };
  const lista = (nova?: string[], antiga?: string[]) =>
    nova && nova.length > 0 ? nova : antiga;

  return {
    ...base,
    name: texto(override.name, base.name),
    shortName: texto(override.shortName, base.shortName),
    type: texto(override.type, base.type),
    neighborhood: texto(override.neighborhood, base.neighborhood),
    city: texto(override.city, base.city),
    state: texto(override.state, base.state),
    address: texto(override.address, base.address),
    cep: texto(override.cep, base.cep),
    phone: texto(override.phone, base.phone),
    email: texto(override.email, base.email),
    network: texto(override.network, base.network),
    nre: texto(override.nre, base.nre),
    modalities: lista(override.modalities, base.modalities),
    historicalOverview: texto(override.historicalOverview, base.historicalOverview),
    pedagogicalHighlights: lista(override.pedagogicalHighlights, base.pedagogicalHighlights),
    infrastructure: lista(override.infrastructure, base.infrastructure),
    coordinates:
      typeof override.latitude === "number" && typeof override.longitude === "number"
        ? { lat: override.latitude, lng: override.longitude }
        : base.coordinates,
    image: texto(override.image, base.image),
  };
}

/** Lê os overrides salvos no banco (índice por slug). */
export async function carregarPerfisEditados(): Promise<{
  perfis: Record<string, PerfilEditavel>;
  error: any;
}> {
  if (!isSupabaseConfigured()) return { perfis: {}, error: null };

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from("school_profiles").select("*");
    if (error) {
      const msg = String(error.message || "");
      if (error.code === "42P01" || /does not exist|schema cache/i.test(msg)) {
        // Tabela ainda não criada: o app segue com os dados estáticos.
        return { perfis: {}, error: null };
      }
      return { perfis: {}, error };
    }

    const perfis: Record<string, PerfilEditavel> = {};
    for (const row of data ?? []) {
      if (row?.slug) perfis[row.slug] = mapPerfil(row);
    }
    return { perfis, error: null };
  } catch (err) {
    return { perfis: {}, error: err };
  }
}

/** Aplica os overrides sobre a lista estática. */
export function aplicarPerfisEditados(
  perfis: Record<string, PerfilEditavel>
): SchoolProfile[] {
  return ARAUCARIA_SCHOOLS.map((base) => mesclarPerfil(base, perfis[base.slug]));
}

/** Lista pronta para a UI: estático + edições do banco. */
export async function carregarEscolas(): Promise<{
  escolas: SchoolProfile[];
  error: any;
}> {
  const { perfis, error } = await carregarPerfisEditados();
  return { escolas: aplicarPerfisEditados(perfis), error };
}

/**
 * Salva as informações editadas de uma escola (upsert por slug).
 * Só o Chefe Administrador chega até aqui pela interface.
 */
export async function salvarPerfilEscola(
  perfil: PerfilEditavel,
  atualizadoPor: string
): Promise<{ perfil: PerfilEditavel | null; error: any }> {
  if (!isSupabaseConfigured()) {
    return { perfil: null, error: new Error("Supabase não configurado no cliente") };
  }
  if (!perfil.slug) {
    return { perfil: null, error: new Error("Escola não identificada") };
  }

  const limpar = (v?: string) => {
    const t = (v || "").trim();
    return t ? t : null;
  };
  const listaLimpa = (v?: string[]) => {
    const arr = (v || []).map((s) => s.trim()).filter(Boolean);
    return arr.length > 0 ? arr : [];
  };

  const payload = {
    slug: perfil.slug,
    name: limpar(perfil.name),
    short_name: limpar(perfil.shortName),
    type: limpar(perfil.type),
    neighborhood: limpar(perfil.neighborhood),
    city: limpar(perfil.city),
    state: limpar(perfil.state),
    address: limpar(perfil.address),
    cep: limpar(perfil.cep),
    phone: limpar(perfil.phone),
    email: limpar(perfil.email),
    website: limpar(perfil.website),
    network: limpar(perfil.network),
    nre: limpar(perfil.nre),
    modalities: listaLimpa(perfil.modalities),
    historical_overview: limpar(perfil.historicalOverview),
    pedagogical_highlights: listaLimpa(perfil.pedagogicalHighlights),
    infrastructure: listaLimpa(perfil.infrastructure),
    latitude: typeof perfil.latitude === "number" ? perfil.latitude : null,
    longitude: typeof perfil.longitude === "number" ? perfil.longitude : null,
    image: limpar(perfil.image),
    updated_at: new Date().toISOString(),
    updated_by: atualizadoPor || null,
  };

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("school_profiles")
      .upsert(payload, { onConflict: "slug" })
      .select();

    if (error) return { perfil: null, error };
    if (!data || data.length === 0) {
      return { perfil: null, error: new Error("As informações não foram gravadas.") };
    }
    return { perfil: mapPerfil(data[0]), error: null };
  } catch (err) {
    return { perfil: null, error: err };
  }
}

/** Converte um perfil completo (estático ou mesclado) para o formato editável. */
export function paraEditavel(escola: SchoolProfile): PerfilEditavel {
  return {
    slug: escola.slug,
    name: escola.name,
    shortName: escola.shortName,
    type: escola.type,
    neighborhood: escola.neighborhood,
    city: escola.city,
    state: escola.state,
    address: escola.address,
    cep: escola.cep,
    phone: escola.phone,
    email: escola.email,
    network: escola.network,
    nre: escola.nre,
    modalities: escola.modalities,
    historicalOverview: escola.historicalOverview,
    pedagogicalHighlights: escola.pedagogicalHighlights,
    infrastructure: escola.infrastructure,
    latitude: escola.coordinates?.lat ?? null,
    longitude: escola.coordinates?.lng ?? null,
    image: escola.image,
  };
}
