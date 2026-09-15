import { BiPeriod } from './bi.types';

export interface ComparisonMetric {
  periodo_1: number;
  periodo_2: number;
  delta: number;
  delta_pct: number;
  tendencia: 'UP' | 'DOWN' | 'STABLE';
}

export interface ComparativeAnalysisResponse {
  comparacao: {
    periodo_1: BiPeriod;
    periodo_2: BiPeriod;
  };
  resumo_comparativo: {
    faturamento: ComparisonMetric;
    quantidade_pedidos: ComparisonMetric;
    ticket_medio: ComparisonMetric;
    margem_media_pct: ComparisonMetric;
  };
  ranking_comparativo: Array<{
    rank_periodo_1: number;
    rank_periodo_2: number;
    mudanca_rank: number;
    vendedor: string;
    faturamento_p1: number;
    faturamento_p2: number;
    delta_pct: number;
  }>;
}
