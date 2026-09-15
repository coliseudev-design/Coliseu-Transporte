import { useState, useEffect } from 'react'
import { useBranchPeriodQuery } from '../hooks/useApi'
import PeriodFilter from '../components/PeriodFilter'
import DataTable from '../components/DataTable'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import { formatBRL, formatBRLCompact } from '../utils/format'
import { CHART_PALETTE } from '../utils/chartColors'
import { Trophy, Package, Tag, Layers, Users, CreditCard } from 'lucide-react'

// Componente Unificado Moderno (Card de Ranking)
function RankingSection({ title, subtitle, icon: Icon, data, loading }: any) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div className="bg-bg-primary rounded-2xl shadow-sm border border-border overflow-hidden animate-fade-in">
      {/* Cabeçalho Unificado */}
      <div className="p-4 sm:p-5 border-b border-divider flex flex-col sm:flex-row sm:items-center justify-between bg-bg-secondary/50 gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-brand-50 text-brand-600 rounded-xl">
            <Icon size={24} strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">{title}</h2>
            <p className="text-sm text-text-secondary">{subtitle}</p>
          </div>
        </div>
      </div>

      {/* Grid de Conteúdo */}
      <div className="p-2 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">
        
        {/* Lado Esquerdo: Tabela */}
        <div className="flex flex-col lg:col-span-6 min-w-0">
          <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">Tabela de Desempenho</h3>
          <div className="flex-1 w-full">
            <DataTable
              loading={loading}
              data={data || []}
              empty="Sem dados no período"
              columns={[
                { key: '#', label: 'RANK', width: isMobile ? '40px' : '60px', render: (_: any, i: number) => <span className="text-text-muted mono font-semibold">{i + 1}º</span> },
                { key: 'nome', label: 'DESCRIÇÃO', render: (r: any) => <span className="font-medium text-text-primary capitalize truncate block max-w-[100px] text-[10px] sm:text-[14px] sm:max-w-[220px]" title={r.nome}>{r.nome}</span> },
                { key: 'total', label: 'FATURAMENTO', align: 'right', render: (r: any) => <span className="font-semibold text-brand-600">{formatBRL(r.total)}</span> },
              ]}
            />
          </div>
        </div>

        {/* Lado Direito: Gráfico de Barras */}
        <div className="flex flex-col lg:col-span-6 min-w-0">
          <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">Visualização de Impacto</h3>
          <div className="h-[280px] sm:h-[320px] w-full relative">
            {!loading && (!data || data.length === 0) ? (
              <div className="absolute inset-0 flex items-center justify-center border border-border rounded-xl bg-bg-secondary/50">
                <span className="text-sm text-text-muted font-medium">Sem dados para desenhar o gráfico</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data || []} layout="vertical" margin={{ left: 0, right: 30, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#6B7280' }} tickFormatter={formatBRLCompact} />
                  <YAxis 
                    type="category" 
                    dataKey="nome" 
                    tick={{ fontSize: 11, fill: '#374151', textAnchor: 'start', dx: isMobile ? -85 : -190, style: { textTransform: 'capitalize' } }} 
                    width={isMobile ? 95 : 200}
                    tickFormatter={(val) => {
                      const maxLen = isMobile ? 12 : 50;
                      return val.length > maxLen ? val.substring(0, maxLen - 1) + '...' : val;
                    }}
                  />
                  <Tooltip 
                    formatter={(v: any) => formatBRL(v)} 
                    contentStyle={{ fontSize: 12, borderRadius: '12px', border: '1px solid #f3f4f6', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} 
                    cursor={{ fill: '#f9fafb' }} 
                  />
                  <Bar dataKey="total" radius={[0, 6, 6, 0]} barSize={22} animationDuration={1000}>
                    {(data || []).map((_: any, i: number) => (
                      <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        
      </div>
    </div>
  )
}

export default function Ranking() {
  const [activeTab, setActiveTab] = useState('vendedores')

  const vendedores = useBranchPeriodQuery<any>('/ranking/vendedores', { limit: 10 })
  const produtos = useBranchPeriodQuery<any>('/ranking/produtos', { limit: 10 })
  const clientes = useBranchPeriodQuery<any>('/ranking/clientes', { limit: 10 })
  const marcas = useBranchPeriodQuery<any>('/ranking/marcas', { limit: 10 })
  const categorias = useBranchPeriodQuery<any>('/ranking/categorias', { limit: 10 })
  const especies = useBranchPeriodQuery<any>('/ranking/especies', { limit: 10 })
  
  // Normalização de Dados para o formato padronizado { nome, total }
  const getNorm = (arr: any[], nameKey1: string, nameKey2: string, valKey1: string, valKey2: string) => {
    return (arr || []).slice(0, 10).map(d => ({
      nome: d[nameKey1] || d[nameKey2] || 'Desconhecido',
      total: parseFloat(d[valKey1]) || parseFloat(d[valKey2]) || 0
    }))
  }

  const vData = getNorm(vendedores.data?.data, 'vendedor', 'nome', 'total', 'faturamento')
  const pData = getNorm(produtos.data?.data, 'produto', 'nome', 'total', 'faturamento')
  const cData = getNorm(clientes.data?.data, 'cliente', 'nome', 'total', 'faturamento')
  const mData = getNorm(marcas.data?.data, 'nome', 'marca', 'faturamento', 'total')
  const catData = getNorm(categorias.data?.data, 'nome', 'categoria', 'faturamento', 'total')
  const eData = getNorm(especies.data?.data, 'especie', 'nome', 'total', 'faturamento')

  const tabs = [
    { id: 'vendedores', label: 'Vendedores', icon: Trophy, data: vData, loading: vendedores.isLoading, subtitle: 'Volume faturado por usuário' },
    { id: 'produtos', label: 'Produtos', icon: Package, data: pData, loading: produtos.isLoading, subtitle: 'SKUs de maior rentabilidade' },
    { id: 'marcas', label: 'Marcas', icon: Tag, data: mData, loading: marcas.isLoading, subtitle: 'Marcas que lideram faturamento' },
    { id: 'categorias', label: 'Categorias', icon: Layers, data: catData, loading: categorias.isLoading, subtitle: 'Segmentos mais fortes' },
    { id: 'clientes', label: 'Clientes', icon: Users, data: cData, loading: clientes.isLoading, subtitle: 'Principais compradores' },
    { id: 'especies', label: 'Espécies', icon: CreditCard, data: eData, loading: especies.isLoading, subtitle: 'Formas de Pagamento' },
  ]

  const currentTab = tabs.find(t => t.id === activeTab) || tabs[0]

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h2 className="font-heading text-xl font-semibold text-text-primary">Super Guia de Rankings</h2>
        <p className="text-text-secondary text-sm mb-4">Métricas detalhadas separadas por categorias.</p>
        <PeriodFilter excludePeriods={['last7']} />
      </div>

      <div 
        className="grid grid-cols-3 sm:flex sm:overflow-visible sm:flex-wrap pb-2 sm:pb-0 gap-2 sm:gap-4 sm:border-b sm:border-divider w-full"
      >
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-1 py-2 sm:px-4 sm:py-3 rounded-lg sm:rounded-none sm:border-b-2 transition-all duration-300 outline-none cursor-pointer ${
                isActive 
                  ? 'bg-brand-500 text-white sm:bg-transparent sm:border-brand-500 sm:text-brand-600 font-bold shadow-md sm:shadow-none scale-105 sm:scale-100' 
                  : 'bg-bg-primary border border-border sm:border-0 sm:bg-transparent sm:border-transparent text-text-secondary hover:bg-bg-secondary sm:hover:bg-transparent sm:hover:text-text-primary sm:hover:border-border font-medium shadow-sm sm:shadow-none'
              }`}
            >
              <Icon size={16} className={isActive ? 'text-white sm:text-brand-500' : 'text-text-muted'} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10.5px] sm:text-sm whitespace-nowrap">{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Card Unificado com a Tabela e Gráfico */}
      <div className="pb-10 min-h-[500px]">
        <RankingSection 
          title={`Top 10 ${currentTab.label}`} 
          subtitle={currentTab.subtitle} 
          icon={currentTab.icon} 
          data={currentTab.data} 
          loading={currentTab.loading} 
        />
      </div>
    </div>
  )
}
