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
      return stored ? JSON.parse(stored) : null;
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
  const [usersList, setUsersList] = useState<User[]>([]);
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);
  const [feedSearchOpen, setFeedSearchOpen] = useState(false);
  const [feedSearchTerm, setFeedSearchTerm] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showGoogleAuthModal, setShowGoogleAuthModal] = useState(false);

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
        localStorage.setItem("local_users_db", JSON.stringify(data.users || []));
        return;
      }
    } catch (error) {
      console.log("Servidor backend não atendeu /api/users, usando dados locais.");
    }

    // Fallback for static hosting
    try {
      const stored = localStorage.getItem("local_users_db");
      if (stored) {
        setUsersList(JSON.parse(stored));
      } else {
        setUsersList(defaultUsers);
        localStorage.setItem("local_users_db", JSON.stringify(defaultUsers));
      }
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
              const isDefaultAdmin = firebaseUser.email === "davidribeiromuller2009@gmail.com" || firebaseUser.email?.includes("diretor");
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

    loadEvents();
    return () => unsubscribe();
  }, []);

  // Handle Direct Google Login
  const handleDirectGoogleLogin = async (email: string, name?: string) => {
    try {
      setIsLoadingAuth(true);
      setLoginError(null);

      const cleanEmail = (email || "").trim().toLowerCase();
      const userName = name || (cleanEmail ? cleanEmail.split("@")[0].replace(/[._]/g, " ") : "Usuário Google");
      const isDirector = cleanEmail === "davidribeiromuller2009@gmail.com" || cleanEmail === "diretoria@helenawysocki.com" || cleanEmail.includes("diretor");

      let res: Response | null = null;
      try {
        res = await fetch("/api/auth/google-direct-login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email: cleanEmail,
            nome: userName,
            role: isDirector ? "Diretor" : "Aluno"
          })
        });
      } catch (e) {
        res = null;
      }

      if (res && res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          const synchronizedUser = { ...data.user, provider: "google" };
          setCurrentUser(synchronizedUser);
          localStorage.setItem("local_user", JSON.stringify(synchronizedUser));

          if (synchronizedUser.isAdmin) {
            await loadAllUsers(data.token);
          }

          setShowGoogleAuthModal(false);
          setActiveScreen("feed");
          showToast(`Bem-vindo(a), ${synchronizedUser.nome}! Conectado com sucesso.`, "success");
          return;
        }
      }

      // Static fallback for offline/GitHub Pages preview
      const fallbackUid = "google-uid-" + Math.floor(Math.random() * 88888 + 10000);
      const fallbackUser: User = {
        id: Date.now(),
        uid: fallbackUid,
        nome: userName,
        email: cleanEmail,
        ativo: true,
        isAdmin: isDirector,
        role: isDirector ? "Diretor" : "Aluno",
        provider: "google",
        institution: "Escola estadual Helena Wysocki"
      };

      // Add to local users cache
      try {
        let localUsersList: User[] = defaultUsers;
        const stored = localStorage.getItem("local_users_db");
        if (stored) localUsersList = JSON.parse(stored);
        const idx = localUsersList.findIndex(u => u.email.toLowerCase() === cleanEmail);
        if (idx === -1) {
          localUsersList.push(fallbackUser);
        } else {
          localUsersList[idx] = { ...localUsersList[idx], ...fallbackUser };
        }
        localStorage.setItem("local_users_db", JSON.stringify(localUsersList));
      } catch {}

      setCurrentUser(fallbackUser);
      localStorage.setItem("local_user", JSON.stringify(fallbackUser));
      setShowGoogleAuthModal(false);
      setActiveScreen("feed");
      showToast(`Bem-vindo(a), ${fallbackUser.nome}! Conectado via Google.`, "success");
    } catch (err: any) {
      console.error("Direct google login error:", err);
      showToast("Erro ao conectar conta Google. Tente novamente.", "error");
    } finally {
      setIsLoadingAuth(false);
    }
  };

  // Trigger real Google Popup
  const handleTriggerGooglePopup = async () => {
    if (!auth || !googleAuthProvider) {
      showToast("Autenticação direta Google selecionada.", "info");
      return;
    }
    try {
      setIsLoadingAuth(true);
      setLoginError(null);
      await signInWithPopup(auth, googleAuthProvider);
      setShowGoogleAuthModal(false);
    } catch (error: any) {
      if (
        error?.code === "auth/popup-closed-by-user" ||
        error?.code === "auth/cancelled-popup-request" ||
        error?.code === "auth/user-cancelled" ||
        error?.message?.includes("popup-closed-by-user")
      ) {
        return;
      }
      console.warn("Popup error:", error);
      showToast("Janela bloqueada pelo navegador. Use o campo direto do modal.", "warning");
    } finally {
      setIsLoadingAuth(false);
    }
  };

  // Handle Google Login button click
  const handleGoogleLogin = async () => {
    setShowGoogleAuthModal(true);
  };

  // Helper to generate or fetch token
  const getAuthToken = async (): Promise<string | null> => {
    if (auth?.currentUser) {
      return await auth.currentUser.getIdToken();
    }
    if (currentUser && currentUser.provider === "local") {
      return `local-${currentUser.uid}|${currentUser.role}|${encodeURIComponent(currentUser.nome)}|${encodeURIComponent(currentUser.email)}`;
    }
    return null;
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
        const isDirector = cleanEmail.includes("diretor") || cleanEmail === "diretoria@helenawysocki.com";
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
        } catch (netErr) {
          res = null;
        }
      }

      if (res && res.ok) {
        await loadEvents();
        showToast("Evento adicionado à agenda escolar!", "success");
        return;
      } else if (res) {
        const detail = await res.json().catch(() => ({}));
        showToast(detail.error || "Não foi possível criar o evento.", "error");
        return;
      }

      // Local storage fallback
      const newEvt: Event = {
        id: Date.now(),
        title: eventData.title,
        location: eventData.location,
        day: Number(eventData.day),
        month: Number(eventData.month),
        year: Number(eventData.year),
        time: eventData.time || "18:00",
        isPaid: !!eventData.isPaid,
        price: eventData.price || null,
        requirements: eventData.requirements || null,
        website: eventData.website || null,
        image: eventData.image || "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=400",
        creatorId: currentUser?.id || 9901,
        createdAt: new Date().toISOString()
      };

      const currentEvts = [...events, newEvt];
      setEvents(currentEvts);
      localStorage.setItem("local_events", JSON.stringify(currentEvts));
      showToast("Evento adicionado à agenda escolar!", "success");
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

  // Admin: Delete user from database
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
        showToast("Conta escolar removida com sucesso.", "info");
        return;
      } else if (res) {
        const detail = await res.json().catch(() => ({}));
        showToast(detail.error || "Não foi possível remover este usuário.", "error");
        return;
      }

      // Local storage fallback
      const updatedList = usersList.filter(u => u.id !== userId);
      setUsersList(updatedList);
      localStorage.setItem("local_users_db", JSON.stringify(updatedList));
      showToast("Conta escolar removida com sucesso.", "info");
    } catch (error) {
      console.error("Admin deletion failed:", error);
      showToast("Erro ao deletar usuário.", "error");
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
        {["feed", "calendar", "admin", "settings", "contact", "eventDetail", "map"].includes(activeScreen) && (
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
      />
    </div>
  );
}
