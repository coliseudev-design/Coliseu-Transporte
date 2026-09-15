import { useBranchPeriodQuery } from '../hooks/useApi'
import KPICard from '../components/KPICard'
import ChartCard from '../components/ChartCard'
import PeriodFilter from '../components/PeriodFilter'
import {
  ShoppingCart, Receipt, DollarSign
} from 'lucide-react'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { formatBRL, formatBRLCompact, formatNum } from '../utils/format'
import { CHART_COLORS, CHART_PALETTE } from '../utils/chartColors'

interface VendasKPIs {
  kpis: {
    total_faturado: number;
    qtd_pedidos: number;
    ticket_medio: number;
  }
}

interface TopVendedor {
  vendedor: string;
  total_vendas: number;
}

interface Categoria {
  nome: string;
  total: number;
}

export default function Vendas() {
  const kpis = useBranchPeriodQuery<VendasKPIs>('/vendas/kpis')
  const ranking = useBranchPeriodQuery<{ data: TopVendedor[] }>('/comissoes/ranking')
  const categoriasReq = useBranchPeriodQuery<{ data: Categoria[] }>('/ranking/categorias', { limit: 10 })

  const topVendedores = ranking.data?.data || []
  const categorias = categoriasReq.data?.data || []

  return (
    <div className="space-y-4 sm:space-y-6">
      <PeriodFilter />

      {/* Resumo no Topo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <KPICard
          label="Faturamento Total"
          value={formatBRL(kpis.data?.kpis?.total_faturado || 0)}
          compactValue={formatBRLCompact(kpis.data?.kpis?.total_faturado)}
          icon={DollarSign}
          iconColor="text-success"
          loading={kpis.isLoading}
        />
        <KPICard
          label="Volume de Pedidos"
          value={formatNum(kpis.data?.kpis?.qtd_pedidos)}
          icon={ShoppingCart}
          loading={kpis.isLoading}
        />
        <KPICard
          label="Ticket Médio"
          value={formatBRL(kpis.data?.kpis?.ticket_medio)}
          icon={Receipt}
          loading={kpis.isLoading}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
        
        {/* Gráfico de Barras - Vendas por Vendedor */}
        <ChartCard
          title="Performance por Vendedor"
          subtitle="Comparativo de volume faturado"
          loading={ranking.isLoading}
          empty={!topVendedores.length}
        >
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topVendedores.slice(0, 7)} margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis 
                  dataKey="vendedor" 
                  tick={{ fontSize: 11, fill: '#6B7280' }} 
                  tickFormatter={(v) => v.split(' ')[0]} 
                />
                <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} tickFormatter={formatBRLCompact} />
                <Tooltip
                  formatter={(v: number) => formatBRL(v)}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="total_vendas" fill={CHART_COLORS.primary} radius={[6, 6, 0, 0]} name="Valor Faturado">
                  {topVendedores.map((_, i) => (
                    <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Gráfico Rosca - Distribuição por Categoria/Marca */}
        <ChartCard
          title="Distribuição por Categoria"
          subtitle="Participação (Share) no faturamento"
          loading={categoriasReq.isLoading}
          empty={!categorias.length}
        >
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categorias}
                  dataKey="total"
                  nameKey="nome"
                  cx="50%"
                  cy="50%"
                  outerRadius="80%"
                  innerRadius="50%" /* Formato Donut/Rosca */
                >
                  {categorias.map((_, i) => (
                    <Cell key={i} fill={CHART_PALETTE[(i + 3) % CHART_PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(v: number) => formatBRL(v)} 
                  contentStyle={{ fontSize: 12, borderRadius: 8 }} 
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

      </div>
    </div>
  )
}
