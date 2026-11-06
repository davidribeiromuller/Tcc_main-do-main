/**
 * Format relative activity time in Portuguese (ex: "Ativo agora", "Ativo há 5 minutos", "Ativo há 2 horas", "Ativo ontem")
 */
export function formatLastActive(dateVal?: string | Date | null): {
  text: string;
  isOnline: boolean;
  statusColor: string;
  badgeBg: string;
  dotColor: string;
} {
  if (!dateVal) {
    return {
      text: "Nunca acessou",
      isOnline: false,
      statusColor: "text-slate-400 dark:text-slate-500",
      badgeBg: "bg-slate-100/80 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/50",
      dotColor: "bg-slate-300 dark:bg-slate-600"
    };
  }

  const date = typeof dateVal === 'string' ? new Date(dateVal) : dateVal;
  if (!date || isNaN(date.getTime())) {
    return {
      text: "Sem registro",
      isOnline: false,
      statusColor: "text-slate-400 dark:text-slate-500",
      badgeBg: "bg-slate-100/80 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/50",
      dotColor: "bg-slate-300 dark:bg-slate-600"
    };
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  // If clock skew or accessed in future or less than 60s
  if (diffSec < 60) {
    return {
      text: "Ativo agora",
      isOnline: true,
      statusColor: "text-emerald-700 dark:text-emerald-300",
      badgeBg: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/50",
      dotColor: "bg-emerald-500"
    };
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    const isVeryRecent = diffMin <= 10;
    return {
      text: diffMin === 1 ? "Ativo há 1 minuto" : `Ativo há ${diffMin} minutos`,
      isOnline: isVeryRecent,
      statusColor: isVeryRecent ? "text-emerald-700 dark:text-emerald-300" : "text-slate-700 dark:text-slate-300",
      badgeBg: isVeryRecent
        ? "bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200/70 dark:border-emerald-800/40"
        : "bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/50",
      dotColor: isVeryRecent ? "bg-emerald-500" : "bg-blue-400"
    };
  }

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return {
      text: diffHours === 1 ? "Ativo há 1 hora" : `Ativo há ${diffHours} horas`,
      isOnline: false,
      statusColor: "text-slate-600 dark:text-slate-300",
      badgeBg: "bg-slate-100 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/50",
      dotColor: "bg-slate-400 dark:bg-slate-500"
    };
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) {
    return {
      text: "Ativo ontem",
      isOnline: false,
      statusColor: "text-slate-600 dark:text-slate-400",
      badgeBg: "bg-slate-100 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/50",
      dotColor: "bg-slate-400 dark:bg-slate-500"
    };
  }

  if (diffDays < 30) {
    return {
      text: `Ativo há ${diffDays} dias`,
      isOnline: false,
      statusColor: "text-slate-500 dark:text-slate-400",
      badgeBg: "bg-slate-100 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/40",
      dotColor: "bg-slate-300 dark:bg-slate-600"
    };
  }

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return {
      text: diffMonths === 1 ? "Ativo há 1 mês" : `Ativo há ${diffMonths} meses`,
      isOnline: false,
      statusColor: "text-slate-500 dark:text-slate-400",
      badgeBg: "bg-slate-100 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/40",
      dotColor: "bg-slate-300 dark:bg-slate-600"
    };
  }

  const diffYears = Math.floor(diffDays / 365);
  return {
    text: diffYears === 1 ? "Ativo há 1 ano" : `Ativo há ${diffYears} anos`,
    isOnline: false,
    statusColor: "text-slate-400 dark:text-slate-500",
    badgeBg: "bg-slate-100 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700/30",
    dotColor: "bg-slate-300 dark:bg-slate-600"
  };
}

export function formatDateTimeBR(dateVal?: string | Date | null): string {
  if (!dateVal) return "Não informado";
  const date = typeof dateVal === 'string' ? new Date(dateVal) : dateVal;
  if (!date || isNaN(date.getTime())) return "Data inválida";
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
