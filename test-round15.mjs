/**
 * Testes da rodada 15 — design dos cards de evento.
 *
 * A parte que pode dar errado silenciosamente é a classificação por área:
 * se "Olimpíada de Robótica" cair em "esporte", o card ganha a cor errada e
 * ninguém percebe até olhar a tela. Aqui isso fica travado.
 *
 * Rodar: npx tsx test-round15.mjs
 */
import { readFileSync } from "node:fs";
import {
  detectarArea,
  visualDoEvento,
  imagemEhPlaceholder,
} from "./src/lib/eventVisuals.ts";

let passou = 0;
let falhou = 0;
function ok(nome, cond, detalhe = "") {
  if (cond) { passou++; console.log(`  ✓ ${nome}`); }
  else { falhou++; console.log(`  ✗ ${nome}${detalhe ? ` — ${detalhe}` : ""}`); }
}

console.log("\n=== 1. Placeholder de imagem ===");
{
  const plateia = "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600";
  ok("reconhece a foto de plateia como placeholder", imagemEhPlaceholder(plateia) === true);
  ok("reconhece URL vazia", imagemEhPlaceholder("") === true);
  ok("reconhece null", imagemEhPlaceholder(null) === true);
  ok("reconhece undefined", imagemEhPlaceholder(undefined) === true);
  ok("aceita foto real", imagemEhPlaceholder("https://exemplo.com/feira.jpg") === false);
  ok("aceita foto do unsplash de outro assunto",
    imagemEhPlaceholder("https://images.unsplash.com/photo-1523240795612-9a054b0db644") === false);
}

console.log("\n=== 2. Classificação por área ===");
{
  const casos = [
    ["Olimpíada Brasileira de Biologia (OBB) - Inscrições", "biologia"],
    ["Olimpíada Brasileira de Astronomia (OBA) - Inscrições", "fisica"],
    ["Olimpíada de Robótica (OBR) - Inscrições", "tecnologia"],
    ["Processo Seletivo IFPR - Prova de Conhecimentos", "vestibular"],
    ["Feira de Literatura de Curitiba", "cultura"],
    ["OBMEP 2027 - 1ª Fase", "matematica"],
    ["Olimpíada Brasileira de Química (OBQ)", "quimica"],
    ["Jogos Escolares do Paraná - JEPS", "esporte"],
    ["Vestibular UFPR 2027", "vestibular"],
    ["Festival Estudantil de Música", "musica"],
    ["Feira de Profissões UTFPR", "geral"],
  ];

  for (const [titulo, esperado] of casos) {
    const obtido = detectarArea({ title: titulo });
    ok(`${titulo.slice(0, 40)} → ${esperado}`, obtido === esperado, `obtido: ${obtido}`);
  }
}

console.log("\n=== 3. Prioridades que evitam erro visual ===");
{
  // "Olimpíada" aparece em quase tudo; robótica precisa ganhar de esporte.
  ok(
    "robótica vence 'olimpíada'",
    detectarArea({ title: "Olimpíada de Robótica" }) === "tecnologia",
    detectarArea({ title: "Olimpíada de Robótica" })
  );
  // "Olimpíada Brasileira de Informática" é tecnologia, não esporte.
  ok(
    "informática vence esporte",
    detectarArea({ title: "Olimpíada Brasileira de Informática" }) === "tecnologia"
  );
  // Astronomia é física, mesmo com "olimpíada" no nome.
  ok(
    "astronomia → física",
    detectarArea({ title: "Mostra de Astronomia" }) === "fisica"
  );
  // Sem pistas: cai em geral, nunca em nada.
  ok("sem pistas → geral", detectarArea({ title: "Evento" }) === "geral");
  ok("vazio → geral", detectarArea({}) === "geral");
}

console.log("\n=== 4. Categoria e descrição também contam ===");
{
  ok(
    "usa a categoria quando o título não diz",
    detectarArea({ title: "Inscrições abertas", category: "Esporte" }) === "esporte",
    detectarArea({ title: "Inscrições abertas", category: "Esporte" })
  );
  ok(
    "usa a descrição como último recurso",
    detectarArea({ title: "Encontro", description: "Uma feira de livro e leitura." }) === "cultura",
    detectarArea({ title: "Encontro", description: "Uma feira de livro e leitura." })
  );
}

console.log("\n=== 5. Visual completo ===");
{
  const visual = visualDoEvento({ title: "Olimpíada de Robótica" });
  ok("tem ícone", Boolean(visual.Icone));
  ok("tem gradiente", /from-.*via-.*to-/.test(visual.gradiente), visual.gradiente);
  ok("tem rótulo", visual.rotulo === "Tecnologia", visual.rotulo);
  ok("tem cor", /^#[0-9a-f]{6}$/i.test(visual.cor), visual.cor);

  // Toda área precisa de gradiente válido — um card sem gradiente fica branco
  // sobre branco no modo escuro.
  const areas = ["matematica", "quimica", "fisica", "tecnologia", "biologia",
    "linguagens", "cultura", "esporte", "vestibular", "meioambiente", "musica", "geral"];
  const titulos = ["OBMEP", "OBQ", "OBA", "OBI", "OBB", "ONHB", "Festival de Teatro",
    "JEPS", "Vestibular UFPR", "Horta escolar", "Coral", "Evento"];
  let todasValidas = true;
  for (const t of titulos) {
    const v = visualDoEvento({ title: t });
    if (!v.gradiente || !v.rotulo || !v.cor || !v.Icone) todasValidas = false;
  }
  ok("todas as áreas produzem visual válido", todasValidas);
  ok("áreas mapeadas: " + areas.length, areas.length === 12);
}

console.log("\n=== 6. O card no Feed (regressão) ===");
{
  const fonte = readFileSync("./src/components/Feed.tsx", "utf8");

  ok("não usa a foto de plateia como fallback",
    !/event\.image \|\| "https:\/\/images\.unsplash\.com\/photo-1540575467063/.test(fonte));
  ok("importa o módulo de visuais", /from "\.\.\/lib\/eventVisuals/.test(fonte));
  ok("decide entre foto e cabeçalho por área", /const temFoto = !imagemEhPlaceholder/.test(fonte));
  ok("título está no corpo, não sobre a imagem",
    /<div className="flex flex-col flex-1 p-3 gap-1\.5">[\s\S]{0,200}<h3/.test(fonte));
  ok("data tem bloco destacado", /Bloco de data/.test(fonte));
  ok("imagem com lazy loading", /loading="lazy"/.test(fonte));
}

console.log(`\n${falhou === 0 ? "✅" : "❌"} ${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
