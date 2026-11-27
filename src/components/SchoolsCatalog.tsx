import React, { useEffect, useState } from "react";
import { ARAUCARIA_SCHOOLS, SchoolProfile } from "../lib/schoolsData";
import {
  Search, MapPin, Phone, Mail, GraduationCap, Building2, ArrowRight,
  Megaphone, Loader2, Globe, School,
} from "lucide-react";
import {
  fetchComunicados,
  ROTULOS_PUBLICO,
  type Comunicado,
} from "../lib/announcementsService.ts";

interface SchoolsCatalogProps {
  onSelectSchool: (slug: string) => void;
  /**
   * Lista de escolas a exibir. Padrão: catálogo estático. O `App` passa a
   * versão com as edições do painel (rodada 26).
   */
  schools?: SchoolProfile[];
}

export const SchoolsCatalog: React.FC<SchoolsCatalogProps> = ({
  onSelectSchool,
  schools = ARAUCARIA_SCHOOLS,
}) => {
  const [search, setSearch] = useState("");
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string>("all");

  /*
    Aba de comunicados gerais.

    Antes, comunicado só existia dentro da página de uma escola específica —
    quem quisesse saber o que a rede toda anunciou tinha de entrar escola por
    escola. Aqui a leitura é da REDE: os comunicados globais (publicados pela
    plataforma) mais os de cada escola, com a origem marcada.
  */
  const [aba, setAba] = useState<"escolas" | "comunicados">("escolas");
  const [comunicados, setComunicados] = useState<Comunicado[]>([]);
  const [carregandoComunicados, setCarregandoComunicados] = useState(false);
  const [erroComunicados, setErroComunicados] = useState<string | null>(null);
  const [filtroOrigem, setFiltroOrigem] = useState<"todos" | "gerais">("todos");

  useEffect(() => {
    if (aba !== "comunicados") return;
    let cancelado = false;

    const carregar = async () => {
      setCarregandoComunicados(true);
      setErroComunicados(null);
      // Sem `schoolId`: traz os globais + os de todas as escolas que a RLS
      // permite (comunicado publicado e não vencido).
      const { comunicados: lista, error } = await fetchComunicados({ incluirGlobais: true });
      if (cancelado) return;
      setComunicados(lista);
      setErroComunicados(error);
      setCarregandoComunicados(false);
    };

    void carregar();
    return () => {
      cancelado = true;
    };
  }, [aba]);

  const neighborhoods = ["all", "Centro", "Costeira", "Fazenda Velha", "Guajuvira (Zona Rural)", "Cachoeira"];

  const filteredSchools = schools.filter((school) => {
    const matchesSearch =
      school.name.toLowerCase().includes(search.toLowerCase()) ||
      school.shortName.toLowerCase().includes(search.toLowerCase()) ||
      school.address.toLowerCase().includes(search.toLowerCase());

    const matchesNeighborhood =
      selectedNeighborhood === "all" ||
      school.neighborhood.toLowerCase().includes(selectedNeighborhood.toLowerCase().split(" ")[0]);

    return matchesSearch && matchesNeighborhood;
  });

  return (
    <div className="w-full pb-bottom-nav">
      <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6 text-left">
        <h1 className="text-2xl sm:text-3xl font-serif font-bold text-gray-900 flex items-center gap-2">
          <Building2 className="w-7 h-7 text-emerald-800" />
          Escolas de Araucária
        </h1>
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          Explore o histórico, comunicados oficiais, modalidades e eventos de cada uma das 6 instituições conectadas pelo eloEscola.
        </p>
      </div>

      {/* Abas: Escolas | Comunicados da rede */}
      <div className="flex items-center gap-1.5 mb-5 border-b border-emerald-200/70">
        <button
          onClick={() => setAba("escolas")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition cursor-pointer ${
            aba === "escolas"
              ? "border-emerald-800 text-emerald-900"
              : "border-transparent text-gray-500 hover:text-emerald-800"
          }`}
        >
          <School className="w-4 h-4" />
          Escolas
        </button>
        <button
          onClick={() => setAba("comunicados")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition cursor-pointer ${
            aba === "comunicados"
              ? "border-emerald-800 text-emerald-900"
              : "border-transparent text-gray-500 hover:text-emerald-800"
          }`}
        >
          <Megaphone className="w-4 h-4" />
          Comunicados da rede
        </button>
      </div>

      {aba === "comunicados" ? (
        <div className="mb-10">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <p className="text-xs text-gray-600">
              Comunicados publicados pela plataforma e pelas escolas. Somem
              automaticamente 2 dias depois de vencerem.
            </p>
            <div className="flex items-center gap-1.5">
              {(["todos", "gerais"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFiltroOrigem(f)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                    filtroOrigem === f
                      ? "bg-emerald-800 text-white font-semibold"
                      : "bg-white text-gray-700 hover:bg-emerald-50 border border-emerald-200/80"
                  }`}
                >
                  {f === "todos" ? "Todos" : "Só os gerais"}
                </button>
              ))}
            </div>
          </div>

          {carregandoComunicados && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando comunicados…
            </div>
          )}

          {!carregandoComunicados && erroComunicados && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-800">
              {erroComunicados}
            </div>
          )}

          {!carregandoComunicados && !erroComunicados && (
            (() => {
              const lista = filtroOrigem === "gerais"
                ? comunicados.filter((c) => !c.schoolId)
                : comunicados;

              if (lista.length === 0) {
                return (
                  <div className="rounded-2xl border border-emerald-200 bg-white p-8 text-center">
                    <Megaphone className="w-8 h-8 text-emerald-700 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-gray-800">
                      Nenhum comunicado no ar
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {filtroOrigem === "gerais"
                        ? "A plataforma não publicou comunicados gerais."
                        : "Quando uma escola publicar um aviso, ele aparece aqui."}
                    </p>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {lista.map((c) => (
                    <article
                      key={c.id}
                      className="rounded-2xl border border-emerald-200/80 bg-white p-4 shadow-2xs"
                    >
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-emerald-50 text-emerald-800">
                          {c.schoolId ? <School className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                          {c.schoolId
                            ? (schools.find((e) => String(e.id) === String(c.schoolId))?.shortName
                                ?? c.schoolSlug
                                ?? "Escola")
                            : "Toda a rede"}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-500 uppercase">
                          {c.category}
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-gray-900 leading-snug">
                        {c.title}
                      </h3>
                      <p className="text-xs text-gray-600 mt-1 whitespace-pre-line">
                        {c.body}
                      </p>

                      <div className="mt-3 flex items-center justify-between gap-2 text-[10px] text-gray-400">
                        <span>
                          {c.authorName ? `Por ${c.authorName}` : "eloEscola"}
                          {" · "}
                          {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                        </span>
                        <span className="font-semibold">
                          {ROTULOS_PUBLICO[c.audience]}
                        </span>
                      </div>
                      {c.expiresAt && (
                        <p className="mt-1 text-[10px] text-amber-700">
                          Expira em {new Date(c.expiresAt).toLocaleDateString("pt-BR")}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              );
            })()
          )}
        </div>
      ) : (
        <>
      {/* Search and Neighborhood Filters */}
      <div className="flex flex-col sm:flex-row items-center gap-3 mb-6">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar escola por nome, bairro ou endereço..."
            className="w-full h-11 pl-10 pr-4 text-xs bg-white border border-emerald-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-2xs"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 no-scrollbar">
          {neighborhoods.map((n) => (
            <button
              key={n}
              onClick={() => setSelectedNeighborhood(n)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                selectedNeighborhood === n
                  ? "bg-emerald-800 text-white font-semibold shadow-xs"
                  : "bg-white text-gray-700 hover:bg-emerald-50 border border-emerald-200/80"
              }`}
            >
              {n === "all" ? "Todos os Bairros" : n}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of 6 Schools */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredSchools.map((school) => (
          <div
            key={school.id}
            onClick={() => onSelectSchool(school.slug)}
            className="group bg-white rounded-3xl border border-emerald-200/80 overflow-hidden shadow-xs hover:shadow-md hover:border-emerald-400 transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              {/* Photo Banner with Authentic School Logo */}
              <div className="relative h-44 w-full overflow-hidden bg-[#eef6f0] dark:bg-[#18281b] flex items-center justify-center p-4">
                <img
                  src={school.image}
                  alt={school.name}
                  className="max-h-36 max-w-full object-contain group-hover:scale-105 transition-transform duration-500 drop-shadow-sm"
                  loading="lazy"
                />
                
                <div className="absolute top-3 left-3">
                  <span className="text-[10px] font-bold bg-[#14321d]/85 backdrop-blur-md text-white px-2.5 py-1 rounded-full border border-white/20 flex items-center gap-1 shadow-xs">
                    <MapPin className="w-3 h-3 text-emerald-400" />
                    {school.neighborhood}
                  </span>
                </div>
              </div>

              {/* Title & Type */}
              <div className="px-4 pt-3 pb-1 text-left">
                <h3 className="text-base font-serif font-bold text-gray-900 leading-tight">
                  {school.shortName}
                </h3>
                <p className="text-[11px] text-emerald-800 font-medium truncate mt-0.5">
                  {school.type}
                </p>
              </div>

              {/* Info Body */}
              <div className="p-4 space-y-2.5">
                <p className="text-xs text-gray-700 line-clamp-3 leading-relaxed">
                  {school.historicalOverview}
                </p>

                <div className="flex flex-wrap gap-1 pt-1">
                  {school.modalities.map((mod, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] bg-emerald-50 text-emerald-900 border border-emerald-200/60 px-2 py-0.5 rounded-md"
                    >
                      {mod}
                    </span>
                  ))}
                </div>

                <div className="pt-2 text-[11px] text-gray-500 space-y-1">
                  <p className="flex items-center gap-1.5 truncate">
                    <MapPin className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    <span className="truncate">{school.address}</span>
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    <span>{school.phone}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Footer Action */}
            <div className="p-4 pt-0">
              <button
                type="button"
                className="w-full py-2.5 px-4 bg-emerald-50 group-hover:bg-emerald-800 text-emerald-900 group-hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-between"
              >
                <span>Conhecer Instituição</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        ))}
      </div>
        </>
      )}
    </div>
      </div>
  );
};
