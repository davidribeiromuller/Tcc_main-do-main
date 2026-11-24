import React from "react";
import {
  Calendar,
  MapPin,
  Building2,
  Info,
  ShieldCheck,
  Edit3,
  Trash2,
  Lock,
  Map as MapIcon,
  GraduationCap,
  Globe2,
} from "lucide-react";
import { Event } from "../types";
import { resolveEventCity, classifyEventAsSchool } from "../lib/eventClassification";

/**
 * Card do mural de eventos (rodada 27).
 * ---------------------------------------------------------------------------
 * O desenho nasceu no painel de administração e virou o padrão dos DOIS murais
 * (painel e mural público do aluno):
 *
 *   ┌─────────────────────────────┐
 *   │ [imagem]           Gratuito │
 *   │                             │
 *   │ 📅 20 de Dezembro • 18:30   │
 *   ├─────────────────────────────┤
 *   │ Título em uma linha         │
 *   │ 📍 Cidade                   │
 *   │ 🏫 Comunidade Escolar • Org │
 *   │ [Ver] [Ações...]            │
 *   └─────────────────────────────┘
 *
 * **Modo escuro** = o print de referência (card `slate-900`, texto branco).
 * **Modo claro** = o mesmo desenho em branco: borda suave, faixa de metadados
 * cinza-clara e as mesmas cores de ação (verde/azul), só que sólidas.
 *
 * Ter um componente só evita o problema que já aconteceu: o painel tinha um
 * card e o mural do aluno outro, e os dois divergiam com o tempo.
 */

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/** "20 de Dezembro de 2026 • 18:30" */
export function dataDoEvento(ev: Event): string {
  const mes = MESES[ev.month] || MESES[(ev.month ?? 0) % 12] || "Mês";
  const hora = ev.time || "14:00";
  return `${ev.day} de ${mes} de ${ev.year} • ${hora}`;
}

/**
 * Cidade mostrada no card.
 *
 * Prefere `city`; sem ela, tenta o fim do endereço ("Rua X, 100 - Centro,
 * Araucária/PR") e, em último caso, a própria localização.
 */
export function cidadeDoEvento(ev: Event): string {
  const daClassificacao = (() => {
    try {
      return resolveEventCity(ev);
    } catch {
      return null;
    }
  })();
  if (daClassificacao) return daClassificacao;
  if (ev.city) return ev.city;

  const partes = String(ev.location || "")
    .split(/[-,/]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const ultima = partes[partes.length - 1];
  return ultima || ev.location || "Local não informado";
}

/** Quem organiza: escola do evento, papel do criador ou a diretoria. */
export function organizadorDoEvento(ev: Event): string {
  if (ev.schoolName) return ev.schoolName;
  if (ev.creatorRole) return `${ev.creatorRole}`;
  return "Diretoria Regional";
}

/** "Comunidade Escolar • Org: X" — usado na faixa de metadados. */
export function faixaDeMetadados(ev: Event): { origem: string; organizador: string } {
  let escolar: boolean | null | undefined = ev.isSchool;
  if (escolar === null || escolar === undefined) {
    try {
      escolar = classifyEventAsSchool(ev);
    } catch {
      escolar = false;
    }
  }
  return {
    origem: escolar ? "Comunidade Escolar" : "Aberto ao público",
    organizador: organizadorDoEvento(ev),
  };
}

export interface EventCardMuralProps {
  event: Event;
  /** Abre o detalhe do evento (botão "Ver" / clique no card). */
  onOpen?: () => void;
  /** Abre o mapa naquele evento. */
  onAbrirMapa?: () => void;
  /** Lista de autorizações (painel). */
  onAutorizacoes?: () => void;
  onEditar?: () => void;
  onExcluir?: () => void;
  /** Mostra o cadeado "outro admin" no lugar de Editar/Excluir. */
  bloqueadoParaEditar?: boolean;
  /** Selo "Seu Evento". */
  seuEvento?: boolean;
  /** Rótulo do botão principal (`Ver` no painel, `Ver evento` no mural). */
  rotuloVer?: string;
  className?: string;
  /** Aceito explicitamente para o TypeScript não reclamar do `key` do map. */
  key?: React.Key;
}

export default function EventCardMural({
  event,
  onOpen,
  onAbrirMapa,
  onAutorizacoes,
  onEditar,
  onExcluir,
  bloqueadoParaEditar = false,
  seuEvento = false,
  rotuloVer = "Ver",
  className = "",
}: EventCardMuralProps) {
  const { origem, organizador } = faixaDeMetadados(event);
  const faixaTexto = `${origem} • Org: ${organizador}`;

  // Já houve dado em que o campo `requirements` repetia a própria faixa.
  // Mostrar a mesma frase duas vezes era o defeito visível no print.
  const requisitos = String(event.requirements || "").trim();
  const mostrarRequisitos =
    requisitos.length > 0 &&
    requisitos !== faixaTexto &&
    !/^comunidade escolar\s*•\s*org:/i.test(requisitos);

  return (
    <div
      onClick={onOpen}
      className={[
        "rounded-2xl border flex flex-col overflow-hidden group h-full transition-all",
        // MODO CLARO: card branco com borda suave e sombra discreta.
        "bg-white border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300",
        // MODO ESCURO: exatamente o card do print.
        "dark:bg-slate-900 dark:border-slate-700/60 dark:shadow-md dark:hover:shadow-xl dark:hover:border-slate-500/70",
        onOpen ? "cursor-pointer" : "",
        className,
      ].join(" ")}
    >
      {/* Imagem de topo + selo de preço + data */}
      <div className="relative h-36 w-full shrink-0 overflow-hidden bg-slate-200 dark:bg-slate-800">
        <img
          src={
            event.image ||
            "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=600&auto=format&fit=crop"
          }
          alt={event.title}
          referrerPolicy="no-referrer"
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {/* No escuro o gradiente funde com o card; no claro escurece só o pé da
            imagem, o suficiente para a data ficar legível. */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/85 via-slate-900/25 to-transparent dark:from-slate-900 dark:via-slate-900/45 dark:to-slate-900/5" />

        {/* Selo de preço — canto superior esquerdo */}
        <span
          className={`absolute top-2.5 left-2.5 text-[10px] font-bold px-2 py-0.5 rounded-md shadow-sm ${
            event.isPaid ? "bg-amber-500 text-slate-900" : "bg-emerald-600 text-white"
          }`}
        >
          {event.isPaid ? (event.price ? `R$ ${event.price}` : "Pago") : "Gratuito"}
        </span>

        {seuEvento && (
          <span className="absolute top-2.5 right-2.5 text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-600/90 text-white shadow-sm">
            Seu Evento
          </span>
        )}

        {/* Data sobre a imagem */}
        <div className="absolute bottom-2.5 left-2.5 right-2.5">
          <span className="inline-flex items-center gap-1.5 max-w-full text-[11px] font-semibold text-white bg-black/45 dark:bg-transparent backdrop-blur-[2px] dark:backdrop-blur-0 rounded-full px-2 py-1 dark:px-0 dark:py-0 drop-shadow">
            <Calendar size={12} className="shrink-0 text-emerald-300 dark:text-emerald-400" />
            <span className="truncate">{dataDoEvento(event)}</span>
          </span>
        </div>
      </div>

      {/* Corpo */}
      <div className="p-4 flex-1 flex flex-col gap-2">
        <h4
          className="font-bold text-sm text-slate-900 dark:text-white line-clamp-1 leading-snug"
          title={event.title}
        >
          {event.title}
        </h4>

        <button
          type="button"
          onClick={(e) => {
            if (!onAbrirMapa) return;
            e.stopPropagation();
            onAbrirMapa();
          }}
          disabled={!onAbrirMapa}
          title={onAbrirMapa ? "Ver localização no mapa" : undefined}
          className={`self-start flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 ${
            onAbrirMapa ? "hover:text-emerald-700 dark:hover:text-emerald-300 cursor-pointer" : "cursor-default"
          }`}
        >
          <MapPin size={12} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="truncate max-w-[16rem]">{cidadeDoEvento(event)}</span>
        </button>

        {/* Faixa de metadados */}
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold rounded-lg px-2 py-1.5 border bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:border-white/5">
          <Building2 size={11} className="shrink-0 text-slate-400 dark:text-slate-400" />
          <span className="shrink-0">{origem}</span>
          <span className="text-slate-400 dark:text-slate-500">•</span>
          <span className="truncate" title={`Org: ${organizador}`}>
            Org: {organizador}
          </span>
        </div>

        {/* Selo escolar/público (mural do aluno) */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300 flex items-center gap-1">
            {event.isSchool ? <GraduationCap size={10} /> : <Globe2 size={10} />}
            {event.isSchool ? "Escolar" : "Público"}
          </span>
          {event.category && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400">
              {event.category}
            </span>
          )}
        </div>

        {mostrarRequisitos && (
          <p className="text-[10px] line-clamp-2 rounded-lg p-2 border bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-white/5">
            {requisitos}
          </p>
        )}

        {/* Barra de ações */}
        <div className="mt-auto pt-3 border-t border-slate-100 dark:border-white/10 flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            {onOpen && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen();
                }}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700/70 dark:text-white dark:hover:bg-slate-600"
              >
                <Info size={12} />
                <span>{rotuloVer}</span>
              </button>
            )}

            {onAbrirMapa && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAbrirMapa();
                }}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700/70 dark:text-white dark:hover:bg-slate-600"
                title="Abrir no mapa"
              >
                <MapIcon size={12} />
                <span>Mapa</span>
              </button>
            )}

            {onAutorizacoes && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAutorizacoes();
                }}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1 bg-emerald-600 text-white hover:bg-emerald-500"
                title="Visualizar autorizações dos pais/responsáveis para este evento"
              >
                <ShieldCheck size={12} />
                <span>Autorizações</span>
              </button>
            )}
          </div>

          {(onEditar || onExcluir) && (
            <div className="flex items-center gap-1.5 shrink-0">
              {onEditar && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditar();
                  }}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1 bg-blue-600 text-white hover:bg-blue-500"
                >
                  <Edit3 size={12} />
                  <span>Editar</span>
                </button>
              )}
              {onExcluir && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onExcluir();
                  }}
                  className="p-1.5 rounded-lg transition-colors cursor-pointer bg-slate-100 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-white dark:hover:bg-red-600/80"
                  title="Excluir evento"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          )}

          {bloqueadoParaEditar && !onEditar && (
            <span className="text-[10px] font-medium flex items-center gap-1 shrink-0 text-slate-400 dark:text-slate-400">
              <Lock size={10} />
              <span>Outro admin</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
