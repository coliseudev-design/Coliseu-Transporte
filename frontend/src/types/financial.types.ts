import { BiPeriod } from './bi.types';

export interface FinancialOverview {
  faturamento_total: number;
  custo_total: number;
  lucro_bruto: number;
  margem_bruta_pct: number;
  periodo: BiPeriod;
}

export interface AccountsReceivable {
  total_recebido: number;
  total_a_receber: number;
  a_receber_15d: number;
  a_receber_30d: number;
  a_receber_60d: number;
  taxa_inadimplencia_pct: number;
  dias_medio_recebimento: number;
}

export interface AccountsPayable {
  total_pago: number;
  total_a_pagar: number;
  a_pagar_15d: number;
  a_pagar_30d: number;
  a_pagar_60d: number;
  dias_medio_pagamento: number;
}

export interface CashFlow {
  saldo_real: number;
  saldo_projetado_15d: number;
  saldo_projetado_30d: number;
  saldo_projetado_60d: number;
}

export interface FinancialAnalysisItem {
  faturamento: number;
  custo: number;
  lucro: number;
  margem_pct: number;
  quantidade_vendas: number;
}

export interface GroupAnalysisItem extends FinancialAnalysisItem {
  grupo: string;
}

export interface BrandAnalysisItem extends FinancialAnalysisItem {
  marca: string;
}

export interface FinancialDashboardResponse {
  visao_geral: FinancialOverview;
  contas_receber: AccountsReceivable;
  contas_pagar: AccountsPayable;
  fluxo_caixa: CashFlow;
  analise_por_grupo: GroupAnalysisItem[];
  analise_por_marca: BrandAnalysisItem[];
}
