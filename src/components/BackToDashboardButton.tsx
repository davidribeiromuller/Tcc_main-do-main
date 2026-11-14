import { ArrowLeft, LayoutDashboard } from "lucide-react";

interface BackToDashboardButtonProps {
  /**
   * Tela de origem: para onde o botão leva.
   *
   * `null` = não se sabe de onde o usuário veio; nesse caso vai para o
   * dashboard (`admin`) se ele for administrador, ou para o mural (`feed`).
   */
  telaAnterior: string | null;
  /** Usuário conectado (decide se o dashboard existe para ele). */
  podeVerDashboard: boolean;
  /** Se a tela atual É a introdução (rótulo muda). */
  naIntroducao: boolean;
  /** Executa a navegação de volta. */
  onVoltar: () => void;
}

/**
 * Botão flutuante de "voltar ao dashboard".
 *
 * ## Por que existe
 *
 * Na tela de introdução não havia como chegar ao dashboard: o menu só aparece
 * depois que o usuário entra em outra tela, e a introdução é justamente a
 * primeira coisa que aparece ao abrir o app (`/`). Quem estava no painel,
 * voltava para a introdução e queria retornar precisava navegar manualmente
 * pelo menu — no celular, pelo menu hambúrguer.
 *
 * ## Quando aparece
 *
 * Só na introdução, e só para quem tem um dashboard para voltar (usuário
 * conectado com acesso administrativo; visitante não vê nada). Fica
 * `fixed`, acima da barra inferior do mobile e longe do assistente, que ocupa
 * o canto inferior direito.
 */
export default function BackToDashboardButton({
  telaAnterior,
  podeVerDashboard,
  naIntroducao,
  onVoltar,
}: BackToDashboardButtonProps) {
  if (!naIntroducao || !podeVerDashboard) return null;

  // Rótulo honesto: se veio do painel, diz "dashboard"; senão, o mural.
  const veioDoDashboard = telaAnterior === "admin";
  const rotulo = veioDoDashboard ? "Voltar ao dashboard" : "Ir para o dashboard";

  return (
    <button
      type="button"
      onClick={onVoltar}
      // `aria-label` explícito porque no mobile só o ícone aparece.
      aria-label={rotulo}
      title={rotulo}
      className="fixed left-3 sm:left-5 bottom-20 sm:bottom-6 z-40 inline-flex items-center gap-1.5 px-3 py-2.5 rounded-full bg-white dark:bg-brand-card-dark text-emerald-900 dark:text-brand-primary border border-emerald-200 dark:border-white/10 shadow-lg hover:bg-emerald-50 dark:hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
    >
      <ArrowLeft size={16} />
      <LayoutDashboard size={15} className="hidden sm:block" />
      <span className="text-xs font-semibold hidden sm:inline">{rotulo}</span>
    </button>
  );
}
