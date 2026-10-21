import { useState } from "react";
import { Sun, Moon, LogOut, Settings as SettingsIcon, ShieldCheck, Crown, User as UserIcon, Calendar, Home } from "lucide-react";

interface MobileHeaderProps {
  activeScreen: string;
  onNavigate: (screen: string) => void;
  currentUser: any;
  onLogout: () => void;
  theme?: "light" | "dark";
  onToggleTheme?: () => void;
  canAccessAdmin?: boolean;
}

export default function MobileHeader({
  activeScreen,
  onNavigate,
  currentUser,
  onLogout,
  theme = "light",
  onToggleTheme,
  canAccessAdmin
}: MobileHeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const userName = currentUser?.nome || currentUser?.email?.split("@")[0] || "Usuário";
  const userRole = currentUser?.role || "Aluno";
  const isChefe = currentUser?.role === "Diretor" || (currentUser?.isAdmin && !currentUser?.role?.includes("Funcionário"));
  const isFuncionario = !isChefe && (currentUser?.role === "Funcionário" || currentUser?.role === "Professor" || currentUser?.isAdmin);

  const screenTitles: Record<string, string> = {
    feed: "Eventos",
    calendar: "Calendário",
    admin: "Painel Admin",
    settings: "Configurações",
    contact: "Contato",
    eventDetail: "Detalhes do Evento",
    map: "Localização"
  };

  return (
    <header className="md:hidden sticky top-0 z-40 bg-white/95 dark:bg-brand-card-dark/95 backdrop-blur-md border-b border-slate-200/80 dark:border-white/10 px-3.5 py-2.5 shadow-2xs transition-colors select-none">
      <div className="flex items-center justify-between gap-2 max-w-lg mx-auto w-full">
        {/* Left: School brand & current screen */}
        <button
          type="button"
          onClick={() => onNavigate("feed")}
          className="flex items-center gap-2 text-left cursor-pointer active:scale-98 transition-transform"
          id="btn-mobile-brand"
        >
          <div className="w-8 h-8 rounded-xl bg-brand-primary/20 text-brand-accent dark:text-brand-primary flex items-center justify-center font-bold text-xs border border-brand-primary/30 shrink-0">
            HW
          </div>
          <div className="min-w-0">
            <span className="font-display font-bold text-xs text-slate-900 dark:text-white tracking-tight block truncate">
              Helena Wysocki
            </span>
            <span className="text-[10px] text-brand-accent dark:text-brand-primary font-medium block truncate">
              {screenTitles[activeScreen] || "Portal Escolar"}
            </span>
          </div>
        </button>

        {/* Right side: Role badge, Theme Toggle, User Avatar */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Small role indicator pill */}
          {isChefe ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300/80 dark:border-amber-700/80">
              <Crown size={11} className="text-amber-600 dark:text-amber-400" />
              <span className="hidden xs:inline">Chefe</span>
            </span>
          ) : isFuncionario ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              <ShieldCheck size={11} className="text-blue-600 dark:text-blue-400" />
              <span className="hidden xs:inline">Admin</span>
            </span>
          ) : null}

          {/* Theme Toggle Button (Light/Dark) */}
          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95 transition-all cursor-pointer border border-transparent dark:border-white/5"
              title={theme === "dark" ? "Mudar para Modo Claro" : "Mudar para Modo Escuro"}
              aria-label="Alternar tema de cores"
              id="btn-mobile-theme-toggle"
            >
              {theme === "dark" ? (
                <Sun size={17} className="text-amber-400 animate-in fade-in zoom-in-75 duration-200" />
              ) : (
                <Moon size={17} className="text-slate-700 animate-in fade-in zoom-in-75 duration-200" />
              )}
            </button>
          )}

          {/* User Profile Avatar with mini dropdown menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="w-9 h-9 rounded-full bg-brand-primary/20 text-brand-accent dark:text-brand-primary flex items-center justify-center font-bold text-xs uppercase overflow-hidden border border-brand-primary/30 active:scale-95 transition-transform cursor-pointer"
              id="btn-mobile-user-avatar"
              aria-label="Menu do usuário"
            >
              {currentUser?.foto_perfil ? (
                <img
                  src={currentUser.foto_perfil}
                  alt={userName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                userName.slice(0, 2).toUpperCase()
              )}
            </button>

            {/* Backdrop & Dropdown Menu */}
            {isMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40 bg-black/20 backdrop-blur-2xs"
                  onClick={() => setIsMenuOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-brand-card-dark border border-slate-200 dark:border-white/15 rounded-2xl shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150 text-slate-800 dark:text-white">
                  <div className="px-3.5 py-2 border-b border-slate-100 dark:border-white/10">
                    <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Conta Conectada</p>
                    <p className="text-xs font-bold truncate mt-0.5">{userName}</p>
                    <p className="text-[10px] text-slate-400 font-mono truncate">{currentUser?.email || "Sem e-mail"}</p>
                    <div className="mt-1.5 flex items-center gap-1">
                      <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                        {userRole}
                      </span>
                    </div>
                  </div>

                  <div className="p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onNavigate("settings");
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer text-left"
                    >
                      <SettingsIcon size={15} className="text-slate-500 dark:text-slate-400" />
                      <span>Configurações & Perfil</span>
                    </button>

                    {canAccessAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsMenuOpen(false);
                          onNavigate("admin");
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer text-left text-brand-accent dark:text-brand-primary font-semibold"
                      >
                        <ShieldCheck size={15} />
                        <span>Painel Administrativo</span>
                      </button>
                    )}

                    <div className="my-1 border-t border-slate-100 dark:border-white/10" />

                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onLogout();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors cursor-pointer text-left font-semibold"
                    >
                      <LogOut size={15} />
                      <span>Sair da Conta</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
