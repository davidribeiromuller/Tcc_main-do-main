import { motion } from "motion/react";
import { Home, Calendar, Settings, ShieldAlert } from "lucide-react";

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isAdmin: boolean;
}

export default function BottomNav({ activeTab, onTabChange, isAdmin }: BottomNavProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 md:hidden bg-brand-accent py-3 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] flex justify-center items-center rounded-t-3xl shadow-[0_-10px_25px_rgba(0,0,0,0.15)] z-50 border-t border-brand-primary/20">
      <div className="max-w-4xl w-full flex justify-around items-center">
      
      <button
        onClick={() => onTabChange("feed")}
        className="relative flex flex-col items-center justify-center p-2 focus:outline-none transition-all cursor-pointer"
        id="btn-nav-feed"
        title="Eventos"
      >
        <Home
          size={24}
          className={`${
            activeTab === "feed" ? "text-white scale-110" : "text-white/60 hover:text-white/80"
          } transition-all duration-250`}
        />
        {activeTab === "feed" && (
          <motion.div
            layoutId="activeTabIndicator"
            className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-white"
          />
        )}
      </button>

      <button
        onClick={() => onTabChange("calendar")}
        className="relative flex flex-col items-center justify-center p-2 focus:outline-none transition-all cursor-pointer"
        id="btn-nav-calendar"
        title="Calendário"
      >
        <Calendar
          size={24}
          className={`${
            activeTab === "calendar" ? "text-white scale-110" : "text-white/60 hover:text-white/80"
          } transition-all duration-250`}
        />
        {activeTab === "calendar" && (
          <motion.div
            layoutId="activeTabIndicator"
            className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-white"
          />
        )}
      </button>

      {isAdmin && (
        <button
          onClick={() => onTabChange("admin")}
          className="relative flex flex-col items-center justify-center p-2 focus:outline-none transition-all cursor-pointer"
          id="btn-nav-admin"
          title="Administração"
        >
          <ShieldAlert
            size={24}
            className={`${
              activeTab === "admin" ? "text-white scale-110" : "text-white/60 hover:text-white/80"
            } transition-all duration-250`}
          />
          {activeTab === "admin" && (
            <motion.div
              layoutId="activeTabIndicator"
              className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-white"
            />
          )}
        </button>
      )}

      <button
        onClick={() => onTabChange("settings")}
        className="relative flex flex-col items-center justify-center p-2 focus:outline-none transition-all cursor-pointer"
        id="btn-nav-settings"
        title="Configurações"
      >
        <Settings
          size={24}
          className={`${
            activeTab === "settings" ? "text-white scale-110" : "text-white/60 hover:text-white/80"
          } transition-all duration-250`}
        />
        {activeTab === "settings" && (
          <motion.div
            layoutId="activeTabIndicator"
            className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-white"
          />
        )}
      </button>

      </div>
    </div>
  );
}
