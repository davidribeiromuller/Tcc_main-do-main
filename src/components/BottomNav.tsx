import { motion } from "motion/react";
import { Home, Calendar, Settings, ShieldAlert, ShieldCheck } from "lucide-react";

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isAdmin: boolean;
}

export default function BottomNav({ activeTab, onTabChange, isAdmin }: BottomNavProps) {
  const navItems = [
    {
      id: "feed",
      label: "Início",
      icon: Home,
    },
    {
      id: "calendar",
      label: "Calendário",
      icon: Calendar,
    },
    ...(isAdmin
      ? [
          {
            id: "admin",
            label: "Painel ADM",
            icon: ShieldCheck,
          },
        ]
      : []),
    {
      id: "settings",
      label: "Ajustes",
      icon: Settings,
    },
  ];

  return (
    <nav
      aria-label="Navegação inferior mobile"
      className="fixed bottom-0 left-0 right-0 md:hidden bg-white/95 dark:bg-brand-card-dark/95 backdrop-blur-md pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] px-3 border-t border-slate-200 dark:border-white/10 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.5)] z-50 transition-colors select-none"
    >
      <div className="max-w-md mx-auto flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={`relative flex flex-col items-center justify-center py-1.5 px-3 rounded-2xl min-w-[64px] min-h-[48px] focus:outline-none transition-all cursor-pointer active:scale-95 ${
                isActive
                  ? "text-brand-accent dark:text-brand-primary font-bold"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
              id={`btn-nav-${item.id}`}
              title={item.label}
              aria-current={isActive ? "page" : undefined}
            >
              <div className="relative">
                <Icon
                  size={20}
                  className={`transition-transform duration-200 ${
                    isActive ? "scale-110 stroke-[2.4]" : "stroke-[1.8]"
                  }`}
                />
                {isActive && (
                  <motion.div
                    layoutId="activeBottomTabPill"
                    className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-brand-accent dark:bg-brand-primary"
                    transition={{ type: "spring", stiffness: 450, damping: 30 }}
                  />
                )}
              </div>
              <span className={`text-[11px] mt-1 leading-tight tracking-tight truncate ${isActive ? "font-bold" : "font-medium"}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
