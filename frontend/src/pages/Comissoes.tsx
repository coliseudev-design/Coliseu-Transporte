import { useMemo } from 'react'
import { useBranchPeriodQuery } from '../hooks/useApi'
import PeriodFilter from '../components/PeriodFilter'
import {
  Users, Percent, ArrowDownAZ, Hash, Trophy, BarChart3,
  ShoppingCart, Receipt, Tag, User, DollarSign, BadgePercent
} from 'lucide-react'
import { formatBRL, formatBRLCompact, formatNum } from '../utils/format'
import KPICard from '../components/KPICard'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

export default function Comissoes() {
  const ranking = useBranchPeriodQuery<any>('/comissoes/ranking')

  const dadosVendedores = ranking.data?.data || []

  // Ordena os vendedores por Total Vendido do maior para o menor
  const sortedData = useMemo(() => {
    return [...dadosVendedores].sort((a, b) => (b.total_vendas || 0) - (a.total_vendas || 0))
  }, [dadosVendedores])

  // Custom Tooltip for the chart
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-bg-primary p-3 rounded-lg shadow-card-hover border border-border text-sm">
          <p className="font-semibold text-text-primary mb-1">{payload[0].payload.vendedor}</p>
          <p className="text-brand-600 font-medium">Vendido: {formatBRL(payload[0].value)}</p>
          <p className="text-success font-medium">Comissão: {formatBRL(payload[0].payload.total_comissao)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold font-heading text-text-primary flex items-center gap-2">
          <Users className="text-brand-600" />
          Vendedores
        </h1>
        <PeriodFilter />
      </div>

      {ranking.isLoading ? (
        <div className="py-8 text-center text-text-secondary text-sm">Carregando dados dos vendedores...</div>
      ) : sortedData.length === 0 ? (
        <div className="py-8 text-center text-text-secondary text-sm card mt-4">Nenhum dado encontrado no período.</div>
      ) : (
        <div className="flex flex-col gap-4 sm:gap-6 mt-4">
          
          {/* Lista Resumida de Vendedores */}
          <div className="card w-full">
            <div className="flex items-center gap-2 mb-4 border-b border-divider pb-2">
              <Trophy size={18} className="text-warning" />
              <h2 className="font-heading font-semibold text-text-primary">Desempenho Consolidado</h2>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {sortedData.map((v: any, i: number) => (
                <div key={v.vendedor_id} className="border border-border rounded-xl p-4 bg-bg-primary hover:shadow-card-hover transition-shadow relative shadow-card">
                  {/* Badge Rank */}
                  <span className={`absolute -top-3 -left-3 w-8 h-8 flex items-center justify-center text-xs font-bold rounded-full shadow-md text-white ${i === 0 ? 'bg-warning' : i === 1 ? 'bg-text-muted' : 'bg-brand-500'}`}>
                    {i + 1}º
                  </span>
                  
                  <h3 className="font-semibold text-text-primary mb-3 pl-3 truncate border-b border-divider pb-2" title={v.vendedor}>
                    {v.vendedor}
                  </h3>
                  
                  <div className="space-y-4">
                    {/* Faturamento em Destaque */}
                    <div className="flex flex-col gap-1 items-center justify-center p-3 bg-brand-50 rounded-lg border border-brand-100">
                      <span className="text-brand-600 text-[10px] font-bold uppercase tracking-wider">Total Faturado</span>
                      <span className="text-2xl font-bold text-brand-700">{formatBRL(v.total_vendas)}</span>
                    </div>

                    {/* Secundário: Vendas e Ticket */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-2">
                        <div className="bg-bg-secondary p-1.5 rounded-md text-text-secondary">
                          <ShoppingCart size={14} />
                        </div>
                        <div>
                          <p className="text-[10px] text-text-secondary leading-none mb-1 uppercase font-semibold">Vendas</p>
                          <p className="font-semibold text-text-primary text-sm leading-none">{formatNum(v.qtd_vendas)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="bg-bg-secondary p-1.5 rounded-md text-text-secondary">
                          <Receipt size={14} />
                        </div>
                        <div>
                          <p className="text-[10px] text-text-secondary leading-none mb-1 uppercase font-semibold">Ticket Médio</p>
                          <p className="font-semibold text-text-primary text-sm leading-none">{formatBRL(v.ticket_medio)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Destaques Inferiores */}
                    <div className="space-y-2.5 pt-3 border-t border-divider">
                      <div className="flex flex-col gap-1 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-text-secondary text-xs flex items-center gap-1">
                            <Trophy size={12} className="text-warning"/> Maior Venda
                          </span>
                          <span className="font-bold text-text-primary">{formatBRL(v.maior_venda)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-text-secondary bg-bg-secondary px-2 py-1 rounded-md">
                          <User size={12} className="shrink-0" />
                          <span className="truncate font-medium" title={v.cliente_maior_venda}>{v.cliente_maior_venda}</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 text-sm">
                        <span className="text-text-secondary text-xs flex items-center gap-1">
                          <Tag size={12} className="text-brand-500" /> Produto Mais Vendido
                        </span>
                        <div className="text-xs text-text-primary font-medium bg-bg-secondary px-2 py-1 rounded-md truncate" title={v.melhor_produto}>
                          {v.melhor_produto}
                        </div>
                      </div>
                      
                      {v.qtd_descontos > 0 && (
                        <div className="flex justify-between items-center text-xs bg-danger/10 text-danger px-2 py-1.5 rounded-md mt-1 border border-danger/20">
                          <span className="font-medium flex items-center gap-1">
                            <BadgePercent size={12} className="shrink-0" />
                            Descontos ({v.qtd_descontos})
                          </span>
                          <span className="font-bold">{formatBRL(v.total_desconto)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

    </div>
  )
}
