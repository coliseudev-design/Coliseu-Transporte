import { create } from 'zustand'

export type PeriodKey = 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth' | 'last12m' | 'custom'

export interface PeriodState {
  period: PeriodKey
  startDate?: string // ISO YYYY-MM-DD
  endDate?: string
  setPeriod: (p: PeriodKey) => void
  setCustomRange: (start: string, end: string) => void
}

export const usePeriodStore = create<PeriodState>((set) => ({
  period: 'thisMonth',
  setPeriod: (p) => set({ period: p }),
  setCustomRange: (start, end) =>
    set({ period: 'custom', startDate: start, endDate: end }),
}))

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: 'yesterday', label: 'Ontem' },
  { key: 'last7', label: 'Últimos 7 dias' },
  { key: 'thisMonth', label: 'Mês atual' },
  { key: 'lastMonth', label: 'Mês anterior' },
  { key: 'last12m', label: 'Últimos 12 meses' },
  { key: 'custom', label: 'Personalizado' },
]

// Helper para query string
export function periodToParams(state: PeriodState): Record<string, string> {
  const params: Record<string, string> = { period: state.period }
  if (state.period === 'custom' && state.startDate && state.endDate) {
    params.start_date = state.startDate
    params.end_date = state.endDate
  }
  return params
}
