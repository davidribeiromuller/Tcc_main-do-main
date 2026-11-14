/**
 * Busca de endereços (geocoding) — resolve "rua X, 123" em coordenadas.
 *
 * ## Por que este módulo existe
 *
 * O campo "Localização / Endereço" do formulário de evento era um `<input>` de
 * texto livre: o admin digitava o endereço, mas nada acontecia — o evento
 * ficava sem coordenadas e o mapa precisava adivinhar a posição. A busca do
 * mapa, por sua vez, só comparava o termo com nome/bairro de escola e com o
 * título do evento, então procurar por "Rua das Flores" não retornava nada.
 *
 * Aqui o endereço é resolvido de verdade, usando o Nominatim (OpenStreetMap,
 * sem chave de API), com o resultado limitado à região de Araucária/Curitiba.
 *
 * ## Por que Nominatim e não Google Places
 *
 * O app é um TCC publicado no GitHub Pages e não depende de chave de IA nem de
 * billing. O Nominatim é público, gratuito e não exige chave. A política de uso
 * pede no máximo 1 requisição/segundo e um `User-Agent` identificável — ambas
 * respeitadas abaixo (cache + fila de 1 req/s + `email`/`UA` do projeto).
 *
 * ## Geocoding reverso é opcional
 *
 * `descreverCoordenadas` transforma coordenadas em endereço legível (usado
 * quando o admin usa o GPS). Se o serviço falhar, o app segue funcionando: a
 * função devolve `null` e a interface mantém o que o usuário digitou.
 */

import { ARAUCARIA_SCHOOLS } from "./schoolsData";

/** Resultado de uma busca de endereço, já pronto para a interface. */
export interface EnderecoEncontrado {
  /** Endereço completo em uma linha, para preencher o campo de texto. */
  displayName: string;
  /** Nome curto (rua + número), mais legível que o `displayName` completo. */
  shortName: string;
  lat: number;
  lng: number;
  /** Cidade reconhecida (Araucária, Curitiba ou null). */
  city: "Araucária" | "Curitiba" | null;
  /** Bairro, quando disponível. */
  neighborhood: string | null;
  /** Tipo do resultado (house, road, school...). Útil para ordenar. */
  type: string;
  /**
   * Categoria do OSM (`highway`, `amenity`, `place`...).
   *
   * Precisa vir separada do `type` porque o Nominatim devolve ruas como
   * `type: "tertiary"` / `category: "highway"` — só o `type` não identifica
   * que é via.
   */
  category: string;
}

export interface SugestaoEndereco {
  displayName: string;
  shortName: string;
  lat: number;
  lng: number;
  city: "Araucária" | "Curitiba" | null;
  type: string;
  category: string;
}

/** Caixa (viewbox) que cobre Araucária e Curitiba, para restringir a busca. */
const REGIAO = {
  // [lon_min, lat_max, lon_max, lat_min] no formato esperado pelo Nominatim
  viewbox: "-49.75,-25.30,-49.10,-25.75",
  // Enviesa resultados para dentro da caixa, sem excluir o resto do país.
  bounded: 0,
};

const NOMINATIM = "https://nominatim.openstreetmap.org";
const UA = "EloEscola-TCC/1.0 (app escolar; contato: diretoria@helenawysocki.com)";

/**
 * Intervalo mínimo entre requisições.
 *
 * A política do Nominatim é ≤ 1 req/s. Se o app disparar várias buscas (o
 * usuário digitando), precisamos serializar. 1100 ms dá margem.
 */
const INTERVALO_MIN_MS = 1100;
let ultimaRequisicao = 0;

/** Cache em memória: evita repetir a mesma consulta ao digitar e apagar. */
const cache = new Map<string, SugestaoEndereco[]>();
const CACHE_MAX = 80;

/**
 * Espera o tempo necessário para respeitar o limite de 1 req/s.
 */
async function respeitarLimite(): Promise<void> {
  const agora = Date.now();
  const espera = INTERVALO_MIN_MS - (agora - ultimaRequisicao);
  if (espera > 0) {
    await new Promise((resolve) => setTimeout(resolve, espera));
  }
  ultimaRequisicao = Date.now();
}

/** Normaliza a cidade devolvida pelo Nominatim para as duas do app. */
function normalizarCidade(valor: unknown): "Araucária" | "Curitiba" | null {
  if (typeof valor !== "string") return null;
  const limpo = valor
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (limpo === "araucaria") return "Araucária";
  if (limpo === "curitiba") return "Curitiba";
  return null;
}

/**
 * Monta um nome curto a partir das partes do endereço.
 *
 * O `display_name` do Nominatim é longo ("Rua X, 123 - Bairro, Curitiba -
 * Paraná, 80000-000, Brasil"). Para o campo do formulário, "Rua X, 123 - Bairro"
 * é mais útil.
 */
function montarNomeCurto(item: any): string {
  const endereco = item?.address ?? {};
  const rua = endereco.road || endereco.pedestrian || endereco.footway || endereco.path;
  const numero = endereco.house_number;
  const bairro = endereco.suburb || endereco.neighbourhood || endereco.city_district;

  if (rua) {
    const comNumero = numero ? `${rua}, ${numero}` : rua;
    return bairro ? `${comNumero} - ${bairro}` : comNumero;
  }

  // Sem rua (ex.: uma escola ou parque): usa o nome do lugar.
  const nome = item?.name || item?.display_name?.split(",")[0];
  if (nome) return bairro ? `${nome} - ${bairro}` : nome;

  return item?.display_name ?? "";
}

/** Converte um item cru do Nominatim no formato da interface. */
function converter(item: any): SugestaoEndereco {
  const endereco = item?.address ?? {};
  return {
    displayName: item?.display_name ?? "",
    shortName: montarNomeCurto(item),
    lat: Number(item?.lat),
    lng: Number(item?.lon),
    city: normalizarCidade(endereco.city || endereco.town || endereco.municipality),
    type: item?.type ?? "place",
    category: item?.category ?? item?.class ?? "",
  };
}

/**
 * Busca endereços a partir de texto livre.
 *
 * Aceita tanto "Rua das Flores 123" quanto "Escola Helena Wysocki",
 * "Centro Araucária", "Av. Sete de Setembro Curitiba". Devolve no máximo 6
 * resultados, já ordenados (ruas e locais nomeados primeiro).
 *
 * @param termo  o que o usuário digitou
 * @param limite quantidade máxima de sugestões
 */
export async function buscarEnderecos(
  termo: string,
  limite = 6
): Promise<SugestaoEndereco[]> {
  const consulta = (termo || "").trim();

  // Menos de 3 caracteres gera ruído e gasta requisições à toa.
  if (consulta.length < 3) return [];

  try {
    return await buscarNoServico(consulta, limite);
  } catch (err) {
    /**
     * Serviço fora do ar: ainda assim o admin precisa conseguir cadastrar o
     * evento. As escolas do catálogo local têm endereço e coordenadas e são os
     * destinos mais comuns, então servem de sugestão offline. Se nada casar,
     * repassamos o erro para a UI avisar.
     */
    const locais = buscarNasEscolasLocais(consulta, limite);
    if (locais.length > 0) return locais;
    throw err;
  }
}

/**
 * Fallback offline: casa o termo com as escolas conhecidas em `schoolsData`.
 *
 * Não é geocoding — é busca no catálogo local, com coordenadas já verificadas.
 */
function buscarNasEscolasLocais(termo: string, limite: number): SugestaoEndereco[] {
  const alvo = termo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const partes = alvo.split(/\s+/).filter(Boolean);

  return ARAUCARIA_SCHOOLS.filter((escola) => {
    const texto = [escola.name, escola.shortName, escola.address, escola.neighborhood, escola.city]
      .join(" ")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return partes.every((p) => texto.includes(p));
  })
    .slice(0, limite)
    .map((escola) => ({
      displayName: `${escola.address} - ${escola.neighborhood}, ${escola.city}`,
      shortName: `${escola.shortName} - ${escola.neighborhood}`,
      lat: escola.coordinates.lat,
      lng: escola.coordinates.lng,
      city: normalizarCidade(escola.city),
      type: "school",
      category: "amenity",
    }));
}

async function buscarNoServico(
  consulta: string,
  limite: number
): Promise<SugestaoEndereco[]> {

  const chave = `${consulta.toLowerCase()}|${limite}`;
  const emCache = cache.get(chave);
  if (emCache) return emCache;

  await respeitarLimite();

  const params = new URLSearchParams({
    q: consulta,
    format: "jsonv2",
    addressdetails: "1",
    limit: String(Math.min(Math.max(limite, 1), 10)),
    countrycodes: "br",
    "accept-language": "pt-BR",
    viewbox: REGIAO.viewbox,
    bounded: String(REGIAO.bounded),
  });

  const resposta = await fetch(`${NOMINATIM}/search?${params.toString()}`, {
    headers: { Accept: "application/json", "User-Agent": UA },
  });

  if (!resposta.ok) {
    throw new Error(
      resposta.status === 429
        ? "Muitas buscas em pouco tempo. Aguarde alguns segundos e tente novamente."
        : `Não foi possível buscar o endereço (HTTP ${resposta.status}).`
    );
  }

  const dados = await resposta.json();
  if (!Array.isArray(dados)) return [];

  const encontrados = dados
    .map(converter)
    .filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lng) && e.shortName);

  /**
   * Prioriza ruas e locais nomeados sobre limites administrativos.
   *
   * O Nominatim devolve uma rua como `category: "highway"`, `type: "tertiary"`
   * (ou `residential`, `secondary`...). Olhar só o `type` fazia a rua cair no
   * grupo genérico e perder para "Araucária, Paraná" numa busca por endereço.
   */
  const peso = (s: SugestaoEndereco) => {
    const t = s.type;
    if (t === "house" || t === "building") return 0;
    if (s.category === "highway" || s.category === "place" && ["house", "road"].includes(t)) return 1;
    if (["school", "university", "college", "kindergarten"].includes(t)) return 1;
    if (["neighbourhood", "suburb", "quarter", "pedestrian", "footway"].includes(t)) return 2;
    if (["city", "town", "municipality", "administrative", "state"].includes(t)) return 4;
    if (s.category === "place") return 3;
    return 2;
  };
  encontrados.sort((a, b) => peso(a) - peso(b));

  if (cache.size >= CACHE_MAX) {
    // Descarta a entrada mais antiga (Map preserva ordem de inserção).
    const primeira = cache.keys().next().value;
    if (primeira) cache.delete(primeira);
  }
  cache.set(chave, encontrados);

  return encontrados;
}

/**
 * Resolve um endereço e devolve o melhor resultado, ou `null` se nada casar.
 *
 * Usado quando o admin digita o endereço e sai do campo: se houver um resultado
 * claro, preenchemos as coordenadas do evento.
 */
export async function resolverEndereco(
  termo: string
): Promise<EnderecoEncontrado | null> {
  try {
    const resultados = await buscarEnderecos(termo, 1);
    if (resultados.length === 0) return null;

    const melhor = resultados[0];
    return {
      displayName: melhor.displayName,
      shortName: melhor.shortName,
      lat: melhor.lat,
      lng: melhor.lng,
      city: melhor.city,
      neighborhood: null,
      type: melhor.type,
      category: melhor.category,
    };
  } catch {
    return null;
  }
}

/**
 * Geocoding reverso: coordenadas → endereço legível.
 *
 * Usado quando o admin clica em "usar minha localização": o GPS dá números, e
 * o campo de endereço precisa de texto. Se o serviço falhar, devolvemos `null`
 * e a interface mostra as coordenadas — melhor que um endereço inventado.
 */
export async function descreverCoordenadas(
  lat: number,
  lng: number
): Promise<EnderecoEncontrado | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const chave = `rev:${lat.toFixed(5)},${lng.toFixed(5)}`;
  const emCache = cache.get(chave);
  if (emCache && emCache.length > 0) {
    const c = emCache[0];
    return {
      displayName: c.displayName,
      shortName: c.shortName,
      lat: c.lat,
      lng: c.lng,
      city: c.city,
      neighborhood: null,
      type: c.type,
      category: c.category,
    };
  }

  try {
    await respeitarLimite();

    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: "jsonv2",
      addressdetails: "1",
      "accept-language": "pt-BR",
    });

    const resposta = await fetch(`${NOMINATIM}/reverse?${params.toString()}`, {
      headers: { Accept: "application/json", "User-Agent": UA },
    });

    if (!resposta.ok) return null;

    const item = await resposta.json();
    if (!item || item.error) return null;

    const convertido = converter(item);
    if (!convertido.shortName) return null;

    cache.set(chave, [convertido]);

    return {
      displayName: convertido.displayName,
      shortName: convertido.shortName,
      lat: convertido.lat,
      lng: convertido.lng,
      city: convertido.city,
      neighborhood: null,
      type: convertido.type,
      category: convertido.category,
    };
  } catch {
    return null;
  }
}

/** Limpa o cache (usado em testes). */
export function limparCacheEnderecos(): void {
  cache.clear();
  ultimaRequisicao = 0;
}
