#!/usr/bin/env node
/**
 * Gera `supabase/functions/ai-event-scout/rejectionMemory.ts` a partir de
 * `src/lib/rejectionMemory.ts`.
 *
 * Mesmo motivo do `sync-local-engine.mjs`: a Edge Function roda em Deno e não
 * importa de `src/`. Mantemos uma cópia gerada para não haver duas versões da
 * memória de rejeição divergindo com o tempo.
 *
 * Uso: npm run sync:rejection-memory
 *      npm run sync:rejection-memory -- --check
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

const ARQ_ORIGEM = join(raiz, "src/lib/rejectionMemory.ts");
const ARQ_DESTINO = join(raiz, "supabase/functions/ai-event-scout/rejectionMemory.ts");

const CABECALHO = `// GERADO AUTOMATICAMENTE — não editar à mão.
//
// Cópia standalone da memória de rejeição para uso dentro da Edge Function
// (Deno), que não pode importar arquivos de \`src/\`.
//
// Fonte de verdade: src/lib/rejectionMemory.ts
// Para atualizar: npm run sync:rejection-memory

`;

const conteudo = CABECALHO + readFileSync(ARQ_ORIGEM, "utf8").trimStart();
const modoCheck = process.argv.includes("--check");

if (modoCheck) {
  if (!existsSync(ARQ_DESTINO)) {
    console.error("✗ rejectionMemory.ts não existe. Rode npm run sync:rejection-memory");
    process.exit(1);
  }
  if (readFileSync(ARQ_DESTINO, "utf8") !== conteudo) {
    console.error("✗ rejectionMemory.ts desatualizado. Rode npm run sync:rejection-memory");
    process.exit(1);
  }
  console.log("✓ rejectionMemory.ts sincronizado");
  process.exit(0);
}

writeFileSync(ARQ_DESTINO, conteudo);
console.log(`✓ rejectionMemory.ts gerado (${conteudo.length} bytes)`);
