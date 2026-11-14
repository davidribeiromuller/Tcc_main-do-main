import React, { useEffect, useId, useRef, useState } from "react";
import { Check, Loader2, MapPin, Search, X } from "lucide-react";
import { buscarEnderecos, type SugestaoEndereco } from "../lib/addressSearch";

interface AddressSearchInputProps {
  /** Valor atual do campo (endereço em texto). */
  value: string;
  /** Chamado a cada digitação, para manter o formulário em sincronia. */
  onChange: (value: string) => void;
  /**
   * Chamado quando o usuário escolhe uma sugestão.
   * Recebe as coordenadas resolvidas — é isso que permite o evento aparecer no
   * mapa na posição certa, em vez de o mapa adivinhar.
   */
  onSelect?: (sugestao: SugestaoEndereco) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  /** Rótulo do campo. */
  label?: string;
  /** Texto de ajuda abaixo do campo. */
  hint?: string;
  id?: string;
}

/**
 * Campo de endereço com busca real (geocoding).
 *
 * Antes, "Localização / Endereço" era um `<input>` de texto livre: o admin
 * digitava e nada era resolvido, então o evento ficava sem coordenadas. Este
 * componente consulta o Nominatim enquanto o usuário digita e, ao escolher uma
 * sugestão, devolve lat/lng para quem o usa.
 *
 * Detalhes de usabilidade que importam:
 * - `debounce` de 600 ms: sem ele, "Rua das Flores" dispararia 14 requisições,
 *   estourando o limite de 1 req/s do serviço público.
 * - Teclado: ↑ ↓ para navegar, Enter para escolher, Esc para fechar.
 * - Falha de rede não bloqueia o preenchimento manual do campo.
 */
export default function AddressSearchInput({
  value,
  onChange,
  onSelect,
  placeholder = "Ex: Rua das Flores, 123 - Centro, Araucária",
  required,
  className = "",
  label,
  hint,
  id,
}: AddressSearchInputProps) {
  const [sugestoes, setSugestoes] = useState<SugestaoEndereco[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState(false);
  const [indiceAtivo, setIndiceAtivo] = useState(-1);

  // `id` é opcional, mas o rótulo precisa apontar para o campo: sem isso o
  // leitor de tela anuncia um input sem nome. useId gera um id estável.
  const idGerado = useId();
  const inputId = id ?? `endereco-${idGerado}`;

  const containerRef = useRef<HTMLDivElement>(null);
  /** Guarda o texto que originou a última busca, para não buscar de novo. */
  const ultimaBusca = useRef<string>("");

  // Busca com debounce sempre que o texto muda.
  useEffect(() => {
    const termo = (value || "").trim();

    // Não busca de novo o que o usuário acabou de escolher na lista.
    if (selecionado && termo === ultimaBusca.current) return;

    if (termo.length < 3) {
      setSugestoes([]);
      setAberto(false);
      setErro(null);
      return;
    }

    // Já buscamos exatamente este termo e o resultado está na tela.
    if (termo === ultimaBusca.current && sugestoes.length > 0) return;

    let cancelado = false;
    const timer = setTimeout(async () => {
      setBuscando(true);
      setErro(null);
      try {
        const resultado = await buscarEnderecos(termo, 6);
        if (cancelado) return;
        ultimaBusca.current = termo;
        setSugestoes(resultado);
        setAberto(resultado.length > 0);
        setIndiceAtivo(-1);
        setSelecionado(false);
      } catch (err: any) {
        if (cancelado) return;
        setSugestoes([]);
        setErro(err?.message ?? "Não foi possível buscar o endereço.");
      } finally {
        if (!cancelado) setBuscando(false);
      }
    }, 600);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
    // `sugestoes` e `selecionado` são lidos dentro do efeito de propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Fecha a lista ao clicar fora.
  useEffect(() => {
    const aoClicarFora = (evento: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(evento.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  const escolher = (sugestao: SugestaoEndereco) => {
    ultimaBusca.current = sugestao.shortName;
    setSelecionado(true);
    setSugestoes([]);
    setAberto(false);
    setIndiceAtivo(-1);
    onChange(sugestao.shortName);
    onSelect?.(sugestao);
  };

  const aoTeclar = (evento: React.KeyboardEvent<HTMLInputElement>) => {
    if (!aberto || sugestoes.length === 0) return;

    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      setIndiceAtivo((i) => (i + 1) % sugestoes.length);
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      setIndiceAtivo((i) => (i <= 0 ? sugestoes.length - 1 : i - 1));
    } else if (evento.key === "Enter" && indiceAtivo >= 0) {
      // Só intercepta o Enter quando há item destacado — senão o Enter deve
      // enviar o formulário normalmente.
      evento.preventDefault();
      escolher(sugestoes[indiceAtivo]);
    } else if (evento.key === "Escape") {
      setAberto(false);
      setIndiceAtivo(-1);
    }
  };

  return (
    <div className="flex flex-col gap-1" ref={containerRef}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-semibold text-slate-600 dark:text-slate-300"
        >
          {label}
        </label>
      )}

      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
          {buscando ? (
            <Loader2 size={14} className="animate-spin" />
          ) : selecionado ? (
            <Check size={14} className="text-emerald-500" />
          ) : (
            <Search size={14} />
          )}
        </div>

        <input
          id={inputId}
          type="text"
          required={required}
          value={value}
          onChange={(e) => {
            setSelecionado(false);
            onChange(e.target.value);
          }}
          onFocus={() => {
            if (sugestoes.length > 0) setAberto(true);
          }}
          onKeyDown={aoTeclar}
          placeholder={placeholder}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={aberto}
          className={`w-full h-10 pl-9 pr-8 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none text-slate-800 dark:text-slate-100 ${className}`}
        />

        {value && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setSelecionado(false);
              setSugestoes([]);
              setAberto(false);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Limpar endereço"
          >
            <X size={14} />
          </button>
        )}

        {aberto && sugestoes.length > 0 && (
          <ul
            role="listbox"
            className="absolute z-[60] left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl shadow-xl"
          >
            {sugestoes.map((s, indice) => (
              <li key={`${s.lat}-${s.lng}-${indice}`} role="option" aria-selected={indice === indiceAtivo}>
                <button
                  type="button"
                  onMouseEnter={() => setIndiceAtivo(indice)}
                  onClick={() => escolher(s)}
                  className={`w-full text-left px-3 py-2 flex items-start gap-2 transition-colors ${
                    indice === indiceAtivo
                      ? "bg-brand-accent/10 dark:bg-brand-accent/20"
                      : "hover:bg-slate-50 dark:hover:bg-white/5"
                  }`}
                >
                  <MapPin size={13} className="mt-0.5 shrink-0 text-brand-accent" />
                  <span className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                      {s.shortName}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      {s.city ? `${s.city} · ` : ""}
                      {s.displayName}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {erro && <span className="text-[10px] text-amber-600 dark:text-amber-400">{erro}</span>}
      {!erro && hint && (
        <span className="text-[10px] text-slate-400 dark:text-slate-500">{hint}</span>
      )}
    </div>
  );
}
