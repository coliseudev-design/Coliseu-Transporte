import { useOutletContext } from 'react-router-dom';
import { useBiPeriodQuery } from '../../hooks/useBiPeriodQuery';
import { BIService } from '../../services/biApi';
import { BiPeriodFilter } from '../../types/bi.types';
import { MapPin, Navigation, Map as MapIcon, Users } from 'lucide-react';

export default function HeatmapDashboard() {
  const { filter } = useOutletContext<{ filter: BiPeriodFilter }>();

  // Placeholder para requisição futura
  // const { data, isLoading } = useBiPeriodQuery(...)

  const isLoading = false;

  const mockHeatmapData = [
    { uf: 'SP', total_vendas: 1250000.00, share_pct: 45, clientes: 1250 },
    { uf: 'RJ', total_vendas: 450000.00, share_pct: 16, clientes: 420 },
    { uf: 'MG', total_vendas: 320000.00, share_pct: 11, clientes: 310 },
    { uf: 'PR', total_vendas: 210000.00, share_pct: 7, clientes: 180 },
    { uf: 'SC', total_vendas: 180000.00, share_pct: 6, clientes: 155 },
    { uf: 'Outros', total_vendas: 417000.00, share_pct: 15, clientes: 480 },
  ];

  const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-text-secondary">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500 mr-3"></div>
        Carregando Mapa de Calor...
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-bg-primary border border-border-primary rounded-xl p-4 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <span className="text-text-secondary text-sm font-medium">Principal Praça</span>
            <div className="p-2 bg-brand-500/10 text-brand-500 rounded-lg">
              <MapPin size={18} />
            </div>
          </div>
          <div className="text-2xl font-bold text-text-primary mb-1">
            São Paulo (SP)
          </div>
          <div className="flex items-center justify-between mt-auto">
            <span className="text-xs text-text-secondary">Responsável por 45% do faturamento</span>
          </div>
        </div>

        <div className="bg-bg-primary border border-border-primary rounded-xl p-4 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <span className="text-text-secondary text-sm font-medium">Ticket Médio (SP)</span>
            <div className="p-2 bg-green-500/10 text-green-500 rounded-lg">
              <Navigation size={18} />
            </div>
          </div>
          <div className="text-2xl font-bold text-text-primary mb-1">
            R$ 1.000,00
          </div>
          <div className="flex items-center justify-between mt-auto">
            <span className="text-xs text-text-secondary">Acima da média nacional</span>
          </div>
        </div>

        <div className="bg-bg-primary border border-border-primary rounded-xl p-4 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <span className="text-text-secondary text-sm font-medium">Cobertura Nacional</span>
            <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg">
              <MapIcon size={18} />
            </div>
          </div>
          <div className="text-2xl font-bold text-text-primary mb-1">
            24 Estados
          </div>
          <div className="flex items-center justify-between mt-auto">
            <span className="text-xs text-text-secondary">Atuação ativa no período</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Mapa Fake / Placeholder */}
        <div className="lg:col-span-2 bg-bg-primary border border-border-primary rounded-xl shadow-sm p-4 min-h-[400px] flex flex-col relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-text-primary flex items-center">
              <MapIcon size={18} className="text-brand-500 mr-2" /> Distribuição Geográfica de Vendas
            </h3>
          </div>
          
          <div className="flex-1 rounded-lg border border-border-primary bg-bg-secondary flex items-center justify-center relative">
            <div className="text-center">
              <MapPin size={48} className="mx-auto text-text-tertiary mb-3 opacity-20" />
              <p className="text-text-secondary text-sm max-w-sm">
                A visualização interativa do mapa será habilitada após a integração com a API do Google Maps / IBGE.
              </p>
            </div>
            
            {/* Dots simulando capitais */}
            <div className="absolute w-4 h-4 bg-red-500 rounded-full blur-md opacity-60 bottom-[30%] right-[30%] animate-pulse"></div>
            <div className="absolute w-2 h-2 bg-red-500 rounded-full bottom-[30%] right-[30%]"></div>
            
            <div className="absolute w-3 h-3 bg-orange-500 rounded-full blur-md opacity-60 bottom-[40%] right-[25%]"></div>
            <div className="absolute w-1.5 h-1.5 bg-orange-500 rounded-full bottom-[40%] right-[25%]"></div>
          </div>
        </div>

        {/* Tabela de Top UFs */}
        <div className="bg-bg-primary border border-border-primary rounded-xl shadow-sm flex flex-col">
          <div className="p-4 border-b border-border-primary flex items-center">
            <Users size={18} className="text-brand-500 mr-2" />
            <h3 className="text-base font-semibold text-text-primary">Faturamento por UF</h3>
          </div>
          <div className="p-4 space-y-4">
            {mockHeatmapData.map((uf, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-3 w-1/3">
                  <div className="w-8 text-center font-bold text-xs text-text-secondary bg-bg-secondary py-1 rounded">{uf.uf}</div>
                </div>
                <div className="w-2/3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-bold text-text-primary">{formatCurrency(uf.total_vendas)}</span>
                    <span className="text-text-secondary">{uf.share_pct}%</span>
                  </div>
                  <div className="w-full bg-bg-secondary rounded-full h-1.5">
                    <div 
                      className={`h-1.5 rounded-full ${i === 0 ? 'bg-brand-500' : 'bg-brand-400/50'}`} 
                      style={{ width: `${uf.share_pct}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
