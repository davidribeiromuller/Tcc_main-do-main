import React, { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Building2,
  X,
  Save,
  Edit3,
  MapPin,
  Phone,
  Mail,
  Globe,
  GraduationCap,
  Users,
  ShieldCheck,
  Check,
  Loader2,
  Info,
  AlertTriangle,
  Plus,
  Trash2,
  Image as ImageIcon,
} from "lucide-react";
import type { SchoolProfile } from "../lib/schoolsData.ts";
import {
  CAMPOS_ESCOLA,
  CAMPOS_LISTA_ESCOLA,
  paraEditavel,
  salvarPerfilEscola,
  type PerfilEditavel,
} from "../lib/schoolProfilesService.ts";

interface SchoolProfileModalProps {
  escola: SchoolProfile;
  /** Só o Chefe Administrador edita; os demais apenas consultam. */
  podeEditar: boolean;
  /** Nome de quem está salvando (auditoria em `updated_by`). */
  autor: string;
  /** Abre já em modo edição (usado pelo botão "Editar"). */
  iniciarEmEdicao?: boolean;
  onClose: () => void;
  onSalvo?: (perfil: PerfilEditavel) => void | Promise<void>;
  onShowToast?: (msg: string, type?: "error" | "warning" | "success" | "info") => void;
}

/**
 * Ficha da escola na área de contas escolares (rodada 26).
 * Modo leitura por padrão; o Chefe Administrador pode entrar em edição.
 * As listas (modalidades, destaques, infraestrutura) são editadas item a item.
 */
export default function SchoolProfileModal({
  escola,
  podeEditar,
  autor,
  iniciarEmEdicao = false,
  onClose,
  onSalvo,
  onShowToast,
}: SchoolProfileModalProps) {
  const inicial = useMemo(() => paraEditavel(escola), [escola]);
  const [dados, setDados] = useState<PerfilEditavel>(inicial);
  const [editando, setEditando] = useState(iniciarEmEdicao && podeEditar);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setDados(inicial);
  }, [inicial]);

  const notificar = (msg: string, tipo: "error" | "warning" | "success" | "info" = "info") =>
    onShowToast?.(msg, tipo);

  const alterar = <K extends keyof PerfilEditavel>(campo: K, valor: PerfilEditavel[K]) => {
    setDados((prev) => ({ ...prev, [campo]: valor }));
  };

  const alterarItemDeLista = (campo: keyof PerfilEditavel, indice: number, valor: string) => {
    const atual = (dados[campo] as string[] | undefined) || [];
    const copia = [...atual];
    copia[indice] = valor;
    alterar(campo as any, copia as any);
  };

  const adicionarItem = (campo: keyof PerfilEditavel) => {
    const atual = (dados[campo] as string[] | undefined) || [];
    alterar(campo as any, [...atual, ""] as any);
  };

  const removerItem = (campo: keyof PerfilEditavel, indice: number) => {
    const atual = (dados[campo] as string[] | undefined) || [];
    alterar(campo as any, atual.filter((_, i) => i !== indice) as any);
  };

  const handleSalvar = async () => {
    if (!podeEditar) {
      notificar("Apenas o Chefe Administrador pode alterar as informações da escola.", "error");
      return;
    }
    if (salvando) return;

    setSalvando(true);
    setErro(null);
    const { perfil, error } = await salvarPerfilEscola(dados, autor);
    setSalvando(false);

    if (error || !perfil) {
      const msg = error?.message || "Não foi possível salvar as informações da escola.";
      setErro(msg);
      notificar(msg, "error");
      return;
    }

    notificar("Informações da escola atualizadas.", "success");
    setEditando(false);
    await onSalvo?.(perfil);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-brand-card-dark rounded-3xl w-full max-w-2xl border border-brand-primary/20 dark:border-white/10 shadow-2xl my-auto flex flex-col max-h-[92dvh]"
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-slate-100 dark:border-white/10 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-2xl bg-brand-primary/15 text-brand-accent dark:text-brand-primary shrink-0">
              <Building2 size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                {editando ? "Editar informações da escola" : escola.shortName}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {escola.name} · {escola.city}/{escola.state}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {podeEditar && !editando && (
              <button
                type="button"
                onClick={() => setEditando(true)}
                className="px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Edit3 size={13} />
                Editar
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Corpo rolável */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 min-h-0">
          {erro && (
            <div className="mb-3 flex items-start gap-2 p-3 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-xs text-red-800 dark:text-red-200">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <span>{erro}</span>
            </div>
          )}

          {!podeEditar && (
            <div className="mb-3 flex items-start gap-2 p-3 rounded-2xl bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 text-[11px] text-slate-600 dark:text-slate-300">
              <Info size={14} className="shrink-0 mt-0.5" />
              <span>Somente o Chefe Administrador pode alterar estas informações.</span>
            </div>
          )}

          {editando ? (
            /* ------------------------- MODO EDIÇÃO ------------------------- */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CAMPOS_ESCOLA.map(({ campo, rotulo, tipo, placeholder, largo }) => (
                <div key={String(campo)} className={`flex flex-col gap-1 ${largo ? "sm:col-span-2" : ""}`}>
                  <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                    {rotulo}
                  </label>
                  <input
                    type={tipo === "textarea" ? "text" : tipo || "text"}
                    value={(dados[campo] as string) || ""}
                    onChange={(e) => alterar(campo, e.target.value as any)}
                    placeholder={placeholder}
                    className="w-full h-10 px-3 rounded-xl bg-white dark:bg-black/20 border border-brand-primary/40 dark:border-white/15 text-sm text-slate-800 dark:text-slate-100"
                  />
                </div>
              ))}

              <div className="sm:col-span-2 flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  Histórico da escola
                </label>
                <textarea
                  value={dados.historicalOverview || ""}
                  onChange={(e) => alterar("historicalOverview", e.target.value)}
                  rows={4}
                  className="w-full p-3 rounded-xl bg-white dark:bg-black/20 border border-brand-primary/40 dark:border-white/15 text-sm text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="sm:col-span-2 grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                    Latitude
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    value={dados.latitude ?? ""}
                    onChange={(e) =>
                      alterar("latitude", e.target.value === "" ? null : Number(e.target.value))
                    }
                    className="w-full h-10 px-3 rounded-xl bg-white dark:bg-black/20 border border-brand-primary/40 dark:border-white/15 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                    Longitude
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    value={dados.longitude ?? ""}
                    onChange={(e) =>
                      alterar("longitude", e.target.value === "" ? null : Number(e.target.value))
                    }
                    className="w-full h-10 px-3 rounded-xl bg-white dark:bg-black/20 border border-brand-primary/40 dark:border-white/15 text-sm"
                  />
                </div>
              </div>
              <p className="sm:col-span-2 text-[10px] text-slate-400 -mt-1">
                As coordenadas alimentam o mapa. Use apenas a localização real da escola.
              </p>

              {CAMPOS_LISTA_ESCOLA.map(({ campo, rotulo }) => {
                const itens = (dados[campo] as string[] | undefined) || [];
                return (
                  <div key={String(campo)} className="sm:col-span-2 flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                      {rotulo}
                    </label>
                    {itens.map((item, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <input
                          value={item}
                          onChange={(e) => alterarItemDeLista(campo, i, e.target.value)}
                          className="flex-1 h-9 px-3 rounded-xl bg-white dark:bg-black/20 border border-brand-primary/40 dark:border-white/15 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => removerItem(campo, i)}
                          aria-label={`Remover item ${i + 1}`}
                          className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => adicionarItem(campo)}
                      className="self-start px-2.5 py-1.5 rounded-lg bg-brand-primary/15 text-brand-accent dark:text-brand-primary text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus size={12} /> Adicionar
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ------------------------- MODO LEITURA ------------------------ */
            <div className="space-y-4">
              <div className="rounded-2xl overflow-hidden border border-brand-primary/20 dark:border-white/10 bg-[#edf5ef] dark:bg-black/20 flex items-center justify-center p-4">
                {escola.image ? (
                  <img
                    src={escola.image}
                    alt={`Brasão de ${escola.shortName}`}
                    className="max-h-28 object-contain"
                  />
                ) : (
                  <ImageIcon size={28} className="text-slate-400" />
                )}
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                <InfoLinha rotulo="Nome oficial" valor={escola.name} />
                <InfoLinha rotulo="Tipo" valor={escola.type} />
                <InfoLinha rotulo="Rede" valor={escola.network} />
                <InfoLinha rotulo="NRE" valor={escola.nre} />
                <InfoLinha rotulo="Endereço" valor={escola.address} icone={<MapPin size={12} />} />
                <InfoLinha rotulo="CEP" valor={escola.cep} />
                <InfoLinha rotulo="Bairro" valor={escola.neighborhood} />
                <InfoLinha rotulo="Cidade / UF" valor={`${escola.city}/${escola.state}`} />
                <InfoLinha rotulo="Telefone" valor={escola.phone} icone={<Phone size={12} />} />
                <InfoLinha rotulo="E-mail" valor={escola.email} icone={<Mail size={12} />} />
                <InfoLinha
                  rotulo="Coordenadas"
                  valor={`${escola.coordinates.lat.toFixed(5)}, ${escola.coordinates.lng.toFixed(5)}`}
                />
              </dl>

              <BlocoLista
                titulo="Modalidades de ensino"
                icone={<GraduationCap size={13} />}
                itens={escola.modalities}
              />
              <BlocoLista
                titulo="Destaques pedagógicos"
                icone={<ShieldCheck size={13} />}
                itens={escola.pedagogicalHighlights}
              />
              <BlocoLista
                titulo="Infraestrutura"
                icone={<Users size={13} />}
                itens={escola.infrastructure}
              />

              <div>
                <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">
                  Histórico
                </p>
                <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                  {escola.historicalOverview}
                </p>
              </div>

              <p className="text-[10px] text-slate-400 flex items-center gap-1">
                <Globe size={11} />
                Fonte: {escola.verificationSource} · verificado em {escola.lastVerifiedDate}
              </p>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="p-4 border-t border-slate-100 dark:border-white/10 flex items-center justify-end gap-2 shrink-0">
          {editando ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setDados(inicial);
                  setErro(null);
                  setEditando(false);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSalvar()}
                disabled={salvando}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-brand-accent dark:bg-brand-primary text-white dark:text-slate-900 flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
              >
                {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {salvando ? "Salvando..." : "Salvar informações"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer"
            >
              <Check size={14} /> Fechar
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function InfoLinha({
  rotulo,
  valor,
  icone,
}: {
  rotulo: string;
  valor?: string;
  icone?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase font-bold tracking-wider text-slate-400">{rotulo}</dt>
      <dd className="text-slate-800 dark:text-slate-100 flex items-center gap-1.5 min-w-0">
        {icone && <span className="text-brand-accent dark:text-brand-primary shrink-0">{icone}</span>}
        <span className="break-anywhere">{valor || "—"}</span>
      </dd>
    </div>
  );
}

function BlocoLista({
  titulo,
  icone,
  itens,
}: {
  titulo: string;
  icone?: React.ReactNode;
  itens: string[];
}) {
  if (!itens || itens.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
        {icone}
        {titulo}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {itens.map((item, i) => (
          <li
            key={i}
            className="text-[11px] px-2 py-1 rounded-lg bg-brand-primary/10 dark:bg-white/5 border border-brand-primary/20 dark:border-white/10 text-slate-700 dark:text-slate-200"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
