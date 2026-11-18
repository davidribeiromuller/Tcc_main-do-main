import React, { useState, useEffect, useRef, useCallback } from "react";
import { ARAUCARIA_SCHOOLS } from "../lib/schoolsData";
import { ChevronLeft, ChevronRight, School as SchoolIcon, MapPin, GraduationCap, ArrowRight } from "lucide-react";

interface SchoolCarouselProps {
  onSelectSchool: (slug: string) => void;
}

/* ------------------------------------------------------------------ *
 * Rolagem automática CONTÍNUA (rodada 24)
 * ------------------------------------------------------------------
 * Pedido: "reajuste a rolagem automatica, para um pouco mais rapida, e
 * ela nao vai de escola em escola, e uma barra continua, mas pode ser
 * controlada de escola em escola pela flechinha, apos 2-3 segundos faca
 * voltar a rolar automaticamente".
 *
 * Antes: `setInterval` de 4,5 s trocando `currentIndex` — o trilho pulava
 * de card em card. Agora:
 *
 *  - o trilho anda de forma contínua por `requestAnimationFrame`
 *    (VELOCIDADE_PX_POR_SEGUNDO), sem saltos e sem `scroll-snap`;
 *  - as flechas (e os pontinhos) continuam indo de escola em escola, com
 *    animação suave;
 *  - qualquer interação manual (flecha, arrasto, roda do mouse, teclado)
 *    pausa a rolagem e ela volta sozinha depois de RETOMADA_MS (2,5 s);
 *  - a lista é duplicada para o laço ser invisível: ao chegar na cópia,
 *    subtrai-se a largura de uma volta, sem "pulo" na tela.
 * ------------------------------------------------------------------ */

/** Velocidade do trilho: ~4 s por card (antes eram 4,5 s parado + salto). */
const VELOCIDADE_PX_POR_SEGUNDO = 88;
/** Tempo até a rolagem automática voltar depois de uma interação manual. */
const RETOMADA_MS = 2500;

export const SchoolCarousel: React.FC<SchoolCarouselProps> = ({ onSelectSchool }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  /** Pausa controlada por interação (volta sozinha após RETOMADA_MS). */
  const [isPaused, setIsPaused] = useState(false);

  const trilhoRef = useRef<HTMLDivElement>(null);
  const pausaTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const ultimoFrameRef = useRef<number | null>(null);
  /** Fração acumulada (evita perder movimento em velocidades < 1 px). */
  const acumuladoRef = useRef(0);
  /** Largura de uma volta da lista (metade do trilho duplicado). */
  const larguraVoltaRef = useRef(0);
  /** Evita que o "empurrão" programático das flechas conte como gesto do usuário. */
  const scrollProgramaticoRef = useRef(false);

  const total = ARAUCARIA_SCHOOLS.length;

  const limparPausaTimer = useCallback(() => {
    if (pausaTimerRef.current !== null) {
      window.clearTimeout(pausaTimerRef.current);
      pausaTimerRef.current = null;
    }
  }, []);

  /** Pausa agora e retoma sozinho depois de RETOMADA_MS. */
  const pausarTemporariamente = useCallback(() => {
    setIsPaused(true);
    limparPausaTimer();
    pausaTimerRef.current = window.setTimeout(() => {
      pausaTimerRef.current = null;
      setIsPaused(false);
    }, RETOMADA_MS);
  }, [limparPausaTimer]);

  useEffect(() => limparPausaTimer, [limparPausaTimer]);

  /** Mede a largura de uma volta (a lista é renderizada duas vezes). */
  const medirVolta = useCallback(() => {
    const trilho = trilhoRef.current;
    if (!trilho) return;
    larguraVoltaRef.current = trilho.scrollWidth / 2;
  }, []);

  useEffect(() => {
    medirVolta();
    window.addEventListener("resize", medirVolta);
    return () => window.removeEventListener("resize", medirVolta);
  }, [medirVolta]);

  /** Card mais próximo do início visível — usado pelos pontinhos. */
  const indiceVisivel = useCallback((): number => {
    const trilho = trilhoRef.current;
    if (!trilho) return 0;
    const cartoes = Array.from(trilho.children) as HTMLElement[];
    if (cartoes.length === 0) return 0;
    const alvo = trilho.scrollLeft;
    let maisProximo = 0;
    let menorDistancia = Infinity;
    cartoes.forEach((card, i) => {
      const distancia = Math.abs(card.offsetLeft - trilho.offsetLeft - alvo);
      if (distancia < menorDistancia) {
        menorDistancia = distancia;
        maisProximo = i;
      }
    });
    return maisProximo % total;
  }, [total]);

  /** Rola suavemente até o card `indice` (usado por flechas e pontinhos). */
  const irParaIndice = useCallback(
    (indice: number, suave = true) => {
      const trilho = trilhoRef.current;
      if (!trilho) return;
      const alvo = ((indice % total) + total) % total;
      const card = trilho.children[alvo] as HTMLElement | undefined;
      if (!card) return;

      scrollProgramaticoRef.current = true;
      trilho.scrollTo({
        left: card.offsetLeft - trilho.offsetLeft,
        behavior: suave ? "smooth" : "auto",
      });
      // Libera o flag depois que o scroll suave terminar.
      window.setTimeout(() => {
        scrollProgramaticoRef.current = false;
      }, 650);

      setCurrentIndex(alvo);
      pausarTemporariamente();
    },
    [pausarTemporariamente, total]
  );

  /* ------------------------------------------------------------------ *
   * Loop contínuo
   * ------------------------------------------------------------------ */
  useEffect(() => {
    const reduzirMovimento =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (isPaused || reduzirMovimento) {
      ultimoFrameRef.current = null;
      return;
    }

    const passo = (agora: number) => {
      const trilho = trilhoRef.current;
      if (!trilho) {
        rafRef.current = requestAnimationFrame(passo);
        return;
      }

      if (ultimoFrameRef.current === null) ultimoFrameRef.current = agora;
      // Limita o delta: aba em segundo plano volta com um salto enorme.
      const delta = Math.min((agora - ultimoFrameRef.current) / 1000, 0.05);
      ultimoFrameRef.current = agora;

      acumuladoRef.current += VELOCIDADE_PX_POR_SEGUNDO * delta;
      const inteiro = Math.floor(acumuladoRef.current);
      if (inteiro > 0) {
        acumuladoRef.current -= inteiro;
        trilho.scrollLeft += inteiro;
      }

      // Laço invisível: chegou ao fim da primeira cópia, volta para o início.
      const volta = larguraVoltaRef.current;
      if (volta > 0 && trilho.scrollLeft >= volta) {
        trilho.scrollLeft -= volta;
      }

      rafRef.current = requestAnimationFrame(passo);
    };

    rafRef.current = requestAnimationFrame(passo);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      ultimoFrameRef.current = null;
    };
  }, [isPaused]);

  /* Pontinhos acompanham o trilho, mas sem re-render a cada frame. */
  useEffect(() => {
    const trilho = trilhoRef.current;
    if (!trilho) return;

    let agendado = false;
    const aoRolar = () => {
      if (agendado) return;
      agendado = true;
      window.requestAnimationFrame(() => {
        agendado = false;
        const visivel = indiceVisivel();
        setCurrentIndex((anterior) => (anterior === visivel ? anterior : visivel));
      });
    };

    trilho.addEventListener("scroll", aoRolar, { passive: true });
    return () => trilho.removeEventListener("scroll", aoRolar);
  }, [indiceVisivel]);

  /* Qualquer gesto no trilho pausa; a rolagem volta sozinha em 2,5 s. */
  const aoInteragir = () => {
    if (scrollProgramaticoRef.current) return;
    pausarTemporariamente();
  };

  // Pausa no hover apenas enquanto o ponteiro estiver sobre o carrossel
  // (desktop). Ao sair, o timer de retomada devolve o movimento.
  const aoSairDoHover = () => {
    setIsPaused(false);
  };

  return (
    <section
      className="w-full my-8"
      aria-label="Conheça nossas escolas parceiras"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={aoSairDoHover}
      onTouchStart={aoInteragir}
      onFocusCapture={aoInteragir}
      onKeyDown={aoInteragir}
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

        {/* Navegação manual — anda de escola em escola */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => irParaIndice(currentIndex - 1)}
            aria-label="Escola anterior"
            className="p-2 rounded-full border border-emerald-200 bg-white/80 hover:bg-emerald-50 text-emerald-800 transition shadow-sm active:scale-95 cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => irParaIndice(currentIndex + 1)}
            aria-label="Próxima escola"
            className="p-2 rounded-full border border-emerald-200 bg-white/80 hover:bg-emerald-50 text-emerald-800 transition shadow-sm active:scale-95 cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/*
        Trilho CONTÍNUO: sem `snap-x`/`snap-mandatory` (o snap brigaria com o
        rAF e voltaria a "pular" de card em card) e sem `scroll-x-snap`.
        A lista é renderizada duas vezes para o laço ser invisível.
      */}
      <div
        ref={trilhoRef}
        className="flex gap-4 overflow-x-auto pb-4 pt-1 px-2 no-scrollbar touch-scroll"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none", scrollSnapType: "none" }}
        onWheel={aoInteragir}
        onPointerDown={aoInteragir}
        onTouchMove={aoInteragir}
      >
        {[0, 1].map((copia) =>
          ARAUCARIA_SCHOOLS.map((school, index) => {
            const isSelected = index === currentIndex;
            return (
              <div
                key={`${copia}-${school.id}`}
                onClick={() => onSelectSchool(school.slug)}
                aria-hidden={copia === 1 ? true : undefined}
                className={`flex-shrink-0 w-[280px] sm:w-[320px] md:w-[340px] rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden flex flex-col justify-between ${
                  isSelected
                    ? "border-emerald-600 bg-white shadow-md ring-2 ring-emerald-500/20 -translate-y-0.5"
                    : "border-emerald-200/80 bg-white/70 hover:bg-white hover:border-emerald-400 hover:shadow-sm"
                }`}
              >
                {/* Banner com o brasão da escola */}
                <div className="relative h-40 w-full overflow-hidden bg-[#edf5ef] dark:bg-[#16271a] flex items-center justify-center p-3">
                  <img
                    src={school.image}
                    alt={school.name}
                    className="max-h-32 max-w-full object-contain transition-transform duration-500 hover:scale-105 drop-shadow-xs"
                    loading="lazy"
                    draggable={false}
                  />

                  <div className="absolute top-2.5 left-2.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-[#14321d]/85 backdrop-blur-md text-white px-2.5 py-0.5 rounded-full border border-white/20 shadow-xs">
                      <MapPin className="w-3 h-3 text-emerald-400" />
                      {school.neighborhood}
                    </span>
                  </div>
                </div>

                {/* Corpo */}
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

                  <div className="pt-3 border-t border-emerald-100 flex items-center justify-between text-xs font-semibold text-emerald-800 group">
                    <span>Página Institucional</span>
                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 group-hover:bg-emerald-800 group-hover:text-white transition-colors">
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Indicadores — clicar leva à escola e pausa a rolagem por 2,5 s */}
      <div className="flex justify-center items-center gap-2 mt-3">
        {ARAUCARIA_SCHOOLS.map((_, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => irParaIndice(idx)}
            aria-label={`Ir para escola ${idx + 1}`}
            aria-current={idx === currentIndex ? "true" : undefined}
            className={`transition-all rounded-full cursor-pointer ${
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

export default SchoolCarousel;
