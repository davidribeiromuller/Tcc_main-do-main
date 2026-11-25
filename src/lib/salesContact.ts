/**
 * Contato comercial: o lead é salvo no banco e o aviso vai para o WhatsApp.
 *
 * DUAS DECISÕES QUE PRECISAM FICAR EXPLÍCITAS
 *
 * 1. O lead é gravado em `sales_leads` (tabela existente, 13 colunas —
 *    conferida no projeto). A RLS permite INSERT público
 *    (`sales_leads_public_insert`, WITH CHECK true), então a gravação funciona
 *    também na hospedagem estática, sem servidor. Isso é intencional no
 *    esquema: é um formulário de contato, e perder o lead por falta de backend
 *    seria pior.
 *
 * 2. O aviso no WhatsApp NÃO pode ser "mensagem automática do app".
 *    WhatsApp não aceita envio por link: `wa.me` ABRE uma conversa, quem
 *    aperta enviar é a pessoa. Envio automático exige WhatsApp Business API
 *    (Meta/Twilio), que precisa de número verificado, template aprovado e
 *    token — nenhuma dessas coisas existe neste projeto, e inventar um
 *    "enviado com sucesso" seria mentira.
 *
 *    Então o que o app faz, e diz na tela:
 *      - grava o lead no banco (isso é automático e verificável);
 *      - deixa pronto o link `wa.me/5541995119914` com a mensagem já montada,
 *        para a equipe avisar no WhatsApp com um clique.
 *
 *    Se um dia `WHATSAPP_*` (Business API) existir no servidor, o envio
 *    automático entra em `enviarAvisoWhatsApp` sem mudar a tela.
 */

import { getSupabaseClient, isSupabaseConfigured } from "./supabase.ts";
import { fetchJsonApi } from "./staticHosting.ts";
import { telefoneParaEnvio, telefoneParaWhatsApp } from "./formMasks.ts";

/**
 * Número comercial do eloEscola.
 *
 * Vem de `VITE_WHATSAPP_COMERCIAL` quando configurado; o padrão é o número
 * informado pelo autor do projeto. Guardar como constante e não espalhar
 * `5541995119914` por três arquivos evita o clássico "troquei o número e
 * esqueci uma tela".
 */
export const WHATSAPP_COMERCIAL =
  ((import.meta as any)?.env?.VITE_WHATSAPP_COMERCIAL as string)?.trim() || "5541995119914";

export interface DadosContato {
  nome: string;
  email: string;
  telefone?: string;
  escola?: string;
  cnpj?: string;
  cidade?: string;
  uf?: string;
  plano?: string;
  mensagem?: string;
}

export interface ResultadoContato {
  ok: boolean;
  /** Gravou no banco? Diferente de "avisou no WhatsApp". */
  salvo: boolean;
  /** Link para a equipe enviar o aviso no WhatsApp com um clique. */
  linkWhatsApp: string | null;
  erro: string | null;
  /** De onde veio o sucesso: servidor ou gravação direta. */
  via: "servidor" | "banco" | "nenhum";
}

/** Monta o texto do aviso — usado no link e, um dia, na API. */
export function montarMensagemAviso(dados: DadosContato): string {
  const linhas = [
    "*Novo contato pelo eloEscola*",
    "",
    `*Nome:* ${dados.nome}`,
    `*E-mail:* ${dados.email}`,
  ];
  if (dados.telefone) linhas.push(`*Telefone:* ${dados.telefone}`);
  if (dados.escola) linhas.push(`*Escola/Rede:* ${dados.escola}`);
  if (dados.cnpj) linhas.push(`*CNPJ:* ${dados.cnpj}`);
  if (dados.cidade) linhas.push(`*Cidade:* ${dados.cidade}${dados.uf ? `/${dados.uf}` : ""}`);
  if (dados.plano) linhas.push(`*Plano de interesse:* ${dados.plano}`);
  if (dados.mensagem) linhas.push("", `*Mensagem:* ${dados.mensagem}`);
  linhas.push("", "_Enviado pelo site do eloEscola._");
  return linhas.join("\n");
}

/**
 * Link `wa.me` com a mensagem pronta.
 *
 * `encodeURIComponent` é obrigatório: sem ele, `&`, `+` e quebras de linha
 * cortam a mensagem no meio (o `+` vira espaço, o `&` encerra o parâmetro).
 */
export function linkWhatsAppDoLead(dados: DadosContato, numero = WHATSAPP_COMERCIAL): string {
  const destino = telefoneParaWhatsApp(numero) || numero;
  return `https://wa.me/${destino}?text=${encodeURIComponent(montarMensagemAviso(dados))}`;
}

/** Converte `plano: "rede"` em "Rede" para a mensagem ficar legível. */
function rotuloPlano(plano?: string, nomes: Record<string, string> = {}): string {
  if (!plano) return "";
  if (nomes[plano]) return nomes[plano];
  return plano.charAt(0).toUpperCase() + plano.slice(1);
}

/**
 * Registra o contato.
 *
 * Ordem: servidor (que também dispara e-mail/WhatsApp quando configurado) e,
 * se não houver, gravação direta no banco. Nos dois casos devolve o link do
 * WhatsApp para a equipe — o aviso automático é o único passo que depende de
 * infraestrutura que o projeto não tem.
 */
export async function registrarContatoComercial(
  dados: DadosContato,
  nomesDePlano: Record<string, string> = {}
): Promise<ResultadoContato> {
  const nome = dados.nome.trim();
  const email = dados.email.trim().toLowerCase();

  if (!nome || !email) {
    return { ok: false, salvo: false, linkWhatsApp: null, erro: "Informe seu nome e e-mail.", via: "nenhum" };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, salvo: false, linkWhatsApp: null, erro: "E-mail inválido. Confira o endereço digitado.", via: "nenhum" };
  }

  const telefoneDigitos = dados.telefone ? telefoneParaEnvio(dados.telefone) : "";

  const dadosParaMensagem: DadosContato = {
    ...dados,
    telefone: telefoneDigitos || undefined,
    plano: rotuloPlano(dados.plano, nomesDePlano),
  };
  const linkWhatsApp = linkWhatsAppDoLead(dadosParaMensagem);

  // 1. Servidor: salva e, se houver provedor, avisa.
  const res = await fetchJsonApi("/api/saas/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: nome,
      email,
      phone: telefoneDigitos || undefined,
      schoolName: dados.escola?.trim() || undefined,
      cnpj: dados.cnpj?.trim() || undefined,
      city: dados.cidade?.trim() || undefined,
      state: dados.uf?.trim() || undefined,
      planInterest: dados.plano || undefined,
      message: dados.mensagem?.trim() || undefined,
      source: "site_planos",
    }),
  });

  if (res && res.ok) {
    return { ok: true, salvo: true, linkWhatsApp, erro: null, via: "servidor" };
  }

  // 2. Sem servidor: grava direto em `sales_leads` (RLS permite INSERT público).
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      salvo: false,
      linkWhatsApp,
      erro:
        res && !res.ok
          ? "Não foi possível registrar seu contato agora. Tente novamente ou fale pelo WhatsApp."
          : "Não foi possível registrar seu contato: banco não configurado neste build.",
      via: "nenhum",
    };
  }

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from("sales_leads").insert([
      {
        name: nome,
        email,
        phone: telefoneDigitos || null,
        school_name: dados.escola?.trim() || null,
        city: dados.cidade?.trim() || null,
        state: dados.uf?.trim() || "PR",
        plan_interest: dados.plano || null,
        // `notes` guarda CNPJ e mensagem: a tabela não tem coluna própria para
        // eles e criar coluna nova exigiria migration — o conteúdo cabe aqui e
        // o painel Master já mostra `notes`.
        notes: [
          dados.cnpj ? `CNPJ: ${dados.cnpj}` : null,
          dados.mensagem ? `Mensagem: ${dados.mensagem}` : null,
        ]
          .filter(Boolean)
          .join(" | ") || null,
        source: "site_planos",
      },
    ]);

    if (error) {
      return {
        ok: false,
        salvo: false,
        linkWhatsApp,
        erro: `Não foi possível registrar seu contato (${error.message}). Fale pelo WhatsApp.`,
        via: "nenhum",
      };
    }
    return { ok: true, salvo: true, linkWhatsApp, erro: null, via: "banco" };
  } catch (err: any) {
    return {
      ok: false,
      salvo: false,
      linkWhatsApp,
      erro: err?.message || "Falha de rede ao registrar o contato.",
      via: "nenhum",
    };
  }
}
