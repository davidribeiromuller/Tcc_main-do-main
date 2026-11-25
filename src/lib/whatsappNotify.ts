/**
 * Aviso de novo lead no WhatsApp da equipe.
 *
 * O QUE É POSSÍVEL E O QUE NÃO É
 *
 * Enviar mensagem de WhatsApp **sem intervenção humana** exige a API oficial
 * (WhatsApp Business / Cloud API da Meta, ou Twilio). Ela pede: número
 * verificado, token permanente, template aprovado e, para o destinatário fora
 * da janela de 24h, um template pré-aprovado. Nada disso existe neste projeto.
 *
 * O que NÃO é possível: "mandar WhatsApp" por link (`wa.me`). O link apenas
 * abre a conversa — quem aperta enviar é a pessoa. Fingir envio automático
 * seria mentira, e é o tipo de mentira que só aparece semanas depois ("por que
 * nunca chegou?").
 *
 * Então este módulo:
 *  - com `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID`: envia pelo Cloud API e reporta
 *    o resultado REAL (inclusive falha);
 *  - sem eles: devolve `canal: "link"` com a URL pronta e `entregue: false`,
 *    para a UI pedir o clique em vez de inventar sucesso.
 */
import { linkWhatsAppDoLead, type DadosContato } from "./salesContact.ts";

export interface ResultadoAviso {
  entregue: boolean;
  canal: "cloud_api" | "link" | "nenhum";
  /** Link pronto — sempre presente, mesmo quando a API está configurada. */
  link: string;
  motivo?: string;
}

/** `true` quando há credenciais da Cloud API configuradas no servidor. */
export function whatsappAutomaticoConfigurado(): boolean {
  return Boolean(
    (process.env.WHATSAPP_TOKEN || "").trim() && (process.env.WHATSAPP_PHONE_ID || "").trim()
  );
}

/** Número que recebe os avisos: ambiente primeiro, padrão do projeto depois. */
export function numeroDaEquipe(): string {
  return (process.env.WHATSAPP_EQUIPE || "").trim() || "5541995119914";
}

function montarTexto(dados: DadosContato): string {
  const linhas = [
    "Novo contato pelo eloEscola",
    `Nome: ${dados.nome}`,
    `E-mail: ${dados.email}`,
  ];
  if (dados.telefone) linhas.push(`Telefone: ${dados.telefone}`);
  if (dados.escola) linhas.push(`Escola/Rede: ${dados.escola}`);
  if (dados.cnpj) linhas.push(`CNPJ: ${dados.cnpj}`);
  if (dados.cidade) linhas.push(`Cidade: ${dados.cidade}${dados.uf ? `/${dados.uf}` : ""}`);
  if (dados.plano) linhas.push(`Plano de interesse: ${dados.plano}`);
  if (dados.mensagem) linhas.push(`Mensagem: ${dados.mensagem}`);
  return linhas.join("\n");
}

/**
 * Envia o aviso, se possível, e devolve o link em qualquer caso.
 *
 * Nunca lança: um problema no WhatsApp não pode derrubar o registro do lead —
 * o dado já está no banco, e é ele que importa.
 */
export async function avisarEquipeNoWhatsApp(dados: DadosContato): Promise<ResultadoAviso> {
  const link = linkWhatsAppDoLead(dados, numeroDaEquipe());

  if (!whatsappAutomaticoConfigurado()) {
    return {
      entregue: false,
      canal: "link",
      link,
      motivo:
        "Envio automático indisponível: WHATSAPP_TOKEN/WHATSAPP_PHONE_ID não configurados. " +
        "O link abre a conversa com a mensagem pronta.",
    };
  }

  const token = (process.env.WHATSAPP_TOKEN || "").trim();
  const phoneId = (process.env.WHATSAPP_PHONE_ID || "").trim();
  const destino = numeroDaEquipe();

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: destino,
        type: "text",
        text: { body: montarTexto(dados) },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const detalhe = await res.text().catch(() => "");
      console.error("[WhatsApp] Provedor recusou o envio:", res.status, detalhe.slice(0, 300));
      return {
        entregue: false,
        canal: "link",
        link,
        motivo: `O provedor recusou o envio (HTTP ${res.status}). Use o link para avisar.`,
      };
    }

    return { entregue: true, canal: "cloud_api", link };
  } catch (err: any) {
    console.error("[WhatsApp] Falha de rede:", err?.message || err);
    return {
      entregue: false,
      canal: "link",
      link,
      motivo: `Falha de rede ao avisar (${err?.message || "erro"}). Use o link para avisar.`,
    };
  }
}
