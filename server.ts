import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import * as dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

// Load environment variables
dotenv.config();

import { requireAuth, AuthRequest } from "./src/middleware/auth.ts";
import { requireAdmin } from "./src/middleware/admin.ts";
import {
  getOrCreateUser,
  getUserByUid,
  getUserByEmail,
  updateUserByUid,
  updateUserById,
  listAllUsers,
  deleteUserById
} from "./src/db/users.ts";
import {
  listAllEvents,
  createNewEvent,
  deleteEventById
} from "./src/db/events.ts";
import {
  requireSupabaseServerAuth,
  isSupabaseServerConfigured,
  SupabaseRequest
} from "./src/lib/supabase-server.ts";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parsing middleware
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));

  // --- API ROUTES ---

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Supabase/Postgres Database Status Info
  app.get("/api/db-status", async (req, res) => {
    try {
      const isSupabase = !!(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL);
      const host = process.env.SUPABASE_DB_URL ? "Supabase (DB URL)" : (process.env.DATABASE_URL ? "Supabase (Custom URL)" : "Google Cloud SQL / Local");
      
      const { db, isDbCachedOffline, markDbOffline, markDbOnline } = await import("./src/db/index.ts");
      const { sql } = await import("drizzle-orm");
      
      if (isDbCachedOffline()) {
        return res.json({
          active: false,
          provider: isSupabase ? "Supabase (PostgreSQL)" : "Google Cloud SQL (PostgreSQL)",
          host: host,
          version: "Drizzle ORM + PG Node Driver",
          cachedOffline: true,
          error: "Conexão off-line em cache",
          sdkInstalled: true
        });
      }
      
      const queryResult = await db.execute(sql`SELECT 1 as connection_test`);
      const active = !!(queryResult && queryResult.rows && queryResult.rows.length > 0);
      
      if (active) {
        markDbOnline();
      }

      res.json({
        active,
        provider: isSupabase ? "Supabase (PostgreSQL)" : "Google Cloud SQL (PostgreSQL)",
        host: host,
        version: "Drizzle ORM + PG Node Driver",
        sdkInstalled: true
      });
    } catch (error: any) {
      console.warn("[Database] Real-time status test failed:", error.message || error);
      try {
        const { markDbOffline } = await import("./src/db/index.ts");
        markDbOffline();
      } catch (e) {}
      res.json({
        active: false,
        provider: !!(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL) ? "Supabase PostgreSQL (Não conectado)" : "Cloud SQL / Local (Sem conexão)",
        error: error.message || "Erro de conexão",
        sdkInstalled: true
      });
    }
  });

  // Supabase Server SDK Test Endpoint
  app.get("/api/supabase-test", requireSupabaseServerAuth("none"), async (req: SupabaseRequest, res) => {
    try {
      const isConfigured = isSupabaseServerConfigured();
      if (!isConfigured) {
        return res.json({
          configured: false,
          message: "Supabase Server SDK is installed but missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY variables."
        });
      }

      // Check if we can perform a simple request
      const ctx = req.supabaseContext;
      res.json({
        configured: true,
        message: "Supabase Server SDK initialized successfully with context!",
        authMode: ctx?.authMode,
        hasClient: !!req.supabase,
        hasAdminClient: !!req.supabaseAdmin,
      });
    } catch (error: any) {
      res.status(500).json({
        configured: false,
        error: error.message || "Internal error in Supabase server wrapper"
      });
    }
  });

  // Check if email already exists before registration
  app.get("/api/auth/check-email", async (req, res) => {
    try {
      const email = req.query.email as string;
      if (!email) {
        return res.status(400).json({ error: "Email é obrigatório" });
      }
      const user = await getUserByEmail(email);
      res.json({ exists: !!user });
    } catch (error: any) {
      console.error("Erro ao verificar email:", error);
      res.status(500).json({ error: error.message || "Erro ao verificar email" });
    }
  });

  // Dedicated Registration Endpoint with duplicate check
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, nome, cpf, phone, birthdate, gender, institution, role } = req.body;
      const cleanEmail = (email || "").trim().toLowerCase();

      if (!cleanEmail) {
        return res.status(400).json({ error: "O e-mail é obrigatório." });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({ error: "Formato de e-mail inválido." });
      }

      // STRICT DUPLICATE EMAIL CHECK
      const existingUser = await getUserByEmail(cleanEmail);
      if (existingUser) {
        return res.status(400).json({ error: "Este e-mail já está cadastrado no sistema. Por favor, tente fazer login." });
      }

      if (!password || password.length < 3) {
        return res.status(400).json({ error: "A senha precisa ter no mínimo 3 caracteres." });
      }

      const uid = "local-uid-" + Math.floor(Math.random() * 88888 + 10000);
      const newUser = await getOrCreateUser(
        uid,
        cleanEmail,
        nome || cleanEmail.split("@")[0],
        "",
        "local",
        role || "Aluno",
        password
      );

      if (cpf || phone || birthdate || gender || institution) {
        await updateUserByUid(uid, {
          cpf: cpf ? String(cpf).trim() : "",
          phone: phone ? String(phone).trim() : "",
          birthdate: birthdate ? String(birthdate).trim() : "",
          gender: gender ? String(gender).trim() : "",
          institution: institution ? String(institution).trim() : "",
        });
      }

      const token = `local-${uid}|${newUser.role || 'Aluno'}|${encodeURIComponent(newUser.nome || '')}|${encodeURIComponent(cleanEmail)}|${encodeURIComponent(password)}`;

      res.json({ user: newUser, token });
    } catch (error: any) {
      console.error("Erro no registro do usuário:", error);
      res.status(500).json({ error: error.message || "Erro ao realizar o cadastro escolar." });
    }
  });

  // Local password login with database verification
  app.post("/api/auth/local-login-password", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email e senha são obrigatórios" });
      }

      const cleanEmail = email.trim().toLowerCase();
      let user = await getUserByEmail(cleanEmail);
      
      if (!user) {
        return res.status(404).json({ error: "Nenhuma conta cadastrada com este e-mail. Por favor, crie uma conta primeiro." });
      } else {
        if (user.password && user.password !== password) {
          return res.status(401).json({ error: "Senha incorreta. Verifique os dados digitados e tente novamente." });
        }
      }

      // Generate local token matching standard requireAuth middleware expectation
      const token = `local-${user.uid}|${user.role || 'Aluno'}|${encodeURIComponent(user.nome || '')}|${encodeURIComponent(user.email)}`;

      res.json({ user, token });
    } catch (error: any) {
      console.error("Erro no login local por senha:", error);
      res.status(500).json({ error: error.message || "Erro interno no servidor" });
    }
  });

  // Autenticação: Login / Registrar Sincronizado
  app.post("/api/auth/login", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Contexto de autenticação ausente" });
      }

      const uid = req.user.uid || (req.user as any).sub || (req.user as any).user_id;
      const email = req.user.email || req.body?.email || "";
      const name = req.body?.nome || (req.user as any).name || (req.user as any).displayName || (email ? email.split("@")[0] : "Usuário Google");
      const picture = req.body?.foto_perfil || (req.user as any).picture || (req.user as any).photoURL || "";
      const provider = req.user.iss === "local-sim" ? "local" : "google";
      const role = req.body?.role || (req.user as any).role || "Aluno";
      const password = (req.user as any).password;

      if (!uid) {
        return res.status(400).json({ error: "UID não identificado no token de autenticação." });
      }
      
      // Sincroniza o usuário do Firebase/Local com nossa tabela PostgreSQL/Fallback
      const user = await getOrCreateUser(
        uid,
        email,
        name,
        picture,
        provider,
        role,
        password
      );

      res.json({ user });
    } catch (error: any) {
      console.error("Erro no fluxo de login:", error);
      res.status(500).json({ error: error.message || "Falha geral de autenticação" });
    }
  });

  // Autenticação: Obter Perfil do database
  app.get("/api/auth/profile", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Sessão inválida" });
      }

      const dbUser = await getUserByUid(req.user.uid);
      if (!dbUser) {
        return res.status(404).json({ error: "Usuário não encontrado no banco" });
      }

      res.json({ user: dbUser });
    } catch (error: any) {
      console.error("Erro ao obter perfil:", error);
      res.status(500).json({ error: error.message || "Falha ao obter perfil" });
    }
  });

  // Autenticação: Logout
  app.post("/api/auth/logout", (req, res) => {
    res.json({ success: true, message: "Logout realizado com sucesso" });
  });

  // Usuário: Atualizar próprio perfil do app
  app.put("/api/users/profile", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Acesso negado" });
      }

      const { nome, cpf, phone, birthdate, gender, institution, role, foto_perfil } = req.body;

      // Sanitizar dados
      const updateData: any = {};
      if (nome !== undefined) updateData.nome = String(nome).trim();
      if (cpf !== undefined) updateData.cpf = String(cpf).trim();
      if (phone !== undefined) updateData.phone = String(phone).trim();
      if (birthdate !== undefined) updateData.birthdate = String(birthdate).trim();
      if (gender !== undefined) updateData.gender = String(gender).trim();
      if (institution !== undefined) updateData.institution = String(institution).trim();
      if (role !== undefined) updateData.role = String(role).trim();
      if (foto_perfil !== undefined) updateData.foto_perfil = String(foto_perfil).trim();

      const updatedUser = await updateUserByUid(req.user.uid, updateData);
      res.json({ user: updatedUser });
    } catch (error: any) {
      console.error("Erro ao atualizar perfil do usuário:", error);
      res.status(500).json({ error: error.message || "Erro ao salvar perfil" });
    }
  });

  // Administrativo: Listar todos os usuários (Admin ou Diretor apenas)
  app.get("/api/users", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const users = await listAllUsers();
      res.json({ users });
    } catch (error: any) {
      console.error("Erro ao listar usuários dba:", error);
      res.status(500).json({ error: error.message || "Falha ao obter usuários" });
    }
  });

  // Administrativo: Atualizar privilégios ou estado de outro usuário por ID
  app.put("/api/users/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "ID de usuário inválido" });
      }

      const { role, isAdmin, ativo } = req.body;
      const updateData: any = {};
      if (role !== undefined) updateData.role = String(role);
      if (isAdmin !== undefined) updateData.isAdmin = Boolean(isAdmin);
      if (ativo !== undefined) updateData.ativo = Boolean(ativo);

      const dbUser = await getUserByUid(req.user!.uid);
      if (dbUser && dbUser.id === userId && isAdmin === false) {
        return res.status(400).json({ error: "Você não pode remover seus próprios privilégios de administrador" });
      }

      const updatedUser = await updateUserById(userId, updateData);
      res.json({ user: updatedUser });
    } catch (error: any) {
      console.error("Erro ao atualizar privilégios:", error);
      res.status(500).json({ error: error.message || "Erro ao atualizar permissões" });
    }
  });

  // Administrativo: Deletar usuário do database
  app.delete("/api/users/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "ID inválido" });
      }

      // Evitar deletar a si mesmo
      const dbUser = await getUserByUid(req.user!.uid);
      if (dbUser && dbUser.id === userId) {
        return res.status(400).json({ error: "Você não pode deletar sua própria conta escolar ativa" });
      }

      const deletedUser = await deleteUserById(userId);
      res.json({ success: true, user: deletedUser });
    } catch (error: any) {
      console.error("Erro ao excluir usuário:", error);
      res.status(500).json({ error: error.message || "Não foi possível excluir o usuário" });
    }
  });

  // --- EVENTS ENDPOINTS ---

  // Obter Feed de Eventos (Público)
  app.get("/api/events", async (req, res) => {
    try {
      const events = await listAllEvents();
      res.json({ events });
    } catch (error: any) {
      console.error("Erro ao obter eventos:", error);
      res.status(500).json({ error: error.message || "Falha ao obter eventos" });
    }
  });

  // Criar Novo Evento (Qualquer usuário com sessão ativa)
  app.post("/api/events", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { title, location, day, month, year, time, isPaid, price, requirements, website, image } = req.body;

      if (!title || !location || !day || isNaN(month) || !year) {
        return res.status(400).json({ error: "Parâmetros obrigatórios incompletos" });
      }

      const dbUser = await getUserByUid(req.user!.uid);
      const creatorId = dbUser ? dbUser.id : null;

      const newEvent = await createNewEvent({
        title: String(title).trim(),
        location: String(location).trim(),
        day: Number(day),
        month: Number(month),
        year: Number(year),
        time: time ? String(time).trim() : "18:00",
        isPaid: Boolean(isPaid),
        price: price ? String(price).trim() : null,
        requirements: requirements ? String(requirements).trim() : "",
        website: website ? String(website).trim() : null,
        image: image ? String(image).trim() : "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=400",
        creatorId: creatorId || undefined,
      });

      res.status(201).json({ event: newEvent });
    } catch (error: any) {
      console.error("Erro ao criar evento:", error);
      res.status(500).json({ error: error.message || "Erro no salvamento do evento" });
    }
  });

  // Excluir Evento por ID
  app.delete("/api/events/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const eventId = parseInt(req.params.id);
      if (isNaN(eventId)) {
        return res.status(400).json({ error: "ID de evento inválido" });
      }

      // Obter usuário do banco
      const dbUser = await getUserByUid(req.user!.uid);
      if (!dbUser) {
        return res.status(401).json({ error: "Usuário com sessão ativa inválida no banco" });
      }

      // Se for administrador, tem permissão total
      if (dbUser.isAdmin) {
        const deleted = await deleteEventById(eventId);
        return res.json({ success: true, event: deleted });
      }

      // Consultar se o evento pertence a esse criador
      const allEvents = await listAllEvents();
      const targetEvent = allEvents.find(e => e.id === eventId);
      if (!targetEvent) {
        return res.status(404).json({ error: "Evento não encontrado" });
      }

      if (targetEvent.creatorId !== dbUser.id) {
        return res.status(403).json({ error: "Acesso negado: Você não é o criador deste evento" });
      }

      const deleted = await deleteEventById(eventId);
      res.json({ success: true, event: deleted });
    } catch (error: any) {
      console.error("Erro ao deletar evento:", error);
      res.status(500).json({ error: error.message || "Erro na exclusão do evento" });
    }
  });

  // --- AI CHAT ENDPOINT ---
  let aiInstance: any = null;
  function getGenAI() {
    if (!aiInstance) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY não configurada no servidor. Por favor, adicione-a nas configurações.");
      }
      aiInstance = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
    return aiInstance;
  }

  function getHelenaLocalFallback(message: string, eventsList: any[]): string {
    const text = message.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""); // Remove accents

    // Helper to format date
    const formatDate = (e: any) => {
      const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      return `${e.day} de ${months[e.month] || 'Outubro'} de ${e.year}`;
    };

    // 1. Check for specific event match by title keywords
    const matchingEvents = eventsList.filter(e => {
      const titleClean = e.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const keywords = titleClean.split(/\s+/).filter((w: string) => w.length > 3);
      return keywords.some((kw: string) => text.includes(kw)) || titleClean.includes(text);
    });

    if (matchingEvents.length > 0 && text.length > 4) {
      const e = matchingEvents[0];
      return `Encontrei este evento no nosso portal que corresponde à sua busca! 🌟

**${e.title}**
📍 **Local:** ${e.location}
📅 **Data:** ${formatDate(e)}
🕒 **Horário:** ${e.time || "18:00"}
💰 **Tipo:** ${e.isPaid ? `Pago (${e.price || 'R$ 15,00'})` : "Gratuito/Entrada Livre"}
⚠️ **Requisitos:** ${e.requirements || "Livre para todos os estudantes."}
${e.website ? `🌐 **Website do Evento:** [Acesse aqui](${e.website})` : ""}

Espero que goste! Precisa de mais alguma informação sobre as atividades escolares?`;
    }

    // 2. Greetings
    if (/\b(oi|ola|bom dia|boa tarde|boa noite|ola helena|ajuda|quem e voce|quem es tu|ajudar)\b/.test(text)) {
      return `Olá! Eu sou a **Helena**, sua Assistente Virtual inteligente do Portal de Eventos da Escola Estadual Helena Wysocki. 🌟

Estou operando em modo de compatibilidade direta com nossa base de dados local para garantir resposta instantânea para você!

Como posso ajudar? Você pode me perguntar sobre:
- 📅 **Os próximos eventos escolares**
- 🆓 **Eventos gratuitos**
- 💰 **Eventos pagos ou preços de ingressos**
- ⚠️ **Requisitos importantes para participar**
- 💡 **Uma recomendação de atividade bem legal!**

O que você gostaria de explorar hoje?`;
    }

    // 3. Free events query
    if (/\b(gratis|gratuito|sem pagar|0800|de graca)\b/.test(text)) {
      const free = eventsList.filter(e => !e.isPaid);
      if (free.length > 0) {
        return `Temos ótimas notícias! O portal conta com os seguintes **eventos gratuitos** (Entrada Livre):

${free.map((e, idx) => `${idx + 1}. **${e.title}**
   📍 Local: ${e.location}
   📅 Data: ${formatDate(e)} às ${e.time || "18:00"}`).join("\n\n")}

Aproveite para participar e trazer seus colegas! Precisa de detalhes sobre algum deles?`;
      } else {
        return `Atualmente todos os eventos cadastrados em nosso portal requerem inscrição ou taxa de ingresso, ou não temos eventos cadastrados no momento. 

Fique atento ao portal, pois novos eventos gratuitos são adicionados frequentemente!`;
      }
    }

    // 4. Paid/Price events query
    if (/\b(pago|preço|preco|valores|valor|ingresso|quanto custa|custa|pagar)\b/.test(text)) {
      const paid = eventsList.filter(e => e.isPaid);
      if (paid.length > 0) {
        return `Aqui estão os eventos que possuem custos ou taxas de ingresso cadastrados no nosso portal:

${paid.map((e, idx) => `${idx + 1}. **${e.title}**
   💰 Valor: **${e.price || "Inscrição Antecipada"}**
   📍 Local: ${e.location}
   📅 Data: ${formatDate(e)} às ${e.time || "18:00"}`).join("\n\n")}

Lembre-se de realizar a inscrição ou compra antecipada se necessário!`;
      } else {
        return `Atualmente, todos os eventos escolares listados em nosso portal são totalmente **gratuitos** (Entrada Livre)! 

Aproveite esta excelente oportunidade para participar de todas as atividades!`;
      }
    }

    // 5. Requirements
    if (/\b(requisito|requisitos|regras|regra|precisa|levar|documento|restr)\b/.test(text)) {
      const withReqs = eventsList.filter(e => e.requirements && e.requirements.trim().length > 0);
      if (withReqs.length > 0) {
        return `Aqui estão as regras e requisitos de participação importantes para os eventos da escola:

${withReqs.map((e, idx) => `${idx + 1}. **${e.title}**
   ⚠️ Requisito: _${e.requirements}_`).join("\n\n")}

Certifique-se de cumprir os requisitos antes do dia do evento para garantir sua participação!`;
      } else {
        return `Para os eventos atualmente listados no nosso portal, não há nenhum requisito especial exigido! A entrada é livre para todos os estudantes de forma geral. 😊`;
      }
    }

    // 6. Recommendation
    if (/\b(sugere|recomenda|indica|dica|legal|melhor|sugerir|recomendacao)\b/.test(text)) {
      if (eventsList.length > 0) {
        const e = eventsList[Math.floor(Math.random() * eventsList.length)];
        return `Com certeza! Minha principal recomendação hoje é o evento:

⭐ **${e.title}** ⭐
📍 **Onde:** ${e.location}
📅 **Quando:** ${formatDate(e)} às ${e.time || "18:00"}
💰 **Custo:** ${e.isPaid ? `Pago (${e.price || 'R$ 15,00'})` : "Gratuito"}

**Por que eu recomendo?** 
Este evento reúne aprendizado prático, integração e é uma excelente oportunidade para complementar sua jornada escolar e conhecer projetos incríveis desenvolvidos por outros alunos da Escola Helena Wysocki!

Gostou da sugestão ou quer ver outra?`;
      } else {
        return `Como ainda não temos eventos registrados no portal no momento, minha recomendação é que você acompanhe os informativos da secretaria e do nosso feed escolar. Em breve teremos novidades empolgantes por aqui! 📅`;
      }
    }

    // 7. General listing / Upcoming
    if (/\b(agenda|calendario|calendário|proximos|proximo|evento|eventos|atividades|acontecer|listar|quais sao)\b/.test(text)) {
      if (eventsList.length > 0) {
        return `Claro! Aqui está a nossa agenda de eventos cadastrados para a Escola Estadual Helena Wysocki:

${eventsList.slice(0, 5).map((e, idx) => `${idx + 1}. **${e.title}**
   📅 Data: ${formatDate(e)} às ${e.time || "18:00"}
   📍 Local: ${e.location}
   ${e.isPaid ? `💰 Preço: ${e.price || 'R$ 15,00'}` : '🆓 Gratuito'}`).join("\n\n")}

Para saber mais sobre algum deles, basta me perguntar pelo nome ou clicar no evento na tela principal!`;
      } else {
        return `No momento não possuímos nenhum evento escolar cadastrado no nosso calendário de atividades. 📅

Fique atento às atualizações do portal para novidades!`;
      }
    }

    // 8. Contact
    if (/\b(contato|falar|telefone|email|secretaria|diretoria|ajuda)\b/.test(text)) {
      return `Se você precisar falar com a secretaria ou direção da Escola Estadual Helena Wysocki, os canais oficiais de comunicação são:

📞 **Telefone:** (31) 3333-4444 (Secretaria Escolar)
✉️ **E-mail:** secretaria@helenawysocki.com
🏫 **Endereço:** Rua Principal da Educação, nº 100 - Belo Horizonte, MG

Estou à disposição para responder dúvidas sobre o calendário de eventos do portal!`;
    }

    // 9. Catch-all / Conversation
    if (eventsList.length > 0) {
      const e = eventsList[0];
      return `Entendi! Como assistente virtual do Portal de Eventos da Escola Helena Wysocki, posso te ajudar a descobrir tudo sobre as nossas atividades escolares. 🎓

Por exemplo, um dos nossos principais destaques na agenda é o evento **${e.title}**, que vai acontecer no dia **${formatDate(e)}** lá no **${e.location}**.

Você gostaria de saber mais sobre este evento, ver a lista completa de eventos gratuitos, ou quer que eu recomende alguma atividade especial?`;
    } else {
      return `Olá! Entendi sua mensagem, mas atualmente não temos eventos cadastrados no portal para que eu possa pesquisar.

Estou à disposição para tirar qualquer dúvida geral sobre o Portal de Eventos da Escola Helena Wysocki! 😊`;
    }
  }

  app.post("/api/ai/chat", async (req, res) => {
    try {
      const { message, history } = req.body;
      if (!message) {
        return res.status(400).json({ error: "Mensagem é obrigatória" });
      }

      // Obter lista atualizada de eventos para contexto da IA
      let eventsContext = "";
      let eventsList: any[] = [];
      try {
        eventsList = await listAllEvents();
        eventsContext = eventsList.map(e => {
          return `- ID: ${e.id}\n  Título: ${e.title}\n  Local: ${e.location}\n  Data: ${e.day}/${e.month + 1}/${e.year}\n  Horário: ${e.time}\n  Pago: ${e.isPaid ? 'Sim' : 'Não'}${e.price ? `\n  Preço: ${e.price}` : ''}${e.requirements ? `\n  Requisitos: ${e.requirements}` : ''}${e.website ? `\n  Website: ${e.website}` : ''}`;
        }).join("\n\n");
      } catch (dbErr: any) {
        console.warn("Não foi possível carregar eventos para contexto da IA:", dbErr);
        eventsContext = "Nenhum evento cadastrado no momento ou falha de conexão com o banco.";
      }

      try {
        const ai = getGenAI();
        
        // Mapear histórico para o formato do SDK @google/genai
        const contentsHistory = (history || []).map((h: any) => ({
          role: h.role === "user" ? "user" : "model",
          parts: [{ text: h.content }]
        }));

        // Adicionar nova mensagem
        contentsHistory.push({
          role: "user",
          parts: [{ text: message }]
        });

        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: contentsHistory,
          config: {
            systemInstruction: `Você é a "Assistente Helena", a assistente de Inteligência Artificial amigável e prestativa do Portal de Eventos da Escola Estadual Helena Wysocki.
Seu papel é resolver problemas, esclarecer dúvidas e facilitar a procura ou recomendação de certos eventos escolares.

Aqui está a lista oficial e ATUALIZADA de eventos escolares cadastrados no banco de dados em tempo real:
${eventsContext}

Instruções de Comportamento:
- Responda SEMPRE em português do Brasil, de forma acolhedora, educada e empática.
- Seja a mais prestativa possível. Explique as datas de forma amigável, por exemplo: "no dia 12 de Outubro" em vez de "12/9" (lembre-se que o mês guardado no banco de dados é indexado em 0, por isso no mapeamento já foi somado +1 para representar o mês correct).
- Se o usuário perguntar por eventos grátis, liste os que têm "Pago: Não".
- Se o usuário quiser saber o preço, requisitos de participação ou detalhes de um evento específico, forneça tudo o que estiver listado para aquele evento.
- Caso o usuário pergunte algo não relacionado a eventos ou à escola, responda de forma educada, mas lembre-o de que sua especialidade é o Portal de Eventos da Escola Helena Wysocki.
- Use formatação Markdown limpa e estruturada (negritos, listas, emojis) para que as respostas fiquem legíveis e bonitas no chat.`
          }
        });

        if (response && response.text) {
          return res.json({ reply: response.text });
        } else {
          throw new Error("Resposta da API do Gemini vazia.");
        }
      } catch (aiError: any) {
        console.warn("[AI Chat] Falha no provedor de nuvem Gemini, acionando fallback local inteligente:", aiError.message || aiError);
        const reply = getHelenaLocalFallback(message, eventsList);
        return res.json({ reply });
      }
    } catch (error: any) {
      console.error("Erro na API de Chat AI:", error);
      res.status(500).json({ error: error.message || "Erro ao processar conversa com AI" });
    }
  });

  // --- VITE / STATIC SERVING FLOW ---

  // Vite development integration or production bundle serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT} with environment ${process.env.NODE_ENV || "development"}`);
  });
}

startServer();
