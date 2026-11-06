import React, { useState, useEffect, useRef } from "react";
import { ARAUCARIA_SCHOOLS, SchoolProfile } from "../lib/schoolsData";
import { ChevronLeft, ChevronRight, School as SchoolIcon, MapPin, GraduationCap, ArrowRight } from "lucide-react";

interface SchoolCarouselProps {
  onSelectSchool: (slug: string) => void;
}

export const SchoolCarousel: React.FC<SchoolCarouselProps> = ({ onSelectSchool }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const totalSchools = ARAUCARIA_SCHOOLS.length;

  // Auto-scroll effect: advances every 4.5 seconds when not paused
  useEffect(() => {
    if (isPaused) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % totalSchools);
    }, 4500);

    return () => clearInterval(timer);
  }, [isPaused, totalSchools]);

  // Sync scroll position when index changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const card = container.children[currentIndex] as HTMLElement;
      if (card) {
        container.scrollTo({
          left: card.offsetLeft - container.offsetLeft,
          behavior: "smooth"
        });
      }
    }
  }, [currentIndex]);

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + totalSchools) % totalSchools);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % totalSchools);
  };

  return (
    <section 
      className="w-full my-8 select-none"
      aria-label="Conheça nossas escolas parceiras"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
    >
      <div className="flex items-end justify-between mb-4 px-2">
        <div>
          <span className="text-xs font-semibold tracking-wider uppercase text-emerald-800 bg-emerald-100/70 px-2.5 py-1 rounded-full">
            Rede Estadual de Araucária
          </span>
          <h2 className="text-xl sm:text-2xl font-serif font-bold text-gray-900 mt-1.5 flex items-center gap-2">
            <SchoolIcon className="w-6 h-6 text-emerald-700" />
            Conheça nossas escolas
          </h2>
          <p className="text-xs sm:text-sm text-gray-600 mt-0.5">
            Instituições conectadas pelo eloEscola. Clique para ver histórico, notícias e eventos exclusivos.
          </p>
        </div>

        {/* Manual Navigation Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handlePrev}
            aria-label="Escola anterior"
            className="p-2 rounded-full border border-emerald-200 bg-white/80 hover:bg-emerald-50 text-emerald-800 transition shadow-sm active:scale-95"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={handleNext}
            aria-label="Próxima escola"
            className="p-2 rounded-full border border-emerald-200 bg-white/80 hover:bg-emerald-50 text-emerald-800 transition shadow-sm active:scale-95"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Horizontal Carousel Container */}
      <div
        ref={scrollContainerRef}
        className="flex gap-4 overflow-x-auto pb-4 pt-1 px-2 no-scrollbar snap-x snap-mandatory scroll-smooth"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {ARAUCARIA_SCHOOLS.map((school, index) => {
          const isSelected = index === currentIndex;
          return (
            <div
              key={school.id}
              onClick={() => onSelectSchool(school.slug)}
              className={`flex-shrink-0 w-[280px] sm:w-[320px] md:w-[340px] snap-start rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden flex flex-col justify-between ${
                isSelected
                  ? "border-emerald-600 bg-white shadow-md ring-2 ring-emerald-500/20 translate-y-[-2px]"
                  : "border-emerald-200/80 bg-white/70 hover:bg-white hover:border-emerald-400 hover:shadow-sm"
              }`}
            >
              {/* School Photo Banner with Authentic Crest Logo */}
              <div className="relative h-40 w-full overflow-hidden bg-[#edf5ef] dark:bg-[#16271a] flex items-center justify-center p-3">
                <img
                  src={school.image}
                  alt={school.name}
                  className="max-h-32 max-w-full object-contain transition-transform duration-500 hover:scale-105 drop-shadow-xs"
                  loading="lazy"
                />
                
                {/* Badge de Bairro */}
                <div className="absolute top-2.5 left-2.5">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-[#14321d]/85 backdrop-blur-md text-white px-2.5 py-0.5 rounded-full border border-white/20 shadow-xs">
                    <MapPin className="w-3 h-3 text-emerald-400" />
                    {school.neighborhood}
                  </span>
                </div>
              </div>

              {/* School Information Body */}
              <div className="p-4 flex-1 flex flex-col justify-between text-left">
                <div>
                  <h3 className="text-base font-bold font-serif text-slate-900 leading-tight mb-1">
                    {school.shortName}
                  </h3>
                  <p className="text-[11px] text-emerald-800 font-medium line-clamp-1 mb-2">
                    {school.name}
                  </p>

                  <p className="text-xs text-gray-700 line-clamp-3 leading-relaxed mb-3">
                    {school.historicalOverview}
                  </p>

                  {/* Modalities Preview */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {school.modalities.slice(0, 2).map((mod, i) => (
                      <span
                        key={i}
                        className="text-[10px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200/60 px-2 py-0.5 rounded-md flex items-center gap-1"
                      >
                        <GraduationCap className="w-2.5 h-2.5 text-emerald-600" />
                        {mod.length > 25 ? mod.slice(0, 25) + "…" : mod}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Footer Link */}
                <div className="pt-3 border-t border-emerald-100 flex items-center justify-between text-xs font-semibold text-emerald-800 group">
                  <span>Página Institucional</span>
                  <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 group-hover:bg-emerald-800 group-hover:text-white transition-colors">
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Position Dots Indicator */}
      <div className="flex justify-center items-center gap-2 mt-3">
        {ARAUCARIA_SCHOOLS.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentIndex(idx)}
            aria-label={`Ir para escola ${idx + 1}`}
            className={`transition-all rounded-full ${
              idx === currentIndex
                ? "w-6 h-2 bg-emerald-700"
                : "w-2 h-2 bg-emerald-200 hover:bg-emerald-400"
            }`}
          />
        ))}
      </div>
    </section>
  );
};
