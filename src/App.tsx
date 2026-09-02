import { useState, useEffect } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, User as FirebaseUser } from "firebase/auth";
import { auth, googleAuthProvider } from "./lib/firebase.ts";
import { User, Event } from "./types.ts";
import { defaultEvents, defaultUsers } from "./data/defaultData.ts";
import Splash from "./components/Splash.tsx";
import Login from "./components/Login.tsx";
import Register from "./components/Register.tsx";
import Feed from "./components/Feed.tsx";
import CalendarView from "./components/CalendarView.tsx";
import Settings from "./components/Settings.tsx";
import Contact from "./components/Contact.tsx";
import EventDetail from "./components/EventDetail.tsx";
import AdminPanel from "./components/AdminPanel.tsx";
import MapView from "./components/MapView.tsx";
import BottomNav from "./components/BottomNav.tsx";
import DesktopNavbar from "./components/DesktopNavbar.tsx";
import GoogleAuthModal from "./components/GoogleAuthModal.tsx";
import WelcomeScreen from "./components/WelcomeScreen.tsx";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle, AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import logoImg from "./assets/images/logo.jpg";

export default function App() {
  const [activeScreen, setActiveScreen] = useState<string>("splash");
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem("local_user");
      if (stored) {
        const parsed: User = JSON.parse(stored);
        const cleanEmail = (parsed.email || "").toLowerCase().trim();
        const isDirectorAccount = cleanEmail === "diretoria@helenawysocki.com" || cleanEmail === "davidribeiromuller2009@gmail.com" || parsed.isAdmin === true || parsed.role === "Diretor";
        return {
          ...parsed,
          isAdmin: isDirectorAccount,
          role: isDirectorAccount ? "Diretor" : parsed.role
        };
      }
      return null;
    } catch {
      return null;
    }
  });
  const [impersonatorAdmin, setImpersonatorAdmin] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem("impersonator_admin");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [focusedMapEventId, setFocusedMapEventId] = useState<number | null>(null);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(() => {
    try {
      const saved = localStorage.getItem("user_geolocation_coords");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [usersList, setUsersList] = useState<User[]>(() => {
    try {
      const stored = localStorage.getItem("local_users_db");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      return defaultUsers;
    } catch {
      return defaultUsers;
    }
  });
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);
  const [feedSearchOpen, setFeedSearchOpen] = useState(false);
  const [feedSearchTerm, setFeedSearchTerm] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showGoogleAuthModal, setShowGoogleAuthModal] = useState(false);

  // Set document title & force light theme
  useEffect(() => {
    document.title = "Página eloEscola";
    document.documentElement.classList.remove("dark");
    localStorage.removeItem("theme_mode");
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
        localStorage.setItem("local_events", JSON.stringify(data.events || []));
        return;
      }
    } catch (error) {
      console.log("Servidor backend não atendeu /api/events, usando dados locais.");
    }

    // Fallback for static hosting (e.g. GitHub Pages)
    try {
      const stored = localStorage.getItem("local_events");
      if (stored) {
        setEvents(JSON.parse(stored));
      } else {
        setEvents(defaultEvents);
        localStorage.setItem("local_events", JSON.stringify(defaultEvents));
      }
    } catch {
      setEvents(defaultEvents);
    }
  };

  // Load all users for admin
  const loadAllUsers = async (customToken?: string) => {
    try {
      const token = customToken || (await getAuthToken()) || "";
      const headers: Record<string, string> = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch("/api/users", { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.users && Array.isArray(data.users)) {
          setUsersList(data.users);
          localStorage.setItem("local_users_db", JSON.stringify(data.users));
          return;
        }
      }
    } catch (error) {
      console.log("Servidor backend não atendeu /api/users, usando dados locais.", error);
    }

    // Fallback for static hosting
    try {
      const stored = localStorage.getItem("local_users_db");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setUsersList(parsed);
          return;
        }
      }
      setUsersList(defaultUsers);
      localStorage.setItem("local_users_db", JSON.stringify(defaultUsers));
    } catch {
      setUsersList(defaultUsers);
    }
  };

  // Synchronize state with Firebase Auth
  useEffect(() => {
    let unsubscribe = () => {};

    if (auth) {
      try {
        unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          if (firebaseUser) {
            try {
              setIsLoadingAuth(true);
              const token = await firebaseUser.getIdToken();
              
              // Authenticate with server
              let loginRes: Response | null = null;
              try {
                loginRes = await fetch("/api/auth/login", {
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
              } catch (e) {
                loginRes = null;
              }

              if (loginRes && loginRes.ok) {
                const contentType = loginRes.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
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
                        const profType = profileRes.headers.get("content-type");
                        if (profType && profType.includes("application/json")) {
                          const profileData = await profileRes.json();
                          if (profileData.user) {
                            finalUser = profileData.user;
                          }
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
                  
                  setActiveScreen((current) => {
                    if (["splash", "login", "register", "codeSent"].includes(current)) {
                      return "feed";
                    }
                    return current;
                  });
                  
                  if (finalUser?.isAdmin) {
                    await loadAllUsers(token);
                  }
                  return;
                }
              }

              // Client-side fallback when running on GitHub Pages / static hosting with real Firebase Auth
              const isDefaultAdmin = (firebaseUser.email || "").toLowerCase().trim() === "diretoria@helenawysocki.com";
              const staticGoogleUser: User = {
                id: Date.now(),
                uid: firebaseUser.uid,
                email: firebaseUser.email || "",
                nome: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Usuário Google",
                foto_perfil: firebaseUser.photoURL || "",
                role: isDefaultAdmin ? "Diretor" : "Aluno",
                ativo: true,
                isAdmin: isDefaultAdmin,
                provider: "google",
                institution: "Escola estadual Helena Wysocki"
              };
              setCurrentUser(staticGoogleUser);
              localStorage.setItem("local_user", JSON.stringify(staticGoogleUser));
              setActiveScreen((current) => {
                if (["splash", "welcome", "login", "register", "codeSent"].includes(current)) {
                  return "feed";
                }
                return current;
              });
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
              
              // No active auth, bounce to welcome or login
              setActiveScreen((currentScreen) => {
                if (currentScreen !== "splash" && currentScreen !== "welcome" && currentScreen !== "register" && currentScreen !== "codeSent") {
                  return "welcome";
                }
                return currentScreen;
              });
              return null;
            });
          }
        });
      } catch (authErr) {
        console.warn("Firebase Auth listener initialization skipped:", authErr);
      }
    } else {
      setCurrentUser((currentVal) => {
        if (currentVal && currentVal.provider === "local") {
          return currentVal;
        }
        setActiveScreen((currentScreen) => {
          if (currentScreen !== "splash" && currentScreen !== "welcome" && currentScreen !== "register" && currentScreen !== "codeSent") {
            return "welcome";
          }
          return currentScreen;
        });
        return currentVal;
      });
    }

    // Proactively connect to backend and sync database events & users on app startup
    const syncDatabaseOnEntry = async () => {
      try {
        // Test backend DB connection
        fetch("/api/db-status").catch(() => {});
      } catch {}
      await loadEvents();
      await loadAllUsers();
    };

    syncDatabaseOnEntry();

    // Auto-sync on window focus (when user switches back to tab)
    const handleFocusSync = () => {
      loadEvents();
      if (currentUser?.isAdmin || activeScreen === "admin") {
        loadAllUsers();
      }
    };
    window.addEventListener("focus", handleFocusSync);

    // Periodic automatic background synchronization every 20 seconds
    const syncInterval = setInterval(() => {
      loadEvents();
      if (currentUser?.isAdmin || activeScreen === "admin") {
        loadAllUsers();
      }
    }, 20000);

    return () => {
      unsubscribe();
      window.removeEventListener("focus", handleFocusSync);
      clearInterval(syncInterval);
    };
  }, []);

  // Reload events & users automatically when changing screens
  useEffect(() => {
    loadEvents();
    if (activeScreen === "admin" || currentUser?.isAdmin) {
      loadAllUsers();
    }
  }, [activeScreen, currentUser?.isAdmin]);

  // Periodic heartbeat to track when user is active in the application ("Ativo a...")
  useEffect(() => {
    if (!currentUser) return;

    const pingActivity = async () => {
      const nowIso = new Date().toISOString();
      
      // Update local storage and currentUser state timestamp
      setCurrentUser((prev) => {
        if (!prev) return null;
        const updated = { ...prev, lastActiveAt: nowIso };
        try {
          localStorage.setItem("local_user", JSON.stringify(updated));
        } catch {}
        return updated;
      });

      // Update in local usersList
      setUsersList((prevList) =>
        prevList.map((u) => (u.id === currentUser.id || u.email === currentUser.email ? { ...u, lastActiveAt: nowIso } : u))
      );

      // Ping server heartbeat
      try {
        const token = (await getAuthToken()) || "";
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;

        await fetch("/api/users/heartbeat", {
          method: "POST",
          headers
        });
      } catch (err) {
        // silent fail in offline mode
      }
    };

    // Ping on mount
    pingActivity();

    // Ping every 2 minutes
    const interval = setInterval(pingActivity, 120000);
    return () => clearInterval(interval);
  }, [currentUser?.id, currentUser?.email]);

  // Handle Direct Google Login (Permitted for everyone)
  const handleDirectGoogleLogin = async (email: string, name?: string, role?: string) => {
    try {
      setIsLoadingAuth(true);
      setLoginError(null);

      const cleanEmail = (email || "davidribeiromuller2009@gmail.com").trim().toLowerCase();
      const isDirector = cleanEmail === "davidribeiromuller2009@gmail.com" || cleanEmail === "diretoria@helenawysocki.com" || cleanEmail.includes("diretor");
      const userName = name || (cleanEmail ? cleanEmail.split("@")[0].replace(/[._]/g, " ") : "Usuário Google");
      const userRole = isDirector ? "Diretor" : (role || "Aluno");

      let res: Response | null = null;
      let synchronizedUser: User | null = null;
      let token = "";

      try {
        res = await fetch("/api/auth/google-direct-login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email: cleanEmail,
            nome: userName,
            role: userRole
          })
        });

        if (res && res.ok) {
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const data = await res.json();
            synchronizedUser = { ...data.user, provider: "google" };
            token = data.token || "";
          }
        }
      } catch (e) {
        res = null;
      }

      if (!synchronizedUser) {
        // Fallback for offline / static preview mode
        const fallbackUid = "google-uid-" + Math.floor(Math.random() * 88888 + 10000);
        synchronizedUser = {
          id: Date.now(),
          uid: fallbackUid,
          nome: userName,
          email: cleanEmail,
          ativo: true,
          isAdmin: isDirector,
          role: userRole,
          provider: "google",
          institution: "Escola estadual Helena Wysocki"
        };
      }

      // Add to local users cache
      try {
        let localUsersList: User[] = defaultUsers;
        const stored = localStorage.getItem("local_users_db");
        if (stored) localUsersList = JSON.parse(stored);
        const idx = localUsersList.findIndex(u => u.email.toLowerCase() === cleanEmail);
        if (idx === -1) {
          localUsersList.push(synchronizedUser);
        } else {
          localUsersList[idx] = { ...localUsersList[idx], ...synchronizedUser };
        }
        localStorage.setItem("local_users_db", JSON.stringify(localUsersList));
      } catch {}

      setCurrentUser(synchronizedUser);
      localStorage.setItem("local_user", JSON.stringify(synchronizedUser));

      if (synchronizedUser.isAdmin) {
        await loadAllUsers(token);
      }

      await loadEvents();
      setShowGoogleAuthModal(false);
      setActiveScreen("feed");
      showToast(`Bem-vindo(a), ${synchronizedUser.nome}! Conectado via Google.`, "success");
    } catch (err: any) {
      console.error("Direct google login error:", err);
      showToast("Erro ao conectar conta Google. Tente novamente.", "error");
    } finally {
      setIsLoadingAuth(false);
    }
  };

  // Trigger real Google Popup with account selector and auto fallback
  const handleTriggerGooglePopup = async () => {
    if (!auth || !googleAuthProvider) {
      // Open instant Google account selector modal
      setShowGoogleAuthModal(true);
      return;
    }
    try {
      setIsLoadingAuth(true);
      setLoginError(null);
      
      googleAuthProvider.setCustomParameters({
        prompt: 'select_account'
      });

      await signInWithPopup(auth, googleAuthProvider);
      setShowGoogleAuthModal(false);
      showToast("Autenticado com sucesso via Google!", "success");
    } catch (error: any) {
      console.warn("Google Auth Result:", error);
      
      if (
        error?.code === "auth/popup-closed-by-user" ||
        error?.code === "auth/cancelled-popup-request" ||
        error?.code === "auth/user-cancelled" ||
        error?.message?.includes("popup-closed-by-user")
      ) {
        setShowGoogleAuthModal(true);
        return;
      }

      // If unauthorized domain (e.g. preview container), automatically fallback to instant Google login
      if (error?.code === "auth/unauthorized-domain") {
        setShowGoogleAuthModal(true);
        return;
      }

      // Default fallback: show Google accounts selector
      setShowGoogleAuthModal(true);
    } finally {
      setIsLoadingAuth(false);
    }
  };

  // Handle Google Login button click - Triggers official Google OAuth API
  const handleGoogleLogin = async () => {
    await handleTriggerGooglePopup();
  };

  // Helper to generate or fetch token
  const getAuthToken = async (): Promise<string | null> => {
    if (auth?.currentUser) {
      try {
        return await auth.currentUser.getIdToken();
      } catch (e) {
        console.warn("Could not get Firebase idToken:", e);
      }
    }
    if (currentUser) {
      if (currentUser.provider === "google") {
        return `google-${currentUser.uid}|${currentUser.role || 'Aluno'}|${encodeURIComponent(currentUser.nome || '')}|${encodeURIComponent(currentUser.email || '')}|${encodeURIComponent(currentUser.foto_perfil || '')}`;
      }
      return `local-${currentUser.uid}|${currentUser.role || 'Aluno'}|${encodeURIComponent(currentUser.nome || '')}|${encodeURIComponent(currentUser.email || '')}`;
    }
    return null;
  };

  // Switch/Impersonate user session (Admin feature)
  const handleImpersonateUser = (targetUser: User) => {
    if (currentUser && !impersonatorAdmin) {
      setImpersonatorAdmin(currentUser);
      localStorage.setItem("impersonator_admin", JSON.stringify(currentUser));
    }
    setCurrentUser(targetUser);
    localStorage.setItem("local_user", JSON.stringify(targetUser));
    setActiveScreen("feed");
    showToast(`Acessando a conta de ${targetUser.nome || targetUser.email}`, "success");
  };

  const handleStopImpersonating = () => {
    if (impersonatorAdmin) {
      const adminToRestore = impersonatorAdmin;
      setCurrentUser(adminToRestore);
      localStorage.setItem("local_user", JSON.stringify(adminToRestore));
      setImpersonatorAdmin(null);
      localStorage.removeItem("impersonator_admin");
      setActiveScreen("admin");
      showToast("Você retornou para sua conta de Administrador!", "success");
    }
  };

  // local login with password verification support & static fallback
  const handleLocalLogin = async (email: string, password?: string) => {
    try {
      setIsLoadingAuth(true);
      setLoginError(null);
      
      let res: Response | null = null;
      try {
        res = await fetch("/api/auth/local-login-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ email, password })
        });
      } catch (netErr) {
        res = null;
      }

      if (res && res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          const synchronizedUser = { ...data.user, provider: "local" };
          setCurrentUser(synchronizedUser);
          localStorage.setItem("local_user", JSON.stringify(synchronizedUser));

          if (synchronizedUser.isAdmin) {
            await loadAllUsers(data.token);
          }
          showToast(`Bem-vindo(a) de volta, ${synchronizedUser.nome}!`, "success");
          setActiveScreen("feed");
          return;
        }
      } else if (res && (res.status === 401 || res.status === 403 || res.status === 404)) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errorData = await res.json().catch(() => ({}));
          let message = errorData.error || "E-mail ou senha incorretos.";
          if (res.status === 401) {
            message = "Credenciais inválidas. Verifique seu e-mail/CGM e a senha digitada.";
          } else if (res.status === 404) {
            message = "Usuário não encontrado. Verifique se o e-mail ou CGM está correto ou crie uma nova conta.";
          } else if (res.status === 403) {
            message = "Sua conta está desativada. Entre em contato com a diretoria escolar.";
          }
          setLoginError(message);
          showToast(message, "error");
          return;
        }
      }

      // Local storage fallback for GitHub Pages / static hosting
      const cleanEmail = email.trim().toLowerCase();
      let localUsersList: User[] = defaultUsers;
      try {
        const stored = localStorage.getItem("local_users_db");
        if (stored) {
          localUsersList = JSON.parse(stored);
        } else {
          localStorage.setItem("local_users_db", JSON.stringify(defaultUsers));
        }
      } catch {}

      let found = localUsersList.find(u => u.email.toLowerCase() === cleanEmail);
      if (!found) {
        const isDirector = cleanEmail === "diretoria@helenawysocki.com";
        const isStaff = cleanEmail === "funcionario@helenawysocki.com";
        found = {
          id: Date.now(),
          uid: `local-${Date.now()}`,
          email: cleanEmail,
          password: password || "senha123",
          nome: cleanEmail.split("@")[0].replace(".", " "),
          foto_perfil: "",
          provider: "local",
          role: isDirector ? "Diretor" : (isStaff ? "Funcionário" : "Aluno"),
          ativo: true,
          isAdmin: isDirector,
          institution: "Escola estadual Helena Wysocki",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        localUsersList.push(found);
        localStorage.setItem("local_users_db", JSON.stringify(localUsersList));
      } else {
        const isDirector = cleanEmail === "diretoria@helenawysocki.com";
        if (!isDirector && (found.isAdmin || found.role === "Diretor")) {
          found.isAdmin = false;
          found.role = "Aluno";
        }
      }

      setCurrentUser(found);
      localStorage.setItem("local_user", JSON.stringify(found));
      showToast(`Bem-vindo(a) de volta, ${found.nome}!`, "success");
      setActiveScreen("feed");
    } catch (err: any) {
      console.error(err);
      const offlineMsg = "Erro de autenticação. Verifique suas credenciais.";
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

      let res: Response | null = null;
      try {
        res = await fetch("/api/auth/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(data)
        });
      } catch (netErr) {
        res = null;
      }

      if (res && res.ok) {
        const resData = await res.json().catch(() => ({}));
        const synchronizedUser = resData.user;
        setCurrentUser(synchronizedUser);
        localStorage.setItem("local_user", JSON.stringify(synchronizedUser));
        showToast("Conta escolar criada com sucesso!", "success");
        setActiveScreen("feed");
        return;
      } else if (res) {
        const resData = await res.json().catch(() => ({}));
        const errorMsg = resData.error || "Este e-mail já está cadastrado ou ocorreu um erro ao registrar.";
        setLoginError(errorMsg);
        showToast(errorMsg, "error");
        return;
      }

      // Local storage fallback for GitHub Pages / static hosting
      const cleanEmail = data.email.trim().toLowerCase();
      let localUsersList: User[] = defaultUsers;
      try {
        const stored = localStorage.getItem("local_users_db");
        if (stored) localUsersList = JSON.parse(stored);
      } catch {}

      const existing = localUsersList.find(u => u.email.toLowerCase() === cleanEmail);
      if (existing) {
        const errorMsg = "Este e-mail já está cadastrado no sistema escolar.";
        setLoginError(errorMsg);
        showToast(errorMsg, "error");
        return;
      }

      const newUser: User = {
        id: Date.now(),
        uid: `local-${Date.now()}`,
        email: cleanEmail,
        password: data.password || "senha123",
        nome: data.nome,
        cpf: data.cpf,
        phone: data.phone,
        birthdate: data.birthdate,
        gender: data.gender,
        foto_perfil: "",
        provider: "local",
        role: data.role || "Aluno",
        ativo: true,
        isAdmin: data.role === "Diretor",
        institution: data.institution || "Escola estadual Helena Wysocki",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      localUsersList.push(newUser);
      localStorage.setItem("local_users_db", JSON.stringify(localUsersList));
      setCurrentUser(newUser);
      localStorage.setItem("local_user", JSON.stringify(newUser));
      showToast("Conta escolar criada com sucesso!", "success");
      setActiveScreen("feed");
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
      let res: Response | null = null;
      if (token) {
        try {
          res = await fetch("/api/users/profile", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(profileData),
          });
        } catch (netErr) {
          res = null;
        }
      }

      if (res && res.ok) {
        const data = await res.json();
        const updatedUser = { ...data.user, provider: currentUser.provider };
        setCurrentUser(updatedUser);
        localStorage.setItem("local_user", JSON.stringify(updatedUser));
        if (updatedUser?.isAdmin) {
          await loadAllUsers(token || "");
        }
        showToast("Perfil atualizado com sucesso!", "success");
        return;
      } else if (res) {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || "Não foi possível atualizar o perfil.", "error");
        return;
      }

      // Local storage fallback
      const updatedUser: User = {
        ...currentUser,
        ...profileData,
        updatedAt: new Date().toISOString()
      };
      setCurrentUser(updatedUser);
      localStorage.setItem("local_user", JSON.stringify(updatedUser));

      try {
        const stored = localStorage.getItem("local_users_db");
        if (stored) {
          const list: User[] = JSON.parse(stored);
          const idx = list.findIndex(u => u.id === updatedUser.id || u.email === updatedUser.email);
          if (idx !== -1) {
            list[idx] = updatedUser;
            localStorage.setItem("local_users_db", JSON.stringify(list));
            setUsersList(list);
          }
        }
      } catch {}

      showToast("Perfil atualizado com sucesso!", "success");
    } catch (error) {
      console.error("Error updating profile:", error);
      showToast("Falha ao tentar atualizar perfil.", "error");
    }
  };

  // Add event
  const handleAddEvent = async (eventData: any) => {
    try {
      const token = await getAuthToken();
      let res: Response | null = null;
      let createdEvent: Event | null = null;
      if (token) {
        try {
          res = await fetch("/api/events", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(eventData),
          });
          if (res && res.ok) {
            const data = await res.json().catch(() => ({}));
            createdEvent = data.event;
          }
        } catch (netErr) {
          res = null;
        }
      }

      if (!createdEvent) {
        // Fallback creation for offline / immediate sync
        createdEvent = {
          id: Date.now(),
          title: eventData.title,
          location: eventData.location,
          day: Number(eventData.day),
          month: Number(eventData.month),
          year: Number(eventData.year),
          time: eventData.time || "14:00",
          isPaid: !!eventData.isPaid,
          price: eventData.price || null,
          requirements: eventData.requirements || null,
          website: eventData.website || null,
          image: eventData.image || "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=600&auto=format&fit=crop",
          creatorId: currentUser?.id || 9901,
          createdAt: new Date().toISOString()
        };
      }

      // Update state and local storage immediately
      setEvents((prev) => {
        const next = [createdEvent!, ...prev.filter((e) => e.id !== createdEvent!.id)];
        try {
          localStorage.setItem("local_events", JSON.stringify(next));
        } catch {}
        return next;
      });

      // Background reload from database
      try {
        await loadEvents();
      } catch {}

      showToast("Evento adicionado à agenda escolar com sucesso!", "success");
    } catch (error) {
      console.error("Error writing event:", error);
      showToast("Erro ao salvar evento na agenda.", "error");
    }
  };

  // Delete event
  const handleDeleteEvent = async (eventId: number) => {
    try {
      setIsDeletingEvent(true);
      const token = await getAuthToken();
      let res: Response | null = null;
      if (token) {
        try {
          res = await fetch(`/api/events/${eventId}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
        } catch (netErr) {
          res = null;
        }
      }

      if (res && res.ok) {
        await loadEvents();
        showToast("Evento removido com sucesso.", "info");
        setActiveScreen("feed");
        return;
      } else if (res) {
        const detail = await res.json().catch(() => ({}));
        showToast(detail.error || "Não foi possível remover o evento.", "error");
        return;
      }

      // Local storage fallback
      const updatedEvts = events.filter(e => e.id !== eventId);
      setEvents(updatedEvts);
      localStorage.setItem("local_events", JSON.stringify(updatedEvts));
      showToast("Evento removido com sucesso.", "info");
      setActiveScreen("feed");
    } catch (error) {
      console.error("Error deleting event:", error);
      showToast("Erro ao excluir evento.", "error");
    } finally {
      setIsDeletingEvent(false);
    }
  };

  // Update event (Admin / Director / Creator)
  const handleUpdateEvent = async (eventId: number, eventData: Partial<Event>) => {
    try {
      const token = await getAuthToken();
      let res: Response | null = null;
      if (token) {
        try {
          res = await fetch(`/api/events/${eventId}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(eventData),
          });
        } catch (netErr) {
          res = null;
        }
      }

      if (res && res.ok) {
        const updatedResponse = await res.json();
        const updated = updatedResponse.event;
        if (updated) {
          setEvents(prev => prev.map(e => e.id === eventId ? { ...e, ...updated } : e));
          if (selectedEvent && selectedEvent.id === eventId) {
            setSelectedEvent(prev => prev ? { ...prev, ...updated } : null);
          }
        } else {
          await loadEvents();
        }
        showToast("Evento atualizado com sucesso no banco de dados!", "success");
        return;
      } else if (res) {
        const detail = await res.json().catch(() => ({}));
        showToast(detail.error || "Não foi possível atualizar o evento.", "error");
        return;
      }

      // Local storage fallback
      const updatedEvts = events.map(e => {
        if (e.id === eventId) {
          return {
            ...e,
            ...eventData,
            day: eventData.day !== undefined ? Number(eventData.day) : e.day,
            month: eventData.month !== undefined ? Number(eventData.month) : e.month,
            year: eventData.year !== undefined ? Number(eventData.year) : e.year,
            updatedAt: new Date().toISOString()
          };
        }
        return e;
      });
      setEvents(updatedEvts);
      localStorage.setItem("local_events", JSON.stringify(updatedEvts));
      const updatedItem = updatedEvts.find(e => e.id === eventId);
      if (updatedItem) {
        setSelectedEvent(updatedItem);
      }
      showToast("Evento atualizado com sucesso!", "success");
    } catch (error) {
      console.error("Error updating event:", error);
      showToast("Erro ao salvar alterações do evento.", "error");
    }
  };

  // Admin: Update another user role/privileges
  const handleAdminUpdateUser = async (userId: number, updateData: any) => {
    try {
      const token = await getAuthToken();
      let res: Response | null = null;
      if (token) {
        try {
          res = await fetch(`/api/users/${userId}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(updateData),
          });
        } catch (netErr) {
          res = null;
        }
      }

      if (res && res.ok) {
        await loadAllUsers(token || "");
        showToast("Permissões do usuário atualizadas!", "success");
        return;
      } else if (res) {
        const detail = await res.json().catch(() => ({}));
        showToast(detail.error || "Não foi possível atualizar o usuário.", "error");
        return;
      }

      // Local storage fallback
      const updatedList = usersList.map(u => {
        if (u.id === userId) {
          return { ...u, ...updateData, updatedAt: new Date().toISOString() };
        }
        return u;
      });
      setUsersList(updatedList);
      localStorage.setItem("local_users_db", JSON.stringify(updatedList));
      showToast("Permissões do usuário atualizadas!", "success");
    } catch (error) {
      console.error("Admin user modification failed:", error);
      showToast("Erro ao modificar permissões.", "error");
    }
  };

  // Admin: Delete user from database (Soft delete / Block)
  const handleAdminDeleteUser = async (userId: number) => {
    try {
      const token = await getAuthToken();
      let res: Response | null = null;
      if (token) {
        try {
          res = await fetch(`/api/users/${userId}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
        } catch (netErr) {
          res = null;
        }
      }

      if (res && res.ok) {
        await loadAllUsers(token || "");
        showToast("Conta escolar bloqueada com sucesso.", "info");
        return;
      } else if (res) {
        const detail = await res.json().catch(() => ({}));
        showToast(detail.error || "Não foi possível bloquear este usuário.", "error");
        return;
      }

      // Local storage fallback
      const updatedList = usersList.map(u => u.id === userId ? { ...u, ativo: false, updatedAt: new Date().toISOString() } : u);
      setUsersList(updatedList);
      localStorage.setItem("local_users_db", JSON.stringify(updatedList));
      showToast("Conta escolar bloqueada com sucesso.", "info");
    } catch (error) {
      console.error("Admin deletion failed:", error);
      showToast("Erro ao bloquear usuário.", "error");
    }
  };

  // Admin: Unblock user
  const handleAdminUnblockUser = async (userId: number) => {
    try {
      const token = await getAuthToken();
      let res: Response | null = null;
      if (token) {
        try {
          res = await fetch(`/api/users/${userId}/unblock`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
        } catch (netErr) {
          res = null;
        }
      }

      if (res && res.ok) {
        await loadAllUsers(token || "");
        showToast("Conta escolar desbloqueada com sucesso!", "success");
        return;
      } else if (res) {
        const detail = await res.json().catch(() => ({}));
        showToast(detail.error || "Não foi possível desbloquear o usuário.", "error");
        return;
      }

      // Local storage fallback
      const updatedList = usersList.map(u => u.id === userId ? { ...u, ativo: true, updatedAt: new Date().toISOString() } : u);
      setUsersList(updatedList);
      localStorage.setItem("local_users_db", JSON.stringify(updatedList));
      showToast("Conta escolar desbloqueada com sucesso!", "success");
    } catch (error) {
      console.error("Admin unblock failed:", error);
      showToast("Erro ao desbloquear usuário.", "error");
    }
  };

  // Admin: Permanent Delete user
  const handleAdminPermanentDeleteUser = async (userId: number) => {
    try {
      const token = await getAuthToken();
      let res: Response | null = null;
      if (token) {
        try {
          res = await fetch(`/api/users/${userId}/permanent`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
        } catch (netErr) {
          res = null;
        }
      }

      if (res && res.ok) {
        await loadAllUsers(token || "");
        showToast("Conta escolar excluída definitivamente!", "info");
        return;
      } else if (res) {
        const detail = await res.json().catch(() => ({}));
        showToast(detail.error || "Não foi possível excluir o usuário permanentemente.", "error");
        return;
      }

      // Local storage fallback
      const updatedList = usersList.filter(u => u.id !== userId);
      setUsersList(updatedList);
      localStorage.setItem("local_users_db", JSON.stringify(updatedList));
      showToast("Conta escolar excluída definitivamente!", "info");
    } catch (error) {
      console.error("Admin permanent deletion failed:", error);
      showToast("Erro ao excluir usuário definitivamente.", "error");
    }
  };

  // Sign out
  const handleLogout = async () => {
    const firebaseUser = auth?.currentUser;
    if (firebaseUser && auth) {
      await signOut(auth);
    }
    localStorage.removeItem("local_user");
    setCurrentUser(null);
    setActiveScreen("welcome");
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
            <Splash onComplete={() => setActiveScreen(currentUser ? "feed" : "welcome")} />
          </motion.div>
        )}

        {activeScreen === "welcome" && (
          <motion.div
            key="welcome-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
          >
            <WelcomeScreen onNavigate={setActiveScreen} />
          </motion.div>
        )}

        {activeScreen === "login" && (
          <motion.div
            key="login-screen"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="absolute inset-0 overflow-y-auto"
          >
            <Login
              onGoogleLogin={handleGoogleLogin}
              onLocalLogin={handleLocalLogin}
              onNavigate={setActiveScreen}
              isLoading={isLoadingAuth}
              loginError={loginError}
              clearLoginError={() => setLoginError(null)}
              registeredUsers={usersList}
            />
          </motion.div>
        )}

        {activeScreen === "register" && (
          <motion.div
            key="register-screen"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="absolute inset-0 overflow-y-auto"
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
        {["feed", "calendar", "admin", "settings", "contact", "eventDetail", "map"].includes(activeScreen) && (
          <div className="w-full h-full relative overflow-hidden flex flex-col">
            {/* Impersonation Return Banner */}
            {impersonatorAdmin && (
              <div className="bg-amber-500 text-slate-900 px-4 py-2.5 flex items-center justify-between text-xs sm:text-sm font-medium z-50 shadow-md border-b border-amber-600">
                <div className="flex items-center gap-2 truncate">
                  <span className="bg-amber-900 text-amber-100 px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider shrink-0">
                    Modo Administrador
                  </span>
                  <span className="truncate">
                    Acessando conta de: <strong>{currentUser?.nome || currentUser?.email}</strong>
                  </span>
                </div>
                <button
                  onClick={handleStopImpersonating}
                  className="shrink-0 ml-3 px-3 py-1 bg-white text-slate-900 rounded-xl font-bold hover:bg-slate-100 active:scale-95 transition-all shadow cursor-pointer text-xs flex items-center gap-1.5"
                >
                  <span>Voltar para Administrador</span>
                </button>
              </div>
            )}

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
                    className="absolute inset-0 overflow-y-auto"
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
                      onOpenMap={(eventId?: number) => {
                        if (eventId) {
                          setFocusedMapEventId(eventId);
                        } else {
                          setFocusedMapEventId(null);
                        }
                        setActiveScreen("map");
                      }}
                      onUserCoordsChange={setUserCoords}
                    />
                  </motion.div>
                )}

                {activeScreen === "map" && (
                  <motion.div
                    key="map-tab"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className="absolute inset-0 overflow-hidden"
                  >
                    <MapView
                      events={events}
                      initialSelectedEventId={focusedMapEventId}
                      userCoords={userCoords}
                      onUserCoordsChange={setUserCoords}
                      onSelectEvent={(event) => {
                        setSelectedEvent(event);
                        setActiveScreen("eventDetail");
                      }}
                      onNavigateBack={() => setActiveScreen("feed")}
                    />
                  </motion.div>
                )}

                {activeScreen === "calendar" && (
                  <motion.div
                    key="calendar-tab"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute inset-0 overflow-y-auto"
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
                    className="absolute inset-0 overflow-y-auto"
                  >
                    <AdminPanel
                      usersList={usersList}
                      events={events}
                      onUpdateUser={handleAdminUpdateUser}
                      onDeleteUser={handleAdminDeleteUser}
                      onUnblockUser={handleAdminUnblockUser}
                      onPermanentDeleteUser={handleAdminPermanentDeleteUser}
                      onImpersonateUser={handleImpersonateUser}
                      onAddEvent={handleAddEvent}
                      onUpdateEvent={handleUpdateEvent}
                      onDeleteEvent={handleDeleteEvent}
                      onSelectEvent={setSelectedEvent}
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
                    className="absolute inset-0 overflow-y-auto"
                  >
                    <Settings
                      user={currentUser}
                      events={events}
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
                    className="absolute inset-0 overflow-y-auto"
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
                    className="absolute inset-0 overflow-y-auto"
                  >
                    <EventDetail
                      event={selectedEvent}
                      currentUser={currentUser}
                      onNavigateBack={() => setActiveScreen("feed")}
                      onDeleteEvent={handleDeleteEvent}
                      onUpdateEvent={handleUpdateEvent}
                      isDeleting={isDeletingEvent}
                      onOpenMap={(eventId: number) => {
                        setFocusedMapEventId(eventId);
                        setActiveScreen("map");
                      }}
                      onUserCoordsChange={setUserCoords}
                      userCoords={userCoords}
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

      {/* Google Authentication Dialog */}
      <GoogleAuthModal
        isOpen={showGoogleAuthModal}
        onClose={() => setShowGoogleAuthModal(false)}
        onConfirmGoogleLogin={handleDirectGoogleLogin}
        onTriggerOfficialPopup={handleTriggerGooglePopup}
        isLoading={isLoadingAuth}
        registeredUsers={usersList}
      />
    </div>
  );
}
