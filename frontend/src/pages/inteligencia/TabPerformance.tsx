import React from 'react'
import KPICard from '../../components/KPICard'
import ChartCard from '../../components/ChartCard'
import {
  DollarSign, TrendingUp, ShoppingBag, Percent,
  UserPlus, HeartHandshake, UserMinus, Activity
} from 'lucide-react'
import { formatBRL, formatNum, formatPct } from '../../utils/format'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts'
import { CHART_COLORS } from '../../utils/chartColors'

// Mocks simulando dados da API para Inteligência de Vendas
const mockVisaoGeral = {
  receita: 1450000,
  volume: 3240,
  crescimentoReceita: 12.5,
  taxaConversao: 24.8,
  cac: 154.30,
  ltv: 4500,
  churn: 2.4,
}

const mockTicketHist = [
  { mes: 'Jan', valor: 380 }, { mes: 'Fev', valor: 410 },
  { mes: 'Mar', valor: 395 }, { mes: 'Abr', valor: 425 },
  { mes: 'Mai', valor: 450 }, { mes: 'Jun', valor: 447 },
]

const mockComposicaoCanal = [
  { nome: 'Loja Física', valor: 480 },
  { nome: 'E-commerce', valor: 310 },
  { nome: 'Televendas', valor: 550 },
  { nome: 'B2B', valor: 1200 },
]

export default function TabPerformance() {
  const ticketAtual = 447.50
  const ticketMeta = 500
  const percentualMeta = Math.min((ticketAtual / ticketMeta) * 100, 100)

  // Determinar cor do termômetro
  let thermoColor = 'bg-danger' // Vermelho (Abaixo 70%)
  if (percentualMeta >= 90) thermoColor = 'bg-success' // Verde (Acima 90%)
  else if (percentualMeta >= 70) thermoColor = 'bg-warning' // Amarelo (70% - 90%)

  return (
    <div className="space-y-6 animate-fade-in py-2">
      
      {/* 1. Visão Geral de Vendas */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-brand-600">Visão Geral de Performance</h3>
          <div className="h-px bg-brand-100 flex-1"></div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-4">
          <div className="col-span-1 sm:col-span-2 xl:col-span-2">
            <KPICard
              label="Receita Total"
              value={formatBRL(mockVisaoGeral.receita)}
              icon={DollarSign}
              iconColor="text-success"
              hint={`+${mockVisaoGeral.crescimentoReceita}% vs período ant.`}
            />
          </div>
          <KPICard
            label="Volume (Qtd)"
            value={formatNum(mockVisaoGeral.volume)}
            icon={ShoppingBag}
            iconColor="text-brand-500"
          />
          <KPICard
            label="Conversão"
            value={`${mockVisaoGeral.taxaConversao}%`}
            icon={Percent}
            iconColor="text-brand-400"
          />
          <KPICard
            label="CAC Médio"
            value={formatBRL(mockVisaoGeral.cac)}
            icon={UserPlus}
            iconColor="text-warning"
            hint="Custo por aquisição"
          />
          <KPICard
            label="LTV (Estimado)"
            value={formatBRL(mockVisaoGeral.ltv)}
            icon={HeartHandshake}
            iconColor="text-success"
            hint="Lifetime value"
          />
          <KPICard
            label="Churn Rate"
            value={`${mockVisaoGeral.churn}%`}
            icon={UserMinus}
            iconColor="text-danger"
          />
        </div>
      </div>

      {/* 2. Análise Detalhada do Ticket Médio */}
      <div>
        <div className="flex items-center gap-2 mb-4 mt-8">
          <h3 className="text-sm font-bold uppercase tracking-wider text-brand-600">Análise do Ticket Médio</h3>
          <div className="h-px bg-brand-100 flex-1"></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Termômetro */}
          <div className="lg:col-span-4 flex flex-col">
            <ChartCard title="Termômetro de Ticket Médio" subtitle="Acompanhamento de metas operacionais" className="flex-1">
              <div className="flex flex-col items-center justify-center h-full py-6 space-y-8">
                
                <div className="text-center">
                  <div className="text-sm font-medium text-text-secondary mb-1">Ticket Médio Atual</div>
                  <div className="text-4xl font-bold font-mono text-text-primary tracking-tight">
                    {formatBRL(ticketAtual)}
                  </div>
                </div>

                {/* Termômetro Visual */}
                <div className="w-full max-w-[200px] space-y-2">
                  <div className="flex justify-between text-xs font-semibold text-text-secondary">
                    <span>R$ 0</span>
                    <span>Meta: {formatBRL(ticketMeta)}</span>
                  </div>
                  <div className="h-6 w-full bg-bg-secondary rounded-full overflow-hidden relative border border-border shadow-inner">
                    {/* Zonas Coloridas de Fundo (Metas) */}
                    <div className="absolute inset-0 flex opacity-20">
                      <div className="h-full bg-danger w-[70%]"></div>
                      <div className="h-full bg-warning w-[20%]"></div>
                      <div className="h-full bg-success w-[10%]"></div>
                    </div>
                    {/* Barra de Progresso Real */}
                    <div 
                      className={`h-full ${thermoColor} transition-all duration-1000 ease-out relative shadow-[0_0_10px_rgba(0,0,0,0.2)]`}
                      style={{ width: `${percentualMeta}%` }}
                    >
                      {/* Brilho da barra */}
                      <div className="absolute top-0 right-0 bottom-0 w-2 bg-white/30"></div>
                    </div>
                  </div>
                  <div className="flex justify-center mt-3">
                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                      percentualMeta >= 90 ? 'bg-success/10 text-success' : 
                      percentualMeta >= 70 ? 'bg-warning/10 text-warning' : 
                      'bg-danger/10 text-danger'
                    }`}>
                      {percentualMeta >= 90 ? 'Excelente (Na Meta)' : 
                       percentualMeta >= 70 ? 'Atenção (Próx. a Meta)' : 
                       'Crítico (Abaixo do Esperado)'}
                    </span>
                  </div>
                </div>

              </div>
            </ChartCard>
          </div>

          {/* Variação Histórica */}
          <div className="lg:col-span-8 flex flex-col">
            <ChartCard title="Evolução do Ticket Médio" subtitle="Variação ao longo do tempo" className="flex-1">
              <div className="h-[250px] mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={mockTicketHist} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorTicket" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} tickFormatter={(v) => `R$ ${v}`} axisLine={false} tickLine={false} />
                    <Tooltip 
                      formatter={(value: any) => formatBRL(value)} 
                      contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Area type="monotone" dataKey="valor" stroke={CHART_COLORS.primary} strokeWidth={3} fillOpacity={1} fill="url(#colorTicket)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>

        </div>

        {/* Composição do Ticket Médio */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          <ChartCard title="Composição por Canal" subtitle="Ticket médio (R$) por canal de venda">
            <div className="h-[200px] mt-2">
               <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mockComposicaoCanal} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                  <XAxis type="number" tickFormatter={(v) => `R$${v}`} tick={{ fontSize: 10 }} />
                  <YAxis dataKey="nome" type="category" tick={{ fontSize: 11, fill: '#4B5563', fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: any) => formatBRL(v)} cursor={{fill: 'transparent'}} />
                  <Bar dataKey="valor" radius={[0, 4, 4, 0]} barSize={24}>
                    {mockComposicaoCanal.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={Object.values(CHART_COLORS)[index % 5]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
          
          <div className="lg:col-span-2">
            <ChartCard title="Insights de Composição" subtitle="Destaques rápidos do ticket médio">
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2 h-full content-center pb-6">
                  <div className="p-4 rounded-xl bg-brand-50 border border-brand-100">
                    <div className="flex items-center gap-2 text-brand-600 mb-2">
                      <Activity size={18} />
                      <span className="font-semibold text-sm">Top Vendedor</span>
                    </div>
                    <div className="text-lg font-bold text-text-primary">Carlos Mendes</div>
                    <div className="text-sm text-text-secondary mt-1">Ticket Médio: <span className="font-semibold text-success">{formatBRL(850)}</span></div>
                  </div>
                  
                  <div className="p-4 rounded-xl bg-success/5 border border-success/20">
                    <div className="flex items-center gap-2 text-success mb-2">
                      <ShoppingBag size={18} />
                      <span className="font-semibold text-sm">Produto Tracionador</span>
                    </div>
                    <div className="text-lg font-bold text-text-primary">Serviço Premium B2B</div>
                    <div className="text-sm text-text-secondary mt-1">Aumenta o ticket médio em <span className="font-semibold text-success">+45%</span></div>
                  </div>
               </div>
            </ChartCard>
          </div>
        </div>
      </div>
      
    </div>
  )
}
