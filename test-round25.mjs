/**
 * Testes da rodada 25 — salvar perfil com duas vias.
 *
 * Relato: "ao alterar o perfil, da erro e volta para o perfil antes da
 * alteração" (com print do toast "Falha ao salvar perfil. O estado anterior
 * foi restaurado").
 *
 * Regra pedida:
 *  - **foto de perfil** e **telefone para contato** mudam sem confirmação;
 *  - **todo o resto** (nome, e-mail, CPF, nascimento, gênero, instituição,
 *    cargo) precisa da confirmação de um Funcionário ADM.
 *
 * Rodar: npx tsx test-round25.mjs
 */
import { readFileSync } from "node:fs";

let passou = 0;
let falhou = 0;
function ok(nome, cond, detalhe = "") {
  if (cond) { passou++; console.log(`  ✓ ${nome}`); }
  else { falhou++; console.log(`  ✗ ${nome}${detalhe ? ` — ${detalhe}` : ""}`); }
}

const ler = (p) => readFileSync(p, "utf8");
const app = ler("./src/App.tsx");
const settings = ler("./src/components/Settings.tsx");
const painel = ler("./src/components/AdminPanel.tsx");
const servico = ler("./src/lib/profileChangeService.ts");
const usersService = ler("./src/lib/usersService.ts");
const aba = ler("./src/components/ProfileChangesTab.tsx");

const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

console.log("\n=== 1. Causa raiz: nada de depender do backend Express ===\n");
{
  const trecho = app.slice(app.indexOf("const handleUpdateProfile"), app.indexOf("// Add event"));
  ok("handleUpdateProfile não usa mais `/api/users/profile`",
    !/api\/users\/profile/.test(trecho));
  ok("usa salvarCamposLivres (Supabase direto)", /salvarCamposLivres\(/.test(trecho));
  ok("usa criarSolicitacaoDePerfil", /criarSolicitacaoDePerfil\(/.test(trecho));
  ok("não reverte o usuário para o estado anterior sem motivo",
    !/setCurrentUser\(previousUser\)/.test(trecho));
  ok("só atualiza o estado quando algo foi realmente salvo",
    /if \(usuarioAtualizado\)/.test(trecho));
  ok("erro é específico (lista o que falhou)", /falhas\.push\(/.test(trecho));
}

console.log("=== 2. Duas vias: livres x sujeitas a aprovação ===\n");
{
  ok("foto de perfil é campo livre",
    /CAMPOS_LIVRES = \["foto_perfil", "phone"\]/.test(servico));
  const exigem = servico.match(/CAMPOS_COM_APROVACAO = \[([\s\S]*?)\] as const;/)?.[1] || "";
  for (const campo of ["nome", "email", "cpf", "birthdate", "gender", "institution", "role"]) {
    ok(`\`${campo}\` exige aprovação`, new RegExp(`"${campo}"`).test(exigem));
  }
  ok("foto NÃO está na lista de aprovação", !/"foto_perfil"/.test(exigem));
  ok("telefone NÃO está na lista de aprovação", !/"phone"/.test(exigem));
  ok("`separarAlteracoes` divide os dois grupos", /export function separarAlteracoes/.test(servico));
  ok("`calcularAlteracoes` só marca o que mudou de verdade",
    /if \(anterior !== proximo\)/.test(servico));
}

console.log("=== 3. Identificação por uid (nunca por e-mail) ===\n");
{
  const servicoUsuarios = semComentarios(usersService);
  ok("fallback de update usa `uid`", /\.eq\("uid", updateData\.uid\)/.test(servicoUsuarios));
  // O fallback de UPDATE não pode usar e-mail como identificador.
  const trechoUpdate = servicoUsuarios.slice(
    servicoUsuarios.indexOf("export async function updateUserDirectInSupabase"),
    servicoUsuarios.indexOf("export async function softDeleteUserDirectInSupabase")
  );
  ok("o update de usuário não filtra por e-mail", !/ilike\("email"/.test(trechoUpdate));
  ok("confere que só uma linha foi afetada", /length === 1/.test(servicoUsuarios));
}

console.log("=== 4. Tela de Configurações comunica as duas vias ===\n");
{
  ok("aviso sobre aprovação", /requer ADM/.test(settings) || /passam por aprovação/.test(settings));
  ok("selo \"imediato\" em foto/telefone", /imediato/.test(settings));
  ok("selo \"requer ADM\" nos campos sensíveis", /requer ADM/.test(settings));
  ok("nenhum selo de aprovação no telefone",
    !/Número de Celular[\s\S]{0,80}requer ADM/.test(settings));
  ok("foto de perfil com selo imediato",
    /Foto de Perfil \{seloLivre\}/.test(settings));
  ok("formulário não fecha no erro", /catch \{\s*\/\/ A mensagem de erro/.test(settings));
  ok("botão mostra estado de envio", /Enviando\.\.\./.test(settings));
  ok("botão desabilitado durante o envio", /disabled=\{salvandoPerfil\}/.test(settings));
}

console.log("=== 5. Painel ADM: aba de aprovação ===\n");
{
  ok("AdminPanel importa a aba", /import ProfileChangesTab from "\.\/ProfileChangesTab"/.test(painel));
  ok("aba registrada no estado",
    /"profileChanges"/.test(painel));
  ok("botão da aba existe", /setActiveTab\("profileChanges"\)/.test(painel));
  ok("aba renderizada", /activeTab === "profileChanges" && \(\s*<ProfileChangesTab/.test(painel));
  ok("chefe e funcionário podem revisar",
    /canReview=\{isChefe \|\| isFuncionarioAdmin\(currentUser\)\}/.test(painel));

  ok("aba lista as pendentes por padrão", /useState<Filtro>\("pending"\)/.test(aba));
  ok("mostra o diff antes → depois", /→/.test(aba) && /valorAnterior/.test(aba));
  ok("aprovar aplica no perfil", /aprovarSolicitacaoDePerfil\(/.test(aba));
  ok("rejeitar pede motivo", /window\.prompt/.test(aba));
  ok("não deixa revisar sem permissão", /if \(!canReview\)/.test(aba));
}

console.log("=== 6. Aprovação é atômica e segura ===\n");
{
  ok("reivindica a solicitação com status condicionado",
    /\.eq\("status", "pending"\)/.test(servico));
  // Rodada 35: a aprovação migrou para o servidor. O requisito continua o
  // mesmo — reivindicar ANTES de aplicar e reverter se a aplicação falhar.
  const servidor = readFileSync("./server.ts", "utf8");
  ok("aplica só depois de reivindicar",
    /\.update\(\{ status: "approved"[\s\S]{0,1200}from\("users"\)[\s\S]{0,200}\.update\(/.test(servidor));
  ok("reverte para pending se a aplicação falhar",
    /status: "pending", reviewed_at: null, reviewed_by: null/.test(servidor));
  ok("cliente delega a aprovação ao servidor",
    /\/api\/admin\/profile-requests\/\$\{solicitacao\.id\}\/approve/.test(servico));
  ok("rejeição não toca no perfil",
    !/updateUserDirectInSupabase[\s\S]{0,200}rejeitarSolicitacaoDePerfil/.test(servico));
  ok("impede aprovar duas vezes",
    /já foi revisada/.test(servico));
}

console.log(`\n${falhou === 0 ? "✅" : "❌"} ${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
