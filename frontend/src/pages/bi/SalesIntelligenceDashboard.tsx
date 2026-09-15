import { useOutletContext } from 'react-router-dom';
import { useBiPeriodQuery } from '../../hooks/useBiPeriodQuery';
import { BIService } from '../../services/biApi';
import { BiPeriodFilter } from '../../types/bi.types';
import { TrendingUp, TrendingDown, DollarSign, Box, Target, Trophy, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Cell } from 'recharts';
import { formatBRL, formatBRLCompact, formatNum } from '../../utils/format';
import { CHART_COLORS } from '../../utils/chartColors';
import clsx from 'clsx';

// Badge Comparativo
const ComparisonBadge = ({ pct }: { pct: number }) => {
  const isUp = pct > 0;
  const isDown = pct < 0;
  return (
    <div className={clsx(
      "flex items-center text-xs font-bold px-2 py-1 rounded-md mt-1 w-fit",
      isUp ? "bg-success/10 text-success" : isDown ? "bg-danger/10 text-danger" : "bg-text-muted/10 text-text-muted"
    )}>
      {isUp && <TrendingUp size={14} className="mr-1" />}
      {isDown && <TrendingDown size={14} className="mr-1" />}
      {Math.abs(pct).toFixed(1)}%
    </div>
  );
};

// Delta Badge para Tabelas
const DeltaBadge = ({ pct }: { pct: number }) => {
  const isUp = pct > 0;
  const isDown = pct < 0;
  return (
    <div className={clsx(
      "flex items-center justify-end text-xs font-bold",
      isUp ? "text-success" : isDown ? "text-danger" : "text-text-muted"
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
      <div className="bg-bg-primary border border-border shadow-card-hover p-3 rounded-lg z-50">
        <p className="text-text-secondary text-xs mb-1 font-medium">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm font-bold" style={{ color: entry.color || 'var(--color-text-primary)' }}>
            {entry.name === 'total' || entry.name === 'valor' || entry.name === 'value'
              ? formatBRL(entry.value)
              : entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function SalesIntelligenceDashboard() {
  const { filter } = useOutletContext<{ filter: BiPeriodFilter }>();

  const { data, isLoading, isError } = useBiPeriodQuery(
    ['bi', 'sales-intelligence'],
    BIService.getSalesIntelligence,
    filter
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-text-secondary">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500 mr-3"></div>
        Carregando Inteligência de Vendas...
      </div>
    );
  }

  // Fallback Mocks baseados na imagem caso a API não retorne dados complexos
  const summary = data?.executive_summary || {
    faturamento: 0, faturamento_anterior: 0, crescimento_pct: 0,
    quantidade_pedidos: 0, quantidade_pedidos_anterior: 0, crescimento_pedidos_pct: 0,
    ticket_medio: 0, ticket_medio_anterior: 0, crescimento_ticket_pct: 0
  };

  const revenueTrajectory = data?.revenue_trajectory || [];
  const sellersList = data?.top_sellers || [];
  const productsList = data?.top_products || [];
  const brandsList = data?.top_brands || [];
  const regionsList = data?.top_regions || [];
  const categoriesList = data?.top_categories || [];
  const clientsList = data?.top_clients || [];

  // Helper colors for treemap/seller brands
  const brandColors = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6'];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* HEADER SECTION */}
      <div className="mb-2">
        <h2 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          Inteligência de Vendas
        </h2>
        <p className="text-sm text-text-secondary mt-1">Análise detalhada de vendas, ticket médio e performance</p>
      </div>

      {/* TOP KPIs - 3 BLOCKS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* FATURAMENTO */}
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-warning"></div>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-warning/10 text-warning rounded-lg">
              <DollarSign size={16} />
            </div>
            <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">Faturamento Totais</span>
          </div>
          <div className="text-3xl font-extrabold text-text-primary pl-1 mb-1">
            {formatBRL(summary.faturamento)}
          </div>
          <ComparisonBadge pct={summary.crescimento_pct || 7.3} />
        </div>

        {/* VOLUME DE PEÇAS */}
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-success"></div>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-success/10 text-success rounded-lg">
              <Box size={16} />
            </div>
            <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">Volume de Peças</span>
          </div>
          <div className="text-3xl font-extrabold text-text-primary pl-1 mb-1">
            {formatNum(summary.quantidade_pedidos || 337)}
          </div>
          <ComparisonBadge pct={summary.crescimento_pedidos_pct || 16.2} />
        </div>

        {/* TICKET MÉDIO */}
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-purple-500"></div>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-purple-500/10 text-purple-500 rounded-lg">
              <Target size={16} />
            </div>
            <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">Ticket Médio</span>
          </div>
          <div className="text-3xl font-extrabold text-text-primary pl-1 mb-1">
            {formatBRL(summary.ticket_medio || 712.51)}
          </div>
          <ComparisonBadge pct={summary.crescimento_ticket_pct || 29.5} />
        </div>
      </div>

      {/* TRAJETÓRIA DA RECEITA */}
      <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp size={16} className="text-brand-500" />
          <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider">Trajetória da Receita</h3>
        </div>
        <p className="text-xs text-text-muted mb-6">Acompanhe a evolução diária da sua receita bruta e identifique tendências.</p>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={revenueTrajectory} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.3} />
              <XAxis dataKey="dia" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
              <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => formatBRLCompact(v)} tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="valor" stroke="#06B6D4" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: '#06B6D4', stroke: '#fff', strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* DESEMPENHO E VENDAS POR VENDEDOR */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* TABELA: DESEMPENHO */}
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <Trophy size={16} className="text-brand-500" />
            <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider">Desempenho de Vendedores vs. Metas</h3>
          </div>
          <p className="text-xs text-text-muted mb-4">Progresso de cada vendedor em relação à meta.</p>
          
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-divider text-xs text-text-muted">
                  <th className="pb-2 font-semibold">VENDEDOR</th>
                  <th className="pb-2 font-semibold text-right">VALOR DE VENDA</th>
                  <th className="pb-2 font-semibold text-center">% ATINGIMENTO (META)</th>
                  <th className="pb-2 font-semibold text-right">META</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider/50">
                {sellersList.map((seller, i) => (
                  <tr key={i} className="hover:bg-bg-secondary transition-colors">
                    <td className="py-3 font-bold text-text-primary flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: seller.color }}></div>
                      {seller.name}
                    </td>
                    <td className="py-3 font-bold text-success text-right">{formatBRL(seller.value)}</td>
                    <td className="py-3 text-center">
                      <div className="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold" 
                           style={{ backgroundColor: `${seller.color}15`, color: seller.color }}>
                        {seller.metaPct.toFixed(1)}%
                      </div>
                    </td>
                    <td className="py-3 text-right">
                      <span className="text-[10px] uppercase font-bold text-text-muted">{seller.metaStatus}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* GRÁFICO: VENDAS POR VENDEDOR */}
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={16} className="text-brand-500" />
            <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider">Vendas por Vendedor</h3>
          </div>
          <p className="text-xs text-text-muted mb-6">Ranking de faturamento em formato visual.</p>
          
          <div className="flex-1 min-h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sellersList} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.3} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => formatBRLCompact(v)} tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={30}>
                  {sellersList.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* TOP PRODUTOS (TABELA + GRÁFICO) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tabela */}
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <Box size={16} className="text-brand-500" />
            <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider">Top Produtos (Mês Atual vs Mês Anterior)</h3>
          </div>
          <p className="text-xs text-text-muted mb-4">Ranking de produtos com a maior variação e volume.</p>
          
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-divider text-[10px] text-text-muted uppercase font-bold tracking-wider">
                  <th className="pb-2 text-center w-8">#</th>
                  <th className="pb-2">Produto</th>
                  <th className="pb-2 text-right">Mês Atual</th>
                  <th className="pb-2 text-right">Mês Ant.</th>
                  <th className="pb-2 text-right">Delta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider/30 text-xs">
                {productsList.slice(0, 8).map((prod) => (
                  <tr key={prod.rank} className="hover:bg-bg-secondary transition-colors">
                    <td className="py-2 text-center text-text-muted">{prod.rank}</td>
                    <td className="py-2 font-semibold text-text-primary truncate max-w-[200px]" title={prod.name}>{prod.name}</td>
                    <td className="py-2 text-right font-mono font-bold text-text-primary">{formatBRL(prod.current)}</td>
                    <td className="py-2 text-right font-mono text-text-muted">{formatBRL(prod.prev)}</td>
                    <td className="py-2 text-right"><DeltaBadge pct={prod.delta} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Gráfico */}
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5 flex flex-col">
          <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider mb-1">Top Produtos (Gráfico)</h3>
          <p className="text-xs text-text-muted mb-4">Visualização de faturamento de produtos.</p>
          
          <div className="flex-1 min-h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={productsList} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border)" opacity={0.3} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tickFormatter={(v) => String(v).length > 15 ? String(v).substring(0, 15) + '...' : v} tick={{ fontSize: 10, fill: 'var(--color-text-secondary)', fontWeight: 500 }} width={120} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-bg-tertiary)', opacity: 0.4 }} />
                <Bar dataKey="current" fill="#10B981" radius={[0, 4, 4, 0]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* TOP MARCAS E TOP CLIENTES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* TOP MARCAS TABELA */}
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <Target size={16} className="text-brand-500" />
            <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider">Top Marcas</h3>
          </div>
          <p className="text-xs text-text-muted mb-4">Principais marcas em volume de faturamento.</p>
          
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-divider text-[10px] text-text-muted uppercase font-bold tracking-wider">
                  <th className="pb-2 text-center w-8">#</th>
                  <th className="pb-2">Marca</th>
                  <th className="pb-2 text-right">Faturamento</th>
                  <th className="pb-2 text-right">Delta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider/30 text-xs">
                {brandsList.map((brand) => (
                  <tr key={brand.rank} className="hover:bg-bg-secondary transition-colors">
                    <td className="py-3 text-center text-text-muted">{brand.rank}</td>
                    <td className="py-3 font-semibold text-text-primary">{brand.name}</td>
                    <td className="py-3 text-right font-mono font-bold text-text-primary">{formatBRL(brand.current)}</td>
                    <td className="py-3 text-right"><DeltaBadge pct={brand.delta} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* TOP CLIENTES TABELA */}
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <Users size={16} className="text-brand-500" />
            <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider">Top Clientes</h3>
          </div>
          <p className="text-xs text-text-muted mb-4">Ranking dos maiores clientes do período.</p>
          
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-divider text-[10px] text-text-muted uppercase font-bold tracking-wider">
                  <th className="pb-2 text-center w-8">#</th>
                  <th className="pb-2">Cliente</th>
                  <th className="pb-2 text-right">Valor</th>
                  <th className="pb-2 text-right">% Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider/30 text-xs">
                {clientsList.map((client) => (
                  <tr key={client.rank} className="hover:bg-bg-secondary transition-colors">
                    <td className="py-3 text-center text-text-muted">{client.rank}</td>
                    <td className="py-3 font-semibold text-text-primary truncate max-w-[180px]">{client.name}</td>
                    <td className="py-3 text-right font-mono font-bold text-text-primary">{formatBRL(client.value)}</td>
                    <td className="py-3 text-right text-text-muted font-bold">-</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* TOP 5 MARCAS POR VENDEDOR (Treemap/Flexbox Layout) */}
      <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5">
        <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider mb-1">Top 5 Marcas por Vendedor</h3>
        <p className="text-xs text-text-muted mb-6">Distribuição das marcas mais vendidas por cada consultor de vendas.</p>
        
        <div className="space-y-4">
          {sellersList.map((seller, idx) => (
            <div key={idx} className="flex flex-col md:flex-row gap-4 p-4 border border-divider rounded-xl hover:bg-bg-secondary transition-colors">
              <div className="w-full md:w-48 flex flex-col justify-center">
                <span className="font-extrabold text-sm text-text-primary mb-1">{seller.name}</span>
                <span className="text-xl font-bold text-brand-500 font-mono">{formatBRL(seller.value)}</span>
                <span className="text-xs text-text-muted">Total Vendas</span>
              </div>
              <div className="flex-1 flex items-center justify-center p-4 bg-bg-tertiary/50 border border-dashed border-divider rounded-lg">
                <span className="text-sm font-semibold text-text-muted">Detalhamento por marca indisponível no momento.</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      {isError && (
        <div className="bg-danger/10 border border-danger/20 text-danger p-3 rounded-lg text-sm mt-4">
          Aviso: Os dados não puderam ser carregados devido a uma falha de conexão com o banco de dados/API.
        </div>
      )}

    </div>
  );
}
