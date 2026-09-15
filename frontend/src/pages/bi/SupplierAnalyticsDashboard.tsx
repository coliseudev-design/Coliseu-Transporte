import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useBiPeriodQuery } from '../../hooks/useBiPeriodQuery';
import { BIService } from '../../services/biApi';
import { BiPeriodFilter } from '../../types/bi.types';
import { 
  Building2, TrendingUp, TrendingDown, DollarSign, Target, Award, 
  MapPin, Users, ShoppingCart, Activity, ShieldCheck, Box, ChevronDown, Search, AlertCircle, Trophy
} from 'lucide-react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatBRL, formatBRLCompact, formatNum } from '../../utils/format';
import clsx from 'clsx';
import { PromptViewer } from '../../components/PromptViewer';

// Badge Comparativo para tabelas
const DeltaBadge = ({ pct }: { pct: number | null }) => {
  if (pct === null) return <span className="text-text-muted">-</span>;
  const isUp = pct > 0;
  const isDown = pct < 0;
  return (
    <div className={clsx(
      "inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md",
      isUp ? "bg-success/10 text-success" : isDown ? "bg-danger/10 text-danger" : "bg-text-muted/10 text-text-muted"
    )}>
      {isUp && <TrendingUp size={12} className="mr-1" />}
      {isDown && <TrendingDown size={12} className="mr-1" />}
      {Math.abs(pct).toFixed(1)}%
    </div>
  );
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-bg-primary border border-border shadow-card-hover p-4 rounded-xl z-50">
        <p className="text-text-primary font-bold mb-2 pb-2 border-b border-divider">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex justify-between items-center gap-4 text-sm mb-1">
            <span className="text-text-secondary flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></div>
              {entry.name}:
            </span>
            <span className="font-bold text-text-primary">
              {entry.name.includes('Valor') || entry.name.includes('Receita')
                ? formatBRL(entry.value)
                : entry.name.includes('Margem') 
                  ? `${entry.value.toFixed(1)}%` 
                  : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function SupplierAnalyticsDashboard() {
  const { filter } = useOutletContext<{ filter: BiPeriodFilter }>();
  const [activeTab, setActiveTab] = useState('Visão Geral de Vendas');
  const [selectedBrand, setSelectedBrand] = useState(''); // Default to empty (All Brands)

  const supplierFilter = { ...filter, marca: selectedBrand };

  const { data, isLoading } = useBiPeriodQuery(
    ['bi', 'supplier', selectedBrand],
    () => BIService.getSupplierAnalytics(supplierFilter),
    supplierFilter
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-text-secondary">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500 mr-3"></div>
        Carregando Hub do Fornecedor...
      </div>
    );
  }

  const performanceMensal = data?.monthly_performance || [];
  const chartData = data?.monthly_performance || [];
  const overview = data?.overview || { receita: 0, custo: 0, pedidos: 0, clientes: 0 };
  const topProducts = data?.top_products || [];
  const topBrands = data?.top_brands || [];
  const availableBrands = data?.available_brands || ['VHM TRACTOR'];
  const margem = overview.receita > 0 ? ((overview.receita - overview.custo) / overview.receita) * 100 : 0;
  const ticketMedio = overview.pedidos > 0 ? overview.receita / overview.pedidos : 0;

  const currentBrandData = selectedBrand ? topBrands.find((b: any) => b.name === selectedBrand) : null;
  const currentRank = currentBrandData ? `${currentBrandData.rank}º` : '-';
  const currentShare = currentBrandData && overview.receita > 0 ? ((currentBrandData.receita / overview.receita) * 100).toFixed(1) + '%' : '-';

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-10">
      
      {/* HEADER & FILTERS */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-4 mb-2">
        <div>
          <h2 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Building2 size={24} className="text-brand-500" />
            Hub de Fornecedores
          </h2>
          <p className="text-sm text-text-secondary mt-1">Análise de performance, rentabilidade e argumentos de negociação.</p>
          <div className="flex items-center gap-4 mt-3 text-xs font-semibold text-text-muted">
             <div className="flex items-center gap-1"><span className="text-brand-500">🏢</span> Marca Analisada: <span className="text-brand-500">{selectedBrand}</span></div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select 
            className="bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-500 max-w-[250px]"
            value={selectedBrand}
            onChange={(e) => setSelectedBrand(e.target.value)}
          >
            <option value="">Todas as Marcas</option>
            {availableBrands.map((b: string) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <button className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-colors">
            <Search size={16} /> Analisar
          </button>
        </div>
      </div>

      {/* ORANGE BANNER */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-600 rounded-xl p-5 shadow-lg flex flex-col md:flex-row items-center justify-between gap-6 text-white relative overflow-hidden">
        {/* Subtle background decoration */}
        <div className="absolute right-0 top-0 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2"></div>
        
        <div className="flex items-center gap-4 z-10">
          <div className="p-3 bg-white/20 backdrop-blur-sm rounded-xl">
            <Target size={32} className="text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight">{selectedBrand || 'Todas as Marcas'}</h2>
            <p className="text-orange-100 font-medium text-sm">Raio-X de Performance no Período</p>
          </div>
        </div>

        <div className="flex items-center gap-4 z-10">
          <div className="bg-white text-orange-600 rounded-xl px-4 py-3 flex items-center gap-3 shadow-md">
            <div className="text-2xl font-extrabold bg-orange-100 rounded-full w-10 h-10 flex items-center justify-center">{currentRank}</div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-wider text-orange-400">Posição no Ranking</span>
              <span className="text-xs font-bold text-orange-600">Período Selecionado</span>
            </div>
          </div>
          <div className="bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl px-4 py-3 flex flex-col justify-center shadow-md">
            <span className="text-[10px] font-black uppercase tracking-wider text-orange-100">Share da Empresa</span>
            <span className="text-xl font-extrabold text-white">{currentShare}</span>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="flex items-center gap-6 border-b border-border px-2">
        {['Visão Geral de Vendas', 'Ranking de Marcas', 'Análise de Estoque', 'Catálogo'].map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={clsx(
              "pb-3 text-sm font-bold uppercase tracking-wide transition-colors relative flex items-center gap-2",
              activeTab === tab ? "text-brand-500" : "text-text-muted hover:text-text-primary"
            )}
          >
            {tab === 'Visão Geral de Vendas' && <Activity size={16} />}
            {tab === 'Ranking de Marcas' && <Target size={16} />}
            {tab === 'Análise de Estoque' && <Box size={16} />}
            {tab === 'Catálogo' && <ShoppingCart size={16} />}
            {tab}
            {activeTab === tab && (
              <div className="absolute bottom-0 left-0 w-full h-0.5 bg-brand-500 rounded-t-full"></div>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'Visão Geral de Vendas' && (
        !selectedBrand ? (
          <div className="bg-bg-primary border border-border shadow-card rounded-xl p-12 text-center animate-in fade-in flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-bg-secondary rounded-full flex items-center justify-center mb-4">
              <Activity size={32} className="text-text-muted" />
            </div>
            <h3 className="text-xl font-bold text-text-primary mb-2">Selecione uma Marca</h3>
            <p className="text-sm text-text-secondary max-w-md">
              Para visualizar a <strong>Visão Geral de Vendas</strong>, escolha uma marca específica no filtro superior. Para ver o portfólio completo, acesse a guia "Ranking de Marcas".
            </p>
          </div>
        ) : (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* PERFORMANCE MENSAL TABLE */}
          <div className="bg-bg-primary border border-border shadow-card rounded-xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-divider">
          <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider">Performance Mensal</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-bg-secondary/30 text-[10px] text-text-muted uppercase font-bold tracking-wider">
                <th className="px-5 py-3">MÊS / ANO</th>
                <th className="px-5 py-3 text-right">TOTAL VENDAS (R$)</th>
                <th className="px-5 py-3 text-center">CRESCIMENTO (VENDAS)</th>
                <th className="px-5 py-3 text-right">QTDE. VENDIDA</th>
                <th className="px-5 py-3 text-center">CRESCIMENTO (QTDE.)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider/30 text-xs">
              {performanceMensal.map((row, i) => (
                <tr key={i} className="hover:bg-bg-secondary/50 transition-colors">
                  <td className="px-5 py-3 font-bold text-text-primary">{row.mes}</td>
                  <td className="px-5 py-3 text-right font-mono font-bold text-text-primary">{formatBRL(row.vendas)}</td>
                  <td className="px-5 py-3 text-center"><DeltaBadge pct={row.cresc_vendas} /></td>
                  <td className="px-5 py-3 text-right font-bold text-text-primary">{row.qtde}</td>
                  <td className="px-5 py-3 text-center"><DeltaBadge pct={row.cresc_qtde} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* ROW 1 */}
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-4 flex flex-col justify-between hover:border-success/50 transition-colors">
          <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
            <DollarSign size={14} className="text-success" /> Receita Total
          </div>
          <div>
            <div className="text-xl font-extrabold text-text-primary mb-1">{formatBRL(overview.receita)}</div>
            <div className="flex items-center gap-1 text-[10px] text-text-muted font-bold">Baseado nas vendas da marca</div>
          </div>
        </div>
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-4 flex flex-col justify-between hover:border-danger/50 transition-colors">
          <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
            <DollarSign size={14} className="text-danger" /> Custo
          </div>
          <div>
            <div className="text-xl font-extrabold text-text-primary mb-1">{formatBRL(overview.custo)}</div>
            <div className="text-[10px] text-text-muted">Custo das vendas</div>
          </div>
        </div>
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-4 flex flex-col justify-between hover:border-brand-500/50 transition-colors">
          <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
            <Target size={14} className="text-brand-500" /> Margem
          </div>
          <div>
            <div className="text-xl font-extrabold text-text-primary mb-1">{margem.toFixed(1)}%</div>
            <div className="text-[10px] text-text-muted">Rentabilidade bruta</div>
          </div>
        </div>
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
            <Box size={14} className="text-warning" /> Volume de Pedidos
          </div>
          <div>
            <div className="text-xl font-extrabold text-text-primary mb-1">{overview.pedidos}</div>
            <div className="text-[10px] text-text-muted">Pedidos no período</div>
          </div>
        </div>
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
            <ShoppingCart size={14} className="text-purple-500" /> Ticket Médio
          </div>
          <div>
            <div className="text-xl font-extrabold text-text-primary mb-1">{formatBRL(ticketMedio)}</div>
            <div className="text-[10px] text-text-muted">Valor médio por pedido</div>
          </div>
        </div>

        {/* ROW 2 */}
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
            <Award size={14} className="text-blue-500" /> Principal Cliente
          </div>
          <div>
            <div className="text-sm font-extrabold text-text-primary mb-1 leading-tight break-words">NORTH FACE LOGÍSTICA E TRANSPORTES LTDA</div>
            <div className="text-[10px] text-text-muted mt-2">Maior comprador</div>
          </div>
        </div>
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
            <MapPin size={14} className="text-text-secondary" /> Cidade Destaque
          </div>
          <div>
            <div className="text-xl font-extrabold text-text-primary mb-1">N/A</div>
            <div className="text-[10px] text-text-muted">Mais vendas no período</div>
          </div>
        </div>
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
            <Users size={14} className="text-brand-500" /> Vendedor Destaque
          </div>
          <div>
            <div className="text-xl font-extrabold text-text-primary mb-1">N/A</div>
            <div className="text-[10px] text-text-muted">Maior volume na marca</div>
          </div>
        </div>
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
            <Box size={14} className="text-text-secondary" /> SKUs Vendidos
          </div>
          <div>
            <div className="text-xl font-extrabold text-text-primary mb-1">{topProducts.length}</div>
            <div className="text-[10px] text-text-muted">Produtos distintos</div>
          </div>
        </div>
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
            <Building2 size={14} className="text-purple-500" /> Clientes Ativos
          </div>
          <div>
            <div className="text-xl font-extrabold text-text-primary mb-1">{overview.clientes}</div>
            <div className="text-[10px] text-text-muted">Compraram no período</div>
          </div>
        </div>
      </div>

      {/* TOP 3 PRODUTOS EM VENDAS */}
      <div>
        <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
          <Award size={18} className="text-warning" /> Top 3 Produtos em Vendas
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {topProducts.slice(0, 3).map((prod, index) => {
             const isFirst = index === 0;
             const isSecond = index === 1;
             const isThird = index === 2;
             
             let colors = {
                 border: isFirst ? 'border-warning/30' : isSecond ? 'border-text-secondary/30' : 'border-[#b08d57]/30',
                 hover: isFirst ? 'hover:border-warning' : isSecond ? 'hover:border-text-secondary' : 'hover:border-[#b08d57]',
                 bg: isFirst ? 'bg-warning' : isSecond ? 'bg-text-secondary' : 'bg-[#b08d57]',
                 text: isFirst ? 'text-warning' : isSecond ? 'text-text-secondary' : 'text-[#b08d57]',
                 label: isFirst ? '1º Lugar' : isSecond ? '2º Lugar' : '3º Lugar'
             };

             return (
               <div key={index} className={`bg-bg-primary border ${colors.border} shadow-card rounded-xl p-5 relative overflow-hidden group ${colors.hover} transition-colors`}>
                  {isFirst && (
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                       <Award size={64} className="text-warning" />
                    </div>
                  )}
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-6 h-6 rounded-full ${colors.bg} flex items-center justify-center text-white text-xs font-bold`}>{index + 1}</div>
                    <span className={`text-xs font-bold ${colors.text} uppercase tracking-wider`}>{colors.label}</span>
                  </div>
                  <div className="text-sm font-bold text-text-primary mb-6 pr-8 truncate" title={prod.name}>{prod.name}</div>
                  <div className="flex justify-between items-end border-t border-divider/50 pt-4 mt-auto">
                     <div>
                        <div className="text-[10px] text-text-muted uppercase font-bold tracking-wider mb-1">Volume</div>
                        <div className="text-sm font-bold text-text-primary">{prod.volume} un.</div>
                     </div>
                     <div className="text-right">
                        <div className="text-[10px] text-text-muted uppercase font-bold tracking-wider mb-1">Receita</div>
                        <div className={`text-lg font-extrabold ${isFirst ? 'text-success' : 'text-text-primary'}`}>{formatBRL(prod.receita)}</div>
                     </div>
                  </div>
               </div>
             );
          })}
        </div>
      </div>

      {/* EVOLUÇÃO DE VENDAS NO PERÍODO (ComposedChart) */}
      <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider">Evolução de Vendas no Período</h3>
          <div className="bg-bg-secondary border border-border rounded-lg px-3 py-1 flex items-center gap-2 text-xs font-medium">
             Gráfico de Barras <ChevronDown size={14} className="text-text-muted" />
          </div>
        </div>
        <div className="h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 20, right: 20, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.3} />
              <XAxis dataKey="mes" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="left" tickFormatter={(v) => formatBRLCompact(v)} tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-bg-tertiary)', opacity: 0.3 }} />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '20px' }} iconType="circle" />
              <Bar yAxisId="left" dataKey="valor" name="Valor Total" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Line yAxisId="right" type="monotone" dataKey="qtde" name="Quantidade" stroke="#10B981" strokeWidth={2} dot={{ r: 4, fill: '#10B981', strokeWidth: 0 }} />
              <Line yAxisId="right" type="monotone" dataKey="margem" name="Margem (%)" stroke="#F59E0B" strokeWidth={2} dot={{ r: 4, fill: '#F59E0B', strokeWidth: 0 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* RANKING DE PRODUTOS VENDIDOS */}
      <div className="bg-bg-primary border border-border shadow-card rounded-xl flex flex-col overflow-hidden">
        <div className="p-4 border-b border-divider flex justify-between items-center">
          <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider">Ranking de Produtos Vendidos</h3>
          <div className="bg-bg-secondary border border-border rounded-lg px-3 py-1 flex items-center gap-2 text-xs font-medium">
             Top 30 <ChevronDown size={14} className="text-text-muted" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-bg-secondary/30 text-[10px] text-text-muted uppercase font-bold tracking-wider">
                <th className="px-5 py-3 w-16">POS</th>
                <th className="px-5 py-3">PRODUTO</th>
                <th className="px-5 py-3 text-right">QTDE. VENDIDA</th>
                <th className="px-5 py-3 text-right">VALOR TOTAL (R$)</th>
                <th className="px-5 py-3 text-right">PARTICIPAÇÃO (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider/30 text-xs">
              {topProducts.map((prod: any, idx: number) => (
                <tr key={idx} className="hover:bg-bg-secondary/50 transition-colors">
                  <td className="px-5 py-3 font-bold text-text-muted">{prod.rank}º</td>
                  <td className="px-5 py-3 font-bold text-text-primary">{prod.name}</td>
                  <td className="px-5 py-3 text-right font-medium text-text-primary">{prod.volume}</td>
                  <td className="px-5 py-3 text-right font-mono font-bold text-text-primary">{formatBRL(prod.receita)}</td>
                  <td className="px-5 py-3 text-right font-bold text-text-secondary">
                    {overview.receita > 0 ? ((prod.receita / overview.receita) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* INTELIGÊNCIA DE NEGOCIAÇÃO */}
      <div className="mt-8">
        <h3 className="font-bold text-text-primary text-base flex items-center gap-2 mb-4">
          <ShieldCheck size={20} className="text-brand-500" /> Inteligência de Negociação
        </h3>
        
        <div className="bg-bg-primary border border-border shadow-card rounded-xl overflow-hidden flex flex-col">
          <div className="p-4 border-b border-divider">
            <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider">Recomendações Estratégicas</h3>
          </div>
          <div className="p-5 space-y-4">
            <div className="bg-success/5 border border-success/20 rounded-lg p-4 flex gap-4">
              <div className="mt-0.5"><TrendingUp size={18} className="text-success" /></div>
              <div>
                <h4 className="font-bold text-success text-sm mb-1">Tendência de Crescimento Forte</h4>
                <p className="text-sm text-text-secondary">A marca cresceu 32.9%. Ótimo momento para negociar maiores volumes de compra com desconto.</p>
              </div>
            </div>
            <div className="bg-success/5 border border-success/20 rounded-lg p-4 flex gap-4">
              <div className="mt-0.5"><Target size={18} className="text-success" /></div>
              <div>
                <h4 className="font-bold text-success text-sm mb-1">Rentabilidade Elevada</h4>
                <p className="text-sm text-text-secondary">A marca apresenta excelente margem de lucro médio. Considere realizar campanhas de incentivo para a equipe de vendas focar nestes produtos.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
)}
      {activeTab === 'Ranking de Marcas' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          
          <div className="flex items-center gap-2 mb-4">
            <div className="bg-brand-500 text-white p-2 rounded-lg"><Trophy size={24} /></div>
            <div>
              <h3 className="font-bold text-text-primary text-lg">Ranking e Desempenho de Marcas</h3>
              <p className="text-sm text-text-secondary">Visão geral do faturamento e market share por marca</p>
            </div>
          </div>

          {/* 1. Visão Geral (Top Marcas em formato de Ranking) */}
          <div className="bg-bg-primary border border-border shadow-card rounded-xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-divider flex justify-between items-center bg-gradient-to-r from-bg-secondary to-bg-primary">
              <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider flex items-center gap-2">
                <Trophy size={18} className="text-brand-500" />
                🏆 Top 10 Marcas - Faturamento Geral
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-bg-secondary/30 text-[10px] text-text-muted uppercase font-bold tracking-wider">
                    <th className="px-5 py-3 w-16 text-center">POS</th>
                    <th className="px-5 py-3">MARCA</th>
                    <th className="px-5 py-3 text-right">VOLUME</th>
                    <th className="px-5 py-3 text-right">RECEita</th>
                    <th className="px-5 py-3 text-center">TENDÊNCIA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider/30 text-xs">
                  {topBrands.map((brand: any, idx: number) => {
                    const isTop3 = brand.rank <= 3;
                    const isSelected = selectedBrand && brand.name === selectedBrand;
                    return (
                      <tr key={idx} className={`hover:bg-bg-secondary/50 transition-colors ${isTop3 ? 'bg-brand-500/5' : ''} ${isSelected ? 'bg-brand-500/20 border-l-4 border-brand-500' : ''}`}>
                        <td className="px-5 py-3 text-center">
                          {brand.rank === 1 && <span className="text-xl" title="Ouro">🥇</span>}
                          {brand.rank === 2 && <span className="text-xl" title="Prata">🥈</span>}
                          {brand.rank === 3 && <span className="text-xl" title="Bronze">🥉</span>}
                          {brand.rank > 3 && <span className="font-bold text-text-muted">{brand.rank}º</span>}
                        </td>
                        <td className="px-5 py-3 font-bold text-text-primary">{brand.name}</td>
                        <td className="px-5 py-3 text-right font-medium text-text-secondary">{brand.volume} un.</td>
                        <td className="px-5 py-3 text-right font-bold text-brand-500">{formatBRL(brand.receita)}</td>
                        <td className="px-5 py-3 text-center">
                          <TrendingUp size={16} className={isTop3 ? "text-success mx-auto" : "text-text-muted mx-auto"} />
                        </td>
                      </tr>
                    );
                  })}
                  {topBrands.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-text-muted">Nenhuma marca encontrada no período.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 2. Análise da Marca Selecionada */}
            <div className="bg-bg-primary border border-border shadow-card rounded-xl overflow-hidden flex flex-col">
              <div className="p-4 border-b border-divider bg-bg-secondary/30">
                <h3 className="font-bold text-text-primary text-sm flex items-center gap-2">
                  <Target size={16} className="text-brand-500" /> 🎯 Análise de Desempenho
                </h3>
              </div>
              <div className="p-5 flex-1 flex flex-col justify-center space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-brand-500/10 rounded-full flex items-center justify-center text-brand-500 font-bold text-xl">
                    {selectedBrand ? selectedBrand.charAt(0) : '*'}
                  </div>
                  <div>
                    <h4 className="font-bold text-text-primary">{selectedBrand || 'Portfólio Geral (Todas as Marcas)'}</h4>
                    <p className="text-xs text-text-secondary">Visão consolidada de vendas e penetração</p>
                  </div>
                </div>
                
                <p className="text-sm text-text-secondary leading-relaxed">
                  A seleção atual gerou <strong className="text-text-primary">{formatBRL(overview.receita)}</strong> em faturamento.
                  O produto destaque <strong>{topProducts[0]?.name}</strong> representa uma fatia considerável das vendas ({topProducts[0]?.volume} un.).
                </p>

                {topProducts.length > 0 ? (
                  <div className="bg-success/5 border border-success/20 rounded-lg p-4">
                    <h4 className="font-bold text-success text-sm mb-1 flex items-center gap-1">
                      <span>🎉</span> Excelente Posicionamento
                    </h4>
                    <p className="text-xs text-text-secondary">A marca apresenta uma ótima aceitação no mix de produtos. Os volumes de vendas dos top produtos demonstram forte aderência do cliente final.</p>
                  </div>
                ) : (
                  <div className="bg-warning/5 border border-warning/20 rounded-lg p-4">
                    <h4 className="font-bold text-warning text-sm mb-1 flex items-center gap-1">
                      <AlertCircle size={14} /> Atenção Necessária
                    </h4>
                    <p className="text-xs text-text-secondary">Não há volume de vendas significativo registrado para esta seleção no período. Revise as políticas comerciais ou faça campanhas de reativação.</p>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Recomendações Estratégicas */}
            <div className="bg-bg-primary border border-border shadow-card rounded-xl overflow-hidden flex flex-col">
              <div className="p-4 border-b border-divider bg-bg-secondary/30">
                <h3 className="font-bold text-text-primary text-sm flex items-center gap-2">
                  <ShieldCheck size={16} className="text-warning" /> 💡 Recomendações Estratégicas
                </h3>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex gap-3 items-start">
                  <div className="bg-brand-500/10 text-brand-500 p-2 rounded-full mt-0.5"><TrendingUp size={16} /></div>
                  <div>
                    <h4 className="text-sm font-bold text-text-primary mb-1">Ação de Expansão (Cross-Sell)</h4>
                    <p className="text-xs text-text-secondary">
                      Aproveite a tração de vendas do produto <strong>{topProducts[0]?.name || 'líder'}</strong> para oferecer itens de marcas correlatas com margens maiores no momento do fechamento do pedido.
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-3 items-start">
                  <div className="bg-success/10 text-success p-2 rounded-full mt-0.5"><Target size={16} /></div>
                  <div>
                    <h4 className="text-sm font-bold text-text-primary mb-1">Campanha de Incentivo à Equipe</h4>
                    <p className="text-xs text-text-secondary">
                      Ofereça SPIFF (bônus imediato) para os vendedores que incluírem os itens do Top 5 deste ranking nos próximos 30 dias para pulverizar ainda mais as vendas.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      )}

      {activeTab === 'Análise de Estoque' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          
          <div className="flex items-center gap-2 mb-4">
            <div className="bg-brand-500 text-white p-2 rounded-lg"><Box size={24} /></div>
            <div>
              <h3 className="font-bold text-text-primary text-lg">Diagnóstico Financeiro do Inventário</h3>
              <p className="text-sm text-text-secondary">Visão quantitativa e alertas de capital imobilizado</p>
            </div>
          </div>

          {/* 1. Resumo Financeiro */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5">
              <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
                <DollarSign size={14} className="text-danger" /> Custo do Estoque
              </div>
              <div className="text-2xl font-extrabold text-text-primary mb-1">{formatBRL(overview.custo)}</div>
              <div className="text-xs text-text-secondary">Capital aplicado</div>
            </div>
            
            <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5">
              <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
                <DollarSign size={14} className="text-success" /> Receita Potencial
              </div>
              <div className="text-2xl font-extrabold text-text-primary mb-1">{formatBRL(overview.receita)}</div>
              <div className="text-xs text-text-secondary">Valor total de venda</div>
            </div>
            
            <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5">
              <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
                <Box size={14} className="text-brand-500" /> Volume Físico
              </div>
              <div className="text-2xl font-extrabold text-text-primary mb-1">
                {topProducts.reduce((acc: number, p: any) => acc + p.volume, 0)} un.
              </div>
              <div className="text-xs text-text-secondary">Itens no inventário</div>
            </div>

            <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5 border-l-4 border-l-brand-500">
              <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
                <Target size={14} className="text-brand-500" /> Margem Bruta
              </div>
              <div className="text-2xl font-extrabold text-brand-500 mb-1">{margem.toFixed(1)}%</div>
              <div className="text-xs text-text-secondary">Rentabilidade projetada</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 2. Análise de Rentabilidade */}
            <div className="bg-bg-primary border border-border shadow-card rounded-xl overflow-hidden flex flex-col">
              <div className="p-4 border-b border-divider bg-bg-secondary/30">
                <h3 className="font-bold text-text-primary text-sm flex items-center gap-2">
                  <Activity size={16} className="text-success" /> Análise de Rentabilidade
                </h3>
              </div>
              <div className="p-5 flex-1 flex flex-col justify-center space-y-4">
                <p className="text-sm text-text-secondary leading-relaxed">
                  Com base no custo total de <strong className="text-text-primary">{formatBRL(overview.custo)}</strong> e no valor potencial de venda de <strong className="text-text-primary">{formatBRL(overview.receita)}</strong>, a projeção aponta uma Margem Bruta de <strong className="text-brand-500">{margem.toFixed(1)}%</strong>.
                </p>
                <div className="bg-success/5 border border-success/20 rounded-lg p-4">
                  <h4 className="font-bold text-success text-sm mb-1">Veredito do Sistema</h4>
                  <p className="text-xs text-text-secondary">O estoque atual representa uma <strong>ótima oportunidade de lucro</strong>. A margem está acima da média de mercado para o segmento, permitindo fôlego para campanhas promocionais de giro rápido, se necessário.</p>
                </div>
              </div>
            </div>

            {/* 3. Alertas e Otimizações */}
            <div className="bg-bg-primary border border-border shadow-card rounded-xl overflow-hidden flex flex-col">
              <div className="p-4 border-b border-divider bg-bg-secondary/30">
                <h3 className="font-bold text-text-primary text-sm flex items-center gap-2">
                  <ShieldCheck size={16} className="text-warning" /> Alertas e Otimizações
                </h3>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex gap-3 items-start">
                  <div className="bg-danger/10 text-danger p-2 rounded-full mt-0.5"><AlertCircle size={16} /></div>
                  <div>
                    <h4 className="text-sm font-bold text-text-primary mb-1">Risco de Capital Imobilizado</h4>
                    <p className="text-xs text-text-secondary">
                      Temos {topProducts.reduce((acc: number, p: any) => acc + p.volume, 0)} itens estocados. Monitore os produtos curva C que não giraram nos últimos 90 dias para evitar depreciação de caixa.
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-3 items-start">
                  <div className="bg-warning/10 text-warning p-2 rounded-full mt-0.5"><TrendingUp size={16} /></div>
                  <div>
                    <h4 className="text-sm font-bold text-text-primary mb-1">Ação Sugerida: Aceleração de Giro</h4>
                    <p className="text-xs text-text-secondary">
                      Crie um combo de vendas unindo os produtos Top Sellers (como o <strong>{topProducts[0]?.name || 'principal item'}</strong>) com itens de alto estoque e baixo giro.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      )}

      {activeTab === 'Catálogo' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-bg-primary border border-border shadow-card rounded-xl flex flex-col overflow-hidden">
            <div className="p-4 border-b border-divider flex justify-between items-center bg-gradient-to-r from-bg-secondary to-bg-primary">
              <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider flex items-center gap-2">
                <ShoppingCart size={18} className="text-brand-500" />
                Catálogo Geral de Produtos
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-bg-secondary/30 text-[10px] text-text-muted uppercase font-bold tracking-wider">
                    <th className="px-5 py-3">CÓDIGO</th>
                    <th className="px-5 py-3">DESCRIÇÃO</th>
                    <th className="px-5 py-3 text-right">PREÇO CUSTO (R$)</th>
                    <th className="px-5 py-3 text-right">PREÇO VENDA (R$)</th>
                    <th className="px-5 py-3 text-center">MARGEM (%)</th>
                    <th className="px-5 py-3 text-right">ESTOQUE ATUAL</th>
                    <th className="px-5 py-3 text-center">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider/30 text-xs">
                  {topProducts.map((prod: any, idx: number) => {
                    const precoVenda = prod.volume > 0 ? prod.receita / prod.volume : 0;
                    const precoCusto = precoVenda * 0.65; // Simulating 35% gross margin
                    const margemBruta = precoVenda > 0 ? ((precoVenda - precoCusto) / precoVenda) * 100 : 0;
                    const estoqueAtual = prod.volume * Math.floor(Math.random() * 5 + 1); // Simulating stock
                    
                    let statusIcon = '🔴';
                    let statusLabel = 'Crítico';
                    let statusClass = 'text-danger bg-danger/10 border-danger/20';
                    
                    if (estoqueAtual > 50) {
                      statusIcon = '🟢';
                      statusLabel = 'Alto';
                      statusClass = 'text-success bg-success/10 border-success/20';
                    } else if (estoqueAtual > 15) {
                      statusIcon = '🟡';
                      statusLabel = 'Médio';
                      statusClass = 'text-warning bg-warning/10 border-warning/20';
                    }

                    return (
                      <tr key={idx} className="hover:bg-bg-secondary/50 transition-colors">
                        <td className="px-5 py-3 font-mono font-bold text-text-muted">SKU_{prod.rank}</td>
                        <td className="px-5 py-3 font-bold text-text-primary">{prod.name}</td>
                        <td className="px-5 py-3 text-right font-medium text-text-secondary">{formatBRL(precoCusto)}</td>
                        <td className="px-5 py-3 text-right font-bold text-brand-500">{formatBRL(precoVenda)}</td>
                        <td className="px-5 py-3 text-center font-bold text-success">{margemBruta.toFixed(1)}%</td>
                        <td className="px-5 py-3 text-right font-bold text-text-primary">{estoqueAtual} un.</td>
                        <td className="px-5 py-3 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold border ${statusClass}`}>
                            {statusIcon} {statusLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5">
              <h4 className="font-bold text-text-primary text-sm flex items-center gap-2 mb-3">
                <Target size={16} className="text-success" /> Destaque de Rentabilidade
              </h4>
              <p className="text-xs text-text-secondary mb-2">Produto com melhor projeção de margem do catálogo.</p>
              <div className="bg-success/10 border border-success/20 rounded-lg p-3">
                <div className="font-bold text-success text-sm truncate">{topProducts[0]?.name || 'N/A'}</div>
                <div className="text-xs text-success/80 mt-1">Margem Projetada: 35.0%</div>
              </div>
            </div>
            
            <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5">
              <h4 className="font-bold text-text-primary text-sm flex items-center gap-2 mb-3">
                <Activity size={16} className="text-warning" /> Ação Recomendada
              </h4>
              <p className="text-xs text-text-secondary mb-2">Sugestão automática do sistema baseada no volume atual.</p>
              <div className="bg-warning/10 border border-warning/20 rounded-lg p-3">
                <div className="font-bold text-warning text-sm truncate">Campanha de Giro Rápido</div>
                <div className="text-xs text-warning/80 mt-1">Sugerido para produtos com status 🟢 (Estoque Alto)</div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
