import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import L from "leaflet";
import {
  Search,
  MapPin,
  Calendar,
  Clock,
  Navigation,
  Layers,
  Crosshair,
  Maximize2,
  ChevronRight,
  Sparkles,
  Info,
  X,
  List,
  Filter,
  School,
  Route as RouteIcon,
  Car,
  Footprints,
  ShieldCheck,
  Compass,
  Plus,
  Minus
} from "lucide-react";
import { Event } from "../types";

// Default coordinates for Escola Estadual Helena Wysocki (Araucária - PR)
const SCHOOL_COORDINATES: [number, number] = [-25.5936, -49.4103];

interface MapViewProps {
  events: Event[];
  onSelectEvent: (event: Event) => void;
  onNavigateBack?: () => void;
  initialSelectedEventId?: number | null;
  userCoords?: { lat: number; lng: number } | null;
  onUserCoordsChange?: (coords: { lat: number; lng: number }) => void;
}

// Fallback coordinates helper around Araucária
function getEventCoordinates(event: Event, index: number): [number, number] {
  if (event.lat && event.lng) {
    return [event.lat, event.lng];
  }
  const offsets: [number, number][] = [
    [-25.5936, -49.4103],
    [-25.5942, -49.4116],
    [-25.5926, -49.4092],
    [-25.5965, -49.4045],
    [-25.5912, -49.4128],
    [-25.5981, -49.4088],
  ];
  return offsets[index % offsets.length];
}

// Calculate distance between two coordinates in km (Haversine Formula)
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the Earth in km
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

// Custom Google Maps SVG Icons
const createGoogleMapsPin = (isSelected: boolean, isPaid: boolean, title: string) => {
  const pinColor = isSelected ? "#EA4335" : isPaid ? "#F29900" : "#4285F4";
  const size = isSelected ? 42 : 36;
  
  return L.divIcon({
    className: "custom-gmap-pin",
    html: `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer; transition: transform 0.2s;">
        <div style="
          background-color: ${pinColor};
          width: ${size}px;
          height: ${size}px;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          box-shadow: 0 4px 10px rgba(0,0,0,0.35);
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

// Google Maps Pulsing Blue Dot (User Live Location)
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

export default function MapView({
  events,
  onSelectEvent,
  onNavigateBack,
  initialSelectedEventId,
  userCoords,
  onUserCoordsChange,
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<"all" | "free" | "school" | "external">("all");
  const [activeEvent, setActiveEvent] = useState<Event | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationStatusMessage, setLocationStatusMessage] = useState<string | null>(null);
  const [localUserLocation, setLocalUserLocation] = useState<{ lat: number; lng: number } | null>(() => {
    if (userCoords) return userCoords;
    try {
      const saved = localStorage.getItem("user_geolocation_coords");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const currentUserLocation = userCoords || localUserLocation;

  // Filter events
  const filteredEvents = events.filter((ev) => {
    const matchesSearch =
      ev.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.location.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (selectedCategory === "free") return !ev.isPaid;
    if (selectedCategory === "school")
      return (
        ev.location.toLowerCase().includes("bloco") ||
        ev.location.toLowerCase().includes("escola") ||
        ev.location.toLowerCase().includes("auditório") ||
        ev.location.toLowerCase().includes("sala") ||
        ev.location.toLowerCase().includes("laboratório")
      );
    if (selectedCategory === "external")
      return (
        ev.location.toLowerCase().includes("teatro") ||
        ev.location.toLowerCase().includes("municipal") ||
        ev.location.toLowerCase().includes("rua") ||
        ev.location.toLowerCase().includes("av")
      );
    return true;
  });

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: SCHOOL_COORDINATES,
        zoom: 15,
        zoomControl: false,
        attributionControl: false,
      });

      // Google Maps Clean Tiles (CartoDB Positron / OpenStreetMap Voyager)
      const baseTile = L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        {
          maxZoom: 19,
          subdomains: "abcd",
        }
      ).addTo(map);

      (map as any)._customBaseTile = baseTile;

      const markersGroup = L.layerGroup().addTo(map);
      markersLayerRef.current = markersGroup;

      mapInstanceRef.current = map;

      setTimeout(() => {
        map.invalidateSize();
      }, 100);

      setTimeout(() => {
        map.invalidateSize();
      }, 350);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Event Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersLayerRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();

    // School Main Marker
    const schoolPin = L.divIcon({
      className: "school-pin",
      html: `
        <div style="
          background: #4C6B4C;
          color: white;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: bold;
          box-shadow: 0 4px 12px rgba(0,0,0,0.25);
          border: 2px solid #ffffff;
          display: flex;
          align-items: center;
          gap: 4px;
          white-space: nowrap;
        ">
          <span>🏫 C.E. Helena Wysocki</span>
        </div>
      `,
      iconSize: [140, 30],
      iconAnchor: [70, 15],
    });

    L.marker(SCHOOL_COORDINATES, { icon: schoolPin })
      .addTo(markersGroup)
      .bindPopup("<b>Colégio Estadual Helena Wysocki</b><br/>Campus Principal - Araucária/PR");

    // Add Markers for each event
    filteredEvents.forEach((ev, idx) => {
      const coords = getEventCoordinates(ev, idx);
      const isSelected = activeEvent?.id === ev.id;
      const icon = createGoogleMapsPin(isSelected, ev.isPaid, ev.title);

      const marker = L.marker(coords, { icon })
        .addTo(markersGroup)
        .on("click", () => {
          setActiveEvent(ev);
          map.flyTo(coords, 16, { duration: 0.8 });
        });

      if (isSelected) {
        marker.openPopup();
      }
    });

    // Add / Update User Location Blue Pulsing Marker
    if (currentUserLocation) {
      const userIcon = createGoogleMapsUserPin();
      if (userMarkerRef.current) {
        userMarkerRef.current.setLatLng([currentUserLocation.lat, currentUserLocation.lng]);
      } else {
        userMarkerRef.current = L.marker([currentUserLocation.lat, currentUserLocation.lng], {
          icon: userIcon,
          zIndexOffset: 1000,
        })
          .addTo(map)
          .bindPopup("<b>Sua Localização Atual</b>");
      }
    }
  }, [filteredEvents, activeEvent, currentUserLocation]);

  // Draw Route Polyline when Active Event and User Location exist
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }

    if (activeEvent && currentUserLocation) {
      const eventIdx = events.findIndex((e) => e.id === activeEvent.id);
      const eventCoords = getEventCoordinates(activeEvent, eventIdx >= 0 ? eventIdx : 0);

      // Route polyline with Google Maps blue color and dashing
      const polyline = L.polyline(
        [
          [currentUserLocation.lat, currentUserLocation.lng],
          eventCoords,
        ],
        {
          color: "#4285F4",
          weight: 5,
          opacity: 0.9,
          dashArray: "8, 8",
          lineCap: "round",
          lineJoin: "round",
        }
      ).addTo(map);

      routeLayerRef.current = polyline;

      // Fit bounds to show both user and event
      const bounds = L.latLngBounds([
        [currentUserLocation.lat, currentUserLocation.lng],
        eventCoords,
      ]);
      map.fitBounds(bounds, { padding: [80, 80] });
    }
  }, [activeEvent, currentUserLocation, events]);

  // Initial event selection
  useEffect(() => {
    if (initialSelectedEventId && events.length > 0) {
      const found = events.find((e) => e.id === initialSelectedEventId);
      if (found) {
        setActiveEvent(found);
        const idx = events.findIndex((e) => e.id === found.id);
        const coords = getEventCoordinates(found, idx);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo(coords, 16, { duration: 1 });
        }
      }
    }
  }, [initialSelectedEventId, events]);

  // Handle Geolocation Authorization Request with multi-tier fallback
  const handleRequestLocationAuthorization = (fallbackPreset?: { lat: number; lng: number }) => {
    if (fallbackPreset) {
      setLocalUserLocation(fallbackPreset);
      try {
        localStorage.setItem("user_geolocation_coords", JSON.stringify(fallbackPreset));
      } catch {}
      if (onUserCoordsChange) {
        onUserCoordsChange(fallbackPreset);
      }
      setShowLocationModal(false);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.flyTo([fallbackPreset.lat, fallbackPreset.lng], 16, { duration: 1 });
      }
      return;
    }

    setIsLocating(true);
    setLocationStatusMessage("Solicitando permissão de GPS...");

    if (!("geolocation" in navigator)) {
      // Fallback for unsupported browsers
      const defaultCoords = { lat: -25.5920, lng: -49.4080 }; // Centro de Araucária
      setLocalUserLocation(defaultCoords);
      if (onUserCoordsChange) onUserCoordsChange(defaultCoords);
      setIsLocating(false);
      setShowLocationModal(false);
      return;
    }

    // Try High Accuracy first, if timeout/error fallback gracefully
    const onSuccess = (pos: GeolocationPosition) => {
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setLocalUserLocation(coords);
      try {
        localStorage.setItem("user_geolocation_coords", JSON.stringify(coords));
      } catch {}
      if (onUserCoordsChange) {
        onUserCoordsChange(coords);
      }
      setIsLocating(false);
      setShowLocationModal(false);

      if (mapInstanceRef.current) {
        mapInstanceRef.current.flyTo([coords.lat, coords.lng], 16, { duration: 1 });
      }
    };

    const onError = (err: GeolocationPositionError) => {
      console.warn("High accuracy geolocation failed, trying standard accuracy:", err.message);
      // Try with low accuracy
      navigator.geolocation.getCurrentPosition(
        onSuccess,
        () => {
          // If browser or iframe permissions block GPS, use Araucária default location for immediate route calculation
          const araucariaCenter = { lat: -25.5925, lng: -49.4085 };
          setLocalUserLocation(araucariaCenter);
          try {
            localStorage.setItem("user_geolocation_coords", JSON.stringify(araucariaCenter));
          } catch {}
          if (onUserCoordsChange) {
            onUserCoordsChange(araucariaCenter);
          }
          setIsLocating(false);
          setShowLocationModal(false);
          if (mapInstanceRef.current) {
            mapInstanceRef.current.flyTo([araucariaCenter.lat, araucariaCenter.lng], 16, { duration: 1 });
          }
        },
        { enableHighAccuracy: false, timeout: 4000, maximumAge: 300000 }
      );
    };

    navigator.geolocation.getCurrentPosition(
      onSuccess,
      onError,
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 }
    );
  };

  // Center on school
  const handleCenterSchool = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(SCHOOL_COORDINATES, 16, { duration: 1 });
    }
  };

  // Zoom controls
  const handleZoomIn = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.zoomOut();
    }
  };

  const monthsList = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez"
  ];

  // Calculate distance to active event if user location is available
  const activeEventDistance =
    activeEvent && currentUserLocation
      ? calculateDistanceKm(
          currentUserLocation.lat,
          currentUserLocation.lng,
          getEventCoordinates(activeEvent, 0)[0],
          getEventCoordinates(activeEvent, 0)[1]
        )
      : null;

  return (
    <div className="relative w-full h-[calc(100vh-64px)] md:h-[calc(100vh-72px)] overflow-hidden bg-[#e5e3df] flex flex-col font-sans">
      {/* Top Google Maps Floating Search Bar & Filter Chips */}
      <div className="absolute top-3 left-3 right-3 md:left-6 md:right-auto md:w-96 z-[1000] flex flex-col gap-2 pointer-events-auto">
        {/* Google Maps Search Bar with G-Logo & Search icon */}
        <div className="bg-white dark:bg-slate-900 shadow-[0_2px_8px_rgba(0,0,0,0.18)] rounded-full border border-slate-200/80 dark:border-slate-800 p-2 flex items-center gap-2">
          <div className="p-1.5 text-brand-accent flex items-center justify-center">
            <MapPin size={19} className="text-[#EA4335] fill-[#EA4335]/20" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar endereço, local ou evento..."
            className="w-full bg-transparent text-xs md:text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
            >
              <X size={16} />
            </button>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              sidebarOpen
                ? "bg-[#1A73E8] text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200"
            }`}
            title="Ver lista de eventos"
          >
            <List size={14} />
            <span className="hidden sm:inline">Eventos ({filteredEvents.length})</span>
          </button>
        </div>

        {/* Google Maps Style Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setSelectedCategory("all")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shadow-sm transition-all cursor-pointer ${
              selectedCategory === "all"
                ? "bg-[#1A73E8] text-white font-semibold shadow-md"
                : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200/80"
            }`}
          >
            Todos ({events.length})
          </button>
          <button
            onClick={() => setSelectedCategory("school")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shadow-sm transition-all flex items-center gap-1 cursor-pointer ${
              selectedCategory === "school"
                ? "bg-[#4C6B4C] text-white font-semibold shadow-md"
                : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200/80"
            }`}
          >
            <School size={12} />
            No Helena Wysocki
          </button>
          <button
            onClick={() => setSelectedCategory("free")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shadow-sm transition-all cursor-pointer ${
              selectedCategory === "free"
                ? "bg-[#34A853] text-white font-semibold shadow-md"
                : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200/80"
            }`}
          >
            Gratuitos
          </button>
          <button
            onClick={() => setSelectedCategory("external")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shadow-sm transition-all cursor-pointer ${
              selectedCategory === "external"
                ? "bg-[#9334E8] text-white font-semibold shadow-md"
                : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200/80"
            }`}
          >
            Locais Externos
          </button>
        </div>
      </div>

      {/* Floating Action Buttons (Right Side - Google Maps UI) */}
      <div className="absolute right-3 top-3 md:right-6 md:top-6 z-[1000] flex flex-col gap-2 pointer-events-auto">
        {/* User Geolocation Center Button with Authorization Prompt */}
        <button
          onClick={() => {
            if (currentUserLocation) {
              if (mapInstanceRef.current) {
                mapInstanceRef.current.flyTo(
                  [currentUserLocation.lat, currentUserLocation.lng],
                  16,
                  { duration: 1 }
                );
              }
            } else {
              setShowLocationModal(true);
            }
          }}
          className={`w-10 h-10 md:w-11 md:h-11 rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.2)] border flex items-center justify-center active:scale-95 transition-all cursor-pointer ${
            currentUserLocation
              ? "bg-[#1A73E8] text-white border-[#1A73E8]"
              : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-50"
          }`}
          title="Minha Localização (GPS)"
        >
          <Crosshair size={18} className={currentUserLocation ? "animate-spin-slow" : ""} />
        </button>

        {/* Center on School Helena Wysocki */}
        <button
          onClick={handleCenterSchool}
          className="w-10 h-10 md:w-11 md:h-11 bg-white dark:bg-slate-900 text-[#4C6B4C] rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.2)] border border-slate-200 dark:border-slate-800 flex items-center justify-center hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
          title="Centralizar na Escola Helena Wysocki"
        >
          <School size={18} />
        </button>
      </div>

      {/* Floating Zoom In/Out Controls (Bottom Right - Google Maps UI) */}
      <div className="absolute right-3 bottom-20 md:right-6 md:bottom-8 z-[1000] flex flex-col bg-white dark:bg-slate-900 rounded-lg shadow-[0_2px_6px_rgba(0,0,0,0.2)] border border-slate-200 dark:border-slate-800 overflow-hidden pointer-events-auto">
        <button
          onClick={handleZoomIn}
          className="w-9 h-9 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border-b border-slate-200 dark:border-slate-800 cursor-pointer"
          title="Aproximar"
        >
          <Plus size={16} />
        </button>
        <button
          onClick={handleZoomOut}
          className="w-9 h-9 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          title="Afastar"
        >
          <Minus size={16} />
        </button>
      </div>

      {/* Map DOM Canvas */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Selected Event Google Maps Bottom Sheet */}
      <AnimatePresence>
        {activeEvent && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="absolute bottom-4 left-4 right-4 md:left-8 md:right-auto md:w-[420px] z-[1000] bg-white dark:bg-slate-900 rounded-3xl shadow-[0_6px_24px_rgba(0,0,0,0.2)] border border-slate-200 dark:border-slate-800 p-4 overflow-hidden pointer-events-auto"
          >
            <div className="flex gap-3.5 items-start">
              {/* Event Thumbnail */}
              <img
                src={activeEvent.image || "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=300"}
                alt={activeEvent.title}
                referrerPolicy="no-referrer"
                className="w-20 h-20 rounded-2xl object-cover shrink-0 border border-slate-100 dark:border-slate-800"
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-[#1A73E8]">
                    {activeEvent.isPaid ? activeEvent.price || "Taxa de Adesão" : "Entrada Gratuita"}
                  </span>
                  <button
                    onClick={() => setActiveEvent(null)}
                    className="text-slate-400 hover:text-slate-600 p-1 rounded-full cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>

                <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate mt-0.5">
                  {activeEvent.title}
                </h3>

                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-1 truncate">
                  <MapPin size={12} className="text-[#EA4335] shrink-0" />
                  <span>{activeEvent.location}</span>
                </p>

                <div className="flex items-center gap-2 mt-1">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Calendar size={11} className="text-brand-accent shrink-0" />
                    <span>
                      {activeEvent.day} de {monthsList[activeEvent.month]} • {activeEvent.time}
                    </span>
                  </p>
                </div>

                {activeEventDistance !== null && (
                  <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-[10px] font-bold font-mono">
                    <Car size={11} />
                    <span>{activeEventDistance} km de você • ~{Math.ceil(activeEventDistance * 2.2)} min</span>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <button
                onClick={() => {
                  if (!currentUserLocation) {
                    setShowLocationModal(true);
                  } else {
                    const eventIdx = events.findIndex((e) => e.id === activeEvent.id);
                    const coords = getEventCoordinates(activeEvent, eventIdx);
                    if (mapInstanceRef.current) {
                      const bounds = L.latLngBounds([
                        [currentUserLocation.lat, currentUserLocation.lng],
                        coords,
                      ]);
                      mapInstanceRef.current.fitBounds(bounds, { padding: [80, 80] });
                    }
                  }
                }}
                className="flex-1 h-9 bg-[#1A73E8] text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 hover:bg-[#1557b0] active:scale-97 transition-all cursor-pointer shadow-sm"
              >
                <RouteIcon size={14} />
                <span>{currentUserLocation ? "Minha Rota Traçada" : "Calcular Minha Rota"}</span>
              </button>

              <button
                onClick={() => onSelectEvent(activeEvent)}
                className="flex-1 h-9 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-xl flex items-center justify-center gap-1 active:scale-97 transition-all cursor-pointer"
              >
                <span>Ver Detalhes</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Side Events Drawer (Google Maps Explore Drawer) */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0, x: -300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -300 }}
            className="absolute top-20 left-3 bottom-4 md:left-6 md:w-96 z-[1000] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-3xl shadow-[0_6px_24px_rgba(0,0,0,0.2)] border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden pointer-events-auto"
          >
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-800 dark:text-white">Locais dos Eventos</h2>
                <p className="text-[10px] text-slate-400 font-mono">
                  {filteredEvents.length} eventos mapeados em Araucária
                </p>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
              {filteredEvents.map((ev, idx) => {
                const isSelected = activeEvent?.id === ev.id;
                const coords = getEventCoordinates(ev, idx);
                const distance = currentUserLocation
                  ? calculateDistanceKm(
                      currentUserLocation.lat,
                      currentUserLocation.lng,
                      coords[0],
                      coords[1]
                    )
                  : null;

                return (
                  <div
                    key={ev.id}
                    onClick={() => {
                      setActiveEvent(ev);
                      if (mapInstanceRef.current) {
                        mapInstanceRef.current.flyTo(coords, 16, { duration: 0.8 });
                      }
                    }}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-blue-50/80 dark:bg-blue-950/40 border-[#1A73E8] shadow-sm"
                        : "bg-white dark:bg-slate-800/60 border-slate-100 dark:border-slate-700/50 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex gap-3 items-center">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 ${
                          isSelected
                            ? "bg-[#EA4335]"
                            : ev.isPaid
                            ? "bg-amber-500"
                            : "bg-[#1A73E8]"
                        }`}
                      >
                        <MapPin size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                          {ev.title}
                        </h4>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{ev.location}</p>
                        <div className="flex items-center justify-between gap-2 mt-1 text-[10px] text-slate-400 font-mono">
                          <span>
                            {ev.day} de {monthsList[ev.month]} • {ev.time}
                          </span>
                          {distance !== null && (
                            <span className="text-blue-600 font-bold">{distance} km</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Geolocation Authorization Request Modal (Explicit User Permission Flow) */}
      <AnimatePresence>
        {showLocationModal && (
          <div className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 15 }}
              className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-center relative"
            >
              <div className="w-14 h-14 rounded-2xl bg-blue-500/10 text-[#1A73E8] mx-auto flex items-center justify-center mb-4">
                <Navigation size={28} className="animate-bounce" />
              </div>

              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Permitir Acesso à sua Localização?
              </h3>

              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-2">
                O aplicativo gostaria de acessar sua posição geográfica para exibir sua localização em tempo real no mapa e calcular o trajeto e a distância até os eventos da escola.
              </p>

              <div className="mt-5 flex flex-col gap-2">
                <button
                  onClick={() => handleRequestLocationAuthorization()}
                  disabled={isLocating}
                  className="w-full h-11 bg-[#1A73E8] text-white text-xs font-semibold rounded-2xl flex items-center justify-center gap-2 hover:bg-[#1557b0] active:scale-98 transition-all cursor-pointer shadow-md"
                >
                  <ShieldCheck size={16} />
                  {isLocating ? (locationStatusMessage || "Obtendo localização...") : "Permitir e Ver Minha Posição"}
                </button>

                <button
                  onClick={() => handleRequestLocationAuthorization({ lat: -25.5925, lng: -49.4085 })}
                  disabled={isLocating}
                  className="w-full h-10 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-semibold rounded-2xl hover:bg-blue-100 active:scale-98 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <MapPin size={14} />
                  <span>Usar Centro de Araucária (Padrão)</span>
                </button>

                <button
                  onClick={() => setShowLocationModal(false)}
                  disabled={isLocating}
                  className="w-full h-9 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium rounded-2xl hover:bg-slate-200 active:scale-98 transition-all cursor-pointer"
                >
                  Agora Não (Explorar Manualmente)
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Google Maps Bottom Attribution / Status */}
      <div className="absolute bottom-2 left-2 z-[999] bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs px-2.5 py-1 rounded-md border border-slate-200/80 dark:border-slate-800 text-[10px] text-slate-600 dark:text-slate-400 font-sans flex items-center gap-1.5 shadow-xs pointer-events-auto">
        <span className="w-2 h-2 rounded-full bg-[#34A853] inline-block" />
        <span>Helena Wysocki Maps • Araucária, PR</span>
      </div>
    </div>
  );
}
