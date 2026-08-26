import { useState } from "react";
import { Search, ChevronDown, LogOut, User as UserIcon, Settings as SettingsIcon } from "lucide-react";

interface DesktopNavbarProps {
  activeScreen: string;
  onNavigate: (screen: string) => void;
  currentUser: any;
  onLogout: () => void;
  onSearchClick?: () => void;
}

export default function DesktopNavbar({
  activeScreen,
  onNavigate,
  currentUser,
  onLogout,
  onSearchClick
}: DesktopNavbarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const userName = currentUser?.nome || currentUser?.email?.split("@")[0] || "Usuário";

  return (
    <header className="hidden md:flex items-center justify-between h-18 px-8 bg-white border-b border-slate-100 shadow-sm z-50 select-none">
      {/* Left side: Logo & Brand Name */}
      <div 
        onClick={() => onNavigate("feed")}
        className="flex items-center gap-3 cursor-pointer group"
      >
        <div className="flex flex-col">
          <span className="font-display font-bold text-slate-800 tracking-tight text-base leading-tight group-hover:text-brand-accent transition-colors">
            Helena Wysocki
          </span>
          <span className="text-[9px] uppercase font-mono tracking-wider text-slate-400">
            C.E. Helena Wysocki
          </span>
        </div>
      </div>

      {/* Center: Navigation Menu links matching user screenshot style */}
      <nav className="flex items-center gap-8">
        <button 
          onClick={() => onNavigate("feed")}
          className={`flex items-center gap-1 text-sm font-medium transition-colors cursor-pointer ${
            activeScreen === "feed" 
              ? "text-slate-900 border-b-2 border-brand-accent pb-0.5" 
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          Início
        </button>
        
        <button 
          onClick={() => onNavigate("calendar")}
          className={`flex items-center gap-1 text-sm font-medium transition-colors cursor-pointer ${
            activeScreen === "calendar" 
              ? "text-slate-900 border-b-2 border-brand-accent pb-0.5" 
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          Calendário
        </button>

        {currentUser?.isAdmin && (
          <button 
            onClick={() => onNavigate("admin")}
            className={`flex items-center gap-1 text-sm font-medium transition-colors cursor-pointer ${
              activeScreen === "admin" 
                ? "text-slate-900 border-b-2 border-brand-accent pb-0.5" 
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Painel Admin
          </button>
        )}
      </nav>

      {/* Right side: Search icon, User profile link ("Entrar" equivalent), and "Sair" (Logout button) */}
      <div className="flex items-center gap-6">
        {/* Search Icon */}
        <button 
          onClick={onSearchClick}
          className="text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
          title="Pesquisar eventos"
        >
          <Search size={18} />
        </button>

        {/* User profile identifier ("Entrar" equivalent) with relative container for dropdown */}
        <div className="relative">
          <button 
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
          >
            {currentUser?.foto_perfil ? (
              <img 
                src={currentUser.foto_perfil} 
                alt={userName} 
                referrerPolicy="no-referrer"
                className="w-6 h-6 rounded-full object-cover border border-slate-100"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-semibold text-slate-600 uppercase">
                {userName.substring(0, 2)}
              </div>
            )}
            <span>{userName.split(" ")[0]}</span>
            <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
          </button>

          {isOpen && (
            <>
              {/* Invisible backdrop to dismiss dropdown */}
              <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
              
              {/* Dropdown list */}
              <div className="absolute right-0 mt-3 w-56 bg-white border border-slate-100 rounded-2xl shadow-xl py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-4 py-2 border-b border-slate-50">
                  <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Logado como</p>
                  <p className="text-xs font-semibold text-slate-800 truncate">{userName}</p>
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
                        ? "bg-slate-50 text-slate-900 font-medium"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
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
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 rounded-lg transition-colors cursor-pointer text-left"
                  >
                    <LogOut size={14} />
                    <span>Sair</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Pill-shaped Logout Button ("Cadastre-se grátis" design equivalent) */}
        <button 
          onClick={onLogout}
          className="h-10 px-6 bg-[#4daef4] hover:bg-[#3ca3e8] active:scale-97 text-white text-sm font-medium rounded-full shadow-[0_4px_12px_rgba(77,174,244,0.25)] transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <LogOut size={14} />
          <span>Sair</span>
        </button>
      </div>
    </header>
  );
}
