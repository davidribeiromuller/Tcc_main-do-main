import { useState } from "react";
import { Search, ChevronDown, LogOut, User as UserIcon, Settings as SettingsIcon, Sun, Moon } from "lucide-react";

interface DesktopNavbarProps {
  activeScreen: string;
  onNavigate: (screen: string) => void;
  currentUser: any;
  onLogout: () => void;
  onSearchClick?: () => void;
  canAccessAdmin?: boolean;
  theme?: "light" | "dark";
  onToggleTheme?: () => void;
}

export default function DesktopNavbar({
  activeScreen,
  onNavigate,
  currentUser,
  onLogout,
  onSearchClick,
  canAccessAdmin,
  theme = "light",
  onToggleTheme
}: DesktopNavbarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const userName = currentUser?.nome || currentUser?.email?.split("@")[0] || "Usuário";
  const hasAdminAccess = Boolean(canAccessAdmin || currentUser?.isAdmin);

  return (
    <header className="hidden md:flex items-center justify-between h-18 px-8 bg-white dark:bg-brand-card-dark border-b border-slate-100 dark:border-white/10 shadow-sm z-50 select-none transition-colors">
      {/* Left side: Logo & Brand Name */}
      <div 
        onClick={() => onNavigate("feed")}
        className="flex items-center gap-3 cursor-pointer group"
      >
        <div className="flex flex-col">
          <span className="font-display font-bold text-slate-800 dark:text-brand-text-dark tracking-tight text-base leading-tight group-hover:text-brand-accent dark:group-hover:text-brand-primary transition-colors">
            Helena Wysocki
          </span>
          <span className="text-[9px] uppercase font-mono tracking-wider text-slate-400 dark:text-slate-400">
            C.E. Helena Wysocki
          </span>
        </div>
      </div>

      {/* Center: Navigation Menu links */}
      <nav className="flex items-center gap-8">
        <button 
          onClick={() => onNavigate("feed")}
          className={`flex items-center gap-1 text-sm font-medium transition-colors cursor-pointer ${
            activeScreen === "feed" 
              ? "text-slate-900 dark:text-white border-b-2 border-brand-accent dark:border-brand-primary pb-0.5" 
              : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          Início
        </button>
        
        <button 
          onClick={() => onNavigate("calendar")}
          className={`flex items-center gap-1 text-sm font-medium transition-colors cursor-pointer ${
            activeScreen === "calendar" 
              ? "text-slate-900 dark:text-white border-b-2 border-brand-accent dark:border-brand-primary pb-0.5" 
              : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          Calendário
        </button>

        {hasAdminAccess && (
          <button 
            onClick={() => onNavigate("admin")}
            className={`flex items-center gap-1 text-sm font-medium transition-colors cursor-pointer ${
              activeScreen === "admin" 
                ? "text-slate-900 dark:text-white border-b-2 border-brand-accent dark:border-brand-primary pb-0.5" 
                : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Painel Admin
          </button>
        )}
      </nav>

      {/* Right side: Search, Theme Toggle, User profile, and Logout button */}
      <div className="flex items-center gap-4">
        {/* Search Icon */}
        <button 
          onClick={onSearchClick}
          className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer transition-colors"
          title="Pesquisar eventos"
          aria-label="Pesquisar"
        >
          <Search size={18} />
        </button>

        {/* Theme Quick Toggle Button */}
        {onToggleTheme && (
          <button
            onClick={onToggleTheme}
            className="p-2 rounded-xl text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title={theme === "dark" ? "Alternar para Modo Claro" : "Alternar para Modo Escuro"}
            aria-label="Alternar tema de cores"
          >
            {theme === "dark" ? (
              <Sun size={18} className="text-amber-400 animate-in fade-in zoom-in-75 duration-200" />
            ) : (
              <Moon size={18} className="text-slate-600 animate-in fade-in zoom-in-75 duration-200" />
            )}
          </button>
        )}

        {/* User profile identifier with dropdown */}
        <div className="relative">
          <button 
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            {currentUser?.foto_perfil ? (
              <img 
                src={currentUser.foto_perfil} 
                alt={userName} 
                referrerPolicy="no-referrer"
                className="w-7 h-7 rounded-full object-cover border border-slate-200 dark:border-white/20"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-brand-primary/20 text-brand-accent dark:text-brand-primary flex items-center justify-center text-[10px] font-bold uppercase border border-brand-primary/30">
                {userName.substring(0, 2)}
              </div>
            )}
            <span className="font-semibold text-xs">{userName.split(" ")[0]}</span>
            <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
          </button>

          {isOpen && (
            <>
              {/* Invisible backdrop to dismiss dropdown */}
              <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
              
              {/* Dropdown list */}
              <div className="absolute right-0 mt-3 w-56 bg-white dark:bg-brand-card-dark border border-slate-100 dark:border-white/15 rounded-2xl shadow-xl py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-4 py-2 border-b border-slate-50 dark:border-white/10">
                  <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Logado como</p>
                  <p className="text-xs font-semibold text-slate-800 dark:text-white truncate">{userName}</p>
                  <p className="text-[10px] text-slate-400 truncate">{currentUser?.email || "Sem e-mail"}</p>
                </div>
                <div className="p-1">
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      onNavigate("settings");
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg transition-colors cursor-pointer text-left ${
                      activeScreen === "settings"
                        ? "bg-slate-50 dark:bg-white/10 text-slate-900 dark:text-white font-medium"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    <SettingsIcon size={14} className="text-slate-400" />
                    <span>Configurações</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsOpen(false);
                      onLogout();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-700 rounded-lg transition-colors cursor-pointer text-left"
                  >
                    <LogOut size={14} />
                    <span>Sair</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Pill-shaped Logout Button */}
        <button 
          onClick={onLogout}
          className="h-9 px-4 bg-[#4daef4] hover:bg-[#3ca3e8] active:scale-97 text-white text-xs font-semibold rounded-full shadow-[0_4px_12px_rgba(77,174,244,0.25)] transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <LogOut size={13} />
          <span>Sair</span>
        </button>
      </div>
    </header>
  );
}
