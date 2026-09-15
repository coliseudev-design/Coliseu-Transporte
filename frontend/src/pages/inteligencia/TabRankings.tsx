import React, { useState } from 'react'
import ChartCard from '../../components/ChartCard'
import { Filter, Users, Tag, Package, Trophy, ArrowRight } from 'lucide-react'
import { formatBRL, formatNum } from '../../utils/format'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import { CHART_COLORS } from '../../utils/chartColors'

// Mocks
const mockTopClientes = Array.from({ length: 15 }).map((_, i) => ({ nome: `Cliente Especial ${i+1}`, receita: 50000 - (i*3000), volume: 150 - (i*8) }))
const mockTopMarcas = Array.from({ length: 15 }).map((_, i) => ({ nome: `Marca Premium ${String.fromCharCode(65+i)}`, receita: 80000 - (i*4500), volume: 300 - (i*15) }))
const mockTopProdutos = Array.from({ length: 15 }).map((_, i) => ({ nome: `Produto SK-${100+i}`, receita: 30000 - (i*1500), volume: 500 - (i*20) }))

const mockFunnel = [
  { stage: 'Leads / Contatos', count: 5420, color: 'bg-brand-100', textColor: 'text-brand-800' },
  { stage: 'Propostas Enviadas', count: 3150, color: 'bg-brand-300', textColor: 'text-brand-900' },
  { stage: 'Em Negociação', count: 1840, color: 'bg-brand-500', textColor: 'text-white' },
  { stage: 'Vendas Fechadas', count: 850, color: 'bg-brand-700', textColor: 'text-white' },
]

export default function TabRankings() {
  const [metric, setMetric] = useState<'receita' | 'volume'>('receita')

  const renderRankingList = (data: any[], icon: any, colorClass: string) => {
    return (
      <div className="space-y-3 mt-4 pr-2 max-h-[360px] overflow-y-auto custom-scrollbar">
        {data.map((item, idx) => (
          <div key={idx} className="flex items-center justify-between text-sm p-3 rounded-xl border border-border bg-bg-secondary hover:shadow-card-hover transition-all group">
            <div className="flex items-center gap-3 truncate">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-white border border-border shadow-sm ${idx < 3 ? colorClass : 'text-text-tertiary'}`}>
                {idx + 1}
              </div>
              <span className="font-semibold text-text-primary truncate">{item.nome}</span>
            </div>
            <span className="font-bold font-mono text-text-primary">
              {metric === 'receita' ? formatBRL(item.receita) : formatNum(item.volume)}
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in py-2">
      
      {/* Cabeçalho de Controle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-brand-600">Rankings de Desempenho (Top 15)</h3>
        </div>
        
        <div className="flex items-center bg-bg-secondary p-1 rounded-lg border border-border">
          <button
            onClick={() => setMetric('receita')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${metric === 'receita' ? 'bg-white shadow-sm text-brand-600' : 'text-text-secondary hover:text-text-primary'}`}
          >
            Por Receita
          </button>
          <button
            onClick={() => setMetric('volume')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${metric === 'volume' ? 'bg-white shadow-sm text-brand-600' : 'text-text-secondary hover:text-text-primary'}`}
          >
            Por Volume
          </button>
        </div>
      </div>

      {/* Grid de Rankings */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        
        <ChartCard title="Top 15 Clientes" subtitle={`Ordenado por ${metric}`}>
          {renderRankingList(mockTopClientes, Users, 'text-success')}
        </ChartCard>
        
        <ChartCard title="Top 15 Marcas" subtitle={`Ordenado por ${metric}`}>
          {renderRankingList(mockTopMarcas, Tag, 'text-brand-500')}
        </ChartCard>

        <ChartCard title="Top 15 Produtos" subtitle={`Ordenado por ${metric}`}>
           {renderRankingList(mockTopProdutos, Package, 'text-warning')}
        </ChartCard>

      </div>

      {/* Análise de Funil */}
      <div className="mt-8">
        <div className="flex items-center gap-2 mb-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-brand-600">Análise de Funil de Vendas</h3>
          <div className="h-px bg-brand-100 flex-1"></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7">
            <ChartCard title="Funil Operacional" subtitle="Conversão por estágio">
              <div className="py-6 px-4 flex flex-col items-center gap-2">
                {mockFunnel.map((step, idx) => {
                  const width = 100 - (idx * 18); // Shrinking width for funnel effect
                  const nextStep = mockFunnel[idx + 1]
                  const conversionRate = nextStep ? ((nextStep.count / step.count) * 100).toFixed(1) : null

                  return (
                    <React.Fragment key={idx}>
                      {/* Funnel Block */}
                      <div 
                        className={`relative rounded-lg flex items-center justify-between px-6 py-4 shadow-sm ${step.color} ${step.textColor} transition-transform hover:scale-[1.01]`}
                        style={{ width: `${width}%`, minWidth: '220px' }}
                      >
                        <span className="font-bold tracking-wide">{step.stage}</span>
                        <span className="font-mono font-bold text-lg">{formatNum(step.count)}</span>
                      </div>
                      
                      {/* Conversion indicator between steps */}
                      {conversionRate && (
                        <div className="flex flex-col items-center -my-1 z-10 relative">
                          <div className="w-px h-6 bg-border"></div>
                          <div className={`text-[11px] font-bold px-2 py-0.5 rounded-full border border-border bg-white shadow-sm flex items-center gap-1 ${parseFloat(conversionRate) < 50 ? 'text-danger' : 'text-success'}`}>
                             {parseFloat(conversionRate) < 50 && <ArrowRight size={10} className="rotate-90 text-danger" />}
                             {conversionRate}% conversão
                          </div>
                          <div className="w-px h-6 bg-border"></div>
                        </div>
                      )}
                    </React.Fragment>
                  )
                })}
              </div>
            </ChartCard>
          </div>

          <div className="lg:col-span-5 flex flex-col gap-6">
            <ChartCard title="Diagnóstico do Funil" subtitle="Alertas de gargalo">
               <div className="space-y-4 py-2">
                 <div className="p-4 rounded-xl border border-danger/30 bg-danger/5">
                   <div className="font-bold text-danger text-sm flex items-center gap-2 mb-1">
                     <div className="w-2 h-2 rounded-full bg-danger animate-pulse"></div>
                     Gargalo Identificado
                   </div>
                   <p className="text-sm text-text-secondary leading-relaxed">
                     A taxa de conversão entre <strong className="text-text-primary">Propostas Enviadas</strong> e <strong className="text-text-primary">Em Negociação</strong> está em <span className="text-danger font-bold">58.4%</span>, abaixo da média ideal (70%).
                   </p>
                 </div>
                 
                 <div className="p-4 rounded-xl border border-success/30 bg-success/5">
                   <div className="font-bold text-success text-sm flex items-center gap-2 mb-1">
                     <Trophy size={14} />
                     Ponto Forte
                   </div>
                   <p className="text-sm text-text-secondary leading-relaxed">
                     O tempo médio de fechamento após entrar na fase de <strong className="text-text-primary">Negociação</strong> diminuiu 12% este mês. Excelente eficiência do time.
                   </p>
                 </div>
               </div>
            </ChartCard>
          </div>
        </div>
      </div>
      
    </div>
  )
}
