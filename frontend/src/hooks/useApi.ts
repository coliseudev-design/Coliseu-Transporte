import { useQuery, UseQueryOptions } from '@tanstack/react-query'
import api from '../services/api'

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
