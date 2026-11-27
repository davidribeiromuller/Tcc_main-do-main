/**
 * Aba de comunicados do painel administrativo.
 *
 * DUAS POSSIBILIDADES, DECIDIDAS NO SERVIDOR
 * ------------------------------------------
 * - Direção da escola: publica comunicado **da própria escola**.
 * - Proprietário da plataforma: publica comunicado **global**, que aparece em
 *   todas as escolas e na aba "Comunicados da rede".
 *
 * Este componente é a borda: mostra o que a pessoa pode fazer. A autorização de
 * verdade é da Edge Function `announcements-api`, que confere o JWT, lê
 * `memberships` e a lista de proprietários. Nada aqui é barreira de segurança.
 */
import React, { useEffect, useState } from "react";
import { Megaphone, Globe, School, Send, Ban, Loader2, RefreshCw } from "lucide-react";
import {
  fetchComunicados,
  publicarComunicado,
  ROTULOS_PUBLICO,
  CATEGORIAS_COMUNICADO,
  type Comunicado,
  type PublicoAlvo,
} from "../lib/announcementsService.ts";

interface Props {
  /** Slug da escola do usuário logado, se houver. */
  schoolSlug?: string | null;
  /** Nome da escola, só para exibição. */
  schoolName?: string | null;
  /** `true` para o proprietário da plataforma (pode publicar global). */
  podePublicarGlobal?: boolean;
  onShowToast?: (mensagem: string, tipo?: "success" | "error" | "warning" | "info") => void;
}

export default function AnnouncementsAdminTab({
  schoolSlug,
  schoolName,
  podePublicarGlobal = false,
  onShowToast,
}: Props) {
  const [lista, setLista] = useState<Comunicado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [titulo, setTitulo] = useState("");
  const [corpo, setCorpo] = useState("");
  const [categoria, setCategoria] = useState<string>("Comunicado");
  const [publico, setPublico] = useState<PublicoAlvo>("all");
  const [dias, setDias] = useState<number>(2);
  const [global, setGlobal] = useState(false);
  const [publicando, setPublicando] = useState(false);

  const recarregar = async () => {
    setCarregando(true);
    setErro(null);
    const { comunicados, error } = await fetchComunicados({ incluirGlobais: true });
    setLista(comunicados);
    setErro(error);
    setCarregando(false);
  };

  useEffect(() => {
    void recarregar();
  }, []);

  const publicar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (publicando) return;

    if (!global && !schoolSlug) {
      onShowToast?.("Sua conta não está ligada a uma escola, então só é possível publicar comunicado global.", "error");
      return;
    }

    setPublicando(true);
    try {
      const resultado = await publicarComunicado({
        // O serviço resolve o uuid real da escola a partir do slug. O id do
        // catálogo local é numérico e o Postgres recusaria na coluna uuid.
        schoolSlug: global ? null : schoolSlug,
        title: titulo,
        body: corpo,
        category: categoria,
        audience: publico,
        diasParaExpirar: dias,
      });

      if (resultado.error) {
        onShowToast?.(resultado.error, "error");
        return;
      }
      if (resultado.comunicado) {
        onShowToast?.(
          global
            ? "Comunicado publicado para todas as escolas."
            : "Comunicado publicado.",
          "success"
        );
        setTitulo("");
        setCorpo("");
        await recarregar();
      }
    } finally {
      setPublicando(false);
    }
  };

  return (
    <div className="space-y-5 pb-8">
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-brand-card-dark p-4">
        <div className="flex items-center gap-2 mb-3">
          <Megaphone size={18} className="text-slate-700 dark:text-slate-200" />
          <h3 className="font-bold text-sm">Publicar comunicado</h3>
        </div>

        {podePublicarGlobal && (
          <div className="flex items-center gap-2 mb-3 p-2 rounded-xl bg-slate-50 dark:bg-black/20">
            <button
              type="button"
              onClick={() => setGlobal(false)}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                !global ? "bg-white dark:bg-brand-card-dark shadow-xs" : "text-slate-500"
              }`}
            >
              <School size={13} />
              {schoolName || "Só a escola"}
            </button>
            <button
              type="button"
              onClick={() => setGlobal(true)}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                global ? "bg-emerald-800 text-white shadow-xs" : "text-slate-500"
              }`}
            >
              <Globe size={13} />
              Toda a rede
            </button>
          </div>
        )}

        <form onSubmit={publicar} className="space-y-3">
          <input
            type="text"
            required
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título do comunicado"
            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />

          <textarea
            required
            rows={4}
            value={corpo}
            onChange={(e) => setCorpo(e.target.value)}
            placeholder="Conteúdo do comunicado…"
            className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="text-xs font-semibold">
              Categoria
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="mt-1 w-full h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
              >
                {CATEGORIAS_COMUNICADO.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>

            <label className="text-xs font-semibold">
              Notificar
              <select
                value={publico}
                onChange={(e) => setPublico(e.target.value as PublicoAlvo)}
                className="mt-1 w-full h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
              >
                {(Object.keys(ROTULOS_PUBLICO) as PublicoAlvo[]).map((k) => (
                  <option key={k} value={k}>{ROTULOS_PUBLICO[k]}</option>
                ))}
              </select>
            </label>

            <label className="text-xs font-semibold">
              Expira em (dias)
              <input
                type="number"
                min={1}
                max={90}
                value={dias}
                onChange={(e) => setDias(Number(e.target.value) || 2)}
                className="mt-1 w-full h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={publicando}
            className="w-full h-10 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {publicando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {publicando ? "Publicando…" : global ? "Publicar para toda a rede" : "Publicar"}
          </button>
        </form>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm">
          No ar ({lista.length})
        </h3>
        <button
          onClick={() => void recarregar()}
          className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1 cursor-pointer"
        >
          <RefreshCw size={13} />
          Atualizar
        </button>
      </div>

      {carregando && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" />
          Carregando…
        </div>
      )}

      {!carregando && erro && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-300">
          {erro}
        </div>
      )}

      {!carregando && !erro && lista.length === 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 p-6 text-center">
          <Megaphone size={24} className="mx-auto mb-2 text-slate-400" />
          <p className="text-sm font-semibold">Nenhum comunicado no ar</p>
          <p className="text-xs text-slate-500 mt-1">
            O que você publicar acima aparece aqui e no portal das escolas.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {lista.map((c) => (
          <article
            key={c.id}
            className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-brand-card-dark p-3"
          >
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 dark:bg-white/10">
                {c.schoolId ? <School size={10} /> : <Globe size={10} />}
                {c.schoolId ? (c.schoolSlug || "Escola") : "Toda a rede"}
              </span>
              <span className="text-[10px] font-semibold text-slate-500 uppercase">{c.category}</span>
              <span className="text-[10px] text-slate-400 ml-auto">
                {new Date(c.createdAt).toLocaleDateString("pt-BR")}
              </span>
            </div>
            <p className="text-sm font-bold">{c.title}</p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 whitespace-pre-line">{c.body}</p>
            <div className="mt-1.5 flex items-center gap-3 text-[10px] text-slate-400">
              <span>{ROTULOS_PUBLICO[c.audience]}</span>
              {c.expiresAt && (
                <span className="text-amber-700 dark:text-amber-400">
                  Expira em {new Date(c.expiresAt).toLocaleDateString("pt-BR")}
                </span>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
