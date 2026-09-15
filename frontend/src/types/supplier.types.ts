export interface SupplierAnalyticsResponse {
  overview: {
    receita: number;
    custo: number;
    pedidos: number;
    clientes: number;
  };
  top_products: Array<{
    rank: number;
    name: string;
    volume: number;
    receita: number;
  }>;
  monthly_performance: Array<{
    mes: string;
    valor: number;
    qtde: number;
    margem: number;
  }>;
  available_brands: string[];
}
