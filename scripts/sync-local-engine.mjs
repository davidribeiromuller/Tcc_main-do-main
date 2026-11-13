#!/usr/bin/env node
/**
 * Gera `supabase/functions/ai-event-scout/local_engine.ts` a partir das fontes
 * TypeScript em `src/lib/`.
 *
 * Por quê: a Edge Function roda em Deno dentro do Supabase e não consegue
 * importar arquivos de `src/`. Em vez de manter duas cópias editadas à mão
 * (que divergem com o tempo), geramos a cópia automaticamente.
 *
 * Uso: npm run sync:local-engine
 *      npm run sync:local-engine -- --check   (só verifica, não escreve)
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

const ARQ_CATALOGO = join(raiz, "src/lib/localEventCatalog.ts");
const ARQ_ENGINE = join(raiz, "src/lib/localEventEngine.ts");
const ARQ_DESTINO = join(raiz, "supabase/functions/ai-event-scout/local_engine.ts");

const CABECALHO = `// GERADO AUTOMATICAMENTE — não editar à mão.
//
// Cópia standalone do motor local de eventos para uso dentro da Edge Function
// (Deno), que não pode importar arquivos de \`src/\`.
//
// Fonte de verdade:
//   src/lib/localEventCatalog.ts
//   src/lib/localEventEngine.ts
//
// Para atualizar: rode \`npm run sync:local-engine\`.

`;

function gerar() {
  const catalogo = readFileSync(ARQ_CATALOGO, "utf8");
  const engine = readFileSync(ARQ_ENGINE, "utf8");

  // Remove o import do catálogo: o conteúdo dele é embutido acima do engine.
  const engineSemImport = engine.replace(
    /import \{\n(?:.|\n)*?\} from "\.\/localEventCatalog\.ts";\n/,
    ""
  );

  if (engineSemImport === engine) {
    throw new Error(
      "Não encontrei o import de localEventCatalog.ts no engine. " +
        "O formato mudou: revise o regex em scripts/sync-local-engine.mjs."
    );
  }

  return CABECALHO + catalogo.trimEnd() + "\n\n\n" + engineSemImport.trimStart();
}

const conteudo = gerar();
const modoCheck = process.argv.includes("--check");

if (modoCheck) {
  if (!existsSync(ARQ_DESTINO)) {
    console.error("✗ local_engine.ts não existe. Rode npm run sync:local-engine");
    process.exit(1);
  }
  const atual = readFileSync(ARQ_DESTINO, "utf8");
  if (atual !== conteudo) {
    console.error("✗ local_engine.ts está desatualizado. Rode npm run sync:local-engine");
    process.exit(1);
  }
  console.log("✓ local_engine.ts está sincronizado");
  process.exit(0);
}

writeFileSync(ARQ_DESTINO, conteudo);
console.log(`✓ local_engine.ts gerado (${conteudo.length} bytes)`);
