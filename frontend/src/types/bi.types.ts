export interface BiPeriod {
  inicio: string;
  fim: string;
  label?: string;
}

export interface BiPeriodFilter {
  period?: string; // e.g. 'thisMonth', 'today', 'custom'
  startDate?: string; // ISO string YYYY-MM-DD
  endDate?: string;
  sellerId?: number;
  customerId?: number;
  city?: string;
  companyId?: number;
  brandId?: string;
  groupId?: number;
  periodoLabel?: string;
}

export type BiTrend = 'UP' | 'DOWN' | 'STABLE' | 'UP_STRONG' | 'DOWN_STRONG';
export type BiStatus = 'ATIVO' | 'INATIVO' | 'PENDENTE' | 'FATURADO' | 'CANCELADO';

export interface BiApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}
