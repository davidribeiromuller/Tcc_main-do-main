/**
 * Rodada 38 — configuração de deploy do servidor.
 *
 * O painel administrativo só funciona onde há Node. O repositório era publicado
 * apenas no GitHub Pages (estático), então o painel ficava inutilizável no
 * endereço público. Esta suíte trava as peças que tornam o deploy possível e,
 * principalmente, o par de variáveis que mais causa erro de configuração.
 */
import { readFileSync, existsSync } from "node:fs";

let ok = 0;
let fail = 0;
const falhas = [];
const check = (n, c, d = "") => {
  if (c) { ok++; console.log(`  ✓ ${n}`); }
  else { fail++; falhas.push(n); console.log(`  ✗ ${n}${d ? ` — ${d}` : ""}`); }
};
const ler = (p) => readFileSync(p, "utf8");

console.log("=== 1. Servidor serve app e API na mesma origem ===");
{
  const server = ler("server.ts");
  check("em produção serve dist/ estático", /NODE_ENV !== "production"[\s\S]{0,600}express\.static\(distPath\)/.test(server));
  check("fallback de SPA para rotas do app", /sendFile\(path\.join\(distPath, "index\.html"\)\)/.test(server));
  check("escuta em 0.0.0.0 (necessário em container)", /app\.listen\(PORT, "0\.0\.0\.0"/.test(server));
  check("lê PORT do ambiente", /process\.env\.PORT/.test(server));
}

console.log("\n=== 2. Artefatos de deploy presentes ===");
{
  check("Dockerfile existe", existsSync("Dockerfile"));
  check(".dockerignore existe", existsSync(".dockerignore"));
  check("railway.json existe", existsSync("railway.json"));
  check("render.yaml existe", existsSync("render.yaml"));
  check("DEPLOY_SERVIDOR.md documenta o passo a passo", existsSync("DEPLOY_SERVIDOR.md"));
}

console.log("\n=== 3. Dockerfile é seguro e coerente ===");
{
  const df = ler("Dockerfile");
  check("build em duas etapas", (df.match(/^FROM /gm) || []).length === 2);
  check("roda como usuário não-root", /^USER node$/m.test(df));
  check("CMD aponta para o bundle real", /CMD \["node", "dist\/server\.cjs"\]/.test(df));
  check("healthcheck usa /api/health", /\/api\/health/.test(df));
  check("instala só dependências de produção no runtime", /npm ci --omit=dev/.test(df));
  check(
    "não copia .env para a imagem",
    !/COPY\s+\.env/.test(df)
  );
  check(
    "declara VITE_* como build-arg (não runtime)",
    /ARG VITE_SUPABASE_URL/.test(df) && /ARG VITE_SUPABASE_PUBLISHABLE_KEY/.test(df)
  );
  check(
    "NÃO usa a chave secreta em build-arg",
    !/ARG VITE_SUPABASE_SECRET|ARG SUPABASE_SECRET_KEY/.test(df)
  );
}

console.log("\n=== 4. .dockerignore protege segredos ===");
{
  const di = ler(".dockerignore");
  check("exclui .env", /^\.env$/m.test(di));
  check("exclui node_modules", /^node_modules$/m.test(di));
  check("exclui .git", /^\.git$/m.test(di));
  check("exclui JSON de fallback (dados locais)", /fallback_\*\.json/.test(di));
}

console.log("\n=== 5. O par obrigatório do Supabase ===");
{
  /*
    Causa de erro mais provável no deploy: o painel responde
    `503 SAAS_NOT_CONFIGURED` mesmo com a chave secreta certa, porque falta
    SUPABASE_URL. O servidor não descobre a URL sozinho no backend.
  */
  const saas = ler("src/lib/saasStore.ts");
  check(
    "isSaasBackendConfigured exige URL E chave",
    /SUPABASE_URL[\s\S]{0,200}SUPABASE_SECRET_KEY/.test(saas)
  );

  const rw = ler("railway.json");
  check("railway.json usa o Dockerfile", /"dockerfilePath": "Dockerfile"/.test(rw));
  check("railway.json aponta healthcheck para /api/health", /"healthcheckPath": "\/api\/health"/.test(rw));

  const ry = ler("render.yaml");
  check("render.yaml declara SUPABASE_URL com valor", /key: SUPABASE_URL\s*\n\s*value: https:\/\/[a-z0-9]+\.supabase\.co/.test(ry));
  check("render.yaml pede SUPABASE_SECRET_KEY no deploy (não versionada)", /key: SUPABASE_SECRET_KEY\s*\n\s*sync: false/.test(ry));
  check("render.yaml gera SESSION_SECRET", /key: SESSION_SECRET\s*\n\s*generateValue: true/.test(ry));
  check("render.yaml define TRUST_PROXY (atrás de proxy)", /key: TRUST_PROXY/.test(ry));
  check(
    "render.yaml NÃO versiona a chave secreta",
    !/sb_secret_/.test(ry) && !/service_role/.test(ry)
  );
}

console.log("\n=== 6. Nenhum segredo real versionado nos arquivos de deploy ===");
{
  const arquivos = ["Dockerfile", ".dockerignore", "railway.json", "render.yaml", "DEPLOY_SERVIDOR.md"];
  for (const f of arquivos) {
    const txt = ler(f);
    const temSegredo = /sb_secret_[A-Za-z0-9]{6,}/.test(txt) || /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9]+\.[A-Za-z0-9]+/.test(txt);
    check(`${f}: sem chave secreta hardcoded`, !temSegredo);
  }
}

console.log("\n=== 7. Documentação cobre o que depende do usuário ===");
{
  const doc = ler("DEPLOY_SERVIDOR.md");
  check("explica por que o Pages não roda o painel", /estática|estático/.test(doc) && /Pages/.test(doc));
  check("avisa que SUPABASE_URL é obrigatória junto da chave", /SUPABASE_URL.*e.*SUPABASE_SECRET_KEY|par obrigatório/i.test(doc) || /exige[\s\S]{0,80}SUPABASE_URL/.test(doc));
  check("traz checklist pós-deploy", /saasConfigured: true/.test(doc));
  check("diz o que NÃO foi validado (imagem Docker)", /NÃO validado|não há Docker/i.test(doc));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${ok} passaram, ${fail} falharam`);
if (fail) { console.log("\nFalhas:"); falhas.forEach((f) => console.log("  -", f)); process.exit(1); }
console.log("RODADA 38 OK — configuração de deploy verificada");
