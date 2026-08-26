import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import L from "leaflet";
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Clock,
  CircleDollarSign,
  CheckSquare,
  Globe,
  Trash2,
  Navigation,
  ShieldCheck,
  Compass,
  Car,
  Layers,
  Plus,
  Minus,
  Maximize2,
  Minimize2,
  X,
  School,
  ExternalLink,
  Pencil,
  CheckCircle
} from "lucide-react";
import { Event, User } from "../types";

interface EventDetailProps {
  event: Event;
  currentUser: User | null;
  onNavigateBack: () => void;
  onDeleteEvent: (id: number) => Promise<void>;
  onUpdateEvent?: (id: number, data: any) => Promise<void>;
  isDeleting: boolean;
  onOpenMap?: (eventId: number) => void;
  onUserCoordsChange?: (coords: { lat: number; lng: number }) => void;
  userCoords?: { lat: number; lng: number } | null;
}

// Fallback school coordinates (Colégio Estadual Helena Wysocki)
const DEFAULT_LAT = -25.4385;
const DEFAULT_LNG = -49.1925;

// Calculate distance in km
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
}

// Google Maps Styled Pin
const createGoogleMapsPin = (isPaid: boolean) => {
  const pinColor = isPaid ? "#F29900" : "#EA4335";
  const size = 38;
  return L.divIcon({
    className: "custom-gmap-pin",
    html: `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer;">
        <div style="
          background-color: ${pinColor};
          width: ${size}px;
          height: ${size}px;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          box-shadow: 0 4px 12px rgba(0,0,0,0.35);
          border: 2px solid #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <div style="
            width: ${size * 0.42}px;
            height: ${size * 0.42}px;
            background: #ffffff;
            border-radius: 50%;
            transform: rotate(45deg);
          "></div>
        </div>
        <div style="
          position: absolute;
          bottom: -4px;
          width: 8px;
          height: 3px;
          background: rgba(0,0,0,0.3);
          border-radius: 50%;
          filter: blur(1px);
        "></div>
      </div>
    `,
    iconSize: [size, size + 10],
    iconAnchor: [size / 2, size + 6],
    popupAnchor: [0, -size - 4],
  });
};

// Google Maps Blue Pulsing User Dot
const createGoogleMapsUserPin = () => {
  return L.divIcon({
    className: "custom-user-pin",
    html: `
      <div style="position: relative; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
        <div style="
          position: absolute;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: rgba(66, 133, 244, 0.35);
          animation: pulse 1.8s infinite ease-out;
        "></div>
        <div style="
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #4285F4;
          border: 2.5px solid #ffffff;
          box-shadow: 0 2px 6px rgba(0,0,0,0.35);
        "></div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

export default function EventDetail({
  event,
  currentUser,
  onNavigateBack,
  onDeleteEvent,
  onUpdateEvent,
  isDeleting,
  onUserCoordsChange,
  userCoords: propUserCoords,
}: EventDetailProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const eventMarkerRef = useRef<L.Marker | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const [showLocationPermissionModal, setShowLocationPermissionModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  // Edit fields
  const [editTitle, setEditTitle] = useState(event.title);
  const [editLocation, setEditLocation] = useState(event.location);
  const [editDay, setEditDay] = useState(event.day.toString());
  const [editMonth, setEditMonth] = useState(event.month);
  const [editYear, setEditYear] = useState(event.year);
  const [editTime, setEditTime] = useState(event.time || "14:00");
  const [editIsPaid, setEditIsPaid] = useState(!!event.isPaid);
  const [editPrice, setEditPrice] = useState(event.price || "");
  const [editRequirements, setEditRequirements] = useState(event.requirements || "");
  const [editWebsite, setEditWebsite] = useState(event.website || "");

  // Update edit form fields whenever event changes
  useEffect(() => {
    setEditTitle(event.title);
    setEditLocation(event.location);
    setEditDay(event.day.toString());
    setEditMonth(event.month);
    setEditYear(event.year);
    setEditTime(event.time || "14:00");
    setEditIsPaid(!!event.isPaid);
    setEditPrice(event.price || "");
    setEditRequirements(event.requirements || "");
    setEditWebsite(event.website || "");
  }, [event]);

  const [mapType, setMapType] = useState<"roadmap" | "satellite">("roadmap");
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(() => {
    if (propUserCoords) return propUserCoords;
    try {
      const saved = localStorage.getItem("user_geolocation_coords");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (propUserCoords) {
      setUserCoords(propUserCoords);
    }
  }, [propUserCoords]);

  // Valid coordinate derivation
  const eventLat = typeof event.lat === "number" && !isNaN(event.lat) ? event.lat : DEFAULT_LAT;
  const eventLng = typeof event.lng === "number" && !isNaN(event.lng) ? event.lng : DEFAULT_LNG;

  const handleEnroll = () => {
    if (event.website) {
      window.open(event.website, "_blank", "noopener,noreferrer");
    } else {
      alert(`Parabéns! Sua vaga para o evento "${event.title}" foi reservada com sucesso! Um comprovante foi encaminhado para seu email escolar.`);
    }
  };

  const handleAuthorizeLocation = () => {
    setIsLocating(true);
    if (!("geolocation" in navigator)) {
      alert("Seu dispositivo/navegador não suporta geolocalização.");
      setIsLocating(false);
      setShowLocationPermissionModal(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserCoords(coords);
        try {
          localStorage.setItem("user_geolocation_coords", JSON.stringify(coords));
        } catch {}
        if (onUserCoordsChange) {
          onUserCoordsChange(coords);
        }
        setIsLocating(false);
        setShowLocationPermissionModal(false);

        // Update map view to show route bounds
        if (mapInstanceRef.current) {
          const bounds = L.latLngBounds([
            [coords.lat, coords.lng],
            [eventLat, eventLng],
          ]);
          mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40] });
        }
      },
      (err) => {
        console.warn("Location permission denied/error:", err);
        setIsLocating(false);
        setShowLocationPermissionModal(false);
        alert("Permissão de localização não foi concedida. Você pode visualizar o endereço no mapa normalmente.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  // Initialize In-Event Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Destroy existing instance if container changed
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    try {
      const map = L.map(mapContainerRef.current, {
        center: [eventLat, eventLng],
        zoom: 16,
        zoomControl: false,
        attributionControl: false,
      });

      // Google-like clean OSM / Carto tile layer
      const baseTile = L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        {
          maxZoom: 19,
          subdomains: "abcd",
        }
      ).addTo(map);

      tileLayerRef.current = baseTile;

      // Event Pin
      const pinIcon = createGoogleMapsPin(!!event.isPaid);
      const marker = L.marker([eventLat, eventLng], { icon: pinIcon })
        .addTo(map)
        .bindPopup(`<b>${event.title}</b><br/>${event.location}`)
        .openPopup();

      eventMarkerRef.current = marker;
      mapInstanceRef.current = map;

      // Force multiple size invalidations to ensure smooth render during motion entrance
      const t1 = setTimeout(() => {
        map.invalidateSize();
      }, 100);

      const t2 = setTimeout(() => {
        map.invalidateSize();
        map.setView([eventLat, eventLng], 16);
      }, 350);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }
      };
    } catch (err) {
      console.error("Leaflet map init error in EventDetail:", err);
    }
  }, [event.id, eventLat, eventLng, event.isPaid, event.title, event.location]);

  // Update map layer type (Roadmap vs Satellite)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    let tileUrl = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
    let subdomains = "abcd";

    if (mapType === "satellite") {
      tileUrl = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
      subdomains = "";
    }

    const newTile = L.tileLayer(tileUrl, {
      maxZoom: 19,
      subdomains: subdomains || undefined,
    }).addTo(map);

    tileLayerRef.current = newTile;
  }, [mapType]);

  // Handle user live marker and route polyline inside event map
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (userCoords) {
      // User blue pulsing marker
      const userIcon = createGoogleMapsUserPin();
      if (userMarkerRef.current) {
        userMarkerRef.current.setLatLng([userCoords.lat, userCoords.lng]);
      } else {
        userMarkerRef.current = L.marker([userCoords.lat, userCoords.lng], {
          icon: userIcon,
          zIndexOffset: 1000,
        })
          .addTo(map)
          .bindPopup("<b>Sua Posição</b>");
      }

      // Draw Route Polyline
      if (routePolylineRef.current) {
        map.removeLayer(routePolylineRef.current);
      }

      const polyline = L.polyline(
        [
          [userCoords.lat, userCoords.lng],
          [eventLat, eventLng],
        ],
        {
          color: "#4285F4",
          weight: 4,
          opacity: 0.9,
          dashArray: "6, 6",
        }
      ).addTo(map);

      routePolylineRef.current = polyline;

      // Fit bounds nicely
      const bounds = L.latLngBounds([
        [userCoords.lat, userCoords.lng],
        [eventLat, eventLng],
      ]);
      map.fitBounds(bounds, { padding: [35, 35] });
    }
  }, [userCoords, eventLat, eventLng]);

  // Invalidate map size on expand / collapse
  useEffect(() => {
    if (mapInstanceRef.current) {
      const timer = setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [isMapExpanded]);

  const parseRequirements = (reqStr: string | null | undefined): string[] => {
    if (!reqStr) return ["Nenhum requisito ou comprovante obrigatório declarado."];
    return reqStr.split(",").map((s) => s.trim()).filter(Boolean);
  };

  const canEdit = currentUser?.isAdmin || currentUser?.role === "Diretor" || (currentUser && event.creatorId === currentUser.id);
  const canDelete = currentUser?.isAdmin || currentUser?.role === "Diretor" || (currentUser && event.creatorId === currentUser.id);

  const monthsList = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError("");

    if (!editTitle.trim()) {
      setEditError("Por favor, informe o título do evento.");
      return;
    }
    if (!editLocation.trim()) {
      setEditError("Por favor, informe a localização do evento.");
      return;
    }
    const dayNum = parseInt(editDay);
    if (!dayNum || dayNum < 1 || dayNum > 31) {
      setEditError("Por favor, informe um dia válido entre 1 e 31.");
      return;
    }

    try {
      setIsSavingEdit(true);
      if (onUpdateEvent) {
        await onUpdateEvent(event.id, {
          title: editTitle.trim(),
          location: editLocation.trim(),
          day: dayNum,
          month: editMonth,
          year: editYear,
          time: editTime.trim() || "14:00",
          isPaid: editIsPaid,
          price: editIsPaid ? editPrice.trim() : null,
          requirements: editRequirements.trim(),
          website: editWebsite.trim() || null,
        });
      }
      setShowEditModal(false);
    } catch (err: any) {
      setEditError(err.message || "Erro ao salvar alterações no evento.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const userDistance = userCoords
    ? calculateDistanceKm(userCoords.lat, userCoords.lng, eventLat, eventLng)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col h-full overflow-y-auto pb-24 text-brand-text-light dark:text-brand-text-dark bg-brand-bg-light dark:bg-brand-bg-dark"
    >
      {/* Sticky Top Header with Prominent Back Button */}
      <div className="sticky top-0 z-40 bg-brand-bg-light/95 dark:bg-brand-bg-dark/95 backdrop-blur-md px-4 py-3 border-b border-brand-primary/15 flex items-center justify-between shadow-xs">
        <button
          onClick={onNavigateBack}
          className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-white dark:bg-brand-card-dark text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs transition-all cursor-pointer shadow-xs border border-brand-primary/10 active:scale-95"
          id="btn-event-back-top"
          title="Voltar para a lista de eventos"
        >
          <ArrowLeft size={16} className="text-brand-accent dark:text-brand-primary" />
          <span>Voltar para Eventos</span>
        </button>

        <div className="flex items-center gap-2">
          {canEdit && onUpdateEvent && (
            <button
              onClick={() => setShowEditModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-all cursor-pointer shadow-xs active:scale-95"
              title="Editar este evento"
            >
              <Pencil size={13} />
              <span>Editar Evento</span>
            </button>
          )}

          <div className="text-right hidden sm:block">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold block">
              C.E. Helena Wysocki
            </span>
          </div>
        </div>
      </div>

      {/* Visual Banner */}
      <div className="relative w-full h-60 overflow-hidden">
        <img
          src={event.image || "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600"}
          alt={event.title}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/30 to-transparent" />
        
        {/* Floating Back Button over Banner */}
        <button
          onClick={onNavigateBack}
          className="absolute top-4 left-4 px-3.5 py-2 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center gap-1.5 backdrop-blur-md active:scale-95 transition-all cursor-pointer shadow-lg text-xs font-semibold"
          id="btn-event-back-floating"
        >
          <ArrowLeft size={15} />
          <span>Voltar</span>
        </button>

        <div className="absolute top-4 right-4 flex items-center gap-2">
          {canEdit && onUpdateEvent && (
            <button
              onClick={() => setShowEditModal(true)}
              className="p-2 px-3 rounded-full bg-emerald-600/90 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-lg backdrop-blur-md active:scale-95 transition-all cursor-pointer text-xs font-semibold"
              title="Editar evento"
            >
              <Pencil size={14} />
              <span className="hidden sm:inline">Editar</span>
            </button>
          )}

          {canDelete && (
            <button
              onClick={() => {
                if (confirm(`Tem certeza de que deseja deletar permanentemente o evento pedagógico "${event.title}"?`)) {
                  onDeleteEvent(event.id);
                }
              }}
              disabled={isDeleting}
              className="p-2.5 rounded-full bg-red-600/80 text-white hover:bg-red-700 active:scale-95 transition-all shadow-lg backdrop-blur-md cursor-pointer disabled:opacity-50"
              title="Excluir evento"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>

        <div className="absolute bottom-4 left-6 right-6 flex flex-col gap-1 text-white">
          <span className="text-[10px] uppercase font-mono tracking-widest font-bold text-white/80">
            {event.creatorRole || "Evento Institucional"}
          </span>
          <h1 className="font-display font-bold text-2xl tracking-tight leading-tight">
            {event.title}
          </h1>
        </div>
      </div>

      <div className="max-w-3xl w-full mx-auto p-6 flex flex-col gap-6">
        {/* Short Description */}
        <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
          {event.description}
        </p>

        {/* Detailed Metadata Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-white dark:bg-brand-card-dark rounded-3xl p-5 border border-brand-primary/10 shadow-xs">
          <div className="flex items-start gap-3">
            <MapPin size={18} className="text-brand-accent shrink-0 mt-0.5" />
            <div className="text-xs text-slate-600 dark:text-slate-300">
              <span className="font-bold text-slate-400 block uppercase tracking-wide text-[9px] mb-0.5">Localização</span>
              {event.location}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Calendar size={18} className="text-brand-accent shrink-0 mt-0.5" />
            <div className="text-xs text-slate-600 dark:text-slate-300">
              <span className="font-bold text-slate-400 block uppercase tracking-wide text-[9px] mb-0.5">Data oficial</span>
              {event.day} de {monthsList[event.month]} de {event.year}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Clock size={18} className="text-brand-accent shrink-0 mt-0.5" />
            <div className="text-xs text-slate-600 dark:text-slate-300">
              <span className="font-bold text-slate-400 block uppercase tracking-wide text-[9px] mb-0.5">Horário</span>
              {event.time}
            </div>
          </div>

          {event.isPaid && (
            <div className="flex items-start gap-3">
              <CircleDollarSign size={18} className="text-yellow-600 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-600 dark:text-slate-300">
                <span className="font-bold text-slate-400 block uppercase tracking-wide text-[9px] mb-0.5">Taxa de Adesão</span>
                {event.price || "Pago"}
              </div>
            </div>
          )}
        </div>

        {/* IN-EVENT INTERACTIVE GOOGLE MAPS SECTION */}
        <div className="bg-white dark:bg-brand-card-dark rounded-3xl p-4 border border-brand-primary/10 shadow-xs flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-red-500/10 text-[#EA4335] flex items-center justify-center">
                <MapPin size={17} className="fill-[#EA4335]/20" />
              </div>
              <div>
                <h3 className="font-bold text-xs text-slate-800 dark:text-slate-100">Mapa do Evento</h3>
                <p className="text-[10px] text-slate-400 font-mono truncate max-w-[200px] sm:max-w-xs">{event.location}</p>
              </div>
            </div>

            {/* Distance badge if location was authorized */}
            {userDistance !== null && (
              <div className="px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-[#1A73E8] border border-blue-200 dark:border-blue-800 text-[11px] font-bold font-mono flex items-center gap-1">
                <Car size={13} />
                <span>{userDistance} km de você</span>
              </div>
            )}
          </div>

          {/* Interactive Google Maps Container */}
          <div className={`relative w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-[#e5e3df] transition-all shadow-inner ${
            isMapExpanded ? "h-96" : "h-64"
          }`}>
            {/* Floating Top Controls */}
            <div className="absolute top-2.5 left-2.5 z-[1000] flex items-center gap-1.5 pointer-events-auto">
              <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs px-2.5 py-1 rounded-full shadow-md text-[10px] font-bold text-slate-800 dark:text-white flex items-center gap-1.5 border border-slate-200/80 dark:border-slate-700">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping inline-block" />
                <span className="max-w-[150px] truncate">{event.location}</span>
              </div>
            </div>

            {/* Floating Right Map Controls */}
            <div className="absolute top-2.5 right-2.5 z-[1000] flex flex-col gap-1.5 pointer-events-auto">
              {/* Layer switch */}
              <button
                onClick={() => setMapType(mapType === "roadmap" ? "satellite" : "roadmap")}
                className="w-8 h-8 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
                title="Alternar Satélite / Mapa"
              >
                <Layers size={15} />
              </button>

              {/* Zoom Controls */}
              <button
                onClick={() => mapInstanceRef.current?.zoomIn()}
                className="w-8 h-8 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
                title="Aumentar Zoom"
              >
                <Plus size={15} />
              </button>

              <button
                onClick={() => mapInstanceRef.current?.zoomOut()}
                className="w-8 h-8 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
                title="Diminuir Zoom"
              >
                <Minus size={15} />
              </button>

              {/* GPS Request Permission Button */}
              <button
                onClick={() => {
                  if (userCoords) {
                    if (mapInstanceRef.current) {
                      const bounds = L.latLngBounds([
                        [userCoords.lat, userCoords.lng],
                        [eventLat, eventLng],
                      ]);
                      mapInstanceRef.current.fitBounds(bounds, { padding: [30, 30] });
                    }
                  } else {
                    setShowLocationPermissionModal(true);
                  }
                }}
                className={`w-8 h-8 rounded-lg shadow-md border flex items-center justify-center cursor-pointer transition-all active:scale-95 ${
                  userCoords
                    ? "bg-[#1A73E8] text-white border-[#1A73E8]"
                    : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50"
                }`}
                title="Minha Posição (GPS)"
              >
                <Navigation size={15} />
              </button>

              {/* Expand / Collapse Map size */}
              <button
                onClick={() => setIsMapExpanded(!isMapExpanded)}
                className="w-8 h-8 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
                title={isMapExpanded ? "Reduzir Mapa" : "Expandir Mapa"}
              >
                {isMapExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            </div>

            {/* DOM Map Container */}
            <div
              ref={mapContainerRef}
              className="w-full h-full min-h-[256px] relative z-0"
              style={{ minHeight: isMapExpanded ? "384px" : "256px" }}
            />
          </div>

          {/* Map Actions Bar */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => {
                if (userCoords) {
                  if (mapInstanceRef.current) {
                    const bounds = L.latLngBounds([
                      [userCoords.lat, userCoords.lng],
                      [eventLat, eventLng],
                    ]);
                    mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40] });
                  }
                } else {
                  setShowLocationPermissionModal(true);
                }
              }}
              className="flex-1 h-9 bg-[#1A73E8] hover:bg-[#1557b0] text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-97 cursor-pointer"
            >
              <Navigation size={14} />
              <span>{userCoords ? "Ver Rota Traçada" : "Calcular Trajeto e Distância"}</span>
            </button>

            <button
              onClick={() => {
                if (mapInstanceRef.current) {
                  mapInstanceRef.current.flyTo([eventLat, eventLng], 17, { duration: 0.8 });
                }
              }}
              className="px-3 h-9 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl flex items-center justify-center gap-1 active:scale-97 transition-all cursor-pointer"
              title="Centralizar no Ponto do Evento"
            >
              <MapPin size={14} className="text-[#EA4335]" />
              <span>Centralizar</span>
            </button>
          </div>
        </div>

        {/* Requirements checklists */}
        <div>
          <h3 className="font-display font-semibold text-sm tracking-tight text-slate-500 mb-3 flex items-center gap-2">
            <CheckSquare size={16} className="text-brand-accent" />
            Requisitos e Instruções:
          </h3>
          <ul className="flex flex-col gap-2">
            {parseRequirements(event.requirements).map((req, idx) => (
              <li
                key={idx}
                className="text-xs bg-brand-primary/10 dark:bg-brand-card-dark/30 rounded-xl px-3 py-2 border border-brand-primary/10 flex items-center gap-2"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-brand-accent" />
                <span>{req}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Confirm subscription */}
        <button
          onClick={handleEnroll}
          className="w-full h-13 mt-2 bg-brand-primary text-white font-semibold rounded-2xl flex items-center justify-center gap-2 hover:opacity-95 active:scale-98 transition-all shadow-md cursor-pointer"
        >
          <span>Inscrever-se / Garantir Vaga</span>
        </button>
      </div>

      {/* Modal de Permissão de Localização sob demanda */}
      <AnimatePresence>
        {showLocationPermissionModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-center relative"
            >
              <button
                onClick={() => setShowLocationPermissionModal(false)}
                className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
              >
                <X size={18} />
              </button>

              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-[#1A73E8] mx-auto flex items-center justify-center mb-3">
                <Navigation size={24} />
              </div>

              <h3 className="font-display font-bold text-slate-800 dark:text-white text-base">
                Permissão de Localização
              </h3>

              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
                Permita o acesso à sua localização para traçar a rota até <strong>{event.location}</strong> e calcular a distância em tempo real.
              </p>

              <div className="flex flex-col gap-2">
                <button
                  onClick={handleAuthorizeLocation}
                  disabled={isLocating}
                  className="w-full h-10 bg-[#1A73E8] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-md hover:bg-[#1557b0] cursor-pointer"
                >
                  <ShieldCheck size={16} />
                  <span>{isLocating ? "Obtendo Localização..." : "Autorizar Localização"}</span>
                </button>

                <button
                  onClick={() => setShowLocationPermissionModal(false)}
                  className="w-full h-9 text-xs text-slate-500 hover:text-slate-700 font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Modal de Edição de Evento por Administradores */}
        {showEditModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                    <Pencil size={16} />
                  </div>
                  <h3 className="font-display font-bold text-base text-slate-800 dark:text-white">
                    Editar Evento
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {editError && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 text-xs font-medium flex items-center justify-between">
                  <span>{editError}</span>
                  <button type="button" onClick={() => setEditError("")} className="font-bold text-sm ml-2">✕</button>
                </div>
              )}

              <form onSubmit={handleSaveEdit} className="flex flex-col gap-3.5 text-xs">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Título do Evento*
                  </label>
                  <input
                    type="text"
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full h-11 px-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500/50 focus:outline-none text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Local / Endereço Completo*
                  </label>
                  <input
                    type="text"
                    required
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="w-full h-11 px-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500/50 focus:outline-none text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Dia*</label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={31}
                      value={editDay}
                      onChange={(e) => setEditDay(e.target.value)}
                      className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-center font-bold text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Mês*</label>
                    <select
                      value={editMonth}
                      onChange={(e) => setEditMonth(parseInt(e.target.value))}
                      className="w-full h-11 px-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                    >
                      {monthsList.map((m, i) => (
                        <option key={m} value={i} className="bg-white dark:bg-slate-900">
                          {m.slice(0, 3)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Horário*</label>
                    <input
                      type="time"
                      required
                      value={editTime}
                      onChange={(e) => setEditTime(e.target.value)}
                      className="w-full h-11 px-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-center font-semibold text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700">
                  <input
                    type="checkbox"
                    id="chk-edit-evt-paid"
                    checked={editIsPaid}
                    onChange={(e) => setEditIsPaid(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                  />
                  <label htmlFor="chk-edit-evt-paid" className="text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                    Evento com taxa de inscrição (Pago)
                  </label>
                </div>

                {editIsPaid && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Valor / Taxa (Ex: R$ 15,00)
                    </label>
                    <input
                      type="text"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      placeholder="R$ 0,00"
                      className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
                    />
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Requisitos / Orientações (Separados por vírgula)
                  </label>
                  <input
                    type="text"
                    value={editRequirements}
                    onChange={(e) => setEditRequirements(e.target.value)}
                    placeholder="Ex: Levar documento com foto, Uniforme escolar"
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Link / Site Oficial (Opcional)
                  </label>
                  <input
                    type="url"
                    value={editWebsite}
                    onChange={(e) => setEditWebsite(e.target.value)}
                    placeholder="https://..."
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    type="submit"
                    disabled={isSavingEdit}
                    className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-md active:scale-98 transition-all cursor-pointer"
                  >
                    <CheckCircle size={16} />
                    <span>{isSavingEdit ? "Salvando..." : "Salvar Alterações"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="px-4 h-11 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 font-semibold rounded-xl active:scale-98 transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
