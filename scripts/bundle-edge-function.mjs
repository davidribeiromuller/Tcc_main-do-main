#!/usr/bin/env node
/**
 * Empacota a Edge Function `ai-event-scout` em um único arquivo.
 *
 * Por que existe: o painel do Supabase envia apenas UM arquivo por função.
 * No repositório a função importa `./local_engine.ts`, que por sua vez importa
 * `./eventClassification.ts`. Enviar os imports como estão faz o deploy falhar
 * em runtime (`detectForbiddenContent is not defined`).
 *
 * O script:
 *   1. resolve os imports locais recursivamente;
 *   2. embute cada módulo uma única vez, sem `import`/`export`;
 *   3. valida que nenhuma função importada ficou sem definição;
 *   4. confere que as cópias da pasta da função estão iguais às de `src/`.
 *
 * Uso:
 *   node scripts/bundle-edge-function.mjs           # gera o bundle
 *   node scripts/bundle-edge-function.mjs --check   # só valida
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const dirFuncao = join(raiz, "supabase", "functions", "ai-event-scout");
const entrada = join(dirFuncao, "index.ts");
const saida = join(dirFuncao, "index.bundle.ts");

const apenasVerificar = process.argv.includes("--check");

/**
 * Módulos que são cópia de `src/` e precisam ficar idênticos.
 * A Edge Function roda em Deno e não pode importar de `src/`.
 */
const COPIAS = [
  { origem: join(raiz, "src", "lib", "eventClassification.ts"), destino: join(dirFuncao, "eventClassification.ts") },
];

/**
 * Remove apenas os imports LOCAIS (./arquivo.ts) e os `export`.
 * Imports de pacote (npm:, jsr:, https:) precisam sobreviver para o Deno.
 */
function achatar(codigo) {
  return codigo
    .replace(/^import\s+\{[^}]+\}\s+from\s+["']\.\/[^"']+["'];?[ \t]*\r?\n?/gm, "")
    .replace(/^export\s+(?=(?:interface|type|const|let|var|function|class|enum|async)\b)/gm, "")
    .trim();
}

/** Nomes importados de um módulo, por caminho relativo. */
function importsLocais(codigo) {
  const encontrados = [];
  const regex = /^import\s+\{([^}]+)\}\s+from\s+["'](\.\/[^"']+)["'];?[ \t]*$/gm;
  let m;
  while ((m = regex.exec(codigo)) !== null) {
    const nomes = m[1]
      .split(",")
      .map((s) => s.trim().split(/\s+as\s+/).pop())
      .filter(Boolean);
    encontrados.push({ nomes, caminho: m[2] });
  }
  return encontrados;
}

/** Coleta recursivamente os módulos locais, na ordem de dependência. */
function coletarModulos(caminhoAbsoluto, visitados = new Set()) {
  if (visitados.has(caminhoAbsoluto)) return [];
  visitados.add(caminhoAbsoluto);

  if (!existsSync(caminhoAbsoluto)) {
    throw new Error(`Módulo não encontrado: ${caminhoAbsoluto}`);
  }

  const codigo = readFileSync(caminhoAbsoluto, "utf8");
  const modulos = [];

  for (const imp of importsLocais(codigo)) {
    const alvo = join(dirname(caminhoAbsoluto), imp.caminho);
    // Dependências entram antes do módulo que as usa.
    modulos.push(...coletarModulos(alvo, visitados));
  }

  modulos.push({
    nome: basename(caminhoAbsoluto),
    caminho: caminhoAbsoluto,
    corpo: achatar(codigo),
  });

  return modulos;
}

function gerarBundle() {
  const principal = readFileSync(entrada, "utf8");
  // Dependências do index (exceto ele mesmo) + o próprio index.
  const dependencias = coletarModulos(entrada).filter((m) => m.caminho !== entrada);

  const corpoPrincipal = achatar(principal);

  const cabecalho = [
    "// ============================================================",
    "// ARQUIVO GERADO POR scripts/bundle-edge-function.mjs",
    "// Não edite: altere index.ts / local_engine.ts / eventClassification.ts",
    "// e rode `npm run bundle:edge`.",
    "// ============================================================",
  ].join("\n");

  const blocos = dependencias.map((m) =>
    [
      `// ---- embutido de ${m.nome} ----`,
      m.corpo,
    ].join("\n")
  );

  const conteudo = [cabecalho, corpoPrincipal, ...blocos].join("\n\n") + "\n";

  // Todos os nomes importados precisam ter definição no resultado final.
  const nomesNecessarios = new Set();
  for (const arquivo of [principal, ...dependencias.map((d) => readFileSync(d.caminho, "utf8"))]) {
    for (const imp of importsLocais(arquivo)) imp.nomes.forEach((n) => nomesNecessarios.add(n));
  }

  return { conteudo, nomesNecessarios: [...nomesNecessarios] };
}

// 1. Cópias de src/ precisam estar em dia.
if (apenasVerificar) {
  for (const copia of COPIAS) {
    if (!existsSync(copia.destino)) {
      console.error(`✗ Falta a cópia ${basename(copia.destino)} na pasta da função.`);
      process.exit(1);
    }
    if (readFileSync(copia.origem, "utf8") !== readFileSync(copia.destino, "utf8")) {
      console.error(`✗ ${basename(copia.destino)} divergente de src/. Rode: npm run bundle:edge`);
      process.exit(1);
    }
  }
}

let conteudo, nomesNecessarios;
try {
  ({ conteudo, nomesNecessarios } = gerarBundle());
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}

const semDefinicao = nomesNecessarios.filter((nome) => {
  const declaracao = new RegExp(`(function|const|let|var|class)\\s+${nome}\\b`);
  return !declaracao.test(conteudo);
});

if (semDefinicao.length > 0) {
  console.error(`✗ Funções importadas sem definição no bundle: ${semDefinicao.join(", ")}`);
  process.exit(1);
}

if (apenasVerificar) {
  if (!existsSync(saida)) {
    console.error("✗ index.bundle.ts não existe. Rode: npm run bundle:edge");
    process.exit(1);
  }
  if (readFileSync(saida, "utf8") !== conteudo) {
    console.error("✗ index.bundle.ts desatualizado. Rode: npm run bundle:edge");
    process.exit(1);
  }
  console.log(`✓ index.bundle.ts sincronizado (${nomesNecessarios.length} imports resolvidos)`);
  process.exit(0);
}

// 2. Sincroniza as cópias antes de gerar.
for (const copia of COPIAS) {
  writeFileSync(copia.destino, readFileSync(copia.origem));
}

writeFileSync(saida, conteudo);
console.log(
  `✓ index.bundle.ts gerado (${conteudo.length} bytes, ${nomesNecessarios.length} imports resolvidos)`
);
