/**
 * RODADA 41 — linguagem de interface.
 *
 * O pedido da rodada 40 foi: "tem um erro que fala do servidor do eloEscola,
 * resolva isso também". Na rodada 40 eu corrigi UM lugar (a tela de login) e
 * declarei o item resolvido. Estava errado: a mesma frase continuava em mais
 * 8 arquivos, e o site publicado exibia "O login com senha exige o servidor do
 * eloEscola. Esta demonstração estática permite apenas o modo visitante."
 *
 * Este teste existe para o problema não voltar por descuido:
 *
 *   1. Nenhuma string que o usuário LÊ pode conter "servidor do eloEscola".
 *      (Comentários podem — eles documentam o histórico justamente com essa
 *      frase, e é útil que a origem fique registrada.)
 *   2. Todo ponto que exige backend usa a mensagem padronizada, que explica
 *      o motivo em linguagem de quem usa.
 *   3. As mensagens não podem ser alarmistas ("fora do ar", "erro de conexão")
 *      quando o caso é "esta versão é somente leitura".
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

let passed = 0;
const falhas = [];
function check(nome, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${nome}`);
  } catch (e) {
    falhas.push({ nome, erro: e.message });
    console.log(`  ✗ ${nome}\n      ${e.message}`);
  }
}

/** Percorre src/ e devolve [{path, linhas}] dos .ts/.tsx. */
function arquivosFonte(dir = "src") {
  const saida = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) {
      saida.push(...arquivosFonte(p));
    } else if (/\.(ts|tsx)$/.test(nome)) {
      saida.push({ path: p, linhas: readFileSync(p, "utf8").split("\n") });
    }
  }
  return saida;
}

/**
 * `true` quando a linha é comentário (`//`, `*`, `/*`).
 *
 * É a distinção central deste teste: o texto PODE aparecer na documentação do
 * código (ali ele explica a origem do problema), mas não pode aparecer numa
 * string que a tela renderiza.
 */
function ehComentario(linha) {
  const t = linha.trim();
  if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return true;
  /*
    Comentários de bloco têm linhas que NÃO começam com `*`, como a primeira
    linha de texto depois do `/*`. Em vez de adivinhar pela linha, o chamador
    decide pelo bloco — aqui basta tratar a linha que abre o comentário na
    rodada 40, que é documentação legítima.
  */
  return /^RODADA \d+/.test(t) || /[:—]\s*$/.test(t);
}

const fontes = arquivosFonte();

console.log("[1] Nenhuma mensagem de interface cita 'servidor do eloEscola'");

const ocorrenciasDeInterface = [];
for (const { path, linhas } of fontes) {
  linhas.forEach((linha, i) => {
    if (!/servidor do eloEscola/i.test(linha)) return;
    if (ehComentario(linha)) return;
    ocorrenciasDeInterface.push(`${path}:${i + 1} → ${linha.trim().slice(0, 100)}`);
  });
}

check("nenhuma string renderizada contém o termo", () => {
  assert.deepEqual(
    ocorrenciasDeInterface,
    [],
    `Estas linhas aparecem para o usuário e citam "servidor do eloEscola":\n` +
      ocorrenciasDeInterface.map((o) => "      " + o).join("\n") +
      `\nUse mensagemPrecisaServidor() de src/lib/mensagensServidor.ts.`
  );
});

check("o termo continua documentado no código (o histórico não se perde)", () => {
  // Se alguém "resolver" o problema apagando toda menção, inclusive os
  // comentários que explicam a origem, o próximo a mexer reintroduz o erro.
  const mencoes = fontes.filter((f) =>
    f.linhas.some((l) => /servidor do eloEscola/i.test(l))
  );
  assert.ok(
    mencoes.length >= 1,
    "nenhum comentário registra a origem do problema — o histórico foi apagado"
  );
});

console.log("\n[2] O módulo de mensagens existe e produz texto utilizável");

const mod = await import("./src/lib/mensagensServidor.ts");

check("mensagemPrecisaServidor diz o que fazer sem jargão", () => {
  const msg = mod.mensagemPrecisaServidor("Salvar as alterações");
  assert.match(msg, /Salvar as alterações/);
  assert.match(msg, /servidor ativo/);
  assert.match(msg, /site estático|somente leitura/);
  assert.doesNotMatch(msg, /eloEscola\.$/);
  assert.ok(msg.length > 60, "mensagem curta demais para explicar");
});

check("aceita uma saída (caminho alternativo)", () => {
  const msg = mod.mensagemPrecisaServidor("A recuperação de senha", "Peça à secretaria.");
  assert.match(msg, /Peça à secretaria\./);
});

check("versão curta para toast não repete a explicação inteira", () => {
  const curta = mod.avisoCurtoPrecisaServidor("Alteração de plano");
  assert.match(curta, /Alteração de plano/);
  assert.ok(curta.length < 120, `curta deveria ser curta: ${curta.length} caracteres`);
});

check("o motivo não culpa conexão nem diz que o sistema caiu", () => {
  assert.doesNotMatch(mod.MOTIVO_SEM_BACKEND, /conexão|fora do ar|caiu|erro de rede/i);
  assert.match(mod.MOTIVO_SEM_BACKEND, /não consegue gravar/);
});

check("EXPLICACAO_MODO_LEITURA é coerente com o motivo", () => {
  assert.match(mod.EXPLICACAO_MODO_LEITURA, /somente leitura/);
});

console.log("\n[3] Os pontos que exigem backend usam o módulo");

/**
 * Cada entrada é um arquivo e um trecho que deve existir nele. Não testa o
 * texto exato (que pode mudar), e sim que a mensagem passou a vir do módulo —
 * é o que impede a frase antiga de voltar em um arquivo esquecido.
 */
const pontosMigrados = [
  ["src/lib/staticHosting.ts", "mensagemPrecisaServidor"],
  ["src/lib/usersService.ts", "mensagemPrecisaServidor"],
  ["src/lib/schoolAccountsService.ts", "mensagemPrecisaServidor"],
  ["src/lib/schoolProfilesService.ts", "mensagemPrecisaServidor"],
  ["src/lib/profileChangeService.ts", "mensagemPrecisaServidor"],
  ["src/lib/plansService.ts", "mensagemPrecisaServidor"],
  ["src/components/PasswordRecovery.tsx", "mensagemPrecisaServidor"],
  ["src/components/SchoolSubscription.tsx", "mensagemPrecisaServidor"],
  ["src/components/Login.tsx", "somente leitura"],
];

for (const [path, trecho] of pontosMigrados) {
  check(`${path} usa a mensagem padronizada`, () => {
    const s = readFileSync(path, "utf8");
    assert.ok(s.includes(trecho), `esperava "${trecho}" em ${path}`);
    assert.ok(
      s.includes("mensagensServidor.ts") || trecho === "somente leitura",
      `${path} deve importar de mensagensServidor.ts`
    );
  });
}

console.log("\n[4] A mensagem de login do site publicado é honesta");

const login = readFileSync("src/components/Login.tsx", "utf8");

check("diz que o endereço é somente leitura", () => {
  assert.match(login, /somente leitura/);
});

check("explica que o login com senha existe, mas na versão com servidor", () => {
  assert.match(login, /versão com servidor/);
});

check("oferece uma saída concreta (visitante ou secretaria)", () => {
  assert.match(login, /visitante/i);
});

check("não promete que o painel de ADM abre no site publicado", () => {
  // Este é o ponto que gerou o vaivém: o usuário esperava o painel no
  // endereço do GitHub Pages, mas ali não existe servidor para conferir senha.
  const bloco = login.slice(login.indexOf("somente leitura"), login.indexOf("somente leitura") + 700);
  assert.doesNotMatch(bloco, /painel (abrirá|vai abrir|funciona)/i);
});

console.log(`\n${passed}/${passed + falhas.length} verificações passaram`);
if (falhas.length) {
  console.log("\nFALHAS:");
  for (const f of falhas) console.log(`  - ${f.nome}: ${f.erro}`);
  process.exit(1);
}
console.log("RODADA 41 OK — linguagem de interface sem jargão interno");
