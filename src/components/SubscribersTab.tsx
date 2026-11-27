/**
 * Aba "Assinantes" — quem paga pelo aplicativo.
 *
 * Separada da aba "Financeiro" de propósito: esta responde "quem são as pessoas
 * e escolas que assinam" (lista nominal), enquanto o financeiro responde
 * "quanto entrou e quanto está pendente" (tabela de dinheiro). Misturar as duas
 * numa tela só fazia uma delas ficar escondida.
 *
 * Todos os dados vêm da Edge Function `billing-api` (`/owner/overview`), que
 * valida o JWT e confere a lista de proprietários no servidor. Se a chamada
 * falhar, a tela mostra o motivo real em vez de "R$ 0,00".
 */
import React, { useEffect, useState } from "react";
import { Users, Loader2, RefreshCw, Building2, ShieldCheck } from "lucide-react";
import { fetchOwnerOverview, type OwnerOverview } from "../lib/billingApi.ts";

interface Props {
  onShowToast?: (mensagem: string, tipo?: "success" | "error" | "warning" | "info") => void;
}

function reais(cents: number | null | undefined): string {
  return ((cents ?? 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function SubscribersTab({ onShowToast }: Props) {
  const [dados, setDados] = useState<OwnerOverview | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [precisaLogin, setPrecisaLogin] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    setErro(null);
    const res = await fetchOwnerOverview();
    if (res.ok && res.data) {
      setDados(res.data);
    } else {
      setErro(res.error);
      setPrecisaLogin(res.precisaLoginSupabase === true);
    }
    setCarregando(false);
  };

  useEffect(() => {
    void carregar();
  }, []);

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
        <Loader2 size={16} className="animate-spin" />
        Carregando assinantes…
      </div>
    );
  }

  if (erro) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-4">
        <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
          {precisaLogin ? "Entre com a conta do proprietário" : "Não foi possível carregar"}
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">{erro}</p>
        <button
          onClick={() => void carregar()}
          className="mt-3 text-xs font-semibold underline cursor-pointer"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const assinaturas = dados?.assinaturas ?? [];
  const indicadores = dados?.indicadores;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <Users size={16} />
          Instituições assinantes ({assinaturas.length})
        </h3>
        <button
          onClick={() => void carregar()}
          className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1 cursor-pointer"
        >
          <RefreshCw size={13} />
          Atualizar
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { rotulo: "Contratantes", valor: String(indicadores?.instituicoesContratantes ?? 0) },
          { rotulo: "Ativas", valor: String(indicadores?.assinaturasAtivas ?? 0) },
          { rotulo: "Em teste", valor: String(indicadores?.assinaturasEmTeste ?? 0) },
          { rotulo: "Vencidas", valor: String(indicadores?.assinaturasVencidas ?? 0) },
        ].map((k) => (
          <div
            key={k.rotulo}
            className="rounded-xl border border-slate-200 dark:border-white/10 p-3"
          >
            <p className="text-[10px] uppercase font-bold text-slate-500">{k.rotulo}</p>
            <p className="text-lg font-bold">{k.valor}</p>
          </div>
        ))}
      </div>

      {assinaturas.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 p-6 text-center">
          <Building2 size={24} className="mx-auto mb-2 text-slate-400" />
          <p className="text-sm font-semibold">Nenhuma assinatura registrada</p>
          <p className="text-xs text-slate-500 mt-1">
            Quando uma escola assinar um plano, ela aparece aqui com o valor mensal.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-white/5">
              <tr className="text-left">
                <th className="px-3 py-2 font-bold">Instituição</th>
                <th className="px-3 py-2 font-bold">Plano</th>
                <th className="px-3 py-2 font-bold">Ciclo</th>
                <th className="px-3 py-2 font-bold">Situação</th>
                <th className="px-3 py-2 font-bold text-right">Mensal</th>
              </tr>
            </thead>
            <tbody>
              {assinaturas.map((a: any) => (
                <tr key={a.id} className="border-t border-slate-100 dark:border-white/5">
                  <td className="px-3 py-2">
                    <span className="font-semibold">{a.school_name || a.school_slug || "—"}</span>
                    {a.founder_discount && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                        <ShieldCheck size={10} />
                        fundadora
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{a.plan_name || "—"}</td>
                  <td className="px-3 py-2">{a.billing_cycle === "annual" ? "Anual" : "Mensal"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                        a.status === "active"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : a.status === "trialing"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                      }`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{reais(a.monthly_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-slate-500">
        "Mensal" é o valor equivalente por mês (plano anual dividido por 12, com
        o desconto já aplicado). Taxa de implantação e adicionais não entram no
        valor recorrente — eles aparecem na aba Financeiro.
      </p>
    </div>
  );
}
