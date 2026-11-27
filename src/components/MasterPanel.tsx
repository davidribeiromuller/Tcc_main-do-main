/**
 * Painel financeiro do proprietário da plataforma.
 *
 * O QUE ELE NÃO É
 * ---------------
 * Não é uma segunda versão do `/admin` e não substitui nada. É um módulo
 * separado, com rota separada (`/master/monetizacao`), que lê apenas as tabelas
 * comerciais. `AdminPanel.tsx` não foi tocado.
 *
 * DE ONDE VÊM OS NÚMEROS
 * ----------------------
 * Da Edge Function `billing-api`, que lê com a chave de serviço. Nenhum valor é
 * calculado aqui: MRR, ARR e totais chegam prontos. Isso é deliberado — se o
 * cálculo morasse na tela, bastaria editar o bundle para "provar" receita.
 *
 * AUTORIZAÇÃO
 * -----------
 * Quem decide é o servidor, comparando o e-mail do JWT com
 * `PLATFORM_OWNER_EMAILS`. Não existe coluna `is_owner`, e esta tela não envia
 * nada que possa promover alguém: se a lista estiver vazia, todos recebem 403.
 */
import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  ShieldAlert,
  Wallet,
  TrendingUp,
  TrendingDown,
  Users,
  Clock,
  XCircle,
  Receipt,
  Settings2,
  Handshake,
  ClipboardList,
  RefreshCw,
  Save,
  Building2,
  FileText,
} from "lucide-react";
import {
  fetchOwnerOverview,
  updatePlan,
  updateSubscription,
  registerManualPayment,
  updatePartnerStatus,
  type OwnerOverview,
  type OwnerPlan,
} from "../lib/billingApi.ts";
import { formatBRL } from "../lib/subscription.ts";

interface MasterPanelProps {
  onNavigate: (screen: string) => void;
}

const ABAS = [
  { id: "resumo", rotulo: "Resumo", icone: TrendingUp },
  { id: "instituicoes", rotulo: "Instituições", icone: Building2 },
  { id: "planos", rotulo: "Planos", icone: Settings2 },
  { id: "cobrancas", rotulo: "Cobranças", icone: Receipt },
  { id: "parceiros", rotulo: "Parceiros", icone: Handshake },
  { id: "auditoria", rotulo: "Auditoria", icone: ClipboardList },
] as const;

type AbaId = (typeof ABAS)[number]["id"];

function dataCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return "—";
  }
}

export default function MasterPanel({ onNavigate }: MasterPanelProps) {
  const [aba, setAba] = useState<AbaId>("resumo");
  const [dados, setDados] = useState<OwnerOverview | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [precisaLogin, setPrecisaLogin] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const carregar = async () => {
    setCarregando(true);
    setErro(null);
    const { ok, data, error, precisaLoginSupabase } = await fetchOwnerOverview();
    setCarregando(false);
    if (!ok) {
      setErro(error);
      setPrecisaLogin(precisaLoginSupabase === true);
      return;
    }
    setDados(data);
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ind = dados?.indicadores;

  const cards = ind
    ? [
        { rotulo: "MRR (contratado)", valor: formatBRL(ind.receitaRecorrenteMensalCents), icone: TrendingUp, dica: "Assinaturas ativas, anual convertido para mensal" },
        { rotulo: "ARR (anualizado)", valor: formatBRL(ind.receitaRecorrenteAnualizadaCents), icone: TrendingUp, dica: "MRR × 12 — projeção, não lucro" },
        { rotulo: "Recebido", valor: formatBRL(ind.pagamentosRecebidosCents), icone: Wallet, dica: "Somente cobranças confirmadas" },
        { rotulo: "Pendente", valor: formatBRL(ind.pagamentosPendentesCents), icone: Clock, dica: "Emitido e ainda não confirmado" },
        { rotulo: "Implantação", valor: formatBRL(ind.taxasImplantacaoRecebidasCents), icone: FileText, dica: "Taxa única — fora do MRR" },
        { rotulo: "Adicionais", valor: formatBRL(ind.adicionaisVendidosCents), icone: Receipt, dica: "Recursos extras pagos" },
        { rotulo: "Ativas", valor: String(ind.assinaturasAtivas), icone: Users, dica: "Assinaturas em dia" },
        { rotulo: "Em teste", valor: String(ind.assinaturasEmTeste), icone: Clock, dica: "Período de demonstração" },
        { rotulo: "Vencidas", valor: String(ind.assinaturasVencidas), icone: AlertCircle, dica: "Atrasadas ou expiradas" },
        { rotulo: "Canceladas", valor: String(ind.assinaturasCanceladas), icone: XCircle, dica: "Encerradas" },
      ]
    : [];

  return (
    <div className="flex flex-col w-full pb-24 text-brand-text-light dark:text-brand-text-dark">
      <div className="border-b border-brand-primary/10">
        <div className="max-w-6xl mx-auto w-full flex items-center gap-3 px-5 sm:px-6 py-4">
          <button
            onClick={() => onNavigate("feed")}
            aria-label="Voltar"
            className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 cursor-pointer"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Painel financeiro</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Módulo comercial do eloEscola</p>
          </div>
          <button
            onClick={carregar}
            disabled={carregando}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 cursor-pointer disabled:opacity-50"
            aria-label="Atualizar"
          >
            <RefreshCw size={16} className={carregando ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto w-full px-5 sm:px-6 py-5">
        {mensagem && (
          <div
            className={`mb-4 rounded-xl p-3 text-sm ${
              mensagem.tipo === "ok"
                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200"
                : "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200"
            }`}
          >
            {mensagem.texto}
          </div>
        )}

        {carregando && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-500">
            <Loader2 className="animate-spin" size={22} />
            <p className="text-sm">Consultando o financeiro…</p>
          </div>
        )}

        {!carregando && erro && (
          <div className="rounded-2xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-5 flex gap-3">
            <ShieldAlert className="text-amber-600 shrink-0" size={20} />
            <div>
              <p className="font-semibold text-sm text-amber-900 dark:text-amber-200">
                O painel financeiro não abriu
              </p>
              <p className="text-xs mt-1 text-amber-800 dark:text-amber-300">{erro}</p>
              {precisaLogin && (
                <p className="text-xs mt-2 text-amber-700 dark:text-amber-400">
                  O painel exige um login que o servidor consiga verificar (JWT do Supabase).
                  Entre novamente com o botão “Entrar com Google”.
                </p>
              )}
              <p className="text-xs mt-2 text-amber-700 dark:text-amber-400">
                Nada é exibido com valor estimado: preferimos a tela vazia a um número inventado.
              </p>
            </div>
          </div>
        )}

        {!carregando && !erro && dados && (
          <>
            {/* Aviso de modo de cobrança */}
            <div
              className={`mb-5 rounded-xl p-3 text-xs flex gap-2 ${
                dados.cobranca.configurado
                  ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200"
                  : "bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200"
              }`}
            >
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>
                <strong>Cobrança:</strong> {dados.cobranca.nota}
                {dados.cobranca.faltando.length > 0 && (
                  <> Falta configurar: {dados.cobranca.faltando.join(", ")}.</>
                )}
              </span>
            </div>

            {/* Abas */}
            <div className="flex gap-1 overflow-x-auto pb-1 mb-5">
              {ABAS.map(({ id, rotulo, icone: Icone }) => (
                <button
                  key={id}
                  onClick={() => setAba(id)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition cursor-pointer ${
                    aba === id
                      ? "bg-brand-primary text-white"
                      : "text-slate-600 dark:text-slate-300 hover:bg-brand-primary/10"
                  }`}
                >
                  <Icone size={13} />
                  {rotulo}
                </button>
              ))}
            </div>

            {aba === "resumo" && (
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {cards.map((c, i) => (
                  <motion.div
                    key={c.rotulo}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="rounded-xl border border-brand-primary/15 p-3"
                    title={c.dica}
                  >
                    <c.icone size={14} className="text-brand-primary mb-2" />
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{c.rotulo}</p>
                    <p className="text-base font-bold mt-0.5">{c.valor}</p>
                  </motion.div>
                ))}
              </div>
            )}

            {aba === "instituicoes" && (
              <TabelaInstituicoes
                dados={dados}
                onSalvar={async (id, mudancas) => {
                  const { ok, error } = await updateSubscription(id, mudancas);
                  setMensagem(ok ? { tipo: "ok", texto: "Assinatura atualizada." } : { tipo: "erro", texto: error || "Falha." });
                  if (ok) carregar();
                }}
              />
            )}

            {aba === "planos" && (
              <div className="space-y-3">
                {dados.planos.map((plano: OwnerPlan) => {
                  const salvarPlano = async (mudancas: Record<string, unknown>) => {
                    const { ok, error } = await updatePlan(plano.id, mudancas);
                    setMensagem(
                      ok
                        ? { tipo: "ok", texto: `Plano ${plano.name} atualizado.` }
                        : { tipo: "erro", texto: error || "Falha." }
                    );
                    if (ok) carregar();
                  };
                  /* `key` vai no wrapper: o TS deste projeto não aceita `key`
                     como prop de componente próprio (só de elemento HTML). */
                  return (
                    <div key={plano.id}>
                      <CardPlano plano={plano} onSalvar={salvarPlano} />
                    </div>
                  );
                })}
                <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                  Alterar preço não reajusta contrato vigente: as assinaturas já criadas mantêm o valor
                  registrado. Cada alteração fica na aba Auditoria.
                </p>
              </div>
            )}

            {aba === "cobrancas" && (
              <Cobrancas
                dados={dados}
                onRegistrar={async (entrada) => {
                  const { ok, error } = await registerManualPayment(entrada);
                  setMensagem(ok ? { tipo: "ok", texto: "Pagamento registrado." } : { tipo: "erro", texto: error || "Falha." });
                  if (ok) carregar();
                }}
              />
            )}

            {aba === "parceiros" && (
              <div className="space-y-2">
                {dados.parceiros.length === 0 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 rounded-xl border border-brand-primary/15 p-4">
                    Nenhum parceiro cadastrado. O módulo Parceiros eloEscola fica desativado até haver
                    o primeiro cadastro — o mural de eventos não é afetado.
                  </p>
                )}
                {dados.parceiros.map((p) => (
                  <div key={p.id} className="rounded-xl border border-brand-primary/15 p-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm">{p.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {p.category || "sem categoria"} · status: {p.status}
                        {p.directory_paid_until ? ` · diretório até ${dataCurta(p.directory_paid_until)}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          const { ok, error } = await updatePartnerStatus(p.id, "approved");
                          setMensagem(ok ? { tipo: "ok", texto: "Parceiro aprovado." } : { tipo: "erro", texto: error || "Falha." });
                          if (ok) carregar();
                        }}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-800 cursor-pointer"
                      >
                        Aprovar
                      </button>
                      <button
                        onClick={async () => {
                          const { ok, error } = await updatePartnerStatus(p.id, "suspended");
                          setMensagem(ok ? { tipo: "ok", texto: "Parceiro suspenso." } : { tipo: "erro", texto: error || "Falha." });
                          if (ok) carregar();
                        }}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-100 text-red-700 cursor-pointer"
                      >
                        Suspender
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {aba === "auditoria" && (
              <div className="rounded-xl border border-brand-primary/15 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-white/5 text-left">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Quando</th>
                      <th className="px-3 py-2 font-semibold">Quem</th>
                      <th className="px-3 py-2 font-semibold">Operação</th>
                      <th className="px-3 py-2 font-semibold">Alvo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.auditoria.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-slate-500">
                          Nenhuma operação registrada ainda.
                        </td>
                      </tr>
                    )}
                    {dados.auditoria.map((a) => (
                      <tr key={a.id} className="border-t border-brand-primary/10">
                        <td className="px-3 py-2 whitespace-nowrap">{dataCurta(a.created_at)}</td>
                        <td className="px-3 py-2">{a.actor_email || "sistema"}</td>
                        <td className="px-3 py-2 font-mono text-[11px]">{a.action}</td>
                        <td className="px-3 py-2 text-slate-500">
                          {a.target_type ? `${a.target_type}:${(a.target_id || "").slice(0, 8)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponentes
// ---------------------------------------------------------------------------

function TabelaInstituicoes({
  dados,
  onSalvar,
}: {
  dados: OwnerOverview;
  onSalvar: (id: string, mudancas: Record<string, unknown>) => Promise<void>;
}) {
  return (
    <div className="rounded-xl border border-brand-primary/15 overflow-x-auto">
      <table className="w-full text-xs min-w-[720px]">
        <thead className="bg-slate-50 dark:bg-white/5 text-left">
          <tr>
            <th className="px-3 py-2 font-semibold">Instituição</th>
            <th className="px-3 py-2 font-semibold">Plano</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">Mensal</th>
            <th className="px-3 py-2 font-semibold">Renovação</th>
            <th className="px-3 py-2 font-semibold">Desconto</th>
            <th className="px-3 py-2 font-semibold">Ação</th>
          </tr>
        </thead>
        <tbody>
          {dados.assinaturas.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-4 text-slate-500">
                Nenhuma assinatura registrada.
              </td>
            </tr>
          )}
          {dados.assinaturas.map((s) => (
            <tr key={s.id} className="border-t border-brand-primary/10">
              <td className="px-3 py-2">
                <p className="font-semibold">{s.school_name || "—"}</p>
                <p className="text-[11px] text-slate-500">{s.school_slug}</p>
              </td>
              <td className="px-3 py-2">{s.plan_name || s.plan_id}</td>
              <td className="px-3 py-2">
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-white/10">
                  {s.status}
                </span>
              </td>
              <td className="px-3 py-2 font-semibold">{formatBRL(s.monthly_cents)}</td>
              <td className="px-3 py-2">{dataCurta(s.current_period_end)}</td>
              <td className="px-3 py-2">
                {s.discount_percent > 0 ? `${s.discount_percent}%${s.founder_discount ? " ★" : ""}` : "—"}
              </td>
              <td className="px-3 py-2">
                <div className="flex gap-1">
                  <button
                    onClick={() => onSalvar(s.id, { status: "active" })}
                    className="px-2 py-1 rounded-md bg-emerald-100 text-emerald-800 text-[11px] font-semibold cursor-pointer"
                    title="Reativar / marcar em dia"
                  >
                    Ativar
                  </button>
                  {s.provider === "mercadopago" && (
                    <a
                      href="#"
                      onClick={(e) => e.preventDefault()}
                      className="px-2 py-1 rounded-md bg-slate-100 dark:bg-white/10 text-[11px] font-semibold"
                      title="Cobrança é gerada pela instituição na área de assinatura"
                    >
                      MP
                    </a>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface CardPlanoProps {
  plano: OwnerPlan;
  onSalvar: (m: Record<string, unknown>) => Promise<void>;
}

function CardPlano({ plano, onSalvar }: CardPlanoProps) {
  const [mensal, setMensal] = useState(String(plano.monthly_price_cents));
  const [anual, setAnual] = useState(String(plano.annual_price_cents));
  const [implantacao, setImplantacao] = useState(String(plano.setup_fee_cents));
  const [limite, setLimite] = useState(String(plano.max_active_students ?? ""));
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    setSalvando(true);
    await onSalvar({
      monthly_price_cents: Number(mensal),
      annual_price_cents: Number(anual),
      setup_fee_cents: Number(implantacao),
      max_active_students: limite.trim() === "" ? null : Number(limite),
    });
    setSalvando(false);
  };

  const economia = Number(mensal) * 12 - Number(anual);

  return (
    <div className="rounded-xl border border-brand-primary/15 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-bold text-sm">{plano.name}</p>
          <p className="text-[11px] text-slate-500">{plano.id}</p>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={plano.is_active}
            onChange={(e) => onSalvar({ is_active: e.target.checked })}
            className="accent-brand-primary"
          />
          Ativo
        </label>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { rotulo: "Mensal (centavos)", valor: mensal, set: setMensal },
          { rotulo: "Anual (centavos)", valor: anual, set: setAnual },
          { rotulo: "Implantação (centavos)", valor: implantacao, set: setImplantacao },
          { rotulo: "Limite de usuários", valor: limite, set: setLimite },
        ].map((campo) => (
          <div key={campo.rotulo}>
            <label className="text-[11px] text-slate-500 dark:text-slate-400">{campo.rotulo}</label>
            <input
              value={campo.valor}
              onChange={(e) => campo.set(e.target.value.replace(/[^\d]/g, ""))}
              className="w-full mt-1 px-2 py-1.5 rounded-lg border border-brand-primary/20 bg-white dark:bg-slate-900 text-xs outline-none focus:border-brand-primary"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-3">
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {Number(mensal) > 0 && Number(anual) > 0
            ? `Anual economiza ${formatBRL(Math.max(0, economia))} vs 12 meses (${Math.round((economia / (Number(mensal) * 12)) * 100)}%)`
            : "Preencha os dois preços para ver a economia."}
        </p>
        <button
          onClick={salvar}
          disabled={salvando}
          className="px-3 py-1.5 rounded-lg bg-brand-primary text-white text-xs font-semibold cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
        >
          {salvando ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          Salvar
        </button>
      </div>
    </div>
  );
}

function Cobrancas({
  dados,
  onRegistrar,
}: {
  dados: OwnerOverview;
  onRegistrar: (e: { school_id: string; amount_cents: number; kind: string; due_date?: string; notes?: string }) => Promise<void>;
}) {
  const [escola, setEscola] = useState("");
  const [valor, setValor] = useState("");
  const [tipo, setTipo] = useState("subscription");
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    if (!escola || !valor) return;
    setEnviando(true);
    await onRegistrar({ school_id: escola, amount_cents: Math.round(Number(valor)), kind: tipo });
    setEnviando(false);
    setValor("");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-brand-primary/15 p-4">
        <p className="font-semibold text-sm mb-2">Registrar pagamento recebido fora do provedor</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
          Use quando o pagamento chegou por transferência/PIX e o provedor não registrou. O valor é
          lançado como recebido e entra na auditoria com o seu e-mail.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select
            value={escola}
            onChange={(e) => setEscola(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-brand-primary/20 bg-white dark:bg-slate-900 text-xs"
          >
            <option value="">Instituição…</option>
            {[...new Set(dados.assinaturas.map((s) => s.school_id))].map((id) => {
              const nome = dados.assinaturas.find((s) => s.school_id === id)?.school_name || id;
              return (
                <option key={id} value={id}>
                  {nome}
                </option>
              );
            })}
          </select>
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="Valor em centavos"
            className="px-2 py-1.5 rounded-lg border border-brand-primary/20 bg-white dark:bg-slate-900 text-xs"
          />
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-brand-primary/20 bg-white dark:bg-slate-900 text-xs"
          >
            <option value="subscription">Mensalidade</option>
            <option value="setup">Implantação</option>
            <option value="addon">Adicional</option>
            <option value="manual">Outro</option>
          </select>
        </div>
        <button
          onClick={enviar}
          disabled={enviando || !escola || !valor}
          className="mt-3 px-3 py-1.5 rounded-lg bg-brand-primary text-white text-xs font-semibold cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
        >
          {enviando ? <Loader2 size={12} className="animate-spin" /> : <Wallet size={12} />}
          Registrar recebimento
        </button>
      </div>

      <div className="rounded-xl border border-brand-primary/15 overflow-x-auto">
        <table className="w-full text-xs min-w-[640px]">
          <thead className="bg-slate-50 dark:bg-white/5 text-left">
            <tr>
              <th className="px-3 py-2 font-semibold">Data</th>
              <th className="px-3 py-2 font-semibold">Instituição</th>
              <th className="px-3 py-2 font-semibold">Tipo</th>
              <th className="px-3 py-2 font-semibold">Valor</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Pago em</th>
            </tr>
          </thead>
          <tbody>
            {dados.cobrancas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-slate-500">
                  Nenhuma cobrança emitida.
                </td>
              </tr>
            )}
            {dados.cobrancas.map((c) => (
              <tr key={c.id} className="border-t border-brand-primary/10">
                <td className="px-3 py-2 whitespace-nowrap">{dataCurta(c.created_at)}</td>
                <td className="px-3 py-2">{c.school_name || "—"}</td>
                <td className="px-3 py-2 capitalize">{c.kind}</td>
                <td className="px-3 py-2 font-semibold">{formatBRL(c.amount_cents)}</td>
                <td className="px-3 py-2">{c.status}</td>
                <td className="px-3 py-2">{dataCurta(c.paid_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
