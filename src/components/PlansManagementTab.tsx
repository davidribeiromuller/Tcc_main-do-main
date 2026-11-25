import React, { useEffect, useMemo, useState } from "react";
import {
  Check,
  Pencil,
  X,
  Save,
  Loader2,
  Users,
  Building2,
  ShieldCheck,
  Sparkles,
  Info,
} from "lucide-react";
import { formatBRL } from "../lib/subscription.ts";
import { fetchJsonApi, getStoredSessionToken } from "../lib/staticHosting.ts";

/**
 * Aba "Planos e preços" do painel Master.
 *
 * PEDIDO (rodada 42):
 *   "crie uma página para essa opção no dashboard com a tabela de preços
 *    pré-estabelecidas anteriormente"
 *
 * "Pré-estabelecidas anteriormente" = os valores que já estão na tabela
 * `plans` do banco (Comunidade R$ 149, Escola R$ 299, Rede R$ 699, mais as
 * anuidades com 10% de desconto e as taxas de implantação). Esta tela NÃO
 * inventa preço nem usa constante no frontend: ela lê do banco pelo servidor
 * (`GET /api/master/plans`) e grava por `PUT /api/master/plans/:id`.
 *
 * Por que os preços não ficam hardcoded aqui: o site publica a mesma tabela
 * em /planos (leitura pública via `plans_public_read`). Se a tela do painel
 * tivesse uma cópia, editar ali não mudaria o que o cliente vê — e as duas
 * versões divergiriam em silêncio.
 */

interface PlanRow {
  id: string;
  name: string;
  tagline?: string | null;
  monthly_price_cents: number;
  annual_price_cents: number;
  setup_fee_cents: number;
  max_active_students: number | null;
  max_units: number | null;
  max_admins: number | null;
  is_active: boolean;
  is_public: boolean;
  sort_order?: number;
  features?: Record<string, boolean> | null;
}

interface AddonRow {
  id: string;
  name: string;
  description?: string | null;
  price_cents: number;
  billing_period?: string | null;
  is_active?: boolean;
}

interface Props {
  onShowToast?: (message: string, type?: "success" | "error" | "info") => void;
}

/** Rótulos legíveis dos recursos do JSON `features`. */
const RECURSOS: { chave: string; label: string }[] = [
  { chave: "events", label: "Eventos e mural" },
  { chave: "school_profile", label: "Perfil da escola" },
  { chave: "student_area", label: "Área do aluno" },
  { chave: "partners_directory", label: "Parceiros" },
  { chave: "authorizations", label: "Autorizações digitais" },
  { chave: "reports", label: "Relatórios" },
  { chave: "ai_assistant", label: "Assistente com cota" },
  { chave: "ai_advanced", label: "Assistente avançado" },
  { chave: "multi_unit", label: "Múltiplas unidades" },
  { chave: "custom_domain", label: "Domínio próprio" },
  { chave: "api_integration", label: "Integração por API" },
];

/** Centavos → "149,00" para o input de edição (sem R$, sem milhar). */
function centavosParaInput(c: number): string {
  return (Number(c || 0) / 100).toFixed(2).replace(".", ",");
}

/** "149,00" ou "149.00" ou "149" → centavos inteiros. */
function inputParaCentavos(txt: string): number | null {
  const limpo = String(txt || "").trim().replace(/[^\d,.-]/g, "");
  if (!limpo) return null;
  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo;
  const valor = Number(normalizado);
  if (!Number.isFinite(valor) || valor < 0) return null;
  return Math.round(valor * 100);
}

export default function PlansManagementTab({ onShowToast }: Props) {
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [planos, setPlanos] = useState<PlanRow[]>([]);
  const [addons, setAddons] = useState<AddonRow[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Partial<PlanRow> | null>(null);
  const [salvando, setSalvando] = useState(false);

  const authHeaders = (): Record<string, string> => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${getStoredSessionToken() || ""}`,
  });

  const carregar = async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetchJsonApi("/api/master/plans", { headers: authHeaders() });
      if (!res) {
        setErro(
          "Esta aba precisa do servidor. A versão publicada no GitHub Pages é só o app " +
            "no navegador — rode `npm run dev` (ou o deploy do DEPLOY_SERVIDOR.md) para editar os preços."
        );
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(body?.error || (res.status === 403 ? "Acesso restrito ao proprietário." : "Falha ao carregar."));
        return;
      }
      const ordenados: PlanRow[] = (body.plans || []).slice().sort(
        (a: PlanRow, b: PlanRow) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      );
      setPlanos(ordenados);
      setAddons(body.addons || []);
    } catch (err: any) {
      setErro(err?.message || "Falha ao carregar os planos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const comecarEdicao = (p: PlanRow) => {
    setEditando(p.id);
    setRascunho({
      name: p.name,
      tagline: p.tagline,
      monthly_price_cents: p.monthly_price_cents,
      annual_price_cents: p.annual_price_cents,
      setup_fee_cents: p.setup_fee_cents,
      max_active_students: p.max_active_students,
      max_units: p.max_units,
      max_admins: p.max_admins,
      is_active: p.is_active,
      is_public: p.is_public,
    });
  };

  const cancelar = () => {
    setEditando(null);
    setRascunho(null);
  };

  const salvar = async (id: string) => {
    if (!rascunho) return;
    setSalvando(true);
    try {
      const res = await fetchJsonApi(`/api/master/plans/${id}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(rascunho),
      });
      if (!res) {
        onShowToast?.("Servidor indisponível para salvar.", "error");
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        onShowToast?.(body?.error || "Não foi possível salvar o plano.", "error");
        return;
      }
      onShowToast?.("Plano atualizado. A página pública já mostra o novo preço.", "success");
      cancelar();
      await carregar();
    } finally {
      setSalvando(false);
    }
  };

  /*
    O desconto anual não é digitado: é calculado a partir dos dois preços.
    Mostrar a conta evita a inconsistência clássica de anuidade mais cara que
    12 mensalidades — erro que passaria despercebido no formulário.
  */
  const descontoAnual = (p: { monthly_price_cents: number; annual_price_cents: number }) => {
    const cheio = p.monthly_price_cents * 12;
    if (!cheio || !p.annual_price_cents) return null;
    const pct = Math.round((1 - p.annual_price_cents / cheio) * 100);
    return Number.isFinite(pct) ? pct : null;
  };

  const totalMensal = useMemo(
    () => planos.reduce((s, p) => s + (p.is_active ? p.monthly_price_cents : 0), 0),
    [planos]
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-sm text-slate-500">
        <Loader2 size={16} className="animate-spin" /> Carregando a tabela de preços…
      </div>
    );
  }

  if (erro) {
    return (
      <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-5">
        <p className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
          <Info size={14} className="mt-0.5 shrink-0" /> {erro}
        </p>
        <button
          onClick={carregar}
          className="mt-3 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Tabela de preços</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Estes são os valores que aparecem na página pública de planos. Editar aqui muda lá.
          </p>
        </div>
        <span className="rounded-full bg-brand-primary/10 px-3 py-1 text-[11px] font-semibold text-brand-accent dark:text-brand-primary">
          {planos.length} planos · {formatBRL(totalMensal)}/mês somados
        </span>
      </header>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Plano</th>
              <th className="px-3 py-2 text-right font-semibold">Mensal</th>
              <th className="px-3 py-2 text-right font-semibold">Anual</th>
              <th className="px-3 py-2 text-right font-semibold">Implantação</th>
              <th className="px-3 py-2 text-center font-semibold">Limites</th>
              <th className="px-3 py-2 text-center font-semibold">Situação</th>
              <th className="px-3 py-2 text-right font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {planos.map((p) => {
              const emEdicao = editando === p.id && rascunho;
              const off = descontoAnual(p);
              return (
                <tr key={p.id} className={emEdicao ? "bg-brand-primary/5" : undefined}>
                  <td className="px-3 py-2">
                    {emEdicao ? (
                      <div className="space-y-1">
                        <input
                          value={String(rascunho.name ?? "")}
                          onChange={(e) => setRascunho({ ...rascunho, name: e.target.value })}
                          className="w-32 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-xs"
                          aria-label={`Nome do plano ${p.id}`}
                        />
                        <input
                          value={String(rascunho.tagline ?? "")}
                          onChange={(e) => setRascunho({ ...rascunho, tagline: e.target.value })}
                          placeholder="Descrição curta"
                          className="w-52 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-[11px]"
                          aria-label={`Descrição do plano ${p.id}`}
                        />
                      </div>
                    ) : (
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{p.name}</p>
                        <p className="text-[11px] text-slate-400">{p.id}</p>
                        {p.tagline && (
                          <p className="mt-0.5 max-w-xs text-[11px] text-slate-500 dark:text-slate-400">
                            {p.tagline}
                          </p>
                        )}
                      </div>
                    )}
                  </td>

                  <td className="px-3 py-2 text-right">
                    {emEdicao ? (
                      <input
                        value={centavosParaInput(rascunho.monthly_price_cents ?? 0)}
                        onChange={(e) => {
                          const c = inputParaCentavos(e.target.value);
                          setRascunho({ ...rascunho, monthly_price_cents: c ?? 0 });
                        }}
                        inputMode="decimal"
                        className="w-24 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-right text-xs"
                        aria-label={`Preço mensal de ${p.name}`}
                      />
                    ) : (
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {formatBRL(p.monthly_price_cents)}
                      </span>
                    )}
                  </td>

                  <td className="px-3 py-2 text-right">
                    {emEdicao ? (
                      <input
                        value={centavosParaInput(rascunho.annual_price_cents ?? 0)}
                        onChange={(e) => {
                          const c = inputParaCentavos(e.target.value);
                          setRascunho({ ...rascunho, annual_price_cents: c ?? 0 });
                        }}
                        inputMode="decimal"
                        className="w-28 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-right text-xs"
                        aria-label={`Preço anual de ${p.name}`}
                      />
                    ) : (
                      <div>
                        <span className="text-slate-700 dark:text-slate-200">
                          {formatBRL(p.annual_price_cents)}
                        </span>
                        {off !== null && (
                          <p className={`text-[10px] ${off > 0 ? "text-emerald-600" : "text-rose-500"}`}>
                            {off > 0 ? `${off}% off` : "sem desconto"}
                          </p>
                        )}
                      </div>
                    )}
                  </td>

                  <td className="px-3 py-2 text-right">
                    {emEdicao ? (
                      <input
                        value={centavosParaInput(rascunho.setup_fee_cents ?? 0)}
                        onChange={(e) => {
                          const c = inputParaCentavos(e.target.value);
                          setRascunho({ ...rascunho, setup_fee_cents: c ?? 0 });
                        }}
                        inputMode="decimal"
                        className="w-24 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-right text-xs"
                        aria-label={`Taxa de implantação de ${p.name}`}
                      />
                    ) : (
                      <span className="text-slate-500 dark:text-slate-400">
                        {formatBRL(p.setup_fee_cents)}
                      </span>
                    )}
                  </td>

                  <td className="px-3 py-2">
                    <div className="flex flex-col items-center gap-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <Users size={11} /> {p.max_active_students ?? "—"} alunos
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Building2 size={11} /> {p.max_units ?? "—"} unid.
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <ShieldCheck size={11} /> {p.max_admins ?? "—"} admins
                      </span>
                    </div>
                  </td>

                  <td className="px-3 py-2 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          p.is_active
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                            : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                        }`}
                      >
                        {p.is_active ? "Ativo" : "Inativo"}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {p.is_public ? "público" : "oculto"}
                      </span>
                    </div>
                  </td>

                  <td className="px-3 py-2 text-right">
                    {emEdicao ? (
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => salvar(p.id)}
                          disabled={salvando}
                          className="inline-flex items-center gap-1 rounded-lg bg-brand-primary px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
                        >
                          {salvando ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                          Salvar
                        </button>
                        <button
                          onClick={cancelar}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-600 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300"
                        >
                          <X size={11} /> Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => comecarEdicao(p)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-600 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <Pencil size={11} /> Editar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {planos.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                  Nenhum plano cadastrado no banco.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Recursos por plano */}
      {planos.length > 0 && (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
            <Sparkles size={13} /> O que cada plano inclui
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-1 pr-3 text-left font-semibold">Recurso</th>
                  {planos.map((p) => (
                    <th key={p.id} className="px-2 py-1 text-center font-semibold">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {RECURSOS.map(({ chave, label }) => (
                  <tr key={chave}>
                    <td className="py-1 pr-3 text-slate-600 dark:text-slate-300">{label}</td>
                    {planos.map((p) => (
                      <td key={p.id} className="px-2 py-1 text-center">
                        {p.features?.[chave] ? (
                          <Check size={12} className="mx-auto text-emerald-600" />
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Add-ons */}
      {addons.length > 0 && (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4">
          <h3 className="mb-2 text-xs font-bold text-slate-800 dark:text-slate-100">Serviços adicionais</h3>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {addons.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2 text-xs">
                <div>
                  <p className="font-semibold text-slate-700 dark:text-slate-200">{a.name}</p>
                  {a.description && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{a.description}</p>
                  )}
                </div>
                <span className="whitespace-nowrap font-semibold text-slate-700 dark:text-slate-200">
                  {formatBRL(a.price_cents)}
                  <span className="font-normal text-slate-400"> {a.billing_period || ""}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
