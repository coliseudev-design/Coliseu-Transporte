import { useOutletContext } from 'react-router-dom';
import { useBiPeriodQuery } from '../../hooks/useBiPeriodQuery';
import { BIService } from '../../services/biApi';
import { BiPeriodFilter } from '../../types/bi.types';
import { Target, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

const StatusBadge = ({ status }: { status?: 'ATINGIDA' | 'PARCIAL' | 'NAO_ATINGIDA' }) => {
  if (status === 'ATINGIDA') return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/10 text-green-500"><CheckCircle2 size={12} className="mr-1" /> Atingida</span>;
  if (status === 'PARCIAL') return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/10 text-yellow-500"><Clock size={12} className="mr-1" /> Parcial</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500/10 text-red-500"><AlertCircle size={12} className="mr-1" /> Não Atingida</span>;
};

export default function GoalsPerformanceDashboard() {
  const { filter } = useOutletContext<{ filter: BiPeriodFilter }>();

  const { data, isLoading, isError } = useBiPeriodQuery(
    ['bi', 'goals'],
    BIService.getGoals,
    filter
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-text-secondary">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500 mr-3"></div>
        Carregando Análise de Metas...
      </div>
    );
  }

  // Mock fallback
  const mockGoals = {
    meta_geral: {
      meta_total: 150000.00,
      realizado: 125000.50,
      atingimento_pct: 83.33,
      diferenca: -25000.00,
      projecao: 135000.00,
      projecao_atingimento_pct: 90.0,
      dias_uteis: 22,
      media_diaria: 5681.82,
      meta_diaria: 6818.18,
      dias_restantes: 5
    },
    metas_por_vendedor: [
      { vendedor_id: 5, nome: "João Silva", meta: 45000.00, realizado: 45000.00, atingimento_pct: 100.0, diferenca: 0.00, status: "ATINGIDA" as const, projecao: 45000 },
      { vendedor_id: 8, nome: "Maria Santos", meta: 38000.00, realizado: 32000.00, atingimento_pct: 84.21, diferenca: -6000.00, status: "PARCIAL" as const, projecao: 36000 }
    ],
    metas_por_marca: [
      { marca: "Brand Premium", meta: 50000.00, realizado: 45000.00, atingimento_pct: 90.0, diferenca: -5000.00, status: "PARCIAL" as const, projecao: 48000 }
    ],
    metas_por_grupo: [
      { grupo: "Eletrônicos", meta: 60000.00, realizado: 50000.00, atingimento_pct: 83.33, diferenca: -10000.00, status: "PARCIAL" as const, projecao: 55000 }
    ]
  };

  const goals = data || mockGoals;
  const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      {/* Overview Metas Gerais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Meta Principal */}
        <div className="md:col-span-2 bg-bg-primary border border-border-primary rounded-xl p-6 shadow-sm flex flex-col justify-center">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-text-primary flex items-center">
              <Target size={20} className="text-brand-500 mr-2" /> Meta Global
            </h3>
            <span className="text-sm font-medium text-text-secondary">{goals.meta_geral.dias_restantes} dias restantes</span>
          </div>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div>
              <div className="text-xs text-text-secondary uppercase">Objetivo</div>
              <div className="text-xl font-bold text-text-primary">{formatCurrency(goals.meta_geral.meta_total)}</div>
            </div>
            <div>
              <div className="text-xs text-text-secondary uppercase">Realizado</div>
              <div className="text-xl font-bold text-brand-500">{formatCurrency(goals.meta_geral.realizado)}</div>
            </div>
            <div>
              <div className="text-xs text-text-secondary uppercase">Falta</div>
              <div className="text-xl font-bold text-red-500">{formatCurrency(Math.abs(goals.meta_geral.diferenca))}</div>
            </div>
            <div>
              <div className="text-xs text-text-secondary uppercase">Projeção</div>
              <div className="text-xl font-bold text-text-primary">{formatCurrency(goals.meta_geral.projecao)}</div>
            </div>
          </div>

          <div className="relative pt-1">
            <div className="flex mb-2 items-center justify-between">
              <div>
                <span className="text-xs font-semibold inline-block py-1 uppercase rounded-full text-brand-500 bg-brand-500/10 px-2">
                  Atingimento: {goals.meta_geral.atingimento_pct}%
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold inline-block text-text-secondary">
                  Proj: {goals.meta_geral.projecao_atingimento_pct}%
                </span>
              </div>
            </div>
            <div className="overflow-hidden h-3 mb-4 text-xs flex rounded-full bg-bg-secondary relative">
              {/* Projeção Marker */}
              <div 
                className="absolute top-0 bottom-0 border-l-2 border-dashed border-text-secondary z-10"
                style={{ left: `${Math.min(100, goals.meta_geral.projecao_atingimento_pct)}%` }}
                title={`Projeção: ${goals.meta_geral.projecao_atingimento_pct}%`}
              ></div>
              
              <div 
                style={{ width: `${Math.min(100, goals.meta_geral.atingimento_pct)}%` }} 
                className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center ${
                  goals.meta_geral.atingimento_pct >= 100 ? 'bg-green-500' : 
                  goals.meta_geral.atingimento_pct >= 80 ? 'bg-brand-500' : 'bg-yellow-500'
                }`}
              ></div>
            </div>
          </div>
        </div>

        {/* Informações Diárias */}
        <div className="bg-bg-primary border border-border-primary rounded-xl p-6 shadow-sm flex flex-col justify-center space-y-4">
          <h3 className="text-base font-semibold text-text-primary border-b border-border-primary pb-2">Ritmo de Vendas</h3>
          
          <div className="flex justify-between items-center">
            <span className="text-sm text-text-secondary">Meta Diária</span>
            <span className="text-sm font-bold text-text-primary">{formatCurrency(goals.meta_geral.meta_diaria)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-text-secondary">Média Diária Realizada</span>
            <span className={`text-sm font-bold ${goals.meta_geral.media_diaria >= goals.meta_geral.meta_diaria ? 'text-green-500' : 'text-yellow-500'}`}>
              {formatCurrency(goals.meta_geral.media_diaria)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-text-secondary">Dias Úteis Totais</span>
            <span className="text-sm font-bold text-text-primary">{goals.meta_geral.dias_uteis}</span>
          </div>
        </div>
      </div>

      {/* Grid de Metas Secundárias */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Vendedores */}
        <div className="bg-bg-primary border border-border-primary rounded-xl shadow-sm flex flex-col max-h-[400px]">
          <div className="p-4 border-b border-border-primary">
            <h3 className="text-base font-semibold text-text-primary">Metas por Vendedor</h3>
          </div>
          <div className="overflow-y-auto p-4 space-y-4">
            {goals.metas_por_vendedor.map(v => (
              <div key={v.vendedor_id} className="border border-border-primary rounded-lg p-3 bg-bg-secondary/20">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium text-text-primary">{v.nome}</span>
                  <StatusBadge status={v.status} />
                </div>
                <div className="flex justify-between text-xs text-text-secondary mb-1">
                  <span>{formatCurrency(v.realizado)} / {formatCurrency(v.meta)}</span>
                  <span className="font-bold text-text-primary">{v.atingimento_pct}%</span>
                </div>
                <div className="w-full bg-bg-secondary rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full ${v.atingimento_pct >= 100 ? 'bg-green-500' : 'bg-brand-500'}`} style={{ width: `${Math.min(100, v.atingimento_pct)}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Marcas */}
        <div className="bg-bg-primary border border-border-primary rounded-xl shadow-sm flex flex-col max-h-[400px]">
          <div className="p-4 border-b border-border-primary">
            <h3 className="text-base font-semibold text-text-primary">Metas por Marca</h3>
          </div>
          <div className="overflow-y-auto p-4 space-y-4">
            {goals.metas_por_marca.map((m, i) => (
              <div key={i} className="border border-border-primary rounded-lg p-3 bg-bg-secondary/20">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium text-text-primary">{m.marca}</span>
                  <StatusBadge status={m.status} />
                </div>
                <div className="flex justify-between text-xs text-text-secondary mb-1">
                  <span>{formatCurrency(m.realizado)} / {formatCurrency(m.meta)}</span>
                  <span className="font-bold text-text-primary">{m.atingimento_pct}%</span>
                </div>
                <div className="w-full bg-bg-secondary rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full ${m.atingimento_pct >= 100 ? 'bg-green-500' : 'bg-brand-500'}`} style={{ width: `${Math.min(100, m.atingimento_pct)}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {isError && (
        <div className="bg-orange-500/10 border border-orange-500/20 text-orange-500 p-3 rounded-lg text-sm mt-4">
          Aviso: Os dados não puderam ser carregados devido a uma falha de conexão com o banco de dados/API.
        </div>
      )}
    </div>
  );
}
