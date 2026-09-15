export interface CustomerDNA {
  id: number;
  nome: string;
  cnpj: string;
  cidade: string;
  estado: string;
  telefone: string;
  email: string;
  data_cadastro: string;
  status: string;
  tipo_cliente: string;
  segmento: string;
}

export interface CustomerMetrics {
  faturamento_total: number;
  faturamento_anual: number;
  quantidade_pedidos: number;
  ticket_medio: number;
  ultima_compra: string;
  dias_sem_comprar: number;
  frequencia_dias: number;
  margem_media_pct: number;
  risco_churn_pct: number;
}

export interface CustomerHabits {
  produto_favorito: {
    id: number;
    descricao: string;
    quantidade_comprada: number;
    valor_total: number;
    margem_pct: number;
  };
  marca_favorita: {
    marca: string;
    quantidade_comprada: number;
    valor_total: number;
    percentual_compras: number;
  };
  categoria_favorita: {
    categoria: string;
    quantidade_comprada: number;
    valor_total: number;
    percentual_compras: number;
  };
  melhor_dia_semana: string;
  melhor_horario: string;
  sazonalidade: Array<{
    mes: string;
    valor_medio: number;
    quantidade_media: number;
  }>;
}

export interface RiskAssessment {
  risco_churn_pct: number;
  motivo_risco: string;
  recomendacao: string;
  score_saude: number;
  status_saude: 'SAUDÁVEL' | 'ATENÇÃO' | 'CRÍTICO';
}

export interface CustomerOrderHistory {
  id: number;
  numero_nota: string;
  data_emissao: string;
  vendedor_nome: string;
  valor_total: number;
  quantidade_itens: number;
  margem_pct: number;
  status: string;
}

export interface Radar360Response {
  customer_dna: CustomerDNA;
  customer_metrics: CustomerMetrics;
  customer_habits: CustomerHabits;
  customer_orders_history: CustomerOrderHistory[];
  risk_assessment: RiskAssessment;
}

export interface CustomerOverview {
  total_clientes: number;
  clientes_ativos: number;
  clientes_novos: number;
  clientes_em_crescimento: number;
  clientes_em_queda: number;
  clientes_inativos: number;
  taxa_retencao_pct: number;
  valor_medio_cliente: number;
}

export interface TopCustomer {
  rank: number;
  cliente_id: number;
  nome: string;
  faturamento: number;
  quantidade_pedidos: number;
  ticket_medio: number;
  margem_media_pct: number;
  ultima_compra: string;
}

export interface InactiveCustomer {
  cliente_id: number;
  nome: string;
  dias_sem_comprar: number;
  ultima_compra: string;
  faturamento_historico: number;
  frequencia_dias: number;
  risco_churn_pct: number;
}

export interface NewCustomer {
  cliente_id: number;
  nome: string;
  data_primeira_compra: string;
  faturamento: number;
  quantidade_pedidos: number;
  ticket_medio: number;
  potencial_score: number;
}

export interface CustomerAnalyticsResponse {
  customer_overview: CustomerOverview;
  top_clientes: TopCustomer[];
  clientes_sem_comprar: InactiveCustomer[];
  clientes_novos: NewCustomer[];
}
