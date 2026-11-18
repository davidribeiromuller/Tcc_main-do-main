/**
 * Integração real (rodada 25): fluxo completo contra o Supabase.
 * Cria um usuário de teste, simula a tela de perfil e limpa tudo no fim.
 * Rodar: npx tsx test-round25-integration.mjs
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Credenciais: o app já tem defaults embutidos em src/lib/supabase.ts
// (publishable key + URL do projeto). Nada de segredo aqui.
const {
  calcularAlteracoes, separarAlteracoes, salvarCamposLivres,
  criarSolicitacaoDePerfil, aprovarSolicitacaoDePerfil, listarSolicitacoesDePerfil,
} = await import("./src/lib/profileChangeService.ts");
const { getSupabaseClient } = await import("./src/lib/supabase.ts");

let passou = 0, falhou = 0;
const ok = (n, c, d = "") => { c ? (passou++, console.log(`  ✓ ${n}`)) : (falhou++, console.log(`  ✗ ${n}${d ? ` — ${d}` : ""}`)); };

const sb = getSupabaseClient();

/*
  Este teste FALA COM O BANCO DE VERDADE (cria um usuário temporário, exercita
  as duas vias e apaga tudo no fim). No sandbox do agente o acesso a
  *.supabase.co é bloqueado, então ele se auto-ignora quando não há rede.
  Rode na sua máquina:  npx tsx test-round25-integration.mjs
*/
try {
  const ping = await fetch(`${(await import("./src/lib/supabase.ts")).getEffectiveSupabaseUrl()}/rest/v1/`, { method: "GET" });
  if (!ping) throw new Error("sem resposta");
} catch {
  console.log("\n⏭  Ignorado: sem acesso de rede ao Supabase neste ambiente.\n");
  process.exit(0);
}
const stamp = Date.now();
const email = `teste.perfil.${stamp}@escola.pr.gov.br`;
const uid = `test-profile-${stamp}`;

// 0. cria usuário de teste
const { data: criado, error: errCriar } = await sb.from("users").insert({
  uid, nome: "Prestes Teste", email, role: "Aluno", institution: "Escola estadual Helena Wysocki",
  phone: "", cpf: "", ativo: true,
}).select();
if (errCriar) { console.error("não criou usuário de teste:", errCriar); process.exit(1); }
const user = criado[0];
console.log(`\nUsuário de teste: id=${user.id} uid=${uid}\n`);

try {
  console.log("=== 1. Campos livres aplicam na hora ===");
  const atual = { ...user, nome: user.nome, phone: "", foto_perfil: "", email: user.email };
  const alt1 = calcularAlteracoes(atual, { phone: "(41) 98888-7777", foto_perfil: "https://exemplo/foto.png", nome: user.nome });
  ok("só phone e foto aparecem como alteração", alt1.length === 2, JSON.stringify(alt1.map(a=>a.campo)));
  const { livres, sujeitas } = separarAlteracoes(alt1);
  ok("phone e foto caem em 'livres'", livres.length === 2 && sujeitas.length === 0);

  const r1 = await salvarCamposLivres(user.id, livres);
  ok("salvou sem erro", !r1.error && !!r1.user, String(r1.error?.message || ""));
  ok("telefone gravado", r1.user?.phone === "(41) 98888-7777", String(r1.user?.phone));
  ok("foto gravada", r1.user?.foto_perfil === "https://exemplo/foto.png");

  console.log("\n=== 2. Campos sensíveis viram solicitação (perfil intacto) ===");
  const alt2 = calcularAlteracoes(r1.user, { nome: "Prestes Alterado", role: "Diretor" });
  const split2 = separarAlteracoes(alt2);
  ok("nome e cargo exigem aprovação", split2.sujeitas.length === 2 && split2.livres.length === 0);
  const { solicitacao, error: errSol } = await criarSolicitacaoDePerfil({ user: r1.user, alteracoes: split2.sujeitas });
  ok("solicitação criada", !!solicitacao && !errSol, String(errSol?.message || ""));
  ok("status pending", solicitacao?.status === "pending");

  const { data: depois } = await sb.from("users").select("*").eq("id", user.id).single();
  ok("perfil NÃO mudou antes da aprovação", depois.nome === "Prestes Teste" && depois.role === "Aluno",
    `${depois.nome}/${depois.role}`);

  console.log("\n=== 3. Painel lista a pendência ===");
  const { solicitacoes, error: errList } = await listarSolicitacoesDePerfil("pending");
  const achada = solicitacoes.find((s) => s.id === solicitacao.id);
  ok("sem erro na listagem", !errList, String(errList?.message || ""));
  ok("solicitação aparece na aba", !!achada);
  ok("diff antes → depois preenchido",
    achada?.alteracoes.some((a) => a.campo === "nome" && a.valorAnterior === "Prestes Teste" && a.valorNovo === "Prestes Alterado"),
    JSON.stringify(achada?.alteracoes));

  console.log("\n=== 4. Aprovação aplica no perfil ===");
  const aprov = await aprovarSolicitacaoDePerfil({ solicitacao: achada, reviewedBy: "Teste ADM" });
  ok("aprovou sem erro", !aprov.error && !!aprov.user, String(aprov.error?.message || ""));
  const { data: final } = await sb.from("users").select("*").eq("id", user.id).single();
  ok("nome aplicado", final.nome === "Prestes Alterado", final.nome);
  ok("cargo aplicado", final.role === "Diretor", final.role);
  ok("telefone preservado", final.phone === "(41) 98888-7777");

  const segunda = await aprovarSolicitacaoDePerfil({ solicitacao: achada, reviewedBy: "Teste ADM" });
  ok("não deixa aprovar duas vezes", !!segunda.error);
} finally {
  await sb.from("profile_change_requests").delete().eq("user_id", user.id);
  await sb.from("users").delete().eq("id", user.id);
  console.log("\n(usuário e solicitações de teste removidos)");
}

console.log(`\n${falhou === 0 ? "✅" : "❌"} ${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
