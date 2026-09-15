import { useQuery, UseQueryOptions } from '@tanstack/react-query'
import api from '../services/api'
import { usePeriodStore, periodToParams } from '../store/periodStore'
import { useBranchParam } from '../contexts/BranchContext'

export function useApiQuery<T = unknown>(
  endpoint: string,
  params?: Record<string, unknown>,
  options?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<T>({
    queryKey: [endpoint, params],
    queryFn: async () => {
      const { data } = await api.get<T>(endpoint, { params })
      return data
    },
    ...options,
  })
}

/** Usa período global da store para adicionar params automaticamente */
export function usePeriodQuery<T = unknown>(endpoint: string, extra?: Record<string, unknown>) {
  const state = usePeriodStore()
  const params = { ...periodToParams(state), ...(extra || {}) }
  return useApiQuery<T>(endpoint, params)
}

/**
 * Combina período global + filtro de filial (depto_id) automaticamente.
 * Usar em TODAS as páginas que precisam do filtro por departamento/empresa.
 */
export function useBranchPeriodQuery<T = unknown>(endpoint: string, extra?: Record<string, unknown>) {
  const state = usePeriodStore()
  const branchParam = useBranchParam()
  const params = { ...periodToParams(state), ...branchParam, ...(extra || {}) }
  return useApiQuery<T>(endpoint, params)
}
