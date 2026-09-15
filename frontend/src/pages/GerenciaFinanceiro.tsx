import { useState, useMemo } from 'react'
import { useApiQuery } from '../hooks/useApi'
import {
  TrendingUp, TrendingDown, Minus, ArrowUpRight, ArrowDownRight,
  AlertTriangle, CheckCircle2, Clock, Users, DollarSign, BarChart2, Activity,
  Calendar, Award, RotateCcw, UserPlus, PieChart as PieIcon, ShieldAlert,
  Layers, ArrowRightLeft, Sparkles, Filter, ChevronRight, Target, Wallet, UserCheck
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  ComposedChart, PieChart, Pie, Cell, Tooltip,
  ResponsiveContainer, XAxis, YAxis, CartesianGrid,
  Legend
} from 'recharts'
import { formatBRL, formatBRLCompact } from '../utils/format'

// ─── Theme Colors ─────────────────────────────────────────────────────────────
const C = {
  indigo:   '#4F46E5',
  emerald:  '#10B981',
  coral:    '#EF4444',
  amber:    '#F59E0B',
  blue:     '#3B82F6',
  sky:      '#0EA5E9',
  purple:   '#8B5CF6',
  slate:    '#64748B',
  slateDark:'#1E293B',
  gray100:  '#F1F5F9',
  gray200:  '#E2E8F0',
}

const AGING_COLORS = ['#3B82F6', '#F59E0B', '#F97316', '#EF4444']

// ─── Helper Functions ─────────────────────────────────────────────────────────
function pct(val: number, base: number): number {
  if (!base) return 0
  return ((val - base) / base) * 100
}

function TrendBadge({ value, suffix = '%', invert = false }: { value: number; suffix?: string; invert?: boolean }) {
  const isPositive = invert ? value < 0 : value > 0
  const isNeutral  = Math.abs(value) < 0.1
  if (isNeutral) return <span className="flex items-center gap-0.5 text-xs font-bold text-slate-400"><Minus size={13} /> 0{suffix}</span>
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-black px-2 py-0.5 rounded-md ${
      isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
    }`}>
      {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
      {Math.abs(value).toFixed(1)}{suffix}
    </span>
  )
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-900/95 text-white backdrop-blur-md border border-slate-700/60 rounded-xl shadow-xl p-3 text-xs min-w-[170px] z-50">
      <p className="font-bold text-slate-200 mb-2 border-b border-slate-700 pb-1.5">{label}</p>
      {payload.map((p: any, i: number) => {
        const isCount = p.name && (p.name.includes('Títulos') || p.name.includes('Qtd') || p.name.includes('Clientes') || p.name.includes('tit.'))
        return (
          <div key={i} className="flex justify-between items-center gap-4 mb-1">
            <span className="flex items-center gap-1.5 text-slate-300 font-medium">
              <span className="w-2 h-2 rounded-full" style={{ background: p.color || p.fill }} />
              {p.name}
            </span>
            <span className="font-bold text-white">
              {isCount ? `${Number(p.value || 0).toLocaleString('pt-BR')} tit.` : (typeof p.value === 'number' ? formatBRL(p.value) : p.value)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function GerenciaFinanceiroDashboard() {
  const [activeTab, setActiveTab] = useState<'geral' | 'yoy' | 'inadimplencia' | 'recuperacao'>('geral')
  const now = new Date()
  const [periodType, setPeriodType] = useState<'thisMonth' | 'lastMonth' | 'customMonth' | 'thisYear' | 'customYear'>('thisMonth')
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear())

  // Dynamic parameters passed to BI endpoint
  const queryParams = useMemo(() => {
    return {
      period: periodType,
      month: selectedMonth,
      year: selectedYear
    }
  }, [periodType, selectedMonth, selectedYear])

  const periodLabel = useMemo(() => {
    if (periodType === 'thisMonth') return `${now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })} (Mês Atual)`
    if (periodType === 'lastMonth') {
      const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      return `${prevDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })} (Mês Fechado)`
    }
    if (periodType === 'customMonth') {
      const d = new Date(selectedYear, selectedMonth - 1, 1)
      return `${d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`
    }
    if (periodType === 'thisYear') return `Ano ${now.getFullYear()}`
    if (periodType === 'customYear') return `Ano ${selectedYear}`
    return ''
  }, [periodType, selectedMonth, selectedYear])

  // Fetch unified BI endpoint
  const { data: raw, isLoading } = useApiQuery<any>('/financeiro/bi-gerencia', queryParams)

  const d = raw || {}
  const kpis     = d.kpis || {}
  const evo      = d.evolucao_mensal || []
  const aging    = d.inadimplencia_aging || []
  const cart     = d.carteira_clientes || []
  const mom      = d.comparativo_mom || {}
  const yoy      = d.yoy_mensal || []
  const recupTop = d.recuperacao_top_meses || []
  const mtd      = d.mtd || {}

  // Filter YoY chart data to only include months up to the current month (no future zero drop/bars)
  const yoyFiltered = useMemo(() => {
    const currentMonthNum = new Date().getMonth() + 1
    return yoy.filter((r: any) => r.mes_num <= currentMonthNum)
  }, [yoy])

  // Derived calculations for Best Month KPI
  const bestMonthObj = useMemo(() => {
    if (!evo.length) return { label: '—', valor: 0 }
    const best = evo.reduce((max: any, item: any) => (item.valor_recebido > max.valor_recebido ? item : max), evo[0])
    return { label: best.mes || '—', valor: best.valor_recebido || 0 }
  }, [evo])

  // Key KPI values for Cards
  const valAtual          = kpis.mes_atual?.valor_recebido || 0
  const valAnterior       = kpis.mes_anterior?.valor_recebido || 0
  const valRetrasado      = kpis.mes_retrasado?.valor_recebido || 0
  const gapParaSuperar    = Math.max(0, valAnterior - valAtual)
  const metaPct           = valAnterior > 0 ? Number(((valAtual / valAnterior) * 100).toFixed(1)) : 100
  const valInadimplente   = kpis.mes_atual?.valor_inadimplente || 0
  const pctInadimplencia  = kpis.mes_atual?.inadimplencia_pct || 0
  const valAReceber       = kpis.mes_atual?.valor_a_receber || 0
  const qtdAReceber       = kpis.mes_atual?.qtd_a_receber || 0
  const valRecuperado     = kpis.mes_atual?.valor_fora_prazo || 0
  const pctRecuperado     = valAtual > 0 ? Number(((valRecuperado / valAtual) * 100).toFixed(1)) : 0
  const valNoPrazo        = Math.max(0, valAtual - valRecuperado)
  const pctNoPrazo        = valAtual > 0 ? Number(((valNoPrazo / valAtual) * 100).toFixed(1)) : 0
  const novosClientes     = cart[cart.length - 1]?.clientes_novos || 0
  const baseAtiva         = kpis.mes_atual?.clientes_ativos || cart[cart.length - 1]?.clientes_ativos || 0

  // State for Month Selection (Mês Atual vs Mês Anterior)
  const [selectedMonthTab, setSelectedMonthTab] = useState<'atual' | 'anterior'>('atual')

  // Datasets for Tab 5 (Clientes & Faturamento por Classe & Top 30)
  const clientesPorClasseRaw = d.clientes_por_classe || {}
  const planoContasRaw       = d.plano_contas_recebido || {}
  const top30Raw             = d.top30_clientes || {}

  const clientesPorClasse = useMemo(() => {
    return selectedMonthTab === 'atual' ? (clientesPorClasseRaw.mes_atual || []) : (clientesPorClasseRaw.mes_anterior || [])
  }, [clientesPorClasseRaw, selectedMonthTab])

  const planoContas = useMemo(() => {
    return selectedMonthTab === 'atual' ? (planoContasRaw.mes_atual || []) : (planoContasRaw.mes_anterior || [])
  }, [planoContasRaw, selectedMonthTab])

  const top30 = useMemo(() => {
    return selectedMonthTab === 'atual' ? (top30Raw.mes_atual || []) : (top30Raw.mes_anterior || [])
  }, [top30Raw, selectedMonthTab])

  const totalRecebidoTop30 = useMemo(() => {
    return top30.reduce((acc: number, item: any) => acc + (item.valor_recebido || 0), 0)
  }, [top30])

  const totalRecebidoClasse = useMemo(() => {
    return clientesPorClasse.reduce((acc: number, item: any) => acc + (item.valor_recebido || 0), 0)
  }, [clientesPorClasse])

  const totalClientesClasse = useMemo(() => {
    return clientesPorClasse.reduce((acc: number, item: any) => acc + (item.qtd_clientes || 0), 0)
  }, [clientesPorClasse])

  // Total A Receber (Vencidos + A Vencer)
  const valTotalAReceber  = valInadimplente + valAReceber
  const pctVencidos       = valTotalAReceber > 0 ? Number(((valInadimplente / valTotalAReceber) * 100).toFixed(1)) : 0
  const pctAVencer        = valTotalAReceber > 0 ? Number(((valAReceber / valTotalAReceber) * 100).toFixed(1)) : 0

  // Aging summary for Tab 3 (Uses total portfolio aging summary from backend so sum of buckets 100% matches total vencido)
  const agingSummary = d.inadimplencia_aging_summary || {}
  const aging1_30   = agingSummary.aging_1_30   || { qtd: 0, valor: 0 }
  const aging31_60  = agingSummary.aging_31_60  || { qtd: 0, valor: 0 }
  const aging61_90  = agingSummary.aging_61_90  || { qtd: 0, valor: 0 }
  const agingMais90 = agingSummary.aging_mais_90 || { qtd: 0, valor: 0 }
  const totalValAgingSum = aging1_30.valor + aging31_60.valor + aging61_90.valor + agingMais90.valor
  const totalQtdAgingSum = aging1_30.qtd + aging31_60.qtd + aging61_90.qtd + agingMais90.qtd

  // Faixas de Recuperação & Média de Atraso
  const recuperacaoFaixas = d.recuperacao_faixas || {
    media_dias_atraso: 0,
    no_dia: { valor: 0, qtd: 0, pct: 0 },
    dias_1_10: { valor: 0, qtd: 0, pct: 0 },
    mais_10_dias: { valor: 0, qtd: 0, pct: 0 },
  }

  // Resumo de Aquisição de Clientes (Mês Atual vs Anterior & YTD Atual vs YTD Anterior)
  const aquisicaoResumo = d.aquisicao_resumo || {
    mes_atual: 0,
    mes_anterior: 0,
    mom_pct: 0,
    ytd_atual: 0,
    ytd_anterior: 0,
    yoy_pct: 0,
  }

  // Total YTD calculations for YoY Tab
  const ytdAtual    = yoyFiltered.reduce((acc: number, r: any) => acc + (r.valor_atual || 0), 0)
  const ytdAnterior = yoyFiltered.reduce((acc: number, r: any) => acc + (r.valor_anterior || 0), 0)
  const pctYtd      = pct(ytdAtual, ytdAnterior)

  const doughnutData = [
    { name: 'No Prazo', value: Math.max(0, valNoPrazo) },
    { name: 'Fora do Prazo (Recuperado)', value: Math.max(0, valRecuperado) },
  ]

  const tabs = [
    { id: 'geral',        label: 'Visão Geral & Recebimentos',       icon: BarChart2 },
    { id: 'yoy',          label: 'Comparativo de Performance (YoY)',  icon: ArrowRightLeft },
    { id: 'inadimplencia',label: 'Saúde da Carteira & Inadimplência', icon: ShieldAlert },
    { id: 'recuperacao',  label: 'Eficiência de Recuperação',        icon: RotateCcw },
  ]

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-80 space-y-3">
        <div className="animate-spin w-10 h-10 rounded-full border-4 border-indigo-600 border-t-transparent shadow-md" />
        <span className="text-sm font-bold text-slate-600 animate-pulse">Carregando inteligência financeira NEXOS...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* ── 1. HEADER FIXO ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white/70 backdrop-blur-xl p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-ping" />
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Dashboard Financeiro & Inadimplência
            </h1>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1 flex items-center gap-1.5">
            <span>Acompanhando performance analítica de</span>
            <span className="font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md capitalize">
              {periodLabel}
            </span>
          </p>
        </div>

        {/* Botões de Acesso Rápido a Períodos e Seletores Personalizados */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setPeriodType('thisMonth')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 shadow-sm border ${
              periodType === 'thisMonth'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-indigo-200'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            Este Mês
          </button>

          <button
            onClick={() => setPeriodType('lastMonth')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 shadow-sm border ${
              periodType === 'lastMonth'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-indigo-200'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            Mês Anterior (Fechado)
          </button>

          {/* Mês/Ano Personalizado Selector */}
          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold border transition-all ${
            periodType === 'customMonth' ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-slate-200 text-slate-600'
          }`}>
            <Calendar size={13} className="text-indigo-600" />
            <select
              value={periodType === 'customMonth' ? selectedMonth : ''}
              onChange={(e) => {
                const m = parseInt(e.target.value, 10)
                if (m) {
                  setSelectedMonth(m)
                  setPeriodType('customMonth')
                }
              }}
              className="bg-transparent font-bold focus:outline-none cursor-pointer"
            >
              <option value="" disabled>Mês...</option>
              {[
                { v: 1, l: 'Jan' }, { v: 2, l: 'Fev' }, { v: 3, l: 'Mar' },
                { v: 4, l: 'Abr' }, { v: 5, l: 'Mai' }, { v: 6, l: 'Jun' },
                { v: 7, l: 'Jul' }, { v: 8, l: 'Ago' }, { v: 9, l: 'Set' },
                { v: 10, l: 'Out' }, { v: 11, l: 'Nov' }, { v: 12, l: 'Dez' },
              ].map(m => (
                <option key={m.v} value={m.v}>{m.l}</option>
              ))}
            </select>
            <select
              value={periodType === 'customMonth' ? selectedYear : ''}
              onChange={(e) => {
                const y = parseInt(e.target.value, 10)
                if (y) {
                  setSelectedYear(y)
                  setPeriodType('customMonth')
                }
              }}
              className="bg-transparent font-bold focus:outline-none cursor-pointer"
            >
              {[2024, 2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setPeriodType('thisYear')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 shadow-sm border ${
              periodType === 'thisYear'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-indigo-200'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            Este Ano
          </button>

          {/* Ano Personalizado Selector */}
          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold border transition-all ${
            periodType === 'customYear' ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-slate-200 text-slate-600'
          }`}>
            <span className="text-slate-400">Ano:</span>
            <select
              value={periodType === 'customYear' ? selectedYear : ''}
              onChange={(e) => {
                const y = parseInt(e.target.value, 10)
                if (y) {
                  setSelectedYear(y)
                  setPeriodType('customYear')
                }
              }}
              className="bg-transparent font-bold focus:outline-none cursor-pointer"
            >
              <option value="" disabled>Ano...</option>
              {[2023, 2024, 2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── 2. NAVEGAÇÃO POR ABAS NO TOPO ── */}
      <div className="bg-white/90 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-3 sm:p-4 shadow-sm">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {tabs.map(t => {
            const Icon = t.icon
            const isActive = activeTab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 whitespace-nowrap border ${
                  isActive
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100'
                    : 'bg-slate-50/80 text-slate-600 border-slate-200/70 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon size={16} className={isActive ? 'text-white' : 'text-slate-500'} />
                <span>{t.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── 3. CONTEÚDO INDIVIDUAL POR ABA (EXATAMENTE 10 CARDS EM 2 LINHAS LIMPAS POR ABA) ── */}

      {/* ── ABA 1: VISÃO GERAL & RECEBIMENTOS ── */}
      {activeTab === 'geral' && (
        <div className="space-y-6 animate-fade-in">
          
          {/* Grid de 10 Cards Limpos (2 Linhas de 5 Cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
            
            {/* LINHA 1: RECEITAS & METAS DE SUPERAÇÃO */}

            {/* Card 1: Receita Mês Atual */}
            <div className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs font-black text-slate-600 uppercase tracking-wider">Receita Mês Atual</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0">
                  <DollarSign size={18} />
                </div>
              </div>
              <p className="text-lg sm:text-xl font-black text-slate-900 tracking-tight my-1">{formatBRL(valAtual)}</p>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">Mês Atual</span>
                <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">Realizado</span>
              </div>
            </div>

            {/* Card 2: Receita Mês Anterior */}
            <div className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs font-black text-slate-600 uppercase tracking-wider">Receita Mês Anterior</span>
                <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center font-bold shrink-0">
                  <Calendar size={18} />
                </div>
              </div>
              <p className="text-lg sm:text-xl font-black text-slate-800 tracking-tight my-1">{formatBRL(valAnterior)}</p>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">Mês Anterior</span>
                <span className="text-[10px] font-extrabold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md">Base Comparação</span>
              </div>
            </div>

            {/* Card 3: Variação Mês a Mês (MoM %) */}
            <div className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs font-black text-slate-600 uppercase tracking-wider">Variação (MoM %)</span>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold shrink-0 ${
                  pct(valAtual, valAnterior) >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                }`}>
                  {pct(valAtual, valAnterior) >= 0 ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                </div>
              </div>
              <p className={`text-lg sm:text-xl font-black my-1 ${pct(valAtual, valAnterior) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {pct(valAtual, valAnterior) >= 0 ? '+' : ''}{pct(valAtual, valAnterior).toFixed(1)}%
              </p>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">vs. Mês Anterior</span>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                  pct(valAtual, valAnterior) >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                }`}>
                  {pct(valAtual, valAnterior) >= 0 ? 'Crescimento ↑' : 'Queda ↓'}
                </span>
              </div>
            </div>

            {/* Card 4: Diferença em R$ para Superar Mês Anterior */}
            <div className="bg-white/90 backdrop-blur-md border border-amber-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs font-black text-amber-700 uppercase tracking-wider">Diferença p/ Superar</span>
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold shrink-0">
                  <Target size={18} />
                </div>
              </div>
              <p className="text-lg sm:text-xl font-black text-amber-700 tracking-tight my-1">
                {gapParaSuperar > 0 ? formatBRL(gapParaSuperar) : '🎉 Superado!'}
              </p>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">
                  {gapParaSuperar > 0 ? 'Faltam para alcançar' : 'Faturamento Batido'}
                </span>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                  gapParaSuperar > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                }`}>
                  {gapParaSuperar > 0 ? 'Valor Faltante' : 'Meta Vencida!'}
                </span>
              </div>
            </div>

            {/* Card 5: % da Meta Atingida (Velocímetro / Progresso de Alto Impacto) */}
            <div className={`backdrop-blur-md border rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between ${
              metaPct >= 100 
                ? 'bg-gradient-to-br from-emerald-500/10 via-white to-emerald-50/20 border-emerald-300'
                : 'bg-gradient-to-br from-indigo-500/10 via-white to-indigo-50/20 border-indigo-200'
            }`}>
              <div className="flex items-start justify-between mb-1">
                <span className={`text-xs font-black uppercase tracking-wider ${metaPct >= 100 ? 'text-emerald-700' : 'text-indigo-700'}`}>
                  % Meta (Até Agora)
                </span>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold shrink-0 ${
                  metaPct >= 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'
                }`}>
                  <Award size={18} />
                </div>
              </div>
              
              <div className="my-1 flex items-baseline justify-between">
                <p className={`text-lg sm:text-xl font-black tracking-tight ${metaPct >= 100 ? 'text-emerald-700' : 'text-indigo-950'}`}>
                  {metaPct >= 100 ? `🎉 ${metaPct.toFixed(1)}%` : `${metaPct.toFixed(1)}%`}
                </p>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                  metaPct >= 100 ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800'
                }`}>
                  {metaPct >= 100 ? 'META BATIDA!' : `Faltam ${(100 - metaPct).toFixed(1)}%`}
                </span>
              </div>

              {/* Barra de Progresso / Velocímetro Estilizado */}
              <div className="pt-2 border-t border-slate-100/80 space-y-1">
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden p-0.5">
                  <div 
                    className={`h-full rounded-full transition-all duration-700 ${
                      metaPct >= 100 ? 'bg-emerald-500 shadow-sm shadow-emerald-300' : 'bg-indigo-600 shadow-sm shadow-indigo-300'
                    }`} 
                    style={{ width: `${Math.min(100, metaPct)}%` }} 
                  />
                </div>
                <div className="flex justify-between items-center text-[10px] font-extrabold text-slate-400">
                  <span>0%</span>
                  <span className={metaPct >= 100 ? 'text-emerald-600 font-black' : 'text-indigo-600 font-black'}>
                    {metaPct >= 100 ? '100%+ ALCANÇADO!' : 'META 100%'}
                  </span>
                </div>
              </div>
            </div>

            {/* LINHA 2: CARTEIRA, VENCIDOS & A VENCER */}

            {/* Card 6: Total a Receber Carteira */}
            <div className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs font-black text-slate-600 uppercase tracking-wider">Total a Receber</span>
                <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center font-bold shrink-0">
                  <Wallet size={18} />
                </div>
              </div>
              <p className="text-lg sm:text-xl font-black text-slate-900 tracking-tight my-1">{formatBRL(valTotalAReceber)}</p>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">Vencidos + A Vencer</span>
                <span className="text-[10px] font-extrabold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md">Carteira Total</span>
              </div>
            </div>

            {/* Card 7: Total Vencidos (Inadimplência R$) */}
            <div className="bg-white/90 backdrop-blur-md border border-rose-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs font-black text-rose-700 uppercase tracking-wider">Total Vencidos (R$)</span>
                <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center font-bold shrink-0">
                  <ShieldAlert size={18} />
                </div>
              </div>
              <p className="text-lg sm:text-xl font-black text-rose-600 tracking-tight my-1">{formatBRL(valInadimplente)}</p>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">Valor em Atraso</span>
                <span className="text-[10px] font-extrabold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">Em Atraso</span>
              </div>
            </div>

            {/* Card 8: Taxa de Inadimplência (%) */}
            <div className="bg-white/90 backdrop-blur-md border border-rose-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs font-black text-rose-700 uppercase tracking-wider">Inadimplência (%)</span>
                <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center font-bold shrink-0">
                  <AlertTriangle size={18} />
                </div>
              </div>
              <p className="text-lg sm:text-xl font-black text-rose-700 tracking-tight my-1">{pctInadimplencia.toFixed(1)}%</p>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">% da Carteira</span>
                <span className="text-[10px] font-extrabold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">Risco Carteira</span>
              </div>
            </div>

            {/* Card 9: Total a Vencer no Mês (R$) */}
            <div className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs font-black text-indigo-700 uppercase tracking-wider">Total a Vencer (R$)</span>
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shrink-0">
                  <Clock size={18} />
                </div>
              </div>
              <p className="text-lg sm:text-xl font-black text-indigo-700 tracking-tight my-1">{formatBRL(valAReceber)}</p>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">No Mês Atual</span>
                <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">A Vencer</span>
              </div>
            </div>

            {/* Card 10: Títulos Pendentes (Qtd) */}
            <div className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs font-black text-slate-600 uppercase tracking-wider">Títulos Pendentes</span>
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold shrink-0">
                  <Layers size={18} />
                </div>
              </div>
              <p className="text-lg sm:text-xl font-black text-slate-900 tracking-tight my-1">
                {(kpis.mes_atual?.qtd_inadimplente || 0) + qtdAReceber} títulos
              </p>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">Volume Total</span>
                <span className="text-[10px] font-extrabold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">Quantidade</span>
              </div>
            </div>

          </div>

          {/* Gráfico Principal Aba 1 */}
          <div className="bg-slate-50/60 p-5 rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <span>Volume de Títulos & Receita Monetária</span>
                  <span className="text-[10px] font-extrabold bg-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded-full">
                    13 Meses
                  </span>
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Evolução do volume de títulos recebidos (barras) e receita monetária em R$ (linha)
                </p>
              </div>

              {/* Legend Pills */}
              <div className="flex items-center gap-4 text-xs font-bold bg-white/90 px-3.5 py-2 rounded-xl border border-slate-200/80 shadow-xs shrink-0">
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-md bg-indigo-500 inline-block shadow-sm" />
                  <span className="text-slate-800 font-extrabold">Títulos Recebidos</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 inline-block shadow-sm" />
                  <span className="text-emerald-700 font-extrabold">Valor Recebido (R$)</span>
                </div>
              </div>
            </div>

            <div className="w-full h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={evo}>
                  <defs>
                    <linearGradient id="barGradFull" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.indigo} stopOpacity={0.85} />
                      <stop offset="100%" stopColor={C.sky} stopOpacity={0.5} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.gray200} vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: C.slate, fontWeight: 700 }} axisLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: C.slate }} axisLine={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: C.slate }} axisLine={false} tickFormatter={v => formatBRLCompact(v)} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar yAxisId="left" dataKey="titulos_recebidos" name="Títulos Recebidos" fill="url(#barGradFull)" radius={[6, 6, 0, 0]} maxBarSize={36} />
                  <Line yAxisId="right" type="monotone" dataKey="valor_recebido" name="Valor Recebido (R$)" stroke={C.emerald} strokeWidth={3.5} dot={{ r: 4, fill: C.emerald, strokeWidth: 2, stroke: '#FFF' }} activeDot={{ r: 7 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabela Aba 1 */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 shadow-sm bg-white">
            <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200/70 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Evolução Mensal de Recebimentos</h3>
                <p className="text-[11px] text-slate-500 font-medium">Mais recente no topo | Detalhamento no Vencimento vs. Meses Anteriores</p>
              </div>
              <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md">
                {evo.length} Meses
              </span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100/60 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200/70">
                  <th className="p-3 text-left">Mês</th>
                  <th className="p-3 text-right">Títulos Recebidos</th>
                  <th className="p-3 text-right">No Vencimento (No Prazo)</th>
                  <th className="p-3 text-right">De Meses Anteriores (Recuperados)</th>
                  <th className="p-3 text-right">Valor Total Recebido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {evo.slice().sort((a: any, b: any) => b.mes.localeCompare(a.mes)).map((r: any, idx: number) => {
                  const totalQtd = r.titulos_recebidos || (r.recebidos_no_prazo + r.recebidos_fora_prazo) || r.total_titulos || 0
                  const valorTotal = r.valor_recebido || 0
                  const valorFora = r.valor_fora_prazo || 0
                  const valorNoPrazo = Math.max(0, valorTotal - valorFora)
                  const pctNoPrazoRow = valorTotal > 0 ? ((valorNoPrazo / valorTotal) * 100).toFixed(1) : '0.0'
                  const pctForaRow = valorTotal > 0 ? ((valorFora / valorTotal) * 100).toFixed(1) : '0.0'
                  const currentYearMonth = new Date().toISOString().slice(0, 7)
                  const isCurrentMonth = r.mes === currentYearMonth
                  const isLatest = idx === 0

                  return (
                    <tr key={idx} className={`transition-colors ${isLatest ? 'bg-indigo-50/30 hover:bg-indigo-50/50' : 'hover:bg-slate-50/80'}`}>
                      <td className="p-3 font-bold text-slate-900 flex items-center gap-1.5">
                        {isLatest && <span className="w-2 h-2 rounded-full bg-indigo-600 inline-block" title="Mês mais recente" />}
                        {r.mes}
                        {isCurrentMonth && (
                          <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200">
                            Em andamento
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right font-bold text-slate-800">{totalQtd.toLocaleString('pt-BR')} tit.</td>
                      <td className="p-3 text-right">
                        <div className="font-bold text-emerald-600">{(r.recebidos_no_prazo || 0).toLocaleString('pt-BR')} tit.</div>
                        <div className="text-xs text-slate-600 font-bold">{formatBRL(valorNoPrazo)} ({pctNoPrazoRow}%)</div>
                      </td>
                      <td className="p-3 text-right">
                        <div className="font-bold text-amber-600">{(r.recebidos_fora_prazo || 0).toLocaleString('pt-BR')} tit.</div>
                        <div className="text-xs text-slate-600 font-bold">{formatBRL(valorFora)} ({pctForaRow}%)</div>
                      </td>
                      <td className="p-3 text-right font-black text-slate-900 text-sm">{formatBRL(valorTotal)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ABA 2: COMPARATIVO YoY ── */}
      {activeTab === 'yoy' && (
        <div className="space-y-6 animate-fade-in">

          {/* Grid de 10 Cards Limpos (2 Linhas de 5 Cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
            
            {/* LINHA 1: MTD & METRICAS MENSAIS */}

            {/* Card 1: Total Recebido Até Hoje (MTD Mês Atual) */}
            <div className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs font-black text-slate-600 uppercase tracking-wider flex items-center gap-1">
                  <Calendar size={13} /> Recebido Até Hoje
                </span>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0">
                  <DollarSign size={18} />
                </div>
              </div>
              <p className="text-lg sm:text-xl font-black text-slate-900 tracking-tight my-1">{formatBRL(mtd.valor_atual || 0)}</p>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">Mês Atual MTD</span>
                <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">Até Dia {mtd.dia_corte || new Date().getDate()}</span>
              </div>
            </div>

            {/* Card 2: Mês Anterior Até a Mesma Data */}
            <div className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs font-black text-indigo-700 uppercase tracking-wider flex items-center gap-1">
                  <Calendar size={13} /> Mês Anterior MTD
                </span>
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shrink-0">
                  <Calendar size={18} />
                </div>
              </div>
              <p className="text-lg sm:text-xl font-black text-slate-800 tracking-tight my-1">{formatBRL(mtd.valor_anterior || 0)}</p>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">Mês Anterior</span>
                <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">Até Dia {mtd.dia_corte || new Date().getDate()}</span>
              </div>
            </div>

            {/* Card 3: Performance MTD (Com Seta ↑/↓ e Percentual %) */}
            <div className="bg-white/90 backdrop-blur-md border border-indigo-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs font-black text-indigo-700 uppercase tracking-wider">Performance MTD</span>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold shrink-0 ${
                  mtd.variacao_pct >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                }`}>
                  {mtd.variacao_pct >= 0 ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                </div>
              </div>
              <p className={`text-lg sm:text-xl font-black my-1 ${mtd.variacao_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {mtd.variacao_pct >= 0 ? '+' : ''}{mtd.variacao_pct?.toFixed(1)}%
              </p>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">Comparativo MTD</span>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                  mtd.variacao_pct >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                }`}>
                  {mtd.variacao_pct >= 0 ? 'Melhor ↑' : 'Pior ↓'}
                </span>
              </div>
            </div>

            {/* Card 4: Total Recebido no Ano Atual (YTD) */}
            <div className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs font-black text-slate-600 uppercase tracking-wider">Receita Ano (YTD)</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0">
                  <TrendingUp size={18} />
                </div>
              </div>
              <p className="text-lg sm:text-xl font-black text-indigo-700 tracking-tight my-1">{formatBRL(ytdAtual)}</p>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">Ano {new Date().getFullYear()}</span>
                <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">YTD</span>
              </div>
            </div>

            {/* Card 5: Total Recebido no Ano Anterior (YTD) */}
            <div className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs font-black text-slate-600 uppercase tracking-wider">Ano Anterior YTD</span>
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold shrink-0">
                  <Calendar size={18} />
                </div>
              </div>
              <p className="text-lg sm:text-xl font-black text-slate-800 tracking-tight my-1">{formatBRL(ytdAnterior)}</p>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">Ano {new Date().getFullYear() - 1}</span>
                <span className="text-[10px] font-extrabold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">Comparativo</span>
              </div>
            </div>

            {/* LINHA 2: SALDOS VENCIDOS, RECORDE & YTD % */}

            {/* Card 6: Crescimento YTD (%) */}
            <div className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs font-black text-slate-600 uppercase tracking-wider">Crescimento YTD (%)</span>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold shrink-0 ${
                  pctYtd >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                }`}>
                  {pctYtd >= 0 ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                </div>
              </div>
              <p className={`text-lg sm:text-xl font-black my-1 ${pctYtd >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {pctYtd >= 0 ? '+' : ''}{pctYtd.toFixed(1)}%
              </p>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">Var. Anual</span>
                <span className="text-[10px] font-extrabold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">Ano a Ano</span>
              </div>
            </div>

            {/* Card 7: Saldo Total Vencido de Todo o Período */}
            <div className="bg-white/90 backdrop-blur-md border border-rose-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs font-black text-rose-700 uppercase tracking-wider">Saldo Vencido Histórico</span>
                <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center font-bold shrink-0">
                  <ShieldAlert size={18} />
                </div>
              </div>
              <p className="text-lg sm:text-xl font-black text-rose-700 tracking-tight my-1">{formatBRL(totalValAgingSum || valInadimplente)}</p>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">Todo o Período</span>
                <span className="text-[10px] font-extrabold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">Em Atraso</span>
              </div>
            </div>

            {/* Card 8: Inadimplência Carteira (%) */}
            <div className="bg-white/90 backdrop-blur-md border border-rose-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs font-black text-rose-700 uppercase tracking-wider">Inadimplência (%)</span>
                <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center font-bold shrink-0">
                  <AlertTriangle size={18} />
                </div>
              </div>
              <p className="text-lg sm:text-xl font-black text-rose-700 tracking-tight my-1">{pctInadimplencia.toFixed(1)}%</p>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">Taxa Carteira</span>
                <span className="text-[10px] font-extrabold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">Inadimplência</span>
              </div>
            </div>

            {/* Card 9: Melhor Mês do Ano */}
            <div className="bg-gradient-to-br from-amber-500/10 via-white to-white border border-amber-300/60 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs font-black text-amber-700 uppercase tracking-wider">Melhor Mês do Ano</span>
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold shrink-0">
                  <Award size={18} />
                </div>
              </div>
              <p className="text-lg sm:text-xl font-black text-amber-950 tracking-tight my-1">{formatBRL(bestMonthObj.valor)}</p>
              <div className="pt-2 border-t border-amber-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">Recorde de Faturamento</span>
                <span className="text-[10px] font-extrabold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">RECORD</span>
              </div>
            </div>

            {/* Card 10: Mês Origem de Pico */}
            <div className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs font-black text-slate-600 uppercase tracking-wider">Mês Recorde</span>
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold shrink-0">
                  <Sparkles size={18} />
                </div>
              </div>
              <p className="text-lg sm:text-xl font-black text-slate-900 tracking-tight my-1">{bestMonthObj.label}</p>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">Pico no Ano</span>
                <span className="text-[10px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">Mês de Pico</span>
              </div>
            </div>

          </div>

          {/* Gráfico BarChart YoY */}
          <div className="bg-slate-50/60 p-5 rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
              <div>
                <h3 className="text-base font-black text-slate-900">Receita Mensal: Ano Atual vs. Ano Anterior</h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Comparativo monetário lado a lado ({new Date().getFullYear()} vs. {new Date().getFullYear() - 1}) — Apenas meses decorridos
                </p>
              </div>

              {/* Legend Pills */}
              <div className="flex items-center gap-4 text-xs font-bold bg-white/90 px-3.5 py-2 rounded-xl border border-slate-200/80 shadow-xs">
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-md bg-indigo-600 inline-block shadow-sm" />
                  <span className="text-slate-800 font-extrabold">Ano Atual ({new Date().getFullYear()})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-md bg-slate-400 opacity-60 inline-block shadow-sm" />
                  <span className="text-slate-600 font-semibold">Ano Anterior ({new Date().getFullYear() - 1})</span>
                </div>
              </div>
            </div>

            <div className="w-full h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yoyFiltered}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.gray200} vertical={false} />
                  <XAxis dataKey="mes_nome" tick={{ fontSize: 11, fill: C.slate, fontWeight: 700 }} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: C.slate }} axisLine={false} tickFormatter={v => formatBRLCompact(v)} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="valor_atual" name="Ano Atual" fill={C.indigo} radius={[6, 6, 0, 0]} maxBarSize={32} />
                  <Bar dataKey="valor_anterior" name="Ano Anterior" fill={C.slate} opacity={0.5} radius={[6, 6, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabela YoY */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 shadow-sm bg-white">
            <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200/70 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Comparativo Detalhado Mês a Mês (YoY)</h3>
                <p className="text-[11px] text-slate-500 font-medium">Do mês mais recente para o mais antigo | Setas de tendência de crescimento (↑/↓)</p>
              </div>
              <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md">
                {yoyFiltered.length} Meses Decorridos
              </span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100/70 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200/70">
                  <th className="p-3 text-left">Mês</th>
                  <th className="p-3 text-right">Ano Anterior (R$)</th>
                  <th className="p-3 text-right">Ano Atual (R$)</th>
                  <th className="p-3 text-right">Variação Absoluta (R$)</th>
                  <th className="p-3 text-right">Variação (%)</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {yoyFiltered.slice().sort((a: any, b: any) => b.mes_num - a.mes_num).map((r: any, idx: number) => {
                  const diffVal = r.valor_atual - r.valor_anterior
                  const diffPct = r.valor_anterior > 0 ? (diffVal / r.valor_anterior) * 100 : 0
                  const isPos   = diffVal >= 0
                  const isLatest = idx === 0

                  return (
                    <tr key={idx} className={`transition-colors ${isLatest ? 'bg-indigo-50/30 hover:bg-indigo-50/50' : 'hover:bg-slate-50/80'}`}>
                      <td className="p-3 font-bold text-slate-900 flex items-center gap-1.5">
                        {isLatest && <span className="w-2 h-2 rounded-full bg-indigo-600 inline-block" title="Mês mais recente" />}
                        {r.mes_nome}
                      </td>
                      <td className="p-3 text-right font-bold text-slate-600">{formatBRL(r.valor_anterior)}</td>
                      <td className="p-3 text-right font-black text-slate-900">{formatBRL(r.valor_atual)}</td>
                      <td className={`p-3 text-right font-bold ${isPos ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {isPos ? '+' : ''}{formatBRL(diffVal)}
                      </td>
                      <td className="p-3 text-right font-bold">
                        <span className={`inline-flex items-center gap-0.5 px-2.5 py-1 rounded-full text-xs font-black ${
                          isPos ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}>
                          {isPos ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                          {isPos ? '+' : ''}{diffPct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${isPos ? 'bg-emerald-500 shadow-xs' : 'bg-rose-500 shadow-xs'}`} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ABA 3: SAÚDE DA CARTEIRA & INADIMPLÊNCIA ── */}
      {activeTab === 'inadimplencia' && (
        <div className="space-y-6 animate-fade-in">

          {/* SEÇÃO 1: INDICADORES GLOBAIS DE INADIMPLÊNCIA & PROJEÇÕES FUTURAS */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-black uppercase tracking-wider text-rose-700 flex items-center gap-1.5">
                <ShieldAlert size={16} /> Indicadores Gerais de Inadimplência & Carteira Total
              </h3>
              <span className="text-[11px] font-bold text-slate-500">
                Carteira Total A Receber: <strong className="text-rose-700 font-black">{formatBRL(totalValAgingSum + valAReceber)}</strong> ({totalQtdAgingSum + qtdAReceber} títulos)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
              {/* Card 1: Inadimplência Total da Carteira (%) */}
              <div className="bg-white/90 backdrop-blur-md border border-rose-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-black text-rose-700 uppercase tracking-wider">Inadimplência Total</span>
                  <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center font-bold shrink-0">
                    <ShieldAlert size={18} />
                  </div>
                </div>
                <p className="text-lg sm:text-xl font-black text-rose-600 tracking-tight my-1">
                  {(totalValAgingSum + valAReceber > 0 ? (totalValAgingSum / (totalValAgingSum + valAReceber)) * 100 : 0).toFixed(1)}%
                </p>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">Taxa Carteira</span>
                  <span className="text-[10px] font-extrabold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">Em Atraso</span>
                </div>
              </div>

              {/* Card 2: Saldo Total Vencido (R$) */}
              <div className="bg-white/90 backdrop-blur-md border border-rose-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-black text-rose-700 uppercase tracking-wider">Saldo Total Vencido</span>
                  <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center font-bold shrink-0">
                    <DollarSign size={18} />
                  </div>
                </div>
                <p className="text-lg sm:text-xl font-black text-slate-900 tracking-tight my-1">{formatBRL(totalValAgingSum)}</p>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">{totalQtdAgingSum} títulos</span>
                  <span className="text-[10px] font-extrabold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">Valor Original</span>
                </div>
              </div>

              {/* Card 3: Carteira Total A Receber (R$) */}
              <div className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-black text-slate-600 uppercase tracking-wider">Carteira Total (R$)</span>
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shrink-0">
                    <Wallet size={18} />
                  </div>
                </div>
                <p className="text-lg sm:text-xl font-black text-slate-900 tracking-tight my-1">{formatBRL(totalValAgingSum + valAReceber)}</p>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">{totalQtdAgingSum + qtdAReceber} títulos</span>
                  <span className="text-[10px] font-extrabold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">Base Total</span>
                </div>
              </div>

              {/* Card 4: Entradas Próximo Mês (Agosto) */}
              <div className="bg-white/90 backdrop-blur-md border border-indigo-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-black text-indigo-700 uppercase tracking-wider">
                    {kpis.mes_futuro_1?.label || 'Próximo Mês'}
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shrink-0">
                    <Clock size={18} />
                  </div>
                </div>
                <p className="text-lg sm:text-xl font-black text-indigo-900 tracking-tight my-1">
                  {formatBRL(kpis.mes_futuro_1?.valor_a_receber || 0)}
                </p>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">{kpis.mes_futuro_1?.qtd_a_receber || 0} títulos</span>
                  <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">A Receber</span>
                </div>
              </div>

              {/* Card 5: Entradas Mês Seguinte (Setembro) */}
              <div className="bg-white/90 backdrop-blur-md border border-indigo-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-black text-indigo-700 uppercase tracking-wider">
                    {kpis.mes_futuro_2?.label || 'Mês Seguinte'}
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shrink-0">
                    <Clock size={18} />
                  </div>
                </div>
                <p className="text-lg sm:text-xl font-black text-indigo-900 tracking-tight my-1">
                  {formatBRL(kpis.mes_futuro_2?.valor_a_receber || 0)}
                </p>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">{kpis.mes_futuro_2?.qtd_a_receber || 0} títulos</span>
                  <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">A Receber</span>
                </div>
              </div>
            </div>
          </div>

          {/* SEÇÃO 2: AGING & ESTRUTURA DE INADIMPLÊNCIA POR FAIXAS (VALOR ORIGINAL SEM JUROS) */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-black uppercase tracking-wider text-rose-700 flex items-center gap-1.5">
                <Clock size={16} /> Estrutura de Inadimplência por Faixas de Atraso (Valor Original)
              </h3>
              <span className="text-[11px] font-bold text-slate-500">
                Soma Aging: <strong className="text-rose-700 font-black">{formatBRL(totalValAgingSum)}</strong> ({totalQtdAgingSum} títulos)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
              {/* Card 6: Inadimplência 1 a 30 Dias */}
              <div className="bg-white/90 backdrop-blur-md border border-blue-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-black text-blue-700 uppercase tracking-wider">1 - 30 Dias</span>
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">
                    <Clock size={18} />
                  </div>
                </div>
                <p className="text-lg sm:text-xl font-black text-slate-900 tracking-tight my-1">{formatBRL(aging1_30.valor)}</p>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">{aging1_30.qtd} títulos</span>
                  <span className="text-[10px] font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                    {totalValAgingSum > 0 ? ((aging1_30.valor / totalValAgingSum) * 100).toFixed(1) : 0}% do Vencido
                  </span>
                </div>
              </div>

              {/* Card 7: Inadimplência 31 a 60 Dias */}
              <div className="bg-white/90 backdrop-blur-md border border-amber-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-black text-amber-700 uppercase tracking-wider">31 - 60 Dias</span>
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold shrink-0">
                    <Clock size={18} />
                  </div>
                </div>
                <p className="text-lg sm:text-xl font-black text-slate-900 tracking-tight my-1">{formatBRL(aging31_60.valor)}</p>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">{aging31_60.qtd} títulos</span>
                  <span className="text-[10px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
                    {totalValAgingSum > 0 ? ((aging31_60.valor / totalValAgingSum) * 100).toFixed(1) : 0}% do Vencido
                  </span>
                </div>
              </div>

              {/* Card 8: Inadimplência 61 a 90 Dias */}
              <div className="bg-white/90 backdrop-blur-md border border-orange-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-black text-orange-700 uppercase tracking-wider">61 - 90 Dias</span>
                  <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center font-bold shrink-0">
                    <AlertTriangle size={18} />
                  </div>
                </div>
                <p className="text-lg sm:text-xl font-black text-slate-900 tracking-tight my-1">{formatBRL(aging61_90.valor)}</p>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">{aging61_90.qtd} títulos</span>
                  <span className="text-[10px] font-extrabold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-md">
                    {totalValAgingSum > 0 ? ((aging61_90.valor / totalValAgingSum) * 100).toFixed(1) : 0}% do Vencido
                  </span>
                </div>
              </div>

              {/* Card 9: Inadimplência +90 Dias */}
              <div className="bg-white/90 backdrop-blur-md border border-rose-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-black text-rose-700 uppercase tracking-wider">+90 Dias (Crítico)</span>
                  <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center font-bold shrink-0">
                    <ShieldAlert size={18} />
                  </div>
                </div>
                <p className="text-lg sm:text-xl font-black text-slate-900 tracking-tight my-1">{formatBRL(agingMais90.valor)}</p>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">{agingMais90.qtd} títulos</span>
                  <span className="text-[10px] font-extrabold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">
                    {totalValAgingSum > 0 ? ((agingMais90.valor / totalValAgingSum) * 100).toFixed(1) : 0}% do Vencido
                  </span>
                </div>
              </div>

              {/* Card 10: Total Inadimplência Consolidado (R$) */}
              <div className="bg-white/90 backdrop-blur-md border border-rose-300 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-black text-rose-800 uppercase tracking-wider">Total Inadimplência</span>
                  <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center font-bold shrink-0">
                    <ShieldAlert size={18} />
                  </div>
                </div>
                <p className="text-lg sm:text-xl font-black text-rose-700 tracking-tight my-1">{formatBRL(totalValAgingSum)}</p>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">{totalQtdAgingSum} títulos</span>
                  <span className="text-[10px] font-extrabold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-md">
                    Soma 100% Aging
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* SEÇÃO 2: PROJEÇÃO & CONCENTRAÇÃO DE ENTRADAS A RECEBER DO PRÓXIMO MÊS */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-black uppercase tracking-wider text-indigo-700 flex items-center gap-1.5">
                <Calendar size={16} /> Entradas A Receber do Próximo Mês ({kpis.mes_futuro_1?.label || 'Próximo Mês'}) por Vencimentos
              </h3>
              <span className="text-[11px] font-bold text-slate-500">
                Total Previsto no Mês: <strong className="text-indigo-700 font-black">{formatBRL(kpis.mes_futuro_1?.valor_a_receber || 0)}</strong> ({kpis.mes_futuro_1?.qtd_a_receber || 0} títulos)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
              {(() => {
                const futValTotal = kpis.mes_futuro_1?.valor_a_receber || 1;
                const fx = kpis.mes_futuro_1?.vencimentos_faixas || {};
                const buckets = [
                  { title: 'Venc. Dia 01 a 05', data: fx.dias_1_5 || { qtd: 0, valor: 0 } },
                  { title: 'Venc. Dia 06 a 10', data: fx.dias_6_10 || { qtd: 0, valor: 0 } },
                  { title: 'Venc. Dia 11 a 15', data: fx.dias_11_15 || { qtd: 0, valor: 0 } },
                  { title: 'Venc. Dia 16 a 20', data: fx.dias_16_20 || { qtd: 0, valor: 0 } },
                  { title: 'Venc. Dia 21 a 31', data: fx.dias_21_31 || { qtd: 0, valor: 0 } },
                ];

                return buckets.map((b, idx) => {
                  const pctDoMes = (b.data.valor / futValTotal) * 100;
                  return (
                    <div key={idx} className="bg-white/90 backdrop-blur-md border border-indigo-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-xs font-black text-indigo-700 uppercase tracking-wider">{b.title}</span>
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shrink-0">
                          <Clock size={18} />
                        </div>
                      </div>
                      <p className="text-lg sm:text-xl font-black text-slate-900 tracking-tight my-1">{formatBRL(b.data.valor)}</p>
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-500">{b.data.qtd} títulos</span>
                        <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                          {pctDoMes.toFixed(1)}% do Mês
                        </span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Aging Analysis */}
            <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200/60">
              <h3 className="text-sm font-bold text-slate-800 mb-1">Aging Analysis de Inadimplência</h3>
              <p className="text-xs text-slate-500 mb-4">Títulos em atraso por faixas de dias</p>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={aging.map((a: any) => ({
                  mes: a.mes,
                  '1-30 dias':  a.aging_1_30?.valor || 0,
                  '31-60 dias': a.aging_31_60?.valor || 0,
                  '61-90 dias': a.aging_61_90?.valor || 0,
                  '+90 dias':   a.aging_mais_90?.valor || 0,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.gray200} vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 10, fill: C.slate }} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: C.slate }} axisLine={false} tickFormatter={v => formatBRLCompact(v)} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="1-30 dias" stackId="a" fill={AGING_COLORS[0]} />
                  <Bar dataKey="31-60 dias" stackId="a" fill={AGING_COLORS[1]} />
                  <Bar dataKey="61-90 dias" stackId="a" fill={AGING_COLORS[2]} />
                  <Bar dataKey="+90 dias" stackId="a" fill={AGING_COLORS[3]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Previsto vs Efetivo (Gap) */}
            <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200/60">
              <h3 className="text-sm font-bold text-slate-800 mb-1">Gap de Inadimplência</h3>
              <p className="text-xs text-slate-500 mb-4">Valor Previsto vs. Valor Efetivamente Recebido</p>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={evo.slice(-6)}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.gray200} vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 10, fill: C.slate }} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: C.slate }} axisLine={false} tickFormatter={v => formatBRLCompact(v)} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="valor_total" name="Valor Previsto" fill={C.indigo} radius={[4, 4, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="valor_recebido" name="Valor Recebido" fill={C.emerald} radius={[4, 4, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabela de Detalhamento do Aging */}
          <div className="overflow-x-auto rounded-xl border border-slate-200/70">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100/70 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                  <th className="p-3 text-left">Faixa de Atraso</th>
                  <th className="p-3 text-right">Qtd Títulos em Atraso</th>
                  <th className="p-3 text-right">Valor Total Vencido</th>
                  <th className="p-3 text-right">% da Carteira Vencida</th>
                  <th className="p-3 text-center">Nível de Risco</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {[
                  { label: '1 - 30 dias',  item: aging1_30,   color: 'text-blue-600',  badge: 'Baixo',   badgeClass: 'bg-blue-50 text-blue-700' },
                  { label: '31 - 60 dias', item: aging31_60,  color: 'text-amber-600', badge: 'Médio',   badgeClass: 'bg-amber-50 text-amber-700' },
                  { label: '61 - 90 dias', item: aging61_90,  color: 'text-orange-600',badge: 'Alto',    badgeClass: 'bg-orange-50 text-orange-700' },
                  { label: '+90 dias',     item: agingMais90, color: 'text-rose-600',  badge: 'Crítico', badgeClass: 'bg-rose-50 text-rose-700' },
                ].map((f, idx) => {
                  const pctVal = totalValAgingSum > 0 ? (f.item.valor / totalValAgingSum) * 100 : 0

                  return (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className={`p-3 font-bold ${f.color}`}>{f.label}</td>
                      <td className="p-3 text-right font-medium text-slate-700">{f.item.qtd}</td>
                      <td className="p-3 text-right font-bold text-slate-900">{formatBRL(f.item.valor)}</td>
                      <td className="p-3 text-right font-bold text-slate-700">{pctVal.toFixed(1)}%</td>
                      <td className="p-3 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${f.badgeClass}`}>
                          {f.badge}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ABA 4: EFICIÊNCIA DE RECUPERAÇÃO ── */}
      {activeTab === 'recuperacao' && (
        <div className="space-y-6 animate-fade-in">

          {/* SEÇÃO 1: LINHA DE RECUPERAÇÃO E MÉDIA DE ATRASO DO MÊS */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-black uppercase tracking-wider text-indigo-700 flex items-center gap-1.5">
                <RotateCcw size={16} /> Indicadores Gerais de Recebimento & Recuperação
              </h3>
              <span className="text-[11px] font-bold text-slate-500">
                Média de Atraso nos Pagamentos: <strong className="text-amber-700 font-black">{recuperacaoFaixas.media_dias_atraso.toFixed(1)} dias</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
              {/* Card 1: Recebimento no Prazo (%) */}
              <div className="bg-white/90 backdrop-blur-md border border-emerald-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-black text-emerald-700 uppercase tracking-wider">Recebimento no Prazo (%)</span>
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0">
                    <CheckCircle2 size={18} />
                  </div>
                </div>
                <p className="text-lg sm:text-xl font-black text-emerald-600 tracking-tight my-1">{pctNoPrazo.toFixed(1)}%</p>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">Taxa Vencimento</span>
                  <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">No Prazo</span>
                </div>
              </div>

              {/* Card 2: Valor Recebido no Prazo (R$) */}
              <div className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-black text-slate-600 uppercase tracking-wider">Valor no Prazo (R$)</span>
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0">
                    <DollarSign size={18} />
                  </div>
                </div>
                <p className="text-lg sm:text-xl font-black text-slate-900 tracking-tight my-1">{formatBRL(valNoPrazo)}</p>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">Liquidado em Dia</span>
                  <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">Sem Atraso</span>
                </div>
              </div>

              {/* Card 3: Recebido de Meses Anteriores (R$) */}
              <div className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-black text-amber-700 uppercase tracking-wider">De Meses Anteriores (R$)</span>
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold shrink-0">
                    <RotateCcw size={18} />
                  </div>
                </div>
                <p className="text-lg sm:text-xl font-black text-slate-900 tracking-tight my-1">{formatBRL(valRecuperado)}</p>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">Recuperado</span>
                  <span className="text-[10px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">Fora do Prazo</span>
                </div>
              </div>

              {/* Card 4: Proporção de Recuperação (%) */}
              <div className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-black text-amber-700 uppercase tracking-wider">Taxa Recuperação (%)</span>
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold shrink-0">
                    <PieIcon size={18} />
                  </div>
                </div>
                <p className="text-lg sm:text-xl font-black text-amber-700 tracking-tight my-1">{pctRecuperado.toFixed(1)}%</p>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">% do Total no Mês</span>
                  <span className="text-[10px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">Participação</span>
                </div>
              </div>

              {/* Card 5: Média de Atraso no Pagamento (Dias) */}
              <div className="bg-white/90 backdrop-blur-md border border-amber-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-black text-amber-700 uppercase tracking-wider">Média de Atraso</span>
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold shrink-0">
                    <Clock size={18} />
                  </div>
                </div>
                <p className="text-lg sm:text-xl font-black text-amber-700 tracking-tight my-1">
                  {recuperacaoFaixas.media_dias_atraso.toFixed(1)} dias
                </p>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">Pagos C/ Atraso</span>
                  <span className="text-[10px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">Média em Dias</span>
                </div>
              </div>
            </div>
          </div>

          {/* SEÇÃO 2: PERCENCIAIS E TEMPO DE RECEBIMENTO (NO DIA, 1 A 10 DIAS, APÓS 10 DIAS) */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-black uppercase tracking-wider text-indigo-700 flex items-center gap-1.5">
                <PieIcon size={16} /> Distribuição de Recebimentos por Tempo de Liquidação (No Dia vs Atraso)
              </h3>
              <span className="text-[11px] font-bold text-slate-500">
                Total Liquidado no Mês: <strong className="text-indigo-700 font-black">{formatBRL(valAtual)}</strong> ({kpis.mes_atual?.titulos_recebidos || 0} títulos)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
              {/* Card 6: Percentual Recebido no Dia (%) */}
              <div className="bg-white/90 backdrop-blur-md border border-emerald-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-black text-emerald-700 uppercase tracking-wider">% Recebido No Dia</span>
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0">
                    <CheckCircle2 size={18} />
                  </div>
                </div>
                <p className="text-lg sm:text-xl font-black text-emerald-700 tracking-tight my-1">
                  {recuperacaoFaixas.no_dia.pct.toFixed(1)}%
                </p>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">{recuperacaoFaixas.no_dia.qtd} títulos</span>
                  <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">No Vencimento</span>
                </div>
              </div>

              {/* Card 7: Percentual Recebido entre 1 a 10 Dias (%) */}
              <div className="bg-white/90 backdrop-blur-md border border-blue-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-black text-blue-700 uppercase tracking-wider">% Entre 1 a 10 Dias</span>
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">
                    <Clock size={18} />
                  </div>
                </div>
                <p className="text-lg sm:text-xl font-black text-blue-700 tracking-tight my-1">
                  {recuperacaoFaixas.dias_1_10.pct.toFixed(1)}%
                </p>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">{recuperacaoFaixas.dias_1_10.qtd} títulos</span>
                  <span className="text-[10px] font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">Atraso Curto</span>
                </div>
              </div>

              {/* Card 8: Percentual Recebido Após 10 Dias (%) */}
              <div className="bg-white/90 backdrop-blur-md border border-amber-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-black text-amber-700 uppercase tracking-wider">% Após 10 Dias</span>
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold shrink-0">
                    <AlertTriangle size={18} />
                  </div>
                </div>
                <p className="text-lg sm:text-xl font-black text-amber-700 tracking-tight my-1">
                  {recuperacaoFaixas.mais_10_dias.pct.toFixed(1)}%
                </p>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">{recuperacaoFaixas.mais_10_dias.qtd} títulos</span>
                  <span className="text-[10px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">Atraso Longo</span>
                </div>
              </div>

              {/* Card 9: Valor Pago Com Atraso (R$) */}
              <div className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-black text-slate-600 uppercase tracking-wider">Pago Com Atraso (R$)</span>
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shrink-0">
                    <RotateCcw size={18} />
                  </div>
                </div>
                <p className="text-lg sm:text-xl font-black text-slate-900 tracking-tight my-1">{formatBRL(valRecuperado)}</p>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">{kpis.mes_atual?.qtd_fora_prazo || 0} títulos</span>
                  <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">Fora do Prazo</span>
                </div>
              </div>

              {/* Card 10: Total Liquidado no Mês (R$) */}
              <div className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-black text-indigo-700 uppercase tracking-wider">Total Liquidado (R$)</span>
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shrink-0">
                    <DollarSign size={18} />
                  </div>
                </div>
                <p className="text-lg sm:text-xl font-black text-indigo-900 tracking-tight my-1">{formatBRL(valAtual)}</p>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">{kpis.mes_atual?.titulos_recebidos || 0} títulos</span>
                  <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">Recebimento Total</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Doughnut Eficiência */}
            <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200/60 flex flex-col items-center justify-center">
              <h3 className="text-sm font-bold text-slate-800 mb-1 w-full text-left">Eficiência de Pagamento no Prazo</h3>
              <p className="text-xs text-slate-500 mb-4 w-full text-left">Proporção no prazo vs. fora do prazo no mês</p>
              <div className="relative w-56 h-56 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={doughnutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={85}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      <Cell fill={C.emerald} />
                      <Cell fill={C.amber} />
                    </Pie>
                    <Tooltip formatter={(v: number) => formatBRL(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">EFICIÊNCIA</span>
                  <span className="text-2xl font-black text-slate-900">{pctNoPrazo.toFixed(1)}%</span>
                  <span className="text-[10px] font-semibold text-emerald-600">no prazo</span>
                </div>
              </div>
            </div>

            {/* Top 5 Meses Destaque em Recuperação */}
            <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200/60">
              <h3 className="text-sm font-bold text-slate-800 mb-1">Top 5 Meses que Mais Contribuíram para Recuperação</h3>
              <p className="text-xs text-slate-500 mb-4">Origem dos títulos antigos recebidos</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={recupTop} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={C.gray200} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: C.slate }} axisLine={false} tickFormatter={v => formatBRLCompact(v)} />
                  <YAxis type="category" dataKey="mes_origem_label" tick={{ fontSize: 10, fill: C.slate }} axisLine={false} width={80} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="valor_recuperado" name="Valor Recuperado" fill={C.amber} radius={[0, 4, 4, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabela de Origem da Recuperação */}
          <div className="overflow-x-auto rounded-xl border border-slate-200/70">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100/70 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                  <th className="p-3 text-left">Mês de Vencimento Original</th>
                  <th className="p-3 text-right">Qtd Títulos Recuperados</th>
                  <th className="p-3 text-right">Valor Total Recuperado</th>
                  <th className="p-3 text-center">Ação Recomendada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {recupTop.map((r: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 font-semibold text-slate-800">{r.mes_origem_label}</td>
                    <td className="p-3 text-right font-medium text-slate-700">{r.total_titulos}</td>
                    <td className="p-3 text-right font-bold text-amber-600">{formatBRL(r.valor_recuperado)}</td>
                    <td className="p-3 text-center">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700">
                        Manter Régua Automática
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}
