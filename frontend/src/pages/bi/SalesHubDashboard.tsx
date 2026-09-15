import { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useBiPeriodQuery } from '../../hooks/useBiPeriodQuery';
import { BIService } from '../../services/biApi';
import { BiPeriodFilter } from '../../types/bi.types';
import { Box, DollarSign, Target, CheckCircle2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatBRL, formatNum, formatBRLCompact } from '../../utils/format';
import clsx from 'clsx';

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

export default function SalesHubDashboard() {
  const { filter } = useOutletContext<{ filter: BiPeriodFilter }>();

  const { data, isLoading, isError } = useBiPeriodQuery(
    ['bi', 'sales-hub'],
    BIService.getSalesHub,
    filter
  );

  const [statusFilter, setStatusFilter] = useState('TODOS');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 100;

  const { filteredOrders, currentOrders, totalPages, availableStatuses } = useMemo(() => {
    const orders = data?.recent_orders || [];
    
    const statuses = Array.from(new Set(orders.map((o: any) => o.status))).filter(Boolean) as string[];
    
    const filtered = statusFilter === 'TODOS' 
      ? orders 
      : orders.filter((o: any) => o.status === statusFilter);
    
    const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const currentOrders = filtered.slice(startIndex, startIndex + itemsPerPage);
    
    return { filteredOrders: filtered, currentOrders, totalPages, availableStatuses: statuses };
  }, [data?.recent_orders, statusFilter, currentPage]);

  const handleFilterChange = (newStatus: string) => {
    setStatusFilter(newStatus);
    setCurrentPage(1);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-text-secondary">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500 mr-3"></div>
        Carregando Hub de Vendas...
      </div>
    );
  }

  const mockSellers = data?.top_sellers || [];

  const mockRecentOrders: any[] = [];

  const heatmapData = Array.from({ length: 4 }).map(() => 
    Array.from({ length: 7 }).map(() => Math.floor(Math.random() * 10))
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* HEADER */}
      <div className="mb-2">
        <h2 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          Hub de Vendas
        </h2>
        <p className="text-sm text-text-secondary mt-1">Central de monitoramento de pedidos, status de faturamento e performance</p>
      </div>

      {/* TOP KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* VOLUME DE PEDIDOS */}
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5 relative overflow-hidden">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 bg-success/10 text-success rounded-lg">
              <Box size={16} />
            </div>
            <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">Volume de Pedidos</span>
          </div>
          <div className="text-3xl font-extrabold text-text-primary pl-1 mb-1">
            {formatNum(data?.total_pedidos || 0)} <span className="text-xs font-medium text-text-muted lowercase">pedidos</span>
          </div>
          <div className="flex justify-end text-[10px] text-success font-bold mt-1">100% atingido</div>
          <div className="w-full bg-bg-secondary h-1 mt-1 rounded-full overflow-hidden">
             <div className="bg-success h-full w-[100%]"></div>
          </div>
        </div>

        {/* FATURAMENTO */}
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5 relative overflow-hidden">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 bg-warning/10 text-warning rounded-lg">
              <DollarSign size={16} />
            </div>
            <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">Faturamento</span>
          </div>
          <div className="text-3xl font-extrabold text-text-primary pl-1 mb-1">
            {formatBRL(data?.faturamento_total || 0)}
          </div>
          <div className="flex justify-end text-[10px] text-warning font-bold mt-1">85% atingido</div>
          <div className="w-full bg-bg-secondary h-1 mt-1 rounded-full overflow-hidden">
             <div className="bg-warning h-full w-[85%]"></div>
          </div>
        </div>

        {/* TICKET MÉDIO */}
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5 relative overflow-hidden">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 bg-purple-500/10 text-purple-500 rounded-lg">
              <Target size={16} />
            </div>
            <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">Ticket Médio</span>
          </div>
          <div className="text-3xl font-extrabold text-text-primary pl-1 mb-1">
            {formatBRL(data?.ticket_medio || 0)}
          </div>
          <div className="flex justify-end text-[10px] text-purple-500 font-bold mt-1">92% atingido</div>
          <div className="w-full bg-bg-secondary h-1 mt-1 rounded-full overflow-hidden">
             <div className="bg-purple-500 h-full w-[92%]"></div>
          </div>
        </div>
      </div>

      {/* MAPA DE ATIVIDADE DE VENDAS (Heatmap Simples) */}
      <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5">
        <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider mb-1">Mapa de Atividade de Vendas</h3>
        <p className="text-xs text-text-muted mb-4">Heatmap de volume de vendas na semana (seg-dom)</p>
        
        <div className="w-full overflow-x-auto">
          <div className="min-w-[600px] border border-divider rounded-lg p-2">
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'].map(d => (
                <div key={d} className="text-center text-[10px] font-bold text-text-muted uppercase">{d}</div>
              ))}
            </div>
            <div className="flex flex-col gap-1">
              {heatmapData.map((row, rowIdx) => (
                <div key={rowIdx} className="grid grid-cols-7 gap-1">
                  {row.map((val, colIdx) => (
                    <div 
                      key={colIdx} 
                      className="h-10 sm:h-12 md:h-16 rounded-md border border-divider/30 transition-colors hover:border-brand-500"
                      style={{ 
                        backgroundColor: val === 0 ? 'var(--color-bg-secondary)' : `rgba(16, 185, 129, ${0.1 + (val / 10) * 0.9})`
                      }}
                      title={`${val} vendas`}
                    ></div>
                  ))}
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center mt-3 px-2">
              <span className="text-[10px] text-text-muted uppercase">Baixo</span>
              <span className="text-[10px] text-text-muted uppercase">Alto</span>
            </div>
          </div>
        </div>
      </div>

      {/* RANKING DE VENDEDORES & COMPARATIVO */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* RANKING (Tabela) */}
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5 flex flex-col">
          <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider mb-1">Ranking de Vendedores</h3>
          <p className="text-xs text-text-muted mb-4">Performance do time comercial de vendas</p>
          
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-divider text-[10px] text-text-muted uppercase font-bold tracking-wider">
                  <th className="pb-2 w-8 text-center">#</th>
                  <th className="pb-2">VENDEDOR</th>
                  <th className="pb-2 text-right">FATURADO</th>
                  <th className="pb-2 text-right">SHARE %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider/30 text-xs">
                {mockSellers.map((seller, i) => (
                  <tr key={i} className="hover:bg-bg-secondary transition-colors group">
                    <td className="py-3 text-center text-text-muted font-mono">{i+1}</td>
                    <td className="py-3 font-bold text-text-primary flex items-center gap-2">
                      <CheckCircle2 size={12} className="text-brand-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                      {seller.name}
                    </td>
                    <td className="py-3 text-right font-mono font-bold text-text-primary">{formatBRL(seller.value)}</td>
                    <td className="py-3 text-right font-bold text-warning">{seller.share.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* COMPARATIVO (Gráfico) */}
        <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5 flex flex-col">
          <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider mb-1">Comparativo de Vendas</h3>
          <p className="text-xs text-text-muted mb-4">Visualização de performance da equipe</p>
          
          <div className="flex-1 min-h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mockSellers} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border)" opacity={0.3} />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  axisLine={{ stroke: 'var(--color-border)' }} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: 'var(--color-text-secondary)', fontWeight: 500 }} 
                  width={60} 
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-bg-tertiary)', opacity: 0.4 }} />
                <Bar dataKey="value" fill="#10B981" radius={[0, 4, 4, 0]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* FILA DE PEDIDOS RECENTES */}
      <div className="bg-bg-primary border border-border shadow-card rounded-xl p-5 flex flex-col">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
          <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider">Fila de Pedidos Recentes</h3>
          
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted font-medium">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => handleFilterChange(e.target.value)}
              className="bg-bg-secondary border border-divider rounded-lg text-sm px-3 py-1.5 text-text-primary focus:outline-none focus:border-brand-500"
            >
              <option value="TODOS">Todos os Status</option>
              {availableStatuses.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-divider text-[10px] text-text-muted uppercase font-bold tracking-wider">
                <th className="pb-2">CÓD</th>
                <th className="pb-2">Nº NOTA</th>
                <th className="pb-2">CLIENTE</th>
                <th className="pb-2">VENDEDOR</th>
                <th className="pb-2">DATA</th>
                <th className="pb-2 text-right">VALOR TOTAL</th>
                <th className="pb-2 text-center">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider/30 text-xs">
              {currentOrders.map((order: any, i: number) => (
                <tr key={order.id || i} className="hover:bg-bg-secondary transition-colors">
                  <td className="py-2.5 font-mono text-text-muted">{order.id}</td>
                  <td className="py-2.5 text-text-primary font-medium">{order.numero_nota}</td>
                  <td className="py-2.5 text-text-primary truncate max-w-[200px]" title={order.cliente}>{order.cliente}</td>
                  <td className="py-2.5 text-text-secondary font-medium">{order.vendedor}</td>
                  <td className="py-2.5 text-text-muted">{order.data}</td>
                  <td className="py-2.5 text-right font-mono font-bold text-success">{formatBRL(order.valor)}</td>
                  <td className="py-2.5 text-center">
                    <span className={clsx(
                      "text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider",
                      order.status === 'FATURADO' || order.status === 'FINALIZADO' ? 'bg-success/10 text-success' :
                      order.status === 'CANCELADO' ? 'bg-danger/10 text-danger' :
                      'bg-warning/10 text-warning'
                    )}>
                      {order.status}
                    </span>
                  </td>
                </tr>
              ))}
              {currentOrders.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-text-muted">Nenhum pedido encontrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        {totalPages > 1 && (
          <div className="flex justify-between items-center mt-4 pt-4 border-t border-divider">
            <span className="text-xs text-text-muted">
              Mostrando {currentOrders.length} de {filteredOrders.length} pedidos
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 rounded-md text-xs font-medium border border-divider hover:bg-bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Anterior
              </button>
              <div className="flex items-center px-2">
                <span className="text-xs text-text-muted">Página {currentPage} de {totalPages}</span>
              </div>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 rounded-md text-xs font-medium border border-divider hover:bg-bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      {isError && (
        <div className="bg-danger/10 border border-danger/20 text-danger p-3 rounded-lg text-sm mt-4">
          Aviso: Os dados não puderam ser carregados devido a uma falha de conexão com o banco de dados/API.
        </div>
      )}

    </div>
  );
}
