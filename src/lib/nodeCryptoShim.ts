/**
 * Substituto de `node:crypto` para o bundle do NAVEGADOR.
 *
 * POR QUE ISTO EXISTE (rodada 39):
 *
 * `src/lib/security.ts` importa `node:crypto` para fazer scrypt, HMAC e
 * verificação de JWT. Isso é correto no servidor. O problema é que o Vite
 * também empacota `security.ts` para o navegador — ele chega lá por dois
 * caminhos:
 *
 *   schoolAccountsService.ts → security.ts
 *   usersService.ts          → security.ts
 *
 * `node:crypto` não existe no navegador, então o bundler emitia
 * `const Du = {}` no lugar do módulo. O import não quebrava (por isso ninguém
 * percebeu), mas TODA chamada virava `Du.randomBytes is not a function` —
 * foi exatamente o erro que o usuário viu no console ao se cadastrar:
 *
 *   [usersService] Exceção ao registrar usuário:
 *   TypeError: Du.randomBytes is not a function
 *
 * Resultado prático: o cadastro NUNCA funcionava no GitHub Pages, e a tela
 * mostrava apenas "Não foi possível criar sua conta agora. Verifique sua
 * conexão" — culpando a conexão do usuário por um erro de build.
 *
 * Correção em duas camadas:
 *  1. `vite.config.ts` aponta `node:crypto` para ESTE arquivo no build do
 *     cliente. O módulo passa a carregar normalmente (sem `{}` silencioso).
 *  2. Aqui, cada função lança um erro EXPLICATIVO em português. Quem chamar
 *     sem servidor recebe uma mensagem que diz o que fazer, em vez de
 *     "is not a function".
 *
 * A camada de serviços também foi corrigida: as operações que precisam de
 * criptografia (cadastro, login com senha) agora exigem servidor e devolvem
 * mensagem clara antes de chegar aqui. Este arquivo é a rede de segurança.
 *
 * No servidor nada disto é usado: `server.ts` é compilado pelo esbuild com
 * `--packages=external`, então `node:crypto` continua sendo o módulo real
 * do Node.
 */

const MENSAGEM =
  "Esta operação precisa de criptografia do servidor (Node), que não existe no navegador. " +
  "O eloEscola só executa cadastro e login com senha quando o servidor está em execução.";

function indisponivel(): never {
  throw new Error(MENSAGEM);
}

export function createHash(_algoritmo?: string): never {
  return indisponivel();
}

export function createHmac(_algoritmo?: string, _chave?: unknown): never {
  return indisponivel();
}

export function randomBytes(_tamanho?: number): never {
  return indisponivel();
}

export function randomInt(_min?: number, _max?: number): never {
  return indisponivel();
}

export function scryptSync(..._args: unknown[]): never {
  return indisponivel();
}

export function timingSafeEqual(_a?: unknown, _b?: unknown): never {
  return indisponivel();
}

export function verify(..._args: unknown[]): never {
  return indisponivel();
}

export function createPublicKey(..._args: unknown[]): never {
  return indisponivel();
}

/** `true` quando este módulo é o substituto do navegador (e não o Node real). */
export const EH_SUBSTITUTO_DO_NAVEGADOR = true;
