import React, { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Sparkles,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  MessageCircle,
  Building2,
  ShieldCheck,
  Rocket,
  Users,
  CreditCard,
  User2,
  Mail,
  Phone,
  MapPin,
  FileText,
  Send,
  ArrowRight,
  BadgeCheck,
  Clock,
} from "lucide-react";
import { formatBRL, FEATURE_LABELS } from "../lib/subscription.ts";
import {
  carregarCatalogoDePlanos,
  type PlansCatalog,
  type AddonView,
} from "../lib/plansService.ts";
import { formatarCNPJ, formatarTelefone, telefoneValido } from "../lib/formMasks.ts";
import {
  registrarContatoComercial,
  WHATSAPP_COMERCIAL,
  type ResultadoContato,
} from "../lib/salesContact.ts";

interface Props {
  onNavigate: (screen: string) => void;
  onShowToast?: (message: string, type?: "success" | "error" | "info") => void;
}

const addonIcon: Record<string, React.ElementType> = {
  ai_advanced: Sparkles,
  reports: ShieldCheck,
  personalization: Rocket,
  training: Users,
  integration: Building2,
};

/**
 * Tela de planos e contato comercial — reconstruída na rodada 40.
 *
 * O que estava errado antes (e o usuário viu na tela):
 *
 *  1. "Catálogo indisponível · HTTP 404" — a tela só sabia falar com
 *     `/api/saas/plans`, que não existe no GitHub Pages, embora o catálogo
 *     esteja publicado e legível no banco. Agora `carregarCatalogoDePlanos`
 *     cai para a leitura pública de `plans` quando não há servidor.
 *  2. O formulário de contato ficava no FIM da página, depois dos preços.
 *     Quem quer falar com a equipe é a primeira pessoa a desistir de rolar.
 *     Subiu para o topo, com âncora própria.
 *  3. Os campos eram `input` sem rótulo, sem máscara e sem validação: dava
 *     para enviar "telefone: abc". Agora cada campo tem rótulo, ícone, máscara
 *     (CPF/CNPJ/telefone vindos de `lib/formMasks.ts`) e erro por campo.
 *  4. O envio não dizia o que realmente aconteceu. Agora separa "cadastro
 *     gravado" de "aviso no WhatsApp" — porque são coisas diferentes: a
 *     gravação é automática, o aviso depende de alguém clicar.
 */
export default function PlansAndPricing({ onNavigate, onShowToast }: Props) {
  const [catalog, setCatalog] = useState<PlansCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const [sending, setSending] = useState(false);
  const [resultado, setResultado] = useState<ResultadoContato | null>(null);

  const [contato, setContato] = useState({
    nome: "",
    email: "",
    telefone: "",
    escola: "",
    cnpj: "",
    cidade: "",
    uf: "PR",
    plano: "",
    mensagem: "",
  });
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelado = false;
    carregarCatalogoDePlanos().then(({ catalog, error }) => {
      if (cancelado) return;
      setCatalog(catalog);
      setError(error);
      setLoading(false);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  const plans = useMemo(() => catalog?.plans || [], [catalog]);
  const nomesDePlano = useMemo(() => {
    const mapa: Record<string, string> = {};
    for (const p of plans) mapa[p.id] = p.name;
    return mapa;
  }, [plans]);

  const atualizarCampo = (campo: keyof typeof contato, valor: string) => {
    setContato((atual) => ({ ...atual, [campo]: valor }));
    // Erro do campo some assim que a pessoa começa a corrigir — manter o
    // vermelho enquanto ela digita parece que o formulário está quebrado.
    setErros((atuais) => {
      if (!atuais[campo]) return atuais;
      const { [campo]: _, ...resto } = atuais;
      return resto;
    });
  };

  const validar = (): boolean => {
    const novos: Record<string, string> = {};
    if (!contato.nome.trim()) novos.nome = "Informe seu nome.";
    if (!contato.email.trim()) {
      novos.email = "Informe seu e-mail.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contato.email.trim())) {
      novos.email = "E-mail inválido. Exemplo: nome@escola.pr.gov.br";
    }
    if (contato.telefone.trim() && !telefoneValido(contato.telefone)) {
      novos.telefone = "Telefone incompleto: use DDD + número.";
    }
    setErros(novos);
    return Object.keys(novos).length === 0;
  };

  const enviarContato = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validar()) {
      onShowToast?.("Confira os campos destacados.", "error");
      return;
    }

    setSending(true);
    try {
      const r = await registrarContatoComercial(
        {
          nome: contato.nome,
          email: contato.email,
          telefone: contato.telefone,
          escola: contato.escola,
          cnpj: contato.cnpj,
          cidade: contato.cidade,
          uf: contato.uf,
          plano: contato.plano,
          mensagem: contato.mensagem,
        },
        nomesDePlano
      );
      setResultado(r);
      if (r.ok) {
        onShowToast?.("Contato registrado. Obrigado!", "success");
        setContato({
          nome: "",
          email: "",
          telefone: "",
          escola: "",
          cnpj: "",
          cidade: "",
          uf: "PR",
          plano: "",
          mensagem: "",
        });
      } else {
        onShowToast?.(r.erro || "Não foi possível registrar o contato.", "error");
      }
    } finally {
      setSending(false);
    }
  };

  const escolherPlano = (planoId: string) => {
    setContato((atual) => ({ ...atual, plano: planoId }));
    setResultado(null);
    document.getElementById("contato-comercial")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const inputBase =
    "w-full h-11 pl-10 pr-3 rounded-xl border bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white " +
    "placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-shadow";
  const inputOk =
    "border-slate-200 dark:border-slate-700 focus:border-brand-accent focus:ring-brand-accent/25";
  const inputErro = "border-red-400 focus:border-red-400 focus:ring-red-200/50";

  const classeInput = (campo: string) => `${inputBase} ${erros[campo] ? inputErro : inputOk}`;

  return (
    <div className="w-[92%] max-w-6xl mx-auto py-6 pb-bottom-nav">
      <button
        onClick={() => onNavigate("welcome")}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-brand-accent mb-5 transition-colors"
      >
        <ArrowLeft size={14} /> Voltar
      </button>

      {/* ------------------------------------------------------------------ */}
      {/* TOPO: contato comercial (antes ficava no fim da página)             */}
      {/* ------------------------------------------------------------------ */}
      <section
        id="contato-comercial"
        className="mb-10 rounded-3xl border border-brand-primary/30 bg-gradient-to-br from-white to-[#f2f7f1] dark:from-slate-900 dark:to-[#16241b] p-5 sm:p-7 shadow-[0_1px_3px_rgba(15,42,22,0.06)]"
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#1c4d2a] text-white grid place-items-center shrink-0">
              <MessageCircle size={20} />
            </div>
            <div>
              <h2 className="text-lg font-display font-bold text-slate-900 dark:text-white leading-tight">
                Fale com a equipe do eloEscola
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed max-w-xl">
                Conte o tamanho da sua escola ou rede e a gente monta a proposta. Respondemos
                em até 1 dia útil, por e-mail ou WhatsApp.
              </p>
            </div>
          </div>

          <a
            href={`https://wa.me/${WHATSAPP_COMERCIAL}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl border border-[#25D366] text-[#128C4A] dark:text-[#5ee08b] text-xs font-bold hover:bg-[#25D366]/10 transition-colors shrink-0"
          >
            <Phone size={14} /> WhatsApp direto
          </a>
        </div>

        {resultado?.ok ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900/60 p-4">
            <div className="flex items-start gap-2.5">
              <BadgeCheck className="text-emerald-600 shrink-0 mt-0.5" size={18} />
              <div className="text-xs leading-relaxed">
                <p className="font-bold text-emerald-900 dark:text-emerald-200">
                  Contato registrado com sucesso.
                </p>
                <p className="text-emerald-800 dark:text-emerald-300 mt-1">
                  Seus dados foram salvos na nossa base
                  {resultado.via === "banco" ? " (gravação direta no banco)" : ""}. O próximo
                  passo é o aviso para a equipe:
                </p>
                {resultado.linkWhatsApp && (
                  <a
                    href={resultado.linkWhatsApp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-2 h-9 px-3.5 rounded-lg bg-[#1c4d2a] text-white font-bold hover:bg-[#163f22] transition-colors"
                  >
                    <Phone size={13} /> Avisar a equipe no WhatsApp
                  </a>
                )}
                <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 mt-2.5">
                  O envio automático de WhatsApp exige a API oficial do WhatsApp Business, que
                  este projeto ainda não tem configurada. O botão acima abre a conversa com a
                  mensagem pronta — um clique para enviar.
                </p>
                <button
                  onClick={() => setResultado(null)}
                  className="mt-3 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 underline underline-offset-2"
                >
                  Enviar outro contato
                </button>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={enviarContato} noValidate className="grid gap-3 sm:grid-cols-2">
            {/* Nome */}
            <div>
              <label
                htmlFor="contato-nome"
                className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1"
              >
                Seu nome *
              </label>
              <div className="relative">
                <User2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  id="contato-nome"
                  type="text"
                  autoComplete="name"
                  value={contato.nome}
                  onChange={(e) => atualizarCampo("nome", e.target.value)}
                  placeholder="Ex.: Maria Aparecida Souza"
                  className={classeInput("nome")}
                />
              </div>
              {erros.nome && <p className="text-[11px] text-red-600 mt-1">{erros.nome}</p>}
            </div>

            {/* E-mail */}
            <div>
              <label
                htmlFor="contato-email"
                className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1"
              >
                E-mail *
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  id="contato-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={contato.email}
                  onChange={(e) => atualizarCampo("email", e.target.value)}
                  placeholder="nome@escola.pr.gov.br"
                  className={classeInput("email")}
                />
              </div>
              {erros.email && <p className="text-[11px] text-red-600 mt-1">{erros.email}</p>}
            </div>

            {/* Telefone com máscara */}
            <div>
              <label
                htmlFor="contato-telefone"
                className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1"
              >
                WhatsApp / Telefone
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  id="contato-telefone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  value={contato.telefone}
                  onChange={(e) => atualizarCampo("telefone", formatarTelefone(e.target.value))}
                  placeholder="(41) 99999-9999"
                  className={classeInput("telefone")}
                />
              </div>
              {erros.telefone && <p className="text-[11px] text-red-600 mt-1">{erros.telefone}</p>}
            </div>

            {/* CNPJ com máscara */}
            <div>
              <label
                htmlFor="contato-cnpj"
                className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1"
              >
                CNPJ da escola (opcional)
              </label>
              <div className="relative">
                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  id="contato-cnpj"
                  type="text"
                  inputMode="numeric"
                  value={contato.cnpj}
                  onChange={(e) => atualizarCampo("cnpj", formatarCNPJ(e.target.value))}
                  placeholder="00.000.000/0000-00"
                  className={classeInput("cnpj")}
                />
              </div>
            </div>

            {/* Escola */}
            <div>
              <label
                htmlFor="contato-escola"
                className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1"
              >
                Escola ou rede
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  id="contato-escola"
                  type="text"
                  value={contato.escola}
                  onChange={(e) => atualizarCampo("escola", e.target.value)}
                  placeholder="Nome da instituição"
                  className={classeInput("escola")}
                />
              </div>
            </div>

            {/* Cidade / UF */}
            <div className="grid grid-cols-[1fr_84px] gap-2">
              <div>
                <label
                  htmlFor="contato-cidade"
                  className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1"
                >
                  Cidade
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    id="contato-cidade"
                    type="text"
                    value={contato.cidade}
                    onChange={(e) => atualizarCampo("cidade", e.target.value)}
                    placeholder="Araucária"
                    className={classeInput("cidade")}
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="contato-uf"
                  className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1"
                >
                  UF
                </label>
                <input
                  id="contato-uf"
                  type="text"
                  maxLength={2}
                  value={contato.uf}
                  onChange={(e) => atualizarCampo("uf", e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                  placeholder="PR"
                  className={`${inputBase} pl-3 ${erros.uf ? inputErro : inputOk}`}
                />
              </div>
            </div>

            {/* Plano */}
            <div className="sm:col-span-2">
              <label
                htmlFor="contato-plano"
                className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1"
              >
                Plano de interesse
              </label>
              <select
                id="contato-plano"
                value={contato.plano}
                onChange={(e) => atualizarCampo("plano", e.target.value)}
                className={`${inputBase} pl-3 ${inputOk}`}
              >
                <option value="">Ainda não sei — quero uma recomendação</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value="addon">Só um serviço adicional</option>
              </select>
            </div>

            {/* Mensagem */}
            <div className="sm:col-span-2">
              <label
                htmlFor="contato-mensagem"
                className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1"
              >
                Mensagem (opcional)
              </label>
              <textarea
                id="contato-mensagem"
                rows={2}
                value={contato.mensagem}
                onChange={(e) => atualizarCampo("mensagem", e.target.value)}
                placeholder="Quantos alunos, quantas unidades, o que você precisa resolver primeiro…"
                className={`${inputBase} pl-3 py-2 h-auto resize-y ${inputOk}`}
              />
            </div>

            <div className="sm:col-span-2 flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={sending}
                className="h-11 px-6 rounded-xl bg-[#1c4d2a] text-white text-sm font-bold inline-flex items-center justify-center gap-2 hover:bg-[#163f22] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {sending ? (
                  <>
                    <Loader2 className="animate-spin" size={15} /> Enviando…
                  </>
                ) : (
                  <>
                    <Send size={15} /> Quero uma proposta
                  </>
                )}
              </button>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed flex-1">
                Usamos seus dados apenas para responder a este contato. Nada de lista de e-mail
                nem compartilhamento com terceiros.{" "}
                <button
                  type="button"
                  onClick={() => onNavigate("privacy")}
                  className="underline underline-offset-2 hover:text-brand-accent"
                >
                  Privacidade e LGPD
                </button>
              </p>
            </div>
          </form>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* PLANOS                                                              */}
      {/* ------------------------------------------------------------------ */}
      <header className="text-center mb-8">
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 dark:text-white">
          Planos do eloEscola
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-2xl mx-auto leading-relaxed">
          Mural de eventos, autorizações digitais com assinatura e relatórios para a sua escola.
          Cancele quando quiser, sem perder nenhum dado.
        </p>
        {catalog && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
              <Clock size={13} /> {catalog.trialDays} dias de teste grátis
            </span>
            {catalog.founders.availableSlots > 0 && (
              <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400">
                <Sparkles size={13} /> {catalog.founders.availableSlots} vaga(s) de Escola
                Fundadora com {catalog.founders.discountPercent}% por{" "}
                {catalog.founders.discountMonths} meses
              </span>
            )}
          </div>
        )}

        <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs mt-4">
          {(["monthly", "annual"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCycle(c)}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                cycle === c
                  ? "bg-white dark:bg-slate-900 text-[#1c4d2a] dark:text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              {c === "monthly" ? "Mensal" : `Anual (−${catalog?.annualDiscountPercent ?? 10}%)`}
            </button>
          ))}
        </div>
      </header>

      {loading && (
        <div className="flex flex-col items-center gap-2 text-slate-500 py-12">
          <Loader2 className="animate-spin" size={22} />
          <p className="text-sm">Carregando planos…</p>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/60 p-4 flex items-start gap-3 max-w-2xl mx-auto">
          <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
          <div>
            <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
              Não foi possível mostrar os preços agora
            </p>
            <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
              {error}
            </p>
            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1.5">
              Os valores vivem no banco de dados — não mostramos preço fixo no código para não
              exibir um número desatualizado. Use o formulário acima para receber a proposta.
            </p>
          </div>
        </div>
      )}

      {!loading && catalog && (
        <>
          <div className="grid gap-4 sm:grid-cols-3 mb-10">
            {plans.map((plan, idx) => {
              const destaque = idx === 1;
              const preco = cycle === "annual" ? plan.annual_price_cents : plan.monthly_price_cents;
              const porMes =
                cycle === "annual" ? Math.round(plan.annual_price_cents / 12) : plan.monthly_price_cents;
              return (
                <div
                  key={plan.id}
                  className={`relative rounded-3xl border p-5 flex flex-col bg-white dark:bg-slate-900 transition-shadow hover:shadow-md ${
                    destaque
                      ? "border-[#1c4d2a] ring-2 ring-[#1c4d2a]/15 shadow-sm"
                      : "border-slate-200 dark:border-slate-700/60"
                  }`}
                >
                  {destaque && (
                    <span className="absolute -top-2.5 left-5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#1c4d2a] text-white shadow-sm">
                      Mais escolhido
                    </span>
                  )}
                  <h2 className="text-lg font-display font-bold text-slate-900 dark:text-white">
                    {plan.name}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed min-h-[3rem]">
                    {plan.tagline}
                  </p>

                  <div className="mt-3">
                    <div className="flex items-baseline gap-1">
                      <p className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                        {formatBRL(porMes)}
                      </p>
                      <span className="text-xs text-slate-400 font-medium">/mês</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {cycle === "annual"
                        ? `${formatBRL(preco)} por ano, à vista`
                        : "cobrança mensal, cancele quando quiser"}
                    </p>
                    {plan.setup_fee_cents > 0 && (
                      <p className="text-[11px] text-slate-400 mt-1">
                        Implantação única: {formatBRL(plan.setup_fee_cents)}
                      </p>
                    )}
                  </div>

                  <ul className="mt-4 space-y-1.5 text-xs flex-1">
                    <li className="flex items-center gap-2">
                      <Users size={13} className="text-[#1c4d2a] dark:text-[#7ba884] shrink-0" />
                      <span>
                        {plan.max_active_students === null
                          ? "Alunos ilimitados"
                          : `Até ${plan.max_active_students.toLocaleString("pt-BR")} alunos ativos`}
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Building2 size={13} className="text-[#1c4d2a] dark:text-[#7ba884] shrink-0" />
                      <span>
                        {plan.max_units} unidade{plan.max_units > 1 ? "s" : ""}
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <ShieldCheck size={13} className="text-[#1c4d2a] dark:text-[#7ba884] shrink-0" />
                      <span>{plan.max_admins} administradores</span>
                    </li>
                    {Object.keys(FEATURE_LABELS).map((key) => (
                      <li key={key} className="flex items-center gap-2">
                        {plan.features[key] ? (
                          <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                        ) : (
                          <XCircle size={13} className="text-slate-300 dark:text-slate-600 shrink-0" />
                        )}
                        <span
                          className={
                            plan.features[key]
                              ? "text-slate-700 dark:text-slate-200"
                              : "text-slate-400 dark:text-slate-500"
                          }
                        >
                          {FEATURE_LABELS[key]}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => escolherPlano(plan.id)}
                    className={`mt-4 h-10 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors ${
                      destaque
                        ? "bg-[#1c4d2a] text-white hover:bg-[#163f22]"
                        : "border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    Começar teste de {catalog.trialDays} dias
                    <ArrowRight size={13} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Add-ons */}
          {catalog.addons.length > 0 && (
            <section className="mb-8">
              <h2 className="text-base font-display font-bold text-slate-900 dark:text-white mb-1">
                Serviços adicionais
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Contratados à parte, sem mudar de plano.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {catalog.addons.map((addon: AddonView) => {
                  const Icon = addonIcon[addon.id] || Sparkles;
                  return (
                    <div
                      key={addon.id}
                      className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 flex gap-3"
                    >
                      <div className="w-9 h-9 rounded-xl bg-[#1c4d2a]/10 text-[#1c4d2a] dark:text-[#7ba884] grid place-items-center shrink-0">
                        <Icon size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">
                          {addon.name}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mt-0.5">
                          {addon.description}
                        </p>
                        <p className="text-xs font-bold text-slate-900 dark:text-white mt-1">
                          {addon.billing_type === "from" ? "A partir de " : ""}
                          {formatBRL(addon.price_cents)}
                          {addon.unit_label ? ` ${addon.unit_label}` : ""}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Como funciona a cobrança */}
          <section className="mb-4 rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-5">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <CreditCard size={16} className="text-[#1c4d2a] dark:text-[#7ba884]" /> Como funciona
              a cobrança
            </h2>
            <ul className="text-[11px] text-slate-600 dark:text-slate-300 space-y-1.5 leading-relaxed">
              <li>• Pix, boleto e cartão com recorrência, processados por parceiro de pagamentos.</li>
              <li>• O plano anual tem desconto; o mensal pode ser cancelado a qualquer momento.</li>
              <li>• Tolerância de 7 dias após o vencimento, com aviso em 80% dos limites.</li>
              <li>• Sem pagamento, publicações ficam bloqueadas — os dados continuam salvos.</li>
              {!catalog.billing.configured && (
                <li className="text-amber-700 dark:text-amber-400 font-semibold">
                  • Neste ambiente o provedor de pagamentos ainda não está configurado (modo
                  demonstração): nenhuma cobrança real é emitida nem marcada como paga.
                </li>
              )}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
