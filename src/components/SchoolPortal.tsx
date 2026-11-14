import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Building2,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Newspaper,
  Edit3,
  Phone,
  Mail,
  MapPin,
  Plus,
  Save,
  LogOut,
  ArrowLeft,
  Clock,
  Sparkles,
  Info,
  ShieldAlert,
  History,
  ExternalLink,
  RefreshCw
} from "lucide-react";
import { User, Event } from "../types.ts";
import { SchoolProfile, ARAUCARIA_SCHOOLS, SCHOOL_IMAGES } from "../lib/schoolsData.ts";
import { fetchJsonApi } from "../lib/staticHosting.ts";
import { mergeNews, saveNews } from "../lib/schoolNewsStore.ts";
import { safeParseJsonResponse } from "../lib/apiResilience.ts";

interface SchoolPortalProps {
  currentUser: User | null;
  events?: Event[];
  onNavigate: (screen: string) => void;
  onLogout: () => void;
  onAddEvent?: (eventData: any) => Promise<void>;
  onShowToast?: (message: string, type?: "error" | "warning" | "success" | "info") => void;
}

export default function SchoolPortal({
  currentUser,
  events = [],
  onNavigate,
  onLogout,
  onAddEvent,
  onShowToast,
}: SchoolPortalProps) {
  // Determine school from user's institutional profile
  const schoolId = currentUser?.escolaId || 1;
  const initialSchool =
    ARAUCARIA_SCHOOLS.find((s) => s.id === schoolId) || ARAUCARIA_SCHOOLS[0];

  const [schoolData, setSchoolData] = useState<SchoolProfile>(initialSchool);
  const [schoolEvents, setSchoolEvents] = useState<Event[]>([]);
  const [newsList, setNewsList] = useState<any[]>(initialSchool.news || []);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "news" | "events" | "profile" | "audit">("overview");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form states for profile editing
  const [presentationText, setPresentationText] = useState(initialSchool.historicalOverview || "");
  const [phoneInput, setPhoneInput] = useState(initialSchool.phone || "");
  const [emailInput, setEmailInput] = useState(initialSchool.email || "");
  const [addressInput, setAddressInput] = useState(initialSchool.address || "");

  // New News Modal state
  const [showNewsModal, setShowNewsModal] = useState(false);
  const [newsTitle, setNewsTitle] = useState("");
  const [newsSummary, setNewsSummary] = useState("");
  const [newsCategory, setNewsCategory] = useState("Comunicado");
  const [isPublishingNews, setIsPublishingNews] = useState(false);

  // New Event Modal state
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventTime, setEventTime] = useState("14:00");
  const [eventDate, setEventDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [eventLocation, setEventLocation] = useState(initialSchool.name);
  const [eventPrice, setEventPrice] = useState("");
  const [eventIsPaid, setEventIsPaid] = useState(false);

  const schoolCrest =
    SCHOOL_IMAGES[initialSchool.slug] ||
    initialSchool.image ||
    SCHOOL_IMAGES["julio-szymanski"];

  const fetchPortalData = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem("token") || "";
      const res = await fetch(`/api/school-portal/${schoolId}/data`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.school) {
          setSchoolData(data.school);
          setPresentationText(data.school.historicalOverview || data.school.description || "");
          setPhoneInput(data.school.phone || "");
          setEmailInput(data.school.email || "");
          setAddressInput(data.school.address || "");
        }
        if (data.events) {
          setSchoolEvents(data.events);
        }
        if (data.news) {
          setNewsList(data.news);
        }
      } else {
        // Fallback filter from props
        const ownEvents = events.filter(
          (e) =>
            e.schoolId === schoolId ||
            (e.schoolName && e.schoolName.toLowerCase().includes(initialSchool.name.toLowerCase())) ||
            (e.location && e.location.toLowerCase().includes(initialSchool.name.toLowerCase()))
        );
        setSchoolEvents(ownEvents);
        setNewsList(initialSchool.news || []);
      }

      // Fetch audit logs
      const auditRes = await fetch(`/api/admin/school-accounts/audit-logs?schoolId=${schoolId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (auditRes.ok) {
        const auditData = await auditRes.json();
        if (auditData.logs) setAuditLogs(auditData.logs);
      }
    } catch (err) {
      console.warn("Could not load remote portal data, using local store:", err);
      const ownEvents = events.filter(
        (e) =>
          e.schoolId === schoolId ||
          (e.location && e.location.toLowerCase().includes(initialSchool.name.toLowerCase()))
      );
      setSchoolEvents(ownEvents);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPortalData();
  }, [schoolId]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const token = localStorage.getItem("token") || "";
      const res = await fetch(`/api/school-portal/${schoolId}/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          presentation: presentationText,
          phone: phoneInput,
          email: emailInput,
          address: addressInput
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao salvar perfil da escola.");
      }

      if (onShowToast) onShowToast("Informações institucionais atualizadas com sucesso!", "success");
      fetchPortalData();
    } catch (error: any) {
      if (onShowToast) onShowToast(error.message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublishNews = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsTitle.trim() || isPublishingNews) return;

    setIsPublishingNews(true);
    try {
      const token = localStorage.getItem("token") || "";
      const payload = {
        title: newsTitle.trim(),
        summary: newsSummary.trim(),
        description: newsSummary.trim(),
        category: newsCategory,
        date: new Date().toLocaleDateString("pt-BR"),
        author: currentUser?.nome || schoolData.name
      };

      // Nem todo ambiente possui backend (GitHub Pages é estático). A resposta
      // pode ser um `index.html` com status 200, por isso nunca chamamos
      // `res.json()` sem antes validar o Content-Type.
      let publishedRemotely = false;
      try {
        const res = await fetch(`/api/school-portal/${schoolId}/news`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });

        const parsed = await safeParseJsonResponse<{ error?: string }>(res, {});
        if (res.ok && parsed.ok) {
          publishedRemotely = true;
        } else if (res.ok && !parsed.ok) {
          // 200 com HTML: significa "sem backend disponível", não erro do usuário.
          console.info("[SchoolPortal] Backend indisponível; publicando localmente.");
        } else {
          throw new Error(parsed.data?.error || parsed.error || "Erro ao publicar comunicado.");
        }
      } catch (networkErr: any) {
        // Erro de rede também não deve impedir o registro local do comunicado.
        if (networkErr?.message && !/fetch|network|Failed/i.test(networkErr.message)) {
          throw networkErr;
        }
        console.info("[SchoolPortal] Rede indisponível; publicando localmente.", networkErr?.message);
      }

      // Publica no armazenamento local para que o comunicado apareça de fato
      // no mural, mesmo sem servidor (produção no GitHub Pages).
      const created = saveNews(schoolData.slug || initialSchool.slug, {
        title: payload.title,
        description: payload.description,
        category: payload.category as any,
        author: payload.author
      });
      setNewsList((prev) => mergeNews(initialSchool.slug, [...(prev as any), created]));

      setShowNewsModal(false);
      setNewsTitle("");
      setNewsSummary("");
      if (onShowToast) {
        onShowToast(
          publishedRemotely
            ? "Comunicado escolar publicado com sucesso!"
            : "Comunicado publicado e salvo neste dispositivo!",
          "success"
        );
      }
      if (publishedRemotely) fetchPortalData();
    } catch (error: any) {
      if (onShowToast) onShowToast(error.message || "Erro ao publicar comunicado.", "error");
    } finally {
      setIsPublishingNews(false);
    }
  };

  const handleCreateSchoolEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim()) return;

    try {
      const parts = eventDate.split("-");
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // 0-indexed
      const day = parseInt(parts[2], 10);

      const eventPayload = {
        title: eventTitle.trim(),
        location: eventLocation.trim() || schoolData.name,
        schoolName: schoolData.name,
        schoolId: schoolData.id,
        year,
        month,
        day,
        time: eventTime,
        isPaid: eventIsPaid,
        price: eventIsPaid ? eventPrice : "0",
        creatorId: currentUser?.id,
        creatorRole: "Escola"
      };

      if (onAddEvent) {
        await onAddEvent(eventPayload);
      } else {
        // Sem backend (GitHub Pages) `fetchJsonApi` devolve null: quem grava é o
        // fallback do Supabase chamado pelo App após esta função.
        const res = await fetchJsonApi("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(eventPayload)
        });
        if (res && !res.ok) throw new Error("Erro ao salvar evento.");
      }

      setShowEventModal(false);
      setEventTitle("");
      setEventPrice("");
      setEventIsPaid(false);
      if (onShowToast) onShowToast("Evento institucional agendado com sucesso!", "success");
      fetchPortalData();
    } catch (error: any) {
      if (onShowToast) onShowToast(error.message, "error");
    }
  };

  return (
    <div className="min-h-full w-full bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col overflow-y-auto pb-24">
      {/* Top Institutional Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate("welcome")}
              className="p-2 rounded-xl text-slate-500 hover:text-emerald-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Voltar ao início"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 p-1.5 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center overflow-hidden shrink-0">
              <img
                src={schoolCrest}
                alt={schoolData.name}
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = SCHOOL_IMAGES["julio-szymanski"];
                }}
              />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm sm:text-base font-serif font-bold text-slate-900 dark:text-white leading-tight">
                  {schoolData.shortName || schoolData.name}
                </h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  <ShieldCheck size={12} className="text-emerald-600 dark:text-emerald-400" />
                  Conta Institucional Verificada
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Portal Exclusivo da Instituição • Gestão de Notícias, Eventos e Apresentação
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={fetchPortalData}
              className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Atualizar dados"
            >
              <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={() => onNavigate("schoolDetail")}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 transition flex items-center gap-1.5 cursor-pointer"
            >
              <ExternalLink size={13} />
              <span className="hidden sm:inline">Página Pública</span>
            </button>
            <button
              onClick={onLogout}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-300 transition flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut size={13} />
              <span>Sair</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center gap-1 overflow-x-auto no-scrollbar border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === "overview"
                ? "border-emerald-600 text-emerald-800 dark:text-emerald-400 font-bold"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Building2 size={14} />
            <span>Visão Geral</span>
          </button>

          <button
            onClick={() => setActiveTab("news")}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === "news"
                ? "border-emerald-600 text-emerald-800 dark:text-emerald-400 font-bold"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Newspaper size={14} />
            <span>Notícias da Escola ({newsList.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("events")}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === "events"
                ? "border-emerald-600 text-emerald-800 dark:text-emerald-400 font-bold"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Calendar size={14} />
            <span>Eventos da Instituição ({schoolEvents.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("profile")}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === "profile"
                ? "border-emerald-600 text-emerald-800 dark:text-emerald-400 font-bold"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Edit3 size={14} />
            <span>Apresentação & Contato</span>
          </button>

          <button
            onClick={() => setActiveTab("audit")}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === "audit"
                ? "border-emerald-600 text-emerald-800 dark:text-emerald-400 font-bold"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <History size={14} />
            <span>Auditoria Institucional</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6">
        {/* TAB 1: OVERVIEW */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Verification Banner */}
            <div className="bg-gradient-to-r from-emerald-800 to-teal-800 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
              <div className="relative z-10 max-w-xl">
                <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-white font-mono text-[10px] uppercase tracking-wider font-bold">
                  Isolamento Estrito Ativo
                </span>
                <h2 className="text-xl sm:text-2xl font-serif font-bold mt-2">
                  Ambiente Institucional de {schoolData.name}
                </h2>
                <p className="text-xs sm:text-sm text-emerald-100 mt-1 leading-relaxed">
                  Sua equipe tem acesso exclusivo para gerenciar publicações, eventos oficiais e informações da sua escola. Todos os dados são auditados e validados pelo Administrador Chefe do eloEscola.
                </p>
                <div className="flex items-center gap-3 mt-4 text-xs font-medium text-emerald-100">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 size={14} className="text-emerald-300" />
                    Rede Estadual de Ensino / Araucária
                  </span>
                  <span>•</span>
                  <span>ID #{schoolData.id}</span>
                </div>
              </div>
            </div>

            {/* Metric KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-xs font-semibold">Eventos da Escola</span>
                  <Calendar size={18} className="text-emerald-600" />
                </div>
                <div className="text-2xl font-bold font-serif text-slate-900 dark:text-white mt-2">
                  {schoolEvents.length}
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">Ativos na agenda geral</p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-xs font-semibold">Notícias Publicadas</span>
                  <Newspaper size={18} className="text-blue-600" />
                </div>
                <div className="text-2xl font-bold font-serif text-slate-900 dark:text-white mt-2">
                  {newsList.length}
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">Comunicados institucionais</p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-xs font-semibold">Identidade</span>
                  <ShieldCheck size={18} className="text-emerald-600" />
                </div>
                <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mt-3">
                  Verificada
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">Aprovada pelo Chefe ADM</p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-xs font-semibold">Segurança & Retenção</span>
                  <Sparkles size={18} className="text-amber-500" />
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-white mt-3">
                  30 Dias
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">Arquivamento automático</p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-serif font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Newspaper size={16} className="text-emerald-700" />
                    Publicar Novo Comunicado Escolar
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Divulgue avisos importantes, comunicados pedagógicos e notícias oficiais para os pais, alunos e comunidade escolar.
                  </p>
                </div>
                <button
                  onClick={() => setShowNewsModal(true)}
                  className="mt-4 w-full py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 cursor-pointer transition shadow-xs"
                >
                  <Plus size={15} />
                  <span>Novo Comunicado Oficial</span>
                </button>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-serif font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Calendar size={16} className="text-emerald-700" />
                    Agendar Evento da Escola
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Cadastre feiras de ciências, eventos culturais, esportivos ou reuniões oficiais que aparecerão automaticamente no calendário.
                  </p>
                </div>
                <button
                  onClick={() => setShowEventModal(true)}
                  className="mt-4 w-full py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 cursor-pointer transition shadow-xs"
                >
                  <Plus size={15} />
                  <span>Cadastrar Evento Institucional</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: NEWS */}
        {activeTab === "news" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-serif font-bold text-slate-900 dark:text-white">
                  Notícias e Comunicados da Instituição
                </h2>
                <p className="text-xs text-slate-500">
                  Publicações visíveis na página da escola e no feed institucional.
                </p>
              </div>
              <button
                onClick={() => setShowNewsModal(true)}
                className="px-3.5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs transition"
              >
                <Plus size={14} />
                <span>Nova Notícia</span>
              </button>
            </div>

            {newsList.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-slate-400">
                <Newspaper size={36} className="mx-auto mb-2 text-slate-300" />
                <p className="text-xs font-semibold">Nenhuma notícia publicada ainda.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {newsList.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        {item.category || "Comunicado"}
                      </span>
                      <span className="text-[11px] text-slate-400">{item.date}</span>
                    </div>
                    <h3 className="text-sm font-serif font-bold text-slate-900 dark:text-white leading-snug">
                      {item.title}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-3">
                      {item.description || item.summary}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                      Autor: {item.author || schoolData.name}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: EVENTS */}
        {activeTab === "events" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-serif font-bold text-slate-900 dark:text-white">
                  Eventos Vinculados à {schoolData.shortName || schoolData.name}
                </h2>
                <p className="text-xs text-slate-500">
                  Eventos oficiais integrados à política de ciclo de vida de 3 dias.
                </p>
              </div>
              <button
                onClick={() => setShowEventModal(true)}
                className="px-3.5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs transition"
              >
                <Plus size={14} />
                <span>Agendar Evento</span>
              </button>
            </div>

            {schoolEvents.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-slate-400">
                <Calendar size={36} className="mx-auto mb-2 text-slate-300" />
                <p className="text-xs font-semibold">Nenhum evento agendado para esta instituição.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {schoolEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                          {ev.isPaid ? "Com Taxa" : "Gratuito"}
                        </span>
                        <span className="text-[11px] font-mono font-bold text-slate-500">
                          {ev.day}/{ev.month + 1}/{ev.year} • {ev.time}
                        </span>
                      </div>
                      <h4 className="text-sm font-serif font-bold text-slate-900 dark:text-white leading-snug">
                        {ev.title}
                      </h4>
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                        <MapPin size={12} className="text-slate-400" />
                        <span className="truncate">{ev.location}</span>
                      </p>
                    </div>

                    <div className="mt-4 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                      <span>ID #{ev.id}</span>
                      <span className="text-emerald-700 font-medium">Evento Oficial</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: PRESENTATION & CONTACT */}
        {activeTab === "profile" && (
          <form onSubmit={handleSaveProfile} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-5">
            <div>
              <h2 className="text-base font-serif font-bold text-slate-900 dark:text-white">
                Apresentação e Dados da Escola
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Mantenha a história institucional, histórico pedagógico e contatos da escola sempre atualizados para a comunidade.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Texto de Apresentação & Histórico
                </label>
                <textarea
                  rows={6}
                  value={presentationText}
                  onChange={(e) => setPresentationText(e.target.value)}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-none leading-relaxed"
                  placeholder="Escreva sobre a fundação, missão pedagógica e história do colégio..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Telefone Oficial
                  </label>
                  <input
                    type="text"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                    placeholder="(41) 3642-0000"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    E-mail Institucional
                  </label>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                    placeholder="escola@seed.pr.gov.br"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Endereço Completo
                  </label>
                  <input
                    type="text"
                    value={addressInput}
                    onChange={(e) => setAddressInput(e.target.value)}
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                    placeholder="Rua, número, bairro..."
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold rounded-xl flex items-center gap-2 cursor-pointer shadow-xs transition disabled:opacity-50"
              >
                <Save size={15} />
                <span>{isSaving ? "Salvando..." : "Salvar Alterações"}</span>
              </button>
            </div>
          </form>
        )}

        {/* TAB 5: AUDIT */}
        {activeTab === "audit" && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
            <div>
              <h2 className="text-base font-serif font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <History size={16} className="text-emerald-700" />
                Auditoria de Ações da Conta Institucional
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Registro inviolável de todas as publicações e alterações realizadas pela equipe gestora da escola.
              </p>
            </div>

            {auditLogs.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                Nenhum registro de auditoria registrado para esta escola até o momento.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {auditLogs.map((log) => (
                  <div key={log.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                    <div>
                      <span className="font-mono font-bold text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded mr-2">
                        {log.actionType}
                      </span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {log.details}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                      <span>{log.performedBy}</span>
                      <span>•</span>
                      <span>{new Date(log.performedAt).toLocaleString("pt-BR")}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL: NOVA NOTÍCIA */}
      <AnimatePresence>
        {showNewsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 max-w-md w-full shadow-2xl"
            >
              <h3 className="text-base font-serif font-bold text-slate-900 dark:text-white mb-1">
                Publicar Comunicado Oficial
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Aviso oficial para {schoolData.name}
              </p>

              <form onSubmit={handlePublishNews} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Título do Comunicado
                  </label>
                  <input
                    type="text"
                    required
                    value={newsTitle}
                    onChange={(e) => setNewsTitle(e.target.value)}
                    placeholder="Ex: Reunião Pedagógica de Pais e Mestres"
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Categoria
                  </label>
                  <select
                    value={newsCategory}
                    onChange={(e) => setNewsCategory(e.target.value)}
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  >
                    <option value="Comunicado">Comunicado Geral</option>
                    <option value="Pedagógico">Pedagógico & Aulas</option>
                    <option value="Cultural">Cultural & Eventos</option>
                    <option value="Aviso">Aviso Urgente</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Conteúdo / Descrição do Aviso
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={newsSummary}
                    onChange={(e) => setNewsSummary(e.target.value)}
                    placeholder="Detalhes, horários, turmas envolvidas e orientações..."
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowNewsModal(false)}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold rounded-xl cursor-pointer"
                  >
                    Publicar Agora
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: NOVO EVENTO */}
      <AnimatePresence>
        {showEventModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 max-w-md w-full shadow-2xl"
            >
              <h3 className="text-base font-serif font-bold text-slate-900 dark:text-white mb-1">
                Agendar Evento da Escola
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Publicação oficial na agenda do eloEscola
              </p>

              <form onSubmit={handleCreateSchoolEvent} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Título do Evento
                  </label>
                  <input
                    type="text"
                    required
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    placeholder="Ex: Feira de Conhecimento e Mostra Cultural"
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Data
                    </label>
                    <input
                      type="date"
                      required
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Horário
                    </label>
                    <input
                      type="time"
                      required
                      value={eventTime}
                      onChange={(e) => setEventTime(e.target.value)}
                      className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Local do Evento
                  </label>
                  <input
                    type="text"
                    required
                    value={eventLocation}
                    onChange={(e) => setEventLocation(e.target.value)}
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={eventIsPaid}
                      onChange={(e) => setEventIsPaid(e.target.checked)}
                      className="rounded text-emerald-600"
                    />
                    <span>Evento com taxa de inscrição</span>
                  </label>
                  {eventIsPaid && (
                    <input
                      type="number"
                      placeholder="Valor R$"
                      value={eventPrice}
                      onChange={(e) => setEventPrice(e.target.value)}
                      className="w-24 h-8 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    />
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowEventModal(false)}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold rounded-xl cursor-pointer"
                  >
                    Agendar Evento
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
