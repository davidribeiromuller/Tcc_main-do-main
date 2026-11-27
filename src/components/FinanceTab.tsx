/**
 * Aba "Financeiro" — o dinheiro das assinaturas.
 *
 * Separada de "Assinantes": aquela mostra QUEM assina; esta mostra QUANTO
 * entrou, quanto está pendente e o que cada cobrança é (mensalidade, taxa de
 * implantação, adicional). São perguntas diferentes e a tela não deve forçar
 * uma a esconder a outra.
 *
 * Fonte: `billing-api` `/owner/overview`. A função calcula os totais no
 * servidor — o navegador nunca soma dinheiro a partir de dados que ele mesmo
 * poderia alterar.
 */
import React, { useEffect, useState } from "react";
import { Receipt, Loader2, RefreshCw, TrendingUp, AlertTriangle } from "lucide-react";
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

const ROTULO_KIND: Record<string, string> = {
  subscription: "Mensalidade",
  setup: "Implantação",
  addon: "Adicional",
  partner_campaign: "Campanha de parceiro",
  partner_directory: "Diretório de parceiros",
  manual: "Manual",
};

export default function FinanceTab({ onShowToast }: Props) {
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
        Carregando dados financeiros…
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

  const i = dados?.indicadores;
  const cobrancas = dados?.cobrancas ?? [];
  const parceiro = dados?.cobranca;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <Receipt size={16} />
          Dinheiro das assinaturas
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
          { rotulo: "Receita recorrente (mês)", valor: reais(i?.receitaRecorrenteMensalCents), tom: "text-emerald-700 dark:text-emerald-400" },
          { rotulo: "Projeção anual", valor: reais(i?.receitaRecorrenteAnualizadaCents), tom: "" },
          { rotulo: "Recebido", valor: reais(i?.pagamentosRecebidosCents), tom: "text-emerald-700 dark:text-emerald-400" },
          { rotulo: "Pendente", valor: reais(i?.pagamentosPendentesCents), tom: i?.pagamentosPendentesCents ? "text-amber-700 dark:text-amber-400" : "" },
          { rotulo: "Implantações", valor: reais(i?.taxasImplantacaoRecebidasCents), tom: "" },
          { rotulo: "Adicionais", valor: reais(i?.adicionaisVendidosCents), tom: "" },
          { rotulo: "Ativas", valor: String(i?.assinaturasAtivas ?? 0), tom: "" },
          { rotulo: "Canceladas", valor: String(i?.assinaturasCanceladas ?? 0), tom: "" },
        ].map((k) => (
          <div
            key={k.rotulo}
            className="rounded-xl border border-slate-200 dark:border-white/10 p-3"
          >
            <p className="text-[10px] uppercase font-bold text-slate-500">{k.rotulo}</p>
            <p className={`text-base font-bold font-mono ${k.tom}`}>{k.valor}</p>
          </div>
        ))}
      </div>

      {parceiro && !parceiro.configurado && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
              Provedor de pagamento não configurado
            </p>
            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
              {parceiro.nota}
              {parceiro.faltando?.length > 0 && (
                <> Faltando: <span className="font-mono">{parceiro.faltando.join(", ")}</span>.</>
              )}
            </p>
          </div>
        </div>
      )}

      <div>
        <h4 className="font-bold text-xs mb-2 flex items-center gap-1.5">
          <TrendingUp size={13} />
          Cobranças ({cobrancas.length})
        </h4>

        {cobrancas.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 p-6 text-center">
            <Receipt size={24} className="mx-auto mb-2 text-slate-400" />
            <p className="text-sm font-semibold">Nenhuma cobrança registrada</p>
            <p className="text-xs text-slate-500 mt-1">
              Mensalidades, implantações e adicionais aparecem aqui.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-white/5">
                <tr className="text-left">
                  <th className="px-3 py-2 font-bold">Instituição</th>
                  <th className="px-3 py-2 font-bold">Tipo</th>
                  <th className="px-3 py-2 font-bold">Vencimento</th>
                  <th className="px-3 py-2 font-bold">Situação</th>
                  <th className="px-3 py-2 font-bold text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {cobrancas.map((c: any) => (
                  <tr key={c.id} className="border-t border-slate-100 dark:border-white/5">
                    <td className="px-3 py-2 font-semibold">{c.school_name || "—"}</td>
                    <td className="px-3 py-2">{ROTULO_KIND[c.kind] || c.kind}</td>
                    <td className="px-3 py-2">
                      {c.due_date ? new Date(c.due_date).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                          c.status === "paid"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : c.status === "pending"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                              : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{reais(c.amount_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[10px] text-slate-500">
        Receita recorrente considera apenas assinaturas `active`, com o plano
        anual dividido por 12. Taxa de implantação e adicionais são receita
        avulsa e ficam fora desse número — por isso aparecem em linhas próprias.
      </p>
    </div>
  );
}
