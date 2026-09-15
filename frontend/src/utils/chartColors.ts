// Paleta para gráficos (consistente e acessível no tema branco)
export const CHART_COLORS = {
  primary: '#0066CC',
  success: '#28A745',
  warning: '#FFC107',
  danger: '#DC3545',
  neutral: '#6C757D',
  purple: '#7C3AED',
  teal: '#14B8A6',
  orange: '#F97316',
  pink: '#EC4899',
  indigo: '#4F46E5',
}

export const CHART_PALETTE = [
  CHART_COLORS.primary,
  CHART_COLORS.success,
  CHART_COLORS.warning,
  CHART_COLORS.purple,
  CHART_COLORS.teal,
  CHART_COLORS.orange,
  CHART_COLORS.pink,
  CHART_COLORS.indigo,
  CHART_COLORS.danger,
  CHART_COLORS.neutral,
]

export const STATUS_COLORS: Record<string, string> = {
  VENCIDA: CHART_COLORS.danger,
  A_VENCER: CHART_COLORS.warning,
  PAGA: CHART_COLORS.success,
  FUTURA: CHART_COLORS.neutral,
  CANCELADA: CHART_COLORS.neutral,
  ABERTO: CHART_COLORS.warning,
  PROCESSANDO: CHART_COLORS.primary,
  PRONTO: CHART_COLORS.success,
  FINALIZADO: CHART_COLORS.success,
  CANCELADO: CHART_COLORS.neutral,
}
