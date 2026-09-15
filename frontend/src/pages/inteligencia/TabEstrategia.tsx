import React from 'react'
import ChartCard from '../../components/ChartCard'
import { Lightbulb, TrendingUp, AlertTriangle, Crosshair, Star, ShieldAlert } from 'lucide-react'
import { formatBRL } from '../../utils/format'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
  ScatterChart, Scatter, ZAxis, Cell
} from 'recharts'
import { CHART_COLORS } from '../../utils/chartColors'

// Mocks
const mockPrevisao = [
  { mes: 'Jul', real: 450000, otimista: null, pessimista: null },
  { mes: 'Ago', real: 480000, otimista: null, pessimista: null },
  { mes: 'Set', real: 510000, otimista: null, pessimista: null },
  { mes: 'Out', real: 530000, otimista: 530000, pessimista: 530000 }, // Ponto de partida proj.
  { mes: 'Nov', real: null, otimista: 590000, pessimista: 500000 },
  { mes: 'Dez', real: null, otimista: 680000, pessimista: 520000 },
]

const mockQuadrante = [
  { nome: 'Prod A', volume: 120, margem: 45, fill: CHART_COLORS.success }, // Alto volume, Alta Margem (Estrelas)
  { nome: 'Prod B', volume: 150, margem: 15, fill: CHART_COLORS.warning }, // Alto volume, Baixa Margem (Vaca leiteira)
  { nome: 'Prod C', volume: 30, margem: 60, fill: CHART_COLORS.primary }, // Baixo volume, Alta Margem (Oportunidade)
  { nome: 'Prod D', volume: 40, margem: 10, fill: CHART_COLORS.danger }, // Baixo volume, Baixa Margem (Abacaxi)
  { nome: 'Prod E', volume: 95, margem: 35, fill: CHART_COLORS.success },
  { nome: 'Prod F', volume: 60, margem: 50, fill: CHART_COLORS.primary },
]

export default function TabEstrategia() {
  return (
    <div className="space-y-6 animate-fade-in py-2">
      
      {/* Previsões de Vendas */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-brand-600">Modelagem Preditiva</h3>
          <div className="h-px bg-brand-100 flex-1"></div>
        </div>

        <ChartCard title="Projeção de Faturamento (Q4)" subtitle="Cenários Otimista vs Pessimista (Base Histórica)">
           <div className="h-[300px] mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mockPrevisao} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} tickFormatter={(v) => `R$ ${v / 1000}k`} axisLine={false} tickLine={false} />
                <Tooltip 
                  formatter={(value: any, name: string) => {
                    const label = name === 'real' ? 'Realizado' : name === 'otimista' ? 'Cenário Otimista' : 'Cenário Pessimista'
                    return [formatBRL(value), label]
                  }}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <ReferenceLine x="Out" stroke="#9CA3AF" strokeDasharray="3 3" label={{ position: 'top', value: 'Hoje', fill: '#6B7280', fontSize: 10 }} />
                
                <Line type="monotone" dataKey="real" stroke={CHART_COLORS.primary} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="otimista" stroke={CHART_COLORS.success} strokeWidth={2} strokeDasharray="5 5" dot={false} />
                <Line type="monotone" dataKey="pessimista" stroke={CHART_COLORS.danger} strokeWidth={2} strokeDasharray="5 5" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Quadrante de Produtos */}
        <div className="flex flex-col">
          <ChartCard title="Matriz de Portfólio (Produtos)" subtitle="Volume de Vendas vs Margem de Lucro (%)" className="flex-1">
            <div className="h-[280px] mt-2 relative">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis type="number" dataKey="volume" name="Volume" unit=" un" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis type="number" dataKey="margem" name="Margem" unit="%" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <ZAxis type="number" range={[100, 300]} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} 
                    formatter={(value: any, name: string) => [value, name === 'volume' ? 'Volume' : 'Margem (%)']}
                    contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
                  />
                  
                  {/* Linhas divisórias do quadrante */}
                  <ReferenceLine x={80} stroke="#E5E7EB" strokeWidth={2} />
                  <ReferenceLine y={30} stroke="#E5E7EB" strokeWidth={2} />

                  <Scatter name="Produtos" data={mockQuadrante}>
                    {mockQuadrante.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
              {/* Labels do Quadrante */}
              <div className="absolute top-2 right-4 text-[10px] font-bold text-success opacity-50">ESTRELAS (Apostar)</div>
              <div className="absolute top-2 left-12 text-[10px] font-bold text-primary opacity-50">OPORTUNIDADES</div>
              <div className="absolute bottom-6 right-4 text-[10px] font-bold text-warning opacity-50">VACAS LEITEIRAS</div>
              <div className="absolute bottom-6 left-12 text-[10px] font-bold text-danger opacity-50">ABACAXIS (Repensar)</div>
            </div>
          </ChartCard>
        </div>

        {/* Segmentação RFM e Ações */}
        <div className="flex flex-col gap-6">
          <ChartCard title="Segmentação de Clientes (RFM)" subtitle="Baseado em Recência, Frequência e Valor">
            <div className="grid grid-cols-2 gap-3 py-2">
              <div className="p-4 rounded-xl border border-success/30 bg-success/5 flex items-start gap-3">
                <Star className="text-success flex-shrink-0 mt-0.5" size={20} />
                <div>
                  <div className="font-bold text-text-primary">Clientes VIP</div>
                  <div className="text-xs text-text-secondary mt-1">Compram sempre e com ticket alto. <strong className="text-success">142 clientes</strong>.</div>
                  <button className="mt-2 text-xs font-semibold text-success hover:underline">Ver lista de retenção</button>
                </div>
              </div>
              
              <div className="p-4 rounded-xl border border-danger/30 bg-danger/5 flex items-start gap-3">
                <ShieldAlert className="text-danger flex-shrink-0 mt-0.5" size={20} />
                <div>
                  <div className="font-bold text-text-primary">Em Risco de Churn</div>
                  <div className="text-xs text-text-secondary mt-1">Alta frequência no passado, sumiram há 90+ dias. <strong className="text-danger">58 clientes</strong>.</div>
                  <button className="mt-2 text-xs font-semibold text-danger hover:underline">Ação de reativação</button>
                </div>
              </div>
            </div>
          </ChartCard>

          <ChartCard title="Recomendações da IA" subtitle="Insights acionáveis gerados automaticamente" className="flex-1">
            <div className="space-y-3 mt-2 pr-1 overflow-y-auto max-h-[160px]">
              
              <div className="flex gap-3 items-start p-3 rounded-lg hover:bg-bg-secondary transition-colors border border-transparent hover:border-border">
                <div className="p-2 bg-brand-50 rounded-lg text-brand-600">
                  <Lightbulb size={16} />
                </div>
                <div>
                  <div className="text-sm font-bold text-text-primary">Oportunidade de Upsell</div>
                  <div className="text-xs text-text-secondary mt-0.5 leading-relaxed">
                    Clientes que compram <strong>Produto SK-100</strong> têm 65% de chance de comprar <strong>Serviço Premium</strong> se oferecido no checkout.
                  </div>
                </div>
              </div>

              <div className="flex gap-3 items-start p-3 rounded-lg hover:bg-bg-secondary transition-colors border border-transparent hover:border-border">
                <div className="p-2 bg-warning/10 rounded-lg text-warning">
                  <Crosshair size={16} />
                </div>
                <div>
                  <div className="text-sm font-bold text-text-primary">Ajuste de Precificação</div>
                  <div className="text-xs text-text-secondary mt-0.5 leading-relaxed">
                    A margem do <strong>Prod D</strong> caiu 5% este mês. Sugere-se revisão de custo com fornecedor ou ajuste no preço de tabela.
                  </div>
                </div>
              </div>

            </div>
          </ChartCard>
        </div>

      </div>
    </div>
  )
}
