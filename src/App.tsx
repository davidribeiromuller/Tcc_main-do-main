import { useState, useEffect } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, User as FirebaseUser } from "firebase/auth";
import { auth, googleAuthProvider } from "./lib/firebase.ts";
import { User, Event } from "./types.ts";
import Splash from "./components/Splash.tsx";
import Login from "./components/Login.tsx";
import Register from "./components/Register.tsx";
import Feed from "./components/Feed.tsx";
import CalendarView from "./components/CalendarView.tsx";
import Settings from "./components/Settings.tsx";
import Contact from "./components/Contact.tsx";
import EventDetail from "./components/EventDetail.tsx";
import AdminPanel from "./components/AdminPanel.tsx";
import BottomNav from "./components/BottomNav.tsx";
import DesktopNavbar from "./components/DesktopNavbar.tsx";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle, AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import logoImg from "./assets/images/logo.jpg";

export default function App() {
  const [activeScreen, setActiveScreen] = useState<string>("splash");
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem("local_user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);
  const [feedSearchOpen, setFeedSearchOpen] = useState(false);
  const [feedSearchTerm, setFeedSearchTerm] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  // Set document title
  useEffect(() => {
    document.title = "Página eloEscola";
  }, []);

  // Toast notification system
  const [toast, setToast] = useState<{ message: string; type: "error" | "success" | "warning" | "info" } | null>(null);

  const showToast = (message: string, type: "error" | "success" | "warning" | "info" = "error") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((current) => (current?.message === message ? null : current));
    }, 4500);
  };

  // Load events
  const loadEvents = async () => {
    try {
      const res = await fetch("/api/events");
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch (error) {
      console.error("Error loading events from backend:", error);
    }
  };

  // Load all users for admin
  const loadAllUsers = async (token: string) => {
    try {
      const res = await fetch("/api/users", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setUsersList(data.users || []);
      }
    } catch (error) {
      console.error("Error loading users list from backend:", error);
    }
  };

  // Synchronize state with Firebase Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          setIsLoadingAuth(true);
          const token = await firebaseUser.getIdToken();
          
          // Authenticate with server
          const loginRes = await fetch("/api/auth/login", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              email: firebaseUser.email || "",
              nome: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Usuário Google",
              foto_perfil: firebaseUser.photoURL || "",
              role: "Aluno"
            })
          });

          if (loginRes.ok) {
            const data = await loginRes.json();
            let finalUser = data.user;

            // Detect new/existing Google users and automatically register/sync them via /api/users/profile
            if (finalUser && finalUser.provider === "google") {
              try {
                const profileRes = await fetch("/api/users/profile", {
                  method: "PUT",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    nome: finalUser.nome || firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Usuário Google",
                    foto_perfil: finalUser.foto_perfil || firebaseUser.photoURL || "",
                    role: finalUser.role || "Aluno",
                    institution: finalUser.institution || "Escola estadual Helena Wysocki"
                  }),
                });

                if (profileRes.ok) {
                  const profileData = await profileRes.json();
                  if (profileData.user) {
                    finalUser = profileData.user;
                  }
                }
              } catch (profileErr) {
                console.error("Auto profile registration failed:", profileErr);
              }
            }

            setCurrentUser(finalUser);
            if (finalUser) {
              localStorage.setItem("local_user", JSON.stringify(finalUser));
            }
            
            // Only redirect to feed if translating from landing/auth screens
            setActiveScreen((current) => {
              if (["splash", "login", "register", "codeSent"].includes(current)) {
                return "feed";
              }
              return current;
            });
            
            // If user is admin, fetch user list
            if (finalUser?.isAdmin) {
              await loadAllUsers(token);
            }
          }
        } catch (error) {
          console.error("Failed server synchronization:", error);
        } finally {
          setIsLoadingAuth(false);
        }
      } else {
        // Safe check for local simulation login (CGM accounts don't use Firebase Auth)
        setCurrentUser((currentVal) => {
          if (currentVal && currentVal.provider === "local") {
            // Retain local session
            return currentVal;
          }
          
          // No active auth, bounce to login
          setActiveScreen((currentScreen) => {
            if (currentScreen !== "splash" && currentScreen !== "register" && currentScreen !== "codeSent") {
              return "login";
            }
            return currentScreen;
          });
          return null;
        });
      }
    });

    loadEvents();
    return () => unsubscribe();
  }, []);

  // Handle Google Login Popup
  const handleGoogleLogin = async () => {
    try {
      setIsLoadingAuth(true);
      setLoginError(null);
      await signInWithPopup(auth, googleAuthProvider);
    } catch (error: any) {
      if (
        error?.code === "auth/popup-closed-by-user" ||
        error?.code === "auth/cancelled-popup-request" ||
        error?.code === "auth/user-cancelled" ||
        error?.message?.includes("popup-closed-by-user")
      ) {
        console.log("Login com Google cancelado pelo usuário.");
        return;
      }
      
      let errorMsg = "Erro na autenticação com o Google. Por favor, tente novamente.";
      if (error?.code === "auth/popup-blocked") {
        errorMsg = "O seu navegador bloqueou a janela pop-up do Google. Por favor, permita pop-ups para este site e tente novamente.";
      } else if (error?.code === "auth/network-request-failed") {
        errorMsg = "Falha de conexão com a internet. Verifique sua rede e tente novamente.";
      } else if (error?.code === "auth/account-exists-with-different-credential") {
        errorMsg = "Esta conta já está cadastrada com outro método de login (e-mail e senha).";
      } else if (error?.code === "auth/unauthorized-domain") {
        errorMsg = "Este domínio não está autorizado no Firebase. Entre em contato com a administração.";
      }

      console.error("Google sign in failed:", error);
      setLoginError(errorMsg);
      showToast(errorMsg, "error");
    } finally {
      setIsLoadingAuth(false);
    }
  };

  // Helper to generate or fetch token
  const getAuthToken = async (): Promise<string | null> => {
    if (auth.currentUser) {
      return await auth.currentUser.getIdToken();
    }
    if (currentUser && currentUser.provider === "local") {
      return `local-${currentUser.uid}|${currentUser.role}|${encodeURIComponent(currentUser.nome)}|${encodeURIComponent(currentUser.email)}`;
    }
    return null;
  };

  // local login with password verification support
  const handleLocalLogin = async (email: string, password?: string) => {
    try {
      setIsLoadingAuth(true);
      setLoginError(null);
      
      const res = await fetch("/api/auth/local-login-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      if (res.ok) {
        const data = await res.json();
        const synchronizedUser = { ...data.user, provider: "local" };
        setCurrentUser(synchronizedUser);
        localStorage.setItem("local_user", JSON.stringify(synchronizedUser));

        if (synchronizedUser.isAdmin) {
          await loadAllUsers(data.token);
        }
        showToast(`Bem-vindo(a) de volta, ${synchronizedUser.nome}!`, "success");
        setActiveScreen("feed");
      } else {
        const errorData = await res.json().catch(() => ({}));
        let message = errorData.error || "E-mail ou senha incorretos.";
        if (res.status === 401) {
          message = "Credenciais inválidas. Verifique seu e-mail/CGM e a senha digitada.";
        } else if (res.status === 404) {
          message = "Usuário não encontrado. Verifique se o e-mail ou CGM está correto ou crie uma nova conta.";
        } else if (res.status === 403) {
          message = "Sua conta está desativada. Entre em contato com a diretoria escolar.";
        } else if (res.status >= 500) {
          message = "Servidor indisponível no momento. Tente novamente em instantes.";
        }
        setLoginError(message);
        showToast(message, "error");
      }
    } catch (err: any) {
      console.error(err);
      const offlineMsg = "Erro ao conectar ao servidor. Verifique sua conexão com a internet.";
      setLoginError(offlineMsg);
      showToast(offlineMsg, "error");
    } finally {
      setIsLoadingAuth(false);
    }
  };

  // Perform Register user details
  const handleRegister = async (data: {
    nome: string;
    email: string;
    password?: string;
    cpf: string;
    phone: string;
    birthdate: string;
    gender: string;
    role: string;
    institution: string;
  }) => {
    try {
      setIsLoadingAuth(true);
      setLoginError(null);

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
      });

      const resData = await res.json().catch(() => ({}));

      if (res.ok) {
        const synchronizedUser = resData.user;
        setCurrentUser(synchronizedUser);
        localStorage.setItem("local_user", JSON.stringify(synchronizedUser));
        showToast("Conta escolar criada com sucesso!", "success");
        setActiveScreen("feed");
      } else {
        const errorMsg = resData.error || "Este e-mail já está cadastrado ou ocorreu um erro ao registrar.";
        setLoginError(errorMsg);
        showToast(errorMsg, "error");
      }
    } catch (err: any) {
      const errorMsg = "Erro de conexão ao realizar cadastro escolar. Tente novamente.";
      setLoginError(errorMsg);
      showToast(errorMsg, "error");
    } finally {
      setIsLoadingAuth(false);
    }
  };

  // Update own user profile
  const handleUpdateProfile = async (profileData: any) => {
    if (!currentUser) return;

    try {
      const token = await getAuthToken();
      if (!token) {
        showToast("Sessão expirada. Por favor, faça login novamente.", "warning");
        return;
      }

      const res = await fetch("/api/users/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(profileData),
      });

      if (res.ok) {
        const data = await res.json();
        const updatedUser = { ...data.user, provider: currentUser.provider };
        setCurrentUser(updatedUser);
        localStorage.setItem("local_user", JSON.stringify(updatedUser));
        if (updatedUser?.isAdmin) {
          await loadAllUsers(token);
        }
        showToast("Perfil atualizado com sucesso!", "success");
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || "Não foi possível atualizar o perfil. Verifique os dados.", "error");
      }
    } catch (error) {
      console.error("Error updating profile:", error);
      showToast("Falha de rede ao tentar atualizar perfil.", "error");
    }
  };

  // Add event
  const handleAddEvent = async (eventData: any) => {
    try {
      const token = await getAuthToken();
      if (!token) {
        showToast("Sessão inválida. Por favor, entre na sua conta.", "warning");
        return;
      }

      const res = await fetch("/api/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(eventData),
      });

      if (res.ok) {
        await loadEvents();
        showToast("Evento adicionado permanentemente à agenda escolar!", "success");
      } else {
        const detail = await res.json().catch(() => ({}));
        showToast(detail.error || "Não foi possível criar o evento. Permissão negada ou dados inválidos.", "error");
      }
    } catch (error) {
      console.error("Error writing event:", error);
      showToast("Erro de conexão ao salvar evento na agenda.", "error");
    }
  };

  // Delete event
  const handleDeleteEvent = async (eventId: number) => {
    try {
      setIsDeletingEvent(true);
      const token = await getAuthToken();
      if (!token) {
        showToast("Sessão expirada.", "warning");
        return;
      }

      const res = await fetch(`/api/events/${eventId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        await loadEvents();
        showToast("Evento removido com sucesso.", "info");
        setActiveScreen("feed");
      } else {
        const detail = await res.json().catch(() => ({}));
        showToast(detail.error || "Não foi possível remover o evento. Apenas diretores/criadores podem excluir.", "error");
      }
    } catch (error) {
      console.error("Error deleting event:", error);
      showToast("Erro ao conectar ao servidor para excluir evento.", "error");
    } finally {
      setIsDeletingEvent(false);
    }
  };

  // Admin: Update another user role/privileges
  const handleAdminUpdateUser = async (userId: number, updateData: any) => {
    try {
      const token = await getAuthToken();
      if (!token) return;

      const res = await fetch(`/api/users/${userId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updateData),
      });

      if (res.ok) {
        await loadAllUsers(token);
        showToast("Permissões do usuário atualizadas com sucesso!", "success");
      } else {
        const detail = await res.json().catch(() => ({}));
        showToast(detail.error || "Não foi possível atualizar o usuário.", "error");
      }
    } catch (error) {
      console.error("Admin user modification failed:", error);
      showToast("Erro de conexão ao modificar permissões.", "error");
    }
  };

  // Admin: Delete user from database
  const handleAdminDeleteUser = async (userId: number) => {
    try {
      const token = await getAuthToken();
      if (!token) return;

      const res = await fetch(`/api/users/${userId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        await loadAllUsers(token);
        showToast("Conta escolar removida com sucesso.", "info");
      } else {
        const detail = await res.json().catch(() => ({}));
        showToast(detail.error || "Não foi possível remover este usuário.", "error");
      }
    } catch (error) {
      console.error("Admin deletion failed:", error);
      showToast("Erro de conexão ao deletar usuário.", "error");
    }
  };

  // Sign out
  const handleLogout = async () => {
    const firebaseUser = auth.currentUser;
    if (firebaseUser) {
      await signOut(auth);
    }
    localStorage.removeItem("local_user");
    setCurrentUser(null);
    setActiveScreen("login");
  };

  return (
    <div
      id="app-root-container"
      className="app-viewport relative flex flex-col justify-between bg-brand-bg-light text-brand-text-light"
    >
      <AnimatePresence mode="wait">
        
        {activeScreen === "splash" && (
          <motion.div
            key="splash-screen"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
          >
            <Splash onComplete={() => setActiveScreen("login")} />
          </motion.div>
        )}

        {activeScreen === "login" && (
          <motion.div
            key="login-screen"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="absolute inset-0"
          >
            <Login
              onGoogleLogin={handleGoogleLogin}
              onLocalLogin={handleLocalLogin}
              onNavigate={setActiveScreen}
              isLoading={isLoadingAuth}
              loginError={loginError}
              clearLoginError={() => setLoginError(null)}
            />
          </motion.div>
        )}

        {activeScreen === "register" && (
          <motion.div
            key="register-screen"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="absolute inset-0"
          >
            <Register
              onRegister={handleRegister}
              onNavigate={setActiveScreen}
            />
          </motion.div>
        )}

        {activeScreen === "codeSent" && (
          <motion.div
            key="code-sent-confirmation"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col justify-center items-center p-6 text-center"
          >
            <div className="bg-emerald-100 dark:bg-emerald-950/20 text-emerald-600 p-5 rounded-full mb-4">
              <CheckCircle size={48} className="stroke-2" />
            </div>
            <h2 className="text-xl font-display font-medium">Código Enviado!</h2>
            <p className="text-xs text-slate-500 max-w-xs leading-relaxed mt-2">
              Encaminhamos seu código para o email escolar associado. Se estiver cadastrado, deverá receber em instantes.
            </p>
            <button
              onClick={() => setActiveScreen("login")}
              className="mt-6 w-full max-w-xs h-11 bg-brand-primary text-white font-semibold rounded-2xl flex items-center justify-center cursor-pointer shadow-sm hover:scale-102 active:scale-98 transition-all"
            >
              Voltar ao Login
            </button>
          </motion.div>
        )}

        {/* LOGGED IN NAVIGATION SHELLS */}
        {["feed", "calendar", "admin", "settings", "contact", "eventDetail"].includes(activeScreen) && (
          <div className="w-full h-full relative overflow-hidden flex flex-col">
            <DesktopNavbar 
              activeScreen={activeScreen} 
              onNavigate={setActiveScreen} 
              currentUser={currentUser} 
              onLogout={handleLogout} 
              onSearchClick={() => {
                setActiveScreen("feed");
                setFeedSearchOpen((prev) => !prev);
              }}
            />
            
            <div className="flex-1 w-full overflow-hidden relative">
              <AnimatePresence mode="wait">
                {activeScreen === "feed" && (
                  <motion.div
                    key="feed-tab"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute inset-0 overflow-hidden"
                  >
                    <Feed
                      events={events}
                      onSelectEvent={(event) => {
                        setSelectedEvent(event);
                        setActiveScreen("eventDetail");
                      }}
                      onNavigate={setActiveScreen}
                      isAdmin={currentUser?.isAdmin || false}
                      currentUser={currentUser}
                      searchOpen={feedSearchOpen}
                      setSearchOpen={setFeedSearchOpen}
                      searchTerm={feedSearchTerm}
                      setSearchTerm={setFeedSearchTerm}
                    />
                  </motion.div>
                )}

                {activeScreen === "calendar" && (
                  <motion.div
                    key="calendar-tab"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute inset-0 overflow-hidden"
                  >
                    <CalendarView
                      events={events}
                      onAddEvent={handleAddEvent}
                      onSelectEvent={(event) => {
                        setSelectedEvent(event);
                        setActiveScreen("eventDetail");
                      }}
                      userRole={currentUser?.role}
                      currentUser={currentUser}
                      onNavigate={setActiveScreen}
                    />
                  </motion.div>
                )}

                {activeScreen === "admin" && (
                  <motion.div
                    key="admin-tab"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute inset-0 overflow-hidden"
                  >
                    <AdminPanel
                      usersList={usersList}
                      onUpdateUser={handleAdminUpdateUser}
                      onDeleteUser={handleAdminDeleteUser}
                      currentUser={currentUser}
                    />
                  </motion.div>
                )}

                {activeScreen === "settings" && (
                  <motion.div
                    key="settings-tab"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute inset-0 overflow-hidden"
                  >
                    <Settings
                      user={currentUser}
                      onUpdateProfile={handleUpdateProfile}
                      onNavigate={setActiveScreen}
                      onLogout={handleLogout}
                    />
                  </motion.div>
                )}

                {activeScreen === "contact" && (
                  <motion.div
                    key="contact-view"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="absolute inset-0 overflow-hidden"
                  >
                    <Contact onNavigate={setActiveScreen} />
                  </motion.div>
                )}

                {activeScreen === "eventDetail" && selectedEvent && (
                  <motion.div
                    key="event-detail-view"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute inset-0 overflow-hidden"
                  >
                    <EventDetail
                      event={selectedEvent}
                      currentUser={currentUser}
                      onNavigateBack={() => setActiveScreen("feed")}
                      onDeleteEvent={handleDeleteEvent}
                      isDeleting={isDeletingEvent}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Bottom Menu Navigation Footer */}
            {["feed", "calendar", "admin", "settings"].includes(activeScreen) && (
              <BottomNav
                activeTab={activeScreen}
                onTabChange={setActiveScreen}
                isAdmin={currentUser?.isAdmin || false}
              />
            )}
          </div>
        )}

      </AnimatePresence>

      {/* Floating Toast Notification Bar */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[90%] sm:w-auto min-w-[280px]"
          >
            <div
              className={`p-4 rounded-2xl shadow-xl border flex items-start gap-3 backdrop-blur-md ${
                toast.type === "error"
                  ? "bg-red-500/95 text-white border-red-600"
                  : toast.type === "success"
                  ? "bg-emerald-600/95 text-white border-emerald-700"
                  : toast.type === "warning"
                  ? "bg-amber-500/95 text-white border-amber-600"
                  : "bg-slate-800/95 text-white border-slate-700"
              }`}
            >
              {toast.type === "error" && <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />}
              {toast.type === "success" && <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />}
              {toast.type === "warning" && <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />}
              {toast.type === "info" && <Info className="w-5 h-5 shrink-0 mt-0.5" />}

              <div className="flex-1 text-xs font-medium leading-relaxed pr-1">
                {toast.message}
              </div>

              <button
                type="button"
                onClick={() => setToast(null)}
                className="opacity-80 hover:opacity-100 p-0.5 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
