import React from "react";
import { ArrowLeft, ShieldCheck, Scale, Database, Clock, Users, Mail, Lock } from "lucide-react";

/**
 * Política de privacidade pública (LGPD).
 *
 * Este texto é a versão TÉCNICA escrita a partir do que o sistema realmente
 * faz (tabelas, prazos e finalidades conferidos no código). Ele NÃO substitui
 * revisão jurídica — ver `RELATORIO_IMPLEMENTACAO.md`, pendência explícita.
 *
 * A versão é citada no registro de consentimento (`consent_records.policy_version`),
 * então qualquer alteração de conteúdo deve atualizar `POLICY_VERSION`.
 */
export const POLICY_VERSION = "2026-11-11";

interface Props {
  onNavigate: (screen: string) => void;
}

const Section = ({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) => (
  <section className="mb-6">
    <h2 className="text-sm font-display font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
      <span className="w-7 h-7 rounded-xl bg-brand-primary/10 text-brand-primary grid place-items-center">
        <Icon size={14} />
      </span>
      {title}
    </h2>
    <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed space-y-2 pl-9">
      {children}
    </div>
  </section>
);

export default function PrivacyPolicy({ onNavigate }: Props) {
  return (
    <div className="w-[92%] max-w-3xl mx-auto py-6 pb-bottom-nav">
      <button
        onClick={() => onNavigate("settings")}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-brand-accent mb-4"
      >
        <ArrowLeft size={14} /> Voltar às configurações
      </button>

      <header className="mb-6">
        <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
          Política de Privacidade
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          eloEscola · versão {POLICY_VERSION} · em vigor desde 11/11/2026
        </p>
      </header>

      <Section icon={Users} title="Quem trata seus dados">
        <p>
          O eloEscola é operado pela instituição contratante (escola ou rede) com apoio técnico da
          plataforma. A instituição é a <strong>controladora</strong> dos dados de alunos, responsáveis e
          equipe; a plataforma atua como <strong>operadora</strong>, tratando os dados apenas conforme
          instrução da instituição.
        </p>
      </Section>

      <Section icon={Database} title="Quais dados tratamos">
        <ul className="list-disc pl-4 space-y-1">
          <li>
            <strong>Cadastro:</strong> nome, e-mail, telefone, CPF (quando informado pela escola), data de
            nascimento, gênero e instituição.
          </li>
          <li>
            <strong>Participação:</strong> presença em eventos e histórico de atividades escolares.
          </li>
          <li>
            <strong>Autorizações:</strong> nome do responsável, vínculo, contato, texto do termo aceito,
            data/hora do aceite e a assinatura manuscrita digitalizada.
          </li>
          <li>
            <strong>Uso do sistema:</strong> registros técnicos de acesso (data/hora, IP, navegador) e
            consumo de recursos, para segurança e faturamento.
          </li>
          <li>
            <strong>Localização:</strong> somente quando você aciona o botão de localização, para ordenar
            eventos por proximidade. Não há rastreamento contínuo nem em segundo plano.
          </li>
        </ul>
      </Section>

      <Section icon={Scale} title="Base legal e finalidade">
        <p>
          Tratamos dados para <strong>execução de contrato</strong> (uso da plataforma pela instituição),
          <strong> cumprimento de obrigação legal</strong> (registros escolares e autorizações de
          responsáveis para atividades externas) e <strong>legítimo interesse</strong> (segurança e
          prevenção a fraude). O envio de comunicações opcionais depende de consentimento, que pode ser
          revogado a qualquer momento.
        </p>
      </Section>

      <Section icon={Lock} title="Compartilhamento e parceiros">
        <p>
          <strong>Não vendemos dados de alunos.</strong> O diretório de parceiros mostra apenas informações
          do próprio parceiro. Campanhas de parceiros só aparecem se a instituição aprovar, e o parceiro
          recebe no máximo métricas agregadas (quantidade de visualizações) — nunca dados individuais de
          estudantes, responsáveis ou equipe.
        </p>
        <p>
          Operadores técnicos utilizados: provedor de banco de dados e autenticação (Supabase), provedor de
          e-mail transacional, provedor de SMS, provedor de pagamentos e provedor de inteligência
          artificial. Cada um recebe apenas o mínimo necessário.
        </p>
      </Section>

      <Section icon={Clock} title="Por quanto tempo guardamos">
        <ul className="list-disc pl-4 space-y-1">
          <li>Conta e dados de perfil: enquanto o vínculo com a instituição existir.</li>
          <li>
            Autorizações assinadas e histórico de participação: preservados conforme prazo escolar e
            obrigações legais aplicáveis (por serem comprovantes de consentimento).
          </li>
          <li>Eventos: arquivados automaticamente após o período de retenção definido pela escola.</li>
          <li>Logs técnicos e de auditoria: até 24 meses.</li>
          <li>Tokens de recuperação de senha: 30 minutos, descartados após o uso.</li>
        </ul>
      </Section>

      <Section icon={ShieldCheck} title="Seus direitos">
        <p>
          Você pode pedir confirmação de tratamento, acesso, correção, anonimização, portabilidade,
          eliminação e informação sobre compartilhamento. Use o botão{" "}
          <strong>“Falar sobre meus dados”</strong> nas configurações ou escreva para{" "}
          <a className="underline" href="mailto:privacidade@eloescola.com.br">
            privacidade@eloescola.com.br
          </a>
          . Respondemos em até 15 dias corridos.
        </p>
        <p>
          A exclusão de dados pode ser limitada quando houver obrigação legal de retenção (por exemplo,
          comprovantes de autorização de responsáveis), e nesse caso explicamos o motivo na resposta.
        </p>
      </Section>

      <Section icon={Mail} title="Segurança">
        <p>
          Senhas são guardadas apenas como hash (scrypt) — nem a escola nem a plataforma conseguem ler a
          senha original. Sessões são assinadas criptograficamente no servidor. Assinaturas digitalizadas
          ficam em armazenamento privado, acessível somente por link temporário. O acesso a dados de cada
          instituição é isolado por vínculo e verificado no servidor em toda requisição.
        </p>
      </Section>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/60 p-4 text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed">
        <strong>Nota de transparência:</strong> este documento foi escrito pela equipe técnica a partir do
        funcionamento real do sistema e está pendente de revisão jurídica antes da comercialização. O canal
        do titular já está funcional; o encarregado de dados (DPO) deve ser formalmente designado pela
        instituição.
      </div>
    </div>
  );
}
