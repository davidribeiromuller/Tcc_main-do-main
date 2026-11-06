import React, { useState } from "react";
import { ARAUCARIA_SCHOOLS, SchoolProfile } from "../lib/schoolsData";
import { Search, MapPin, Phone, Mail, GraduationCap, Building2, ArrowRight } from "lucide-react";

interface SchoolsCatalogProps {
  onSelectSchool: (slug: string) => void;
}

export const SchoolsCatalog: React.FC<SchoolsCatalogProps> = ({ onSelectSchool }) => {
  const [search, setSearch] = useState("");
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string>("all");

  const neighborhoods = ["all", "Centro", "Costeira", "Fazenda Velha", "Guajuvira (Zona Rural)", "Cachoeira"];

  const filteredSchools = ARAUCARIA_SCHOOLS.filter((school) => {
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
    </div>
  );
};
