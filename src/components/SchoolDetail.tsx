import React, { useState } from "react";
import { SchoolProfile, SchoolNewsItem, SchoolEventItem } from "../lib/schoolsData";
import { mergeNews, saveNews } from "../lib/schoolNewsStore.ts";
import { safeParseJsonResponse } from "../lib/apiResilience.ts";
import { User } from "../types";
import {
  ArrowLeft,
  MapPin,
  Phone,
  Mail,
  GraduationCap,
  Calendar,
  Building,
  CheckCircle2,
  PlusCircle,
  Clock,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Send
} from "lucide-react";

interface SchoolDetailProps {
  school: SchoolProfile;
  currentUser: User | null;
  onBack: () => void;
  onNavigateToEvent?: (eventId: number) => void;
  onRecordParticipation?: (eventData: { id: number; title: string; location: string; date: string; time: string }) => Promise<void>;
  onSchoolUpdate?: (updatedSchool: SchoolProfile) => void;
}

export const SchoolDetail: React.FC<SchoolDetailProps> = ({
  school,
  currentUser,
  onBack,
  onRecordParticipation,
  onSchoolUpdate
}) => {
  const [activeTab, setActiveTab] = useState<"overview" | "news" | "events">("overview");
  const [participatedEvents, setParticipatedEvents] = useState<Record<string, boolean>>({});
  const [participatingLoading, setParticipatingLoading] = useState<string | null>(null);

  // New News Modal State
  const [showNewsModal, setShowNewsModal] = useState(false);
  const [newsTitle, setNewsTitle] = useState("");
  const [newsDescription, setNewsDescription] = useState("");
  const [newsCategory, setNewsCategory] = useState<SchoolNewsItem["category"]>("Comunicado");
  const [submittingNews, setSubmittingNews] = useState(false);

  // New Event Modal State
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDesc, setEventDesc] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("19:00");
  const [eventLocation, setEventLocation] = useState(school.address);
  const [eventCategory, setEventCategory] = useState<SchoolEventItem["category"]>("Cultura");
  const [eventIsFree, setEventIsFree] = useState(true);
  const [submittingEvent, setSubmittingEvent] = useState(false);

  // Permission checks
  const isChefe = currentUser?.email === "davidribeiromuller2009@gmail.com" || currentUser?.email === "diretoria@helenawysocki.com";
  const isThisSchool = currentUser?.role === "Escola" && (
    (currentUser as any).escolaId === school.id ||
    currentUser?.uid === `inst-${school.slug.replace(/-/g, "")}`
  );
  const canPublish = isChefe || isThisSchool;

  const handleConfirmAttendance = async (event: SchoolEventItem, eventIdNum: number) => {
    if (!currentUser || currentUser.isGuest) {
      alert("Para confirmar presença e salvar este evento no seu histórico permanente, crie ou acesse uma conta no eloEscola.");
      return;
    }

    setParticipatingLoading(event.id);
    try {
      if (onRecordParticipation) {
        await onRecordParticipation({
          id: eventIdNum,
          title: `[${school.shortName}] ${event.title}`,
          location: event.location,
          date: event.date,
          time: event.time
        });
      }
      setParticipatedEvents(prev => ({ ...prev, [event.id]: true }));
    } catch (err: any) {
      alert(err.message || "Erro ao registrar confirmação.");
    } finally {
      setParticipatingLoading(null);
    }
  };

  const handlePublishNews = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsTitle.trim() || !newsDescription.trim()) return;

    setSubmittingNews(true);
    try {
      const token = localStorage.getItem("token") || "";
      const res = await fetch(`/api/schools/${school.slug}/news`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          title: newsTitle.trim(),
          description: newsDescription.trim(),
          category: newsCategory,
          author: isThisSchool ? school.shortName : "Administração eloEscola"
        })
      });

      const parsed = await safeParseJsonResponse<any>(res, {});
      if (!res.ok) {
        throw new Error(parsed.data?.error || parsed.error || "Falha ao publicar comunicado.");
      }

      if (res.ok && parsed.ok && parsed.data?.school && onSchoolUpdate) {
        onSchoolUpdate(parsed.data.school);
      } else if (res.ok && parsed.ok && parsed.data?.news) {
        school.news.unshift(parsed.data.news);
      } else {
        // Sem backend (GitHub Pages é estático): persiste localmente para que o
        // comunicado realmente apareça no mural da escola.
        const created = saveNews(school.slug, {
          title: newsTitle.trim(),
          description: newsDescription.trim(),
          category: newsCategory,
          author: isThisSchool ? school.shortName : "Administração eloEscola"
        });
        school.news = mergeNews(school.slug, [created, ...(school.news || [])]);
      }

      setNewsTitle("");
      setNewsDescription("");
      setShowNewsModal(false);
      setActiveTab("news");
      alert("Comunicado publicado com sucesso no mural da escola!");
    } catch (err: any) {
      alert(err.message || "Erro ao publicar notícia.");
    } finally {
      setSubmittingNews(false);
    }
  };

  const handlePublishEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim() || !eventDate.trim()) return;

    setSubmittingEvent(true);
    try {
      const token = localStorage.getItem("token") || "";
      const res = await fetch(`/api/schools/${school.slug}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          title: eventTitle.trim(),
          description: eventDesc.trim(),
          date: eventDate.trim(),
          time: eventTime.trim(),
          location: eventLocation.trim(),
          category: eventCategory,
          isFree: eventIsFree
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Falha ao cadastrar evento.");
      }

      if (data.school && onSchoolUpdate) {
        onSchoolUpdate(data.school);
      } else {
        school.events.unshift(data.event);
      }

      setEventTitle("");
      setEventDesc("");
      setEventDate("");
      setShowEventModal(false);
      setActiveTab("events");
      alert("Evento institucional cadastrado e sincronizado com o eloEscola!");
    } catch (err: any) {
      alert(err.message || "Erro ao cadastrar evento.");
    } finally {
      setSubmittingEvent(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Top Navigation Bar with Back Button */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 bg-white/90 border border-emerald-200 px-3.5 py-1.5 rounded-full hover:bg-emerald-50 transition shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para Início
        </button>

        {canPublish && (
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex text-xs font-medium text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              Gestão Autorizada
            </span>
            <button
              onClick={() => setShowNewsModal(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-emerald-800 text-white px-3 py-1.5 rounded-full hover:bg-emerald-900 transition shadow-sm"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Publicar Aviso
            </button>
            <button
              onClick={() => setShowEventModal(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-emerald-700 text-white px-3 py-1.5 rounded-full hover:bg-emerald-800 transition shadow-sm"
            >
              <Calendar className="w-3.5 h-3.5" />
              Novo Evento
            </button>
          </div>
        )}
      </div>

      {/* School Header Banner */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-[#12311b] via-[#1a3f24] to-[#0f2816] shadow-md border border-emerald-800/40 mb-6 p-6 sm:p-8 text-white">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl bg-[#edf5ef] p-3 shadow-md flex items-center justify-center shrink-0 border border-white/20">
            <img
              src={school.image}
              alt={school.name}
              className="max-h-full max-w-full object-contain drop-shadow-sm"
              loading="lazy"
            />
          </div>

          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider bg-emerald-500/80 backdrop-blur-md px-3 py-0.5 rounded-full text-white">
                {school.network} • {school.nre}
              </span>
              <span className="text-xs font-medium bg-white/20 backdrop-blur-md px-3 py-0.5 rounded-full text-white flex items-center gap-1">
                <MapPin className="w-3 h-3 text-emerald-400" />
                {school.neighborhood}, {school.city}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-serif font-bold text-white leading-tight">
              {school.name}
            </h1>

            <p className="text-xs sm:text-sm text-emerald-100/90 mt-1.5">
              {school.type} • Fundada e mantida pela Secretaria de Estado da Educação do Paraná (SEED/PR)
            </p>
          </div>
        </div>
      </div>

      {/* Quick Official Contacts Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-white/80 backdrop-blur-sm border border-emerald-200/80 rounded-2xl p-4 flex items-start gap-3 shadow-sm">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-800 flex-shrink-0">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Endereço</h4>
            <p className="text-xs font-medium text-gray-800 mt-0.5 leading-snug">
              {school.address}
            </p>
            <p className="text-[11px] text-gray-500">CEP: {school.cep}</p>
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur-sm border border-emerald-200/80 rounded-2xl p-4 flex items-start gap-3 shadow-sm">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-800 flex-shrink-0">
            <Phone className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Telefone Oficial</h4>
            <p className="text-xs font-medium text-gray-800 mt-0.5">
              {school.phone}
            </p>
            <p className="text-[11px] text-emerald-700 font-medium">Secretaria e Direção</p>
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur-sm border border-emerald-200/80 rounded-2xl p-4 flex items-start gap-3 shadow-sm">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-800 flex-shrink-0">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">E-mail Institucional</h4>
            <p className="text-xs font-medium text-gray-800 mt-0.5 break-all">
              {school.email}
            </p>
            <p className="text-[11px] text-gray-500">SEED Paraná Oficial</p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-emerald-200 mb-6 bg-white/60 rounded-t-2xl px-2">
        <button
          onClick={() => setActiveTab("overview")}
          className={`py-3 px-5 text-sm font-semibold transition border-b-2 flex items-center gap-2 ${
            activeTab === "overview"
              ? "border-emerald-700 text-emerald-900"
              : "border-transparent text-gray-500 hover:text-emerald-800"
          }`}
        >
          <Building className="w-4 h-4" />
          Visão Geral & Estrutura
        </button>

        <button
          onClick={() => setActiveTab("news")}
          className={`py-3 px-5 text-sm font-semibold transition border-b-2 flex items-center gap-2 ${
            activeTab === "news"
              ? "border-emerald-700 text-emerald-900"
              : "border-transparent text-gray-500 hover:text-emerald-800"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Mural & Avisos ({school.news.length})
        </button>

        <button
          onClick={() => setActiveTab("events")}
          className={`py-3 px-5 text-sm font-semibold transition border-b-2 flex items-center gap-2 ${
            activeTab === "events"
              ? "border-emerald-700 text-emerald-900"
              : "border-transparent text-gray-500 hover:text-emerald-800"
          }`}
        >
          <Calendar className="w-4 h-4" />
          Eventos & Festividades ({school.events.length})
        </button>
      </div>

      {/* Tab: Overview */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            {/* Historical Overview */}
            <div className="bg-white/80 border border-emerald-200/80 rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-serif font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Building className="w-5 h-5 text-emerald-700" />
                Histórico & Importância Comunitária
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                {school.historicalOverview}
              </p>
            </div>

            {/* Pedagogical Highlights */}
            <div className="bg-white/80 border border-emerald-200/80 rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-serif font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-700" />
                Destaques Pedagógicos e Projetos
              </h3>
              <ul className="space-y-2.5">
                {school.pedagogicalHighlights.map((highlight, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="space-y-6">
            {/* Modalities */}
            <div className="bg-white/80 border border-emerald-200/80 rounded-2xl p-6 shadow-sm">
              <h3 className="text-base font-serif font-bold text-gray-900 mb-3 flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-emerald-700" />
                Modalidades de Ensino
              </h3>
              <div className="space-y-2">
                {school.modalities.map((mod, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-emerald-50/70 rounded-xl border border-emerald-200/60 text-xs font-semibold text-emerald-900 flex items-center gap-2"
                  >
                    <div className="w-2 h-2 rounded-full bg-emerald-600" />
                    {mod}
                  </div>
                ))}
              </div>
            </div>

            {/* Infrastructure */}
            <div className="bg-white/80 border border-emerald-200/80 rounded-2xl p-6 shadow-sm">
              <h3 className="text-base font-serif font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Building className="w-5 h-5 text-emerald-700" />
                Estrutura & Ambientes
              </h3>
              <ul className="space-y-2">
                {school.infrastructure.map((item, idx) => (
                  <li key={idx} className="text-xs text-gray-700 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Tab: News & Notices */}
      {activeTab === "news" && (
        <div className="space-y-4">
          {canPublish && (
            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-emerald-900">Área de Publicação Escolar</p>
                <p className="text-xs text-emerald-700">Publique comunicados oficiais para a comunidade do {school.shortName}.</p>
              </div>
              <button
                onClick={() => setShowNewsModal(true)}
                className="text-xs font-bold bg-emerald-800 text-white px-3.5 py-1.5 rounded-full hover:bg-emerald-900 transition flex items-center gap-1.5 shadow-sm"
              >
                <PlusCircle className="w-4 h-4" />
                Novo Comunicado
              </button>
            </div>
          )}

          {school.news.length === 0 ? (
            <div className="text-center py-12 bg-white/70 rounded-2xl border border-emerald-200">
              <p className="text-sm text-gray-500">Nenhum comunicado publicado para esta escola no momento.</p>
            </div>
          ) : (
            school.news.map((item) => (
              <div
                key={item.id}
                className="bg-white/90 border border-emerald-200/80 rounded-2xl p-5 shadow-sm hover:border-emerald-400 transition"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-900 px-2.5 py-0.5 rounded-full">
                    {item.category}
                  </span>
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {item.date}
                  </span>
                </div>

                <h4 className="text-base font-bold text-gray-900 font-serif mb-1">
                  {item.title}
                </h4>

                <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line mb-3">
                  {item.description}
                </p>

                <div className="text-[11px] text-gray-500 border-t border-emerald-50 pt-2 flex items-center justify-between">
                  <span>Autor: <strong className="text-emerald-800">{item.author}</strong></span>
                  <span className="italic">{item.source}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab: Events & Festivities */}
      {activeTab === "events" && (
        <div className="space-y-4">
          {canPublish && (
            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-emerald-900">Calendário da Instituição</p>
                <p className="text-xs text-emerald-700">Cadastre eventos oficiais do {school.shortName}. Eles serão exibidos aqui e no calendário geral.</p>
              </div>
              <button
                onClick={() => setShowEventModal(true)}
                className="text-xs font-bold bg-emerald-800 text-white px-3.5 py-1.5 rounded-full hover:bg-emerald-900 transition flex items-center gap-1.5 shadow-sm"
              >
                <PlusCircle className="w-4 h-4" />
                Cadastrar Evento
              </button>
            </div>
          )}

          {school.events.length === 0 ? (
            <div className="text-center py-12 bg-white/70 rounded-2xl border border-emerald-200">
              <p className="text-sm text-gray-500">Nenhum evento agendado para esta escola no momento.</p>
            </div>
          ) : (
            school.events.map((ev, index) => {
              const eventIdNum = 8000 + index;
              const hasConfirmed = participatedEvents[ev.id];
              const isLoadingThis = participatingLoading === ev.id;

              return (
                <div
                  key={ev.id}
                  className="bg-white/90 border border-emerald-200/80 rounded-2xl p-5 shadow-sm hover:border-emerald-400 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-900 px-2.5 py-0.5 rounded-full">
                        {ev.category}
                      </span>
                      {ev.isFree ? (
                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          Gratuito
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                          Inscrição
                        </span>
                      )}
                    </div>

                    <h4 className="text-base font-serif font-bold text-gray-900 mb-1">
                      {ev.title}
                    </h4>

                    <p className="text-xs text-gray-700 leading-relaxed mb-2">
                      {ev.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-emerald-700" />
                        {ev.date}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-emerald-700" />
                        {ev.time}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-emerald-700" />
                        {ev.location}
                      </span>
                    </div>
                  </div>

                  {/* Actions: Confirm Attendance */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleConfirmAttendance(ev, eventIdNum)}
                      disabled={hasConfirmed || isLoadingThis}
                      className={`text-xs font-semibold px-4 py-2 rounded-xl transition flex items-center gap-1.5 shadow-sm ${
                        hasConfirmed
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-300 cursor-default"
                          : "bg-emerald-800 text-white hover:bg-emerald-900 active:scale-95"
                      }`}
                    >
                      {hasConfirmed ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                          Presença Confirmada
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          {isLoadingThis ? "Confirmando..." : "Confirmar Presença"}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Modal: Publicar Notícia da Escola */}
      {showNewsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-emerald-200">
            <h3 className="text-lg font-serif font-bold text-gray-900 mb-1">
              Publicar Comunicado Oficial
            </h3>
            <p className="text-xs text-gray-600 mb-4">
              {school.name}
            </p>

            <form onSubmit={handlePublishNews} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Título do Comunicado</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Reunião Pedagógica de Pais e Mestres"
                  value={newsTitle}
                  onChange={(e) => setNewsTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Categoria</label>
                <select
                  value={newsCategory}
                  onChange={(e) => setNewsCategory(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="Comunicado">Comunicado Geral</option>
                  <option value="Pedagógico">Pedagógico</option>
                  <option value="Conquista">Conquista & Premiação</option>
                  <option value="Cultural">Cultural</option>
                  <option value="Aviso">Aviso Urgente</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Conteúdo do Comunicado</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Descreva as instruções, datas, orientações para os estudantes e familiares..."
                  value={newsDescription}
                  onChange={(e) => setNewsDescription(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewsModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingNews}
                  className="px-4 py-2 text-xs font-semibold bg-emerald-800 text-white rounded-xl hover:bg-emerald-900 transition flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {submittingNews ? "Publicando..." : "Publicar Comunicado"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Publicar Evento da Escola */}
      {showEventModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-emerald-200">
            <h3 className="text-lg font-serif font-bold text-gray-900 mb-1">
              Cadastrar Evento Institucional
            </h3>
            <p className="text-xs text-gray-600 mb-4">
              {school.name}
            </p>

            <form onSubmit={handlePublishEvent} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Nome do Evento</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Mostra de Projetos de Robótica"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Data (DD/MM/AAAA)</label>
                  <input
                    type="text"
                    required
                    placeholder="25/11/2026"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Horário</label>
                  <input
                    type="text"
                    required
                    placeholder="09:00 às 16:00"
                    value={eventTime}
                    onChange={(e) => setEventTime(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Local</label>
                <input
                  type="text"
                  required
                  value={eventLocation}
                  onChange={(e) => setEventLocation(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Categoria</label>
                  <select
                    value={eventCategory}
                    onChange={(e) => setEventCategory(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="Feira & Ciência">Feira & Ciência</option>
                    <option value="Esporte">Esporte</option>
                    <option value="Cultura">Cultura & Arte</option>
                    <option value="Comemoração">Comemoração</option>
                    <option value="Reunião">Reunião Comunitária</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Entrada</label>
                  <select
                    value={eventIsFree ? "free" : "paid"}
                    onChange={(e) => setEventIsFree(e.target.value === "free")}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="free">Gratuito / Entrada Livre</option>
                    <option value="paid">Com Inscrição / Taxa</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Descrição</label>
                <textarea
                  rows={3}
                  placeholder="Informações sobre programação, público-alvo, exposições..."
                  value={eventDesc}
                  onChange={(e) => setEventDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEventModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingEvent}
                  className="px-4 py-2 text-xs font-semibold bg-emerald-800 text-white rounded-xl hover:bg-emerald-900 transition flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {submittingEvent ? "Cadastrando..." : "Cadastrar e Sincronizar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
