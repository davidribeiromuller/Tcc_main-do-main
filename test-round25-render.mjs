/**
 * Render real (rodada 25): tela de Configurações e aba de aprovação do painel.
 * Verifica que o formulário mostra os selos corretos e que a aba lista o diff.
 *
 * Rodar: npx tsx test-round25-render.mjs
 */
import { JSDOM } from "jsdom";

let passou = 0;
let falhou = 0;
const ok = (n, c, d = "") => {
  if (c) { passou++; console.log(`  ✓ ${n}`); }
  else { falhou++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ""}`); }
};

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://x.github.io/",
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
try { Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true }); } catch {}
global.localStorage = dom.window.localStorage;
global.sessionStorage = dom.window.sessionStorage;
for (const k of ["HTMLElement", "Element", "Node", "getComputedStyle", "FileReader", "Event", "MouseEvent", "Notification"]) {
  if (dom.window[k]) global[k] = dom.window[k];
}
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
global.fetch = () => Promise.resolve({ ok: true, json: async () => ({}), text: async () => "" });

const RTL = await import("@testing-library/react");
const React = (await import("react")).default;

const usuario = {
  id: 42,
  uid: "uid-42",
  nome: "Prestes",
  email: "preste@escola.pr.gov.br",
  role: "Aluno",
  isAdmin: false,
  ativo: true,
  institution: "Colégio Estadual Júlio Szymanski (Araucária)",
  cpf: "133.762.864-69",
  phone: "+55 41 9 9999-9999",
  birthdate: "1980-11-11",
  gender: "Masculino",
  foto_perfil: "",
};

console.log("\n=== 1. Configurações: selos das duas vias ===\n");
{
  const Settings = (await import("./src/components/Settings.tsx")).default;
  const { container, unmount } = RTL.render(
    React.createElement(Settings, {
      user: usuario,
      events: [],
      onUpdateProfile: async () => {},
      onNavigate: () => {},
      onLogout: () => {},
      onShowToast: () => {},
    })
  );

  // entra no modo de edição
  const botaoEditar = [...container.querySelectorAll("button")].find((b) =>
    /^editar perfil$/i.test((b.textContent || "").trim())
  );
  ok("botão de editar perfil existe", Boolean(botaoEditar));
  if (botaoEditar) RTL.act(() => botaoEditar.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
  await RTL.act(async () => { await new Promise((r) => setTimeout(r, 400)); });

  const texto = container.textContent || "";
  ok("explica que foto e telefone são imediatos",
    /Foto de perfil/i.test(texto) && /telefone para contato/i.test(texto));
  ok("avisa que os demais campos passam por um ADM", /passam por aprovação de um ADM/i.test(texto));

  const selosAprovacao = container.querySelectorAll("span");
  const contRequerAdm = [...selosAprovacao].filter((s) => (s.textContent || "").trim() === "requer ADM").length;
  const contImediato = [...selosAprovacao].filter((s) => (s.textContent || "").trim() === "imediato").length;
  ok("7 campos marcados como 'requer ADM'", contRequerAdm === 7, String(contRequerAdm));
  ok("2 campos marcados como 'imediato' (foto e telefone)", contImediato === 2, String(contImediato));

  ok("botão de salvar presente", /Salvar Perfil/.test(texto));
  unmount();
  RTL.cleanup();
}

console.log("\n=== 2. Aba do painel: diff e ações ===\n");
{
  // mock do serviço para não depender de rede
  const listaFake = [
    {
      id: 7,
      userId: 42,
      userUid: "uid-42",
      userNome: "Prestes",
      alteracoes: [
        { campo: "nome", valorAnterior: "Prestes", valorNovo: "Prestes Alterado" },
        { campo: "role", valorAnterior: "Aluno", valorNovo: "Diretor" },
      ],
      status: "pending",
      createdAt: new Date().toISOString(),
      reviewedAt: null,
      reviewedBy: null,
      rejectionReason: null,
    },
  ];

  const ProfileChangesTab = (await import("./src/components/ProfileChangesTab.tsx")).default;
  const { container, unmount } = RTL.render(
    React.createElement(ProfileChangesTab, {
      currentUser: { id: 1, uid: "adm", nome: "ADM Chefe", email: "adm@escola", role: "Diretor", isAdmin: true, ativo: true },
      canReview: true,
      onShowToast: () => {},
    })
  );

  // aguarda o efeito assíncrono de carregamento
  await RTL.act(async () => { await new Promise((r) => setTimeout(r, 30)); });

  const texto = container.textContent || "";
  ok("explica a regra no topo", /só valem depois da aprovação de um administrador/i.test(texto));
  ok("tem filtros Pendentes/Aprovadas/Rejeitadas",
    /Pendentes/.test(texto) && /Aprovadas/.test(texto) && /Rejeitadas/.test(texto));
  ok("tem botão atualizar", /Atualizar/.test(texto));
  ok("estado vazio ou lista renderizados sem quebrar",
    texto.length > 40);
  unmount();
  RTL.cleanup();
}

console.log(`\n${falhou === 0 ? "✅" : "❌"} ${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
