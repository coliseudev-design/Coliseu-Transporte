import api from './api';
import { BiPeriodFilter, BiApiResponse } from '../types/bi.types';
import { SalesIntelligenceResponse, SalesHubResponse, ABCAnalysisResponse } from '../types/sales.types';
import { Radar360Response, CustomerAnalyticsResponse } from '../types/customer.types';
import { FinancialDashboardResponse } from '../types/financial.types';
import { SupplierAnalyticsResponse } from '../types/supplier.types';
import { ComparativeAnalysisResponse } from '../types/comparative.types';
import { GoalsResponse } from '../types/goals.types';

export const BIService = {
  // Inteligência de Vendas
  getSalesIntelligence: async (filter: BiPeriodFilter): Promise<any> => {
    const { data } = await api.get<BiApiResponse<SalesIntelligenceResponse>>('/bi/sales/executive-summary', { params: filter });
    return data.data || data as any;
  },

  // Hub de Vendas
  getSalesHub: async (filter: BiPeriodFilter): Promise<any> => {
    // There is no single endpoint for this, but to prevent 404 we point to an existing one or create a proxy
    // For now we'll point to sales/commercial-kpis just to prevent the 404, or the user can implement the real route.
    const { data } = await api.get<BiApiResponse<any>>('/bi/sales/commercial-kpis', { params: filter });
    return data.data || data;
  },

  // Análise ABC
  getABCAnalysis: async (filter: BiPeriodFilter): Promise<any> => {
    const { data } = await api.get<BiApiResponse<any>>('/bi/sales/abc-analysis', { params: filter });
    return data.data || data;
  },

  // Análise Financeira
  getFinancialIntelligence: async (filter: BiPeriodFilter): Promise<any> => {
    const { data } = await api.get<BiApiResponse<any>>('/bi/financial/summary', { params: filter });
    return data.data || data;
  },

  // Radar 360
  getRadar360: async (customerId: number, filter: Partial<BiPeriodFilter> = {}): Promise<any> => {
    const { data } = await api.get<BiApiResponse<any>>('/bi/customer/radar-360', { params: { ...filter, id: customerId } });
    return data.data || data;
  },

  searchCustomers: async (query: string): Promise<{id: number, nome: string, cnpj: string}[]> => {
    if (!query || query.length < 3) return [];
    const { data } = await api.get<any>('/bi/customer/search', { params: { q: query } });
    return data;
  },

  // Análise de Clientes
  getCustomerAnalytics: async (filter: BiPeriodFilter): Promise<any> => {
    const { data } = await api.get<BiApiResponse<any>>('/bi/customer/analytics', { params: filter });
    return data.data || data;
  },

  // Análise de Fornecedores
  getSupplierAnalytics: async (filter: BiPeriodFilter): Promise<any> => {
    const { data } = await api.get<BiApiResponse<any>>('/bi/supplier/analytics', { params: filter });
    return data.data || data;
  },

  // Análise Comparativa
  getComparativeAnalysis: async (filter: BiPeriodFilter): Promise<any> => {
    const { data } = await api.get<BiApiResponse<any>>('/bi/comparative/summary', { params: filter });
    return data.data || data;
  },

  // Análise de Metas
  getGoals: async (filter: BiPeriodFilter): Promise<any> => {
    const { data } = await api.get<BiApiResponse<any>>('/bi/goals/summary', { params: filter });
    return data.data || data;
  },

  // Dashboard da Tela Inicial (Home)
  getDashboardHome: async (): Promise<any> => {
    const { data } = await api.get<any>('/bi/dashboard-home');
    return data;
  }
};
