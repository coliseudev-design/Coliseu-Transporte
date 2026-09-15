import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw, CheckCircle2, AlertCircle, Loader2, Link2, Unlink,
  TrendingUp, TrendingDown, ChevronLeft, ChevronRight,
  ArrowUpCircle, ArrowDownCircle, Search, Wallet, X, Trash2,
  Eye, FileText, Calendar, DollarSign, User, CreditCard, Building2
} from 'lucide-react'
import api from '../../services/api'

interface AsaasTransaction {
  id: string
  date: string
  value: number
  type: 'CREDIT' | 'DEBIT'
  description: string
  cliente_nome?: string
  numero_fatura?: string
  sub_descricao?: string
  paymentId: string | null
  balance: number | null
  status: string
  category: string
  conciliado: boolean
  titulo_local: { id: number; descricao: string; cliente_nome: string; status_pagamento: string; valor?: number } | null
}

interface TituloAberto {
  id: number
  descricao: string
  cliente_nome: string
  valor: number
  data_vencimento: string
  status_pagamento: string
}

const fmtBRL = (v: number | null) =>
  v == null ? '—' : Math.abs(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (s: string) => {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

interface Props {
  startDate?: string
  endDate?: string
}

// Default: últimos 30 dias
const getDefaultDates = () => {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 90)
  return {
    start: start.toISOString().split('T')[0],
    end:   end.toISOString().split('T')[0],
  }
}

export default function ExtratoAsaas({ startDate: startProp, endDate: endProp }: Props) {
  const defaults = getDefaultDates()
  const startDate = startProp || defaults.start
  const endDate   = endProp   || defaults.end
  const [transactions, setTransactions] = useState<AsaasTransaction[]>([])
  const [saldo, setSaldo]               = useState<number | null>(null)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')
  const [totalCount, setTotalCount]     = useState(0)
  const [offset, setOffset]             = useState(0)
  const [typeFilter, setTypeFilter]     = useState<'ALL' | 'CREDIT' | 'DEBIT'>('ALL')
  const [selectedBank, setSelectedBank] = useState('asaas')
  const [search, setSearch]             = useState('')

  // Conciliação modal
  const [conciliandoTx, setConciliandoTx] = useState<AsaasTransaction | null>(null)
  const [titulosAbertos, setTitulosAbertos] = useState<TituloAberto[]>([])
  const [loadingTitulos, setLoadingTitulos] = useState(false)
  const [concilMsg, setConcilMsg]         = useState('')
  const [tituloSearch, setTituloSearch]   = useState('')
  const [concilSaving, setConcilSaving]   = useState(false)
  const [syncingPayments, setSyncingPayments] = useState(false)
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([])
  const [hidingTx, setHidingTx]           = useState(false)
  const [selectedExtratoDetail, setSelectedExtratoDetail] = useState<AsaasTransaction | null>(null)
  const [loadingExtratoDetail, setLoadingExtratoDetail]   = useState(false)
  const [detailExtratoData, setDetailExtratoData]         = useState<any | null>(null)

  const handleOpenExtratoDetail = async (tx: AsaasTransaction) => {
    setSelectedExtratoDetail(tx)
    setDetailExtratoData(null)
    setLoadingExtratoDetail(true)
    try {
      const clientDesc = tx.cliente_nome || tx.description || ''
      const res = await api.get(
        `/asaas/extrato/detalhes?paymentId=${tx.paymentId || ''}&transactionId=${tx.id}&description=${encodeURIComponent(clientDesc)}&value=${tx.value}`
      )
      setDetailExtratoData(res.data)
    } catch (err) {
      console.error('Erro ao buscar detalhes da transação:', err)
    } finally {
      setLoadingExtratoDetail(false)
    }
  }

  const handleSincronizarAutomatico = async () => {
    setSyncingPayments(true)
    try {
      const res = await api.post('/asaas/sincronizar-pagamentos')
      alert(res.data?.message || 'Conciliação e sincronização automática de recebimentos concluída com sucesso!')
      fetchExtrato()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao executar a sincronização automática de recebimentos do Asaas.')
    } finally {
      setSyncingPayments(false)
    }
  }

  const handleToggleSelectAll = () => {
    if (selectedTxIds.length === filtered.length) {
      setSelectedTxIds([])
    } else {
      setSelectedTxIds(filtered.map(t => t.id))
    }
  }

  const handleToggleSelectTx = (id: string) => {
    setSelectedTxIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  const handleHideSingleTx = async (tx: AsaasTransaction) => {
    if (!confirm(`Deseja excluir o lançamento "${tx.description}" (${fmtBRL(tx.value)}) do extrato bancário?\n\nEste lançamento deixará de ser exibido no painel de extrato.`)) return;
    setHidingTx(true)
    try {
      await api.post('/asaas/extrato/ocultar', { transactionId: tx.id })
      setTransactions(prev => prev.filter(t => t.id !== tx.id))
      setSelectedTxIds(prev => prev.filter(i => i !== tx.id))
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao excluir lançamento.')
    } finally {
      setHidingTx(false)
    }
  }

  const handleHideBatchTx = async () => {
    if (selectedTxIds.length === 0) return;
    if (!confirm(`Deseja excluir os ${selectedTxIds.length} lançamento(s) selecionados do extrato bancário?`)) return;
    setHidingTx(true)
    try {
      await api.post('/asaas/extrato/excluir-lote', { transactionIds: selectedTxIds })
      setTransactions(prev => prev.filter(t => !selectedTxIds.includes(t.id)))
      setSelectedTxIds([])
      alert(`${selectedTxIds.length} lançamento(s) excluído(s) do extrato bancário com sucesso!`)
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao excluir lançamentos em lote.')
    } finally {
      setHidingTx(false)
    }
  }

  const LIMIT = 50

  const fetchExtrato = useCallback(async () => {
    setLoading(true); setError('')
    try {
      if (selectedBank === 'cora') {
        const params: Record<string, string> = {}
        if (startDate) params.startDate = startDate
        if (endDate)   params.endDate   = endDate
        if (typeFilter !== 'ALL') params.type = typeFilter

        const qs = new URLSearchParams(params).toString()
        const r = await api.get(`/cora/extrato?${qs}`)
        setTransactions(r.data.transactions || [])
        setSaldo(r.data.saldo_atual ?? null)
        setTotalCount(r.data.totalCount || 0)
      } else {
        const params: Record<string, string> = {
          limit:  String(LIMIT),
          offset: String(offset),
        }
        if (startDate) params.startDate = startDate
        if (endDate)   params.endDate   = endDate
        if (typeFilter !== 'ALL') params.type = typeFilter

        const qs = new URLSearchParams(params).toString()
        const r = await api.get(`/asaas/extrato?${qs}`)
        setTransactions(r.data.transactions || [])
        setSaldo(r.data.saldo_atual ?? null)
        setTotalCount(r.data.totalCount || 0)
      }
    } catch (err: any) {
      setError(err.response?.data?.error || `Erro ao buscar extrato ${selectedBank === 'cora' ? 'Banco Cora' : 'Asaas'}.`)
    } finally {
      setLoading(false)
    }
  }, [selectedBank, startDate, endDate, typeFilter, offset])

  useEffect(() => { fetchExtrato() }, [fetchExtrato])

  const openConciliacao = async (tx: AsaasTransaction) => {
    setConciliandoTx(tx)
    setConcilMsg('')
    setTituloSearch('')
    setLoadingTitulos(true)
    try {
      const r = await api.get('/financeiro/titulos-abertos?tipo=RECEBER&limit=50')
      setTitulosAbertos(r.data?.data || [])
    } catch {
      setTitulosAbertos([])
    } finally {
      setLoadingTitulos(false)
    }
  }

  const handleConciliar = async (tituloId: number) => {
    if (!conciliandoTx) return
    setConcilSaving(true); setConcilMsg('')
    try {
      await api.post('/asaas/conciliar', {
        asaas_payment_id: conciliandoTx.paymentId || conciliandoTx.id,
        titulo_id: tituloId,
        data_conciliacao: conciliandoTx.date,
      })
      setConcilMsg('✅ Conciliado com sucesso!')
      setTimeout(() => {
        setConciliandoTx(null)
        fetchExtrato()
      }, 1200)
    } catch (err: any) {
      setConcilMsg('❌ ' + (err.response?.data?.error || 'Erro ao conciliar.'))
    } finally {
      setConcilSaving(false)
    }
  }

  const handleDesconciliar = async (tx: AsaasTransaction) => {
    if (!tx.titulo_local) return
    if (!window.confirm(`Remover conciliação do título "${tx.titulo_local.descricao}"?`)) return
    try {
      await api.post('/asaas/desconciliar', { titulo_id: tx.titulo_local.id })
      fetchExtrato()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao desconciliar.')
    }
  }

  const isTxCredit = (t: AsaasTransaction) => {
    if (t.type === 'CREDIT') return true
    if (t.type === 'DEBIT') return false
    const rawType = ((t.type as string) || '').toUpperCase()
    if (rawType.includes('RECEIVED') || rawType.includes('CREDIT') || rawType.includes('DEPOSIT') || rawType.includes('DEBIT_REFUND')) return true
    if (rawType.includes('FEE') || rawType.includes('SENT') || rawType.includes('BILL_PAYMENT') || rawType.includes('TRANSFER') || rawType.includes('CREDIT_REFUND')) return false
    const descLower = (t.description || '').toLowerCase()
    if (descLower.includes('estorno') && !descLower.includes('cobrança')) return true
    if (
      descLower.includes('taxa') || 
      descLower.includes('pagamento') || 
      descLower.includes('tarifa') ||
      descLower.includes('pix com chave') ||
      descLower.includes('transferência') ||
      descLower.includes('enviad') ||
      descLower.includes('saida') ||
      descLower.includes('saída') ||
      (descLower.includes('transação via pix') && !descLower.includes('estorno'))
    ) return false
    if (
      descLower.includes('recebido') ||
      descLower.includes('recebimento') ||
      descLower.includes('cobrança recebida') ||
      descLower.includes('pix recebido')
    ) return true
    return false
  }

  const filtered = transactions.filter(t => {
    if (typeFilter !== 'ALL') {
      const credit = isTxCredit(t)
      if (typeFilter === 'CREDIT' && !credit) return false
      if (typeFilter === 'DEBIT' && credit) return false
    }
    if (!search) return true
    const s = search.toLowerCase()
    return (
      (t.description  || '').toLowerCase().includes(s) ||
      (t.cliente_nome || '').toLowerCase().includes(s) ||
      (t.category     || '').toLowerCase().includes(s) ||
      (t.paymentId    || '').toLowerCase().includes(s)
    )
  })

  // KPIs
  const totalCredito = transactions.filter(isTxCredit).reduce((s, t) => s + Math.abs(t.value), 0)
  const totalDebito  = transactions.filter(t => !isTxCredit(t)).reduce((s, t) => s + Math.abs(t.value), 0)
  const totalConc    = transactions.filter(t => t.conciliado).length
  const totalPend    = transactions.filter(t => !t.conciliado).length

  return (
    <div className="min-h-[calc(100vh-220px)] flex flex-col justify-between space-y-4 animate-fade-in text-xs">

      {/* SELEÇÃO DO BANCO EM CIMA DOS SALDOS (GRID COMPACTO E ESCALÁVEL) */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Building2 size={13} className="text-indigo-600 dark:text-indigo-400" />
            Conta Bancária / Provedor
          </span>
          <span className="text-[10px] text-slate-400 font-semibold hidden sm:inline">
            Clique no banco para carregar o extrato e saldo em tempo real
          </span>
        </div>

        {/* Grid com auto-fit para suportar 2, 4 ou 10+ bancos harmonicamente */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {/* BANCO ASAAS */}
          <button
            type="button"
            onClick={() => {
              if (selectedBank === 'asaas') return;
              setSelectedBank('asaas');
              setOffset(0);
              setError('');
              setTransactions([]);
              setSaldo(null);
            }}
            className={`group relative p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
              selectedBank === 'asaas'
                ? 'bg-indigo-950/85 dark:bg-indigo-950/90 border-indigo-500 shadow-md ring-2 ring-indigo-500/50 text-white'
                : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/80 hover:border-indigo-400 hover:shadow-xs text-slate-700 dark:text-slate-200'
            }`}
          >
            {/* Logo Asaas */}
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-blue-700 flex items-center justify-center text-white font-black shadow-inner shrink-0 ring-1 ring-white/20">
              <span className="text-sm tracking-tighter">a$</span>
            </div>
            
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className={`text-xs font-black tracking-tight truncate ${selectedBank === 'asaas' ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                  Banco Asaas
                </span>
                {selectedBank === 'asaas' && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse" title="Banco Ativo"></span>
                )}
              </div>
              <p className={`text-[10px] font-semibold truncate ${selectedBank === 'asaas' ? 'text-indigo-200' : 'text-slate-400'}`}>
                Principal (API Direct)
              </p>
            </div>
          </button>

          {/* BANCO CORA */}
          <button
            type="button"
            onClick={() => {
              if (selectedBank === 'cora') return;
              setSelectedBank('cora');
              setOffset(0);
              setError('');
              setTransactions([]);
              setSaldo(null);
            }}
            className={`group relative p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
              selectedBank === 'cora'
                ? 'bg-rose-950/85 dark:bg-rose-950/90 border-rose-500 shadow-md ring-2 ring-rose-500/50 text-white'
                : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/80 hover:border-rose-400 hover:shadow-xs text-slate-700 dark:text-slate-200'
            }`}
          >
            {/* Logo Banco Cora */}
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center text-white font-black shadow-inner shrink-0 ring-1 ring-white/20">
              <span className="text-xs tracking-tighter font-extrabold">cora</span>
            </div>
            
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className={`text-xs font-black tracking-tight truncate ${selectedBank === 'cora' ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                  Banco Cora
                </span>
                {selectedBank === 'cora' && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse" title="Banco Ativo"></span>
                )}
              </div>
              <p className={`text-[10px] font-semibold truncate ${selectedBank === 'cora' ? 'text-rose-200' : 'text-slate-400'}`}>
                Conta 0001 / 7264541-2
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4 border border-divider rounded-xl bg-bg-primary flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <Wallet size={16} className="text-emerald-600" />
          </div>
          <div>
            <p className="text-[9px] text-text-muted uppercase font-bold">
              {selectedBank === 'cora' ? 'Saldo Banco Cora' : 'Saldo Asaas'}
            </p>
            <p className={`text-sm font-bold font-mono ${(saldo ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {saldo != null ? fmtBRL(saldo) : '…'}
            </p>
          </div>
        </div>

        {/* CRÉDITOS (EM AZUL) */}
        <div className="card p-4 border border-divider rounded-xl bg-bg-primary flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <ArrowUpCircle size={16} className="text-blue-600" />
          </div>
          <div>
            <p className="text-[9px] text-text-muted uppercase font-bold">Créditos</p>
            <p className="text-sm font-bold font-mono text-blue-600">{fmtBRL(totalCredito)}</p>
          </div>
        </div>

        {/* DÉBITOS (EM VERMELHO) */}
        <div className="card p-4 border border-divider rounded-xl bg-bg-primary flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center">
            <ArrowDownCircle size={16} className="text-red-500" />
          </div>
          <div>
            <p className="text-[9px] text-text-muted uppercase font-bold">Débitos</p>
            <p className="text-sm font-bold font-mono text-red-500">{fmtBRL(totalDebito)}</p>
          </div>
        </div>

        <div className="card p-4 border border-divider rounded-xl bg-bg-primary flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center">
            <CheckCircle2 size={16} className="text-indigo-600" />
          </div>
          <div>
            <p className="text-[9px] text-text-muted uppercase font-bold">Conciliados</p>
            <p className="text-sm font-bold font-mono text-indigo-600">{totalConc} / {transactions.length}</p>
            {totalPend > 0 && <p className="text-[8px] text-amber-500 font-semibold">{totalPend} pendentes</p>}
          </div>
        </div>
      </div>

      {/* Filters + refresh */}
      <div className="flex flex-wrap items-center gap-2">

        <div className="relative flex-1 min-w-48">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Buscar descrição, categoria..."
            className="input !py-1.5 pl-7 text-xs rounded-lg w-full uppercase"
            value={search}
            onChange={e => setSearch(e.target.value.toUpperCase())}
          />
        </div>

        <div className="flex items-center gap-1 bg-bg-secondary border border-divider rounded-lg p-0.5">
          {(['ALL', 'CREDIT', 'DEBIT'] as const).map(t => (
            <button key={t}
              onClick={() => { setTypeFilter(t); setOffset(0) }}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                typeFilter === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-text-secondary hover:text-text-primary'
              }`}>
              {t === 'ALL' ? 'Todos' : t === 'CREDIT' ? '↑ Crédito' : '↓ Débito'}
            </button>
          ))}
        </div>

        {selectedBank === 'asaas' && (
          <button
            onClick={handleSincronizarAutomatico}
            disabled={syncingPayments}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer transition-all shadow-sm"
            title="Buscar pagamentos recebidos no Asaas e conciliar automaticamente com os títulos em aberto"
          >
            <RefreshCw size={12} className={syncingPayments ? 'animate-spin' : ''} />
            {syncingPayments ? 'Sincronizando...' : '🛠️ Manutenção & Conciliação Automática'}
          </button>
        )}

        <button
          onClick={fetchExtrato}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold border border-divider rounded-lg hover:bg-bg-secondary cursor-pointer transition-all"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-700 text-xs">
          <AlertCircle size={13}/> {error}
        </div>
      )}

      {/* Table */}
      <div className="card border border-divider rounded-xl shadow-sm bg-bg-primary overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-divider bg-bg-secondary/40">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/>
              <span className="text-[9px] font-bold text-text-secondary uppercase tracking-wider">
                {selectedBank === 'cora'
                  ? 'Extrato Banco Cora — Conta Digital 0001 / 7264541-2'
                  : 'Extrato Asaas — Financeiras Transactions'}
              </span>
            </div>
            {selectedTxIds.length > 0 && (
              <button
                type="button"
                onClick={handleHideBatchTx}
                disabled={hidingTx}
                className="ml-3 inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-md transition-colors shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Trash2 size={12} />
                Excluir Selecionados ({selectedTxIds.length})
              </button>
            )}
          </div>
          <span className="text-[9px] text-text-muted">{totalCount} transações</span>
        </div>

        <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="sticky top-0 bg-bg-secondary/90 backdrop-blur-sm border-b border-divider z-10">
              <tr>
                <th className="text-center px-2 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedTxIds.length === filtered.length}
                    onChange={handleToggleSelectAll}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    title="Selecionar Todos"
                  />
                </th>
                <th className="text-center px-2 py-2 text-[8px] font-bold text-text-secondary uppercase w-10">Conc.</th>
                <th className="px-3 py-2 text-[8px] font-bold text-text-secondary uppercase">Data</th>
                <th className="px-3 py-2 text-[8px] font-bold text-text-secondary uppercase">Nº Fatura / Doc</th>
                <th className="px-3 py-2 text-[8px] font-bold text-text-secondary uppercase">Cliente</th>
                <th className="px-3 py-2 text-[8px] font-bold text-text-secondary uppercase">Categoria</th>
                <th className="text-center px-3 py-2 text-[8px] font-bold text-text-secondary uppercase">D/C</th>
                <th className="text-right px-3 py-2 text-[8px] font-bold text-text-secondary uppercase">Valor</th>
                <th className="text-right px-3 py-2 text-[8px] font-bold text-text-secondary uppercase">Saldo</th>
                <th className="px-3 py-2 text-[8px] font-bold text-text-secondary uppercase">Título Coliseu Transporte</th>
                <th className="text-center px-3 py-2 text-[8px] font-bold text-text-secondary uppercase w-28">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider/40">
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center">
                    <Loader2 size={20} className="animate-spin text-indigo-500 mx-auto" />
                    <p className="text-xs text-text-muted mt-2">Buscando extrato do {selectedBank === 'cora' ? 'Banco Cora' : 'Asaas'}...</p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-xs text-text-muted italic">
                    {error ? 'Erro ao carregar.' : 'Nenhuma transação encontrada no período.'}
                  </td>
                </tr>
              ) : (
                filtered.map(tx => {
                  const isCredit = isTxCredit(tx)
                  const isSelected = selectedTxIds.includes(tx.id)
                  return (
                    <tr key={tx.id}
                      className={`hover:bg-bg-secondary/40 transition-colors ${isSelected ? 'bg-indigo-50/50 dark:bg-indigo-950/30' : (tx.conciliado ? 'bg-emerald-50/30 dark:bg-emerald-900/5' : '')}`}>

                      {/* Checkbox de seleção */}
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectTx(tx.id)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>

                      {/* Conciliado status */}
                      <td className="px-3 py-2 text-center">
                        {tx.conciliado ? (
                          <span title="Conciliado" className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-600">
                            <CheckCircle2 size={12}/>
                          </span>
                        ) : (
                          <span title="Pendente de conciliação" className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-500">
                            <AlertCircle size={12}/>
                          </span>
                        )}
                      </td>

                      {/* Data */}
                      <td className="px-3 py-2 text-text-secondary font-mono text-[10px]">{fmtDate(tx.date)}</td>

                      {/* Nº Fatura / Doc */}
                      <td className="px-3 py-2 font-mono font-bold text-indigo-700 dark:text-indigo-400 text-[11px] whitespace-nowrap">
                        {tx.numero_fatura ? `#${tx.numero_fatura}` : (tx.paymentId ? `#${tx.paymentId}` : '—')}
                      </td>

                      {/* Cliente */}
                      <td 
                        className="px-3 py-2 text-text-primary font-medium max-w-72 cursor-pointer group" 
                        onClick={() => handleOpenExtratoDetail(tx)}
                        title="Clique para visualizar o detalhamento completo da cobrança"
                      >
                        <div className="font-extrabold text-slate-900 dark:text-slate-100 text-xs truncate group-hover:text-indigo-600 transition-colors">
                          {tx.cliente_nome || tx.description}
                        </div>
                        {tx.sub_descricao && (
                          <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate mt-0.5" title={tx.sub_descricao}>
                            {tx.sub_descricao}
                          </div>
                        )}
                      </td>

                      {/* Categoria */}
                      <td className="px-3 py-2 text-text-muted text-[10px]">{tx.category || '—'}</td>

                      {/* D/C */}
                      <td className="px-3 py-2 text-center">
                        {isCredit ? (
                          <span className="inline-flex items-center gap-0.5 text-blue-600 font-bold text-[9px] bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                            <TrendingUp size={10}/> C
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-red-500 font-bold text-[9px] bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                            <TrendingDown size={10}/> D
                          </span>
                        )}
                      </td>

                      {/* Valor (CRÉDITO EM AZUL, DÉBITO EM VERMELHO) */}
                      <td className={`px-3 py-2 text-right font-mono font-bold ${isCredit ? 'text-blue-600' : 'text-red-500'}`}>
                        {isCredit ? '+' : '-'}{fmtBRL(tx.value)}
                      </td>

                      {/* Saldo */}
                      <td className={`px-3 py-2 text-right font-mono text-[10px] ${(tx.balance ?? 0) >= 0 ? 'text-text-secondary' : 'text-red-500'}`}>
                        {tx.balance != null ? fmtBRL(tx.balance) : '—'}
                      </td>

                      {/* Título Coliseu Transporte */}
                      <td className="px-3 py-2 max-w-40">
                        {tx.titulo_local ? (
                          <div>
                            <p className="text-[10px] font-semibold text-indigo-700 truncate">{tx.titulo_local.descricao}</p>
                            <p className="text-[8px] text-text-muted">{tx.titulo_local.cliente_nome}</p>
                          </div>
                        ) : (
                          <span className="text-[9px] text-text-muted italic">Sem vínculo</span>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Botão de Ver Detalhes */}
                          <button
                            type="button"
                            onClick={() => handleOpenExtratoDetail(tx)}
                            title="Visualizar detalhamento completo do lançamento"
                            className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded transition-colors cursor-pointer"
                          >
                            <Eye size={14} />
                          </button>

                          {tx.conciliado ? (
                            <button
                              onClick={() => handleDesconciliar(tx)}
                              title="Remover conciliação"
                              className="inline-flex items-center gap-1 px-2 py-1 text-[9px] font-bold bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-md cursor-pointer transition-all"
                            >
                              <Unlink size={10}/> Desfazer
                            </button>
                          ) : tx.paymentId ? (
                            <button
                              onClick={() => openConciliacao(tx)}
                              title="Conciliar com título Coliseu Transporte"
                              className="inline-flex items-center gap-1 px-2 py-1 text-[9px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-md cursor-pointer transition-all"
                            >
                              <Link2 size={10}/> Conciliar
                            </button>
                          ) : null}

                          {/* Botão de Excluir Lançamento do Extrato */}
                          <button
                            type="button"
                            onClick={() => handleHideSingleTx(tx)}
                            title="Excluir este lançamento do extrato bancário"
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalCount > LIMIT && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-divider bg-bg-secondary/30">
            <span className="text-[9px] text-text-muted">
              {offset + 1}–{Math.min(offset + LIMIT, totalCount)} de {totalCount}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={offset === 0 || loading}
                onClick={() => setOffset(o => Math.max(0, o - LIMIT))}
                className="p-1.5 border border-divider rounded-md hover:bg-bg-secondary disabled:opacity-40 cursor-pointer"
              ><ChevronLeft size={12}/></button>
              <button
                disabled={offset + LIMIT >= totalCount || loading}
                onClick={() => setOffset(o => o + LIMIT)}
                className="p-1.5 border border-divider rounded-md hover:bg-bg-secondary disabled:opacity-40 cursor-pointer"
              ><ChevronRight size={12}/></button>
            </div>
          </div>
        )}
      </div>

      {/* Barra Inferior Fixa com Ações e Totais do Banco (Padronizado igual a Títulos, Boletos e Caixa) */}
      <div className="sticky bottom-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-2.5 border-t-2 border-indigo-500 shadow-2xl flex flex-nowrap shrink-0 overflow-x-auto items-center justify-between gap-3 mt-4 rounded-b-xl">
        {/* Ações do Banco */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleSincronizarAutomatico}
            disabled={syncingPayments}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-sm"
            title="Conciliação automática de recebimentos do Banco"
          >
            <RefreshCw size={13} className={syncingPayments ? 'animate-spin' : ''} />
            {syncingPayments ? 'Sincronizando...' : '🛠️ Manutenção & Conciliação Automática'}
          </button>
          <button
            onClick={fetchExtrato}
            disabled={loading}
            className="btn-secondary !py-1.5 !px-3 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Atualizar Extrato
          </button>
        </div>

        {/* Totais do Banco (Lado Direito) */}
        <div className="flex items-center gap-2 text-xs ml-auto font-mono shrink-0 whitespace-nowrap">
          <div className="px-2.5 py-1 bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-200 rounded-lg font-extrabold border border-blue-300 dark:border-blue-700 shadow-2xs flex items-center gap-1 whitespace-nowrap">
            <span className="text-[10px] uppercase font-black text-blue-700 dark:text-blue-300">Créditos:</span>
            <span className="font-mono font-black">+{fmtBRL(totalCredito)}</span>
          </div>

          <div className="px-2.5 py-1 bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-200 rounded-lg font-extrabold border border-rose-300 dark:border-rose-700 shadow-2xs flex items-center gap-1 whitespace-nowrap">
            <span className="text-[10px] uppercase font-black text-rose-700 dark:text-rose-300">Débitos:</span>
            <span className="font-mono font-black">-{fmtBRL(totalDebito)}</span>
          </div>

          <div className="px-4 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-black flex items-center gap-2 shadow-md text-xs whitespace-nowrap">
            <span className="text-[10px] uppercase font-extrabold tracking-wider text-indigo-200">TOTAL SALDO:</span>
            <span className="text-sm font-black">{saldo != null ? fmtBRL(saldo) : 'R$ 0,00'}</span>
          </div>
        </div>
      </div>

      {/* Modal Conciliação */}
      {conciliandoTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-bg-primary border border-divider rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-divider bg-gradient-to-r from-indigo-600 to-indigo-800">
              <div className="flex items-center gap-2">
                <Link2 size={15} className="text-white/90"/>
                <span className="text-sm font-bold text-white">Conciliação Bancária</span>
              </div>
              <button onClick={() => setConciliandoTx(null)} className="p-1.5 rounded-md hover:bg-white/20 text-white cursor-pointer">
                <X size={14}/>
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">

              {/* Transação selecionada */}
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-1">
                <p className="text-[9px] font-bold text-indigo-700 uppercase">Transação Asaas</p>
                <p className="font-semibold text-text-primary">{conciliandoTx.description}</p>
                <div className="flex items-center gap-4 mt-1">
                  <span className="text-[10px] text-text-secondary">{fmtDate(conciliandoTx.date)}</span>
                  <span className={`font-bold font-mono ${conciliandoTx.type === 'CREDIT' ? 'text-emerald-600' : 'text-red-500'}`}>
                    {conciliandoTx.type === 'CREDIT' ? '+' : '-'}{fmtBRL(conciliandoTx.value)}
                  </span>
                  <span className="text-[9px] text-text-muted font-mono">{conciliandoTx.paymentId}</span>
                </div>
              </div>

              {/* Busca de título */}
              <div>
                <label className="text-[9px] font-bold text-text-secondary uppercase mb-1 block">Selecione o Título Coliseu Transporte para vincular</label>
                <div className="relative mb-2">
                  <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"/>
                  <input
                    type="text"
                    placeholder="Buscar por cliente ou descrição..."
                    className="input !py-2 pl-7 rounded-lg w-full text-xs"
                    value={tituloSearch}
                    onChange={e => setTituloSearch(e.target.value)}
                  />
                </div>

                {concilMsg && (
                  <div className="mb-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">{concilMsg}</div>
                )}

                <div className="max-h-52 overflow-y-auto border border-divider rounded-lg divide-y divide-divider/50">
                  {loadingTitulos ? (
                    <div className="py-6 text-center"><Loader2 size={16} className="animate-spin text-indigo-500 mx-auto"/></div>
                  ) : titulosAbertos
                      .filter(t => {
                        if (!tituloSearch) return true
                        const s = tituloSearch.toLowerCase()
                        return (t.descricao || '').toLowerCase().includes(s) ||
                               (t.cliente_nome || '').toLowerCase().includes(s)
                      })
                      .map(t => (
                        <button
                          key={t.id}
                          type="button"
                          disabled={concilSaving}
                          onClick={() => handleConciliar(t.id)}
                          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-indigo-50 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <div className="text-left">
                            <p className="font-semibold text-text-primary text-[11px]">{t.descricao}</p>
                            <p className="text-[9px] text-text-muted">{t.cliente_nome}</p>
                          </div>
                          <div className="text-right shrink-0 ml-4">
                            <p className="font-bold font-mono text-[11px] text-emerald-700">{fmtBRL(t.valor)}</p>
                            <p className="text-[8px] text-text-muted">{fmtDate(t.data_vencimento)}</p>
                          </div>
                        </button>
                      ))
                  }
                  {!loadingTitulos && titulosAbertos.length === 0 && (
                    <p className="py-6 text-center text-xs text-text-muted italic">Nenhum título aberto encontrado.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-3 border-t border-divider bg-bg-secondary/40">
              <button
                onClick={() => setConciliandoTx(null)}
                className="px-4 py-2 text-xs font-bold text-text-secondary border border-divider rounded-lg hover:bg-bg-secondary cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE DETALHAMENTO DO LANÇAMENTO BANCÁRIO / ASAAS */}
      {selectedExtratoDetail && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-200 dark:border-indigo-800">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base">
                    Detalhes da Cobrança / Transação
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    ID Transação: {selectedExtratoDetail.id} {selectedExtratoDetail.paymentId ? `• Fatura #${selectedExtratoDetail.paymentId}` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedExtratoDetail(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content Body */}
            <div className="p-6 overflow-y-auto space-y-4">
              {loadingExtratoDetail ? (
                <div className="py-12 text-center">
                  <Loader2 size={24} className="animate-spin text-indigo-600 mx-auto" />
                  <p className="text-xs text-slate-500 font-medium mt-2">Buscando informações completas do Asaas e Coliseu Transporte...</p>
                </div>
              ) : (
                <>
                  {/* Status Badge */}
                  <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase">Status no Asaas</span>
                    <span className="px-3 py-1 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-extrabold text-xs rounded-full border border-emerald-300 dark:border-emerald-700 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      {detailExtratoData?.payment?.status === 'RECEIVED' || detailExtratoData?.payment?.status === 'CONFIRMED' ? 'Recebida / Paga' : (selectedExtratoDetail.status || 'Concluída')}
                    </span>
                  </div>

                  {/* Card Cliente */}
                  <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 rounded-xl space-y-2">
                    <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-400 font-extrabold text-xs uppercase">
                      <User size={14} /> Cliente
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900 dark:text-slate-100">
                        {detailExtratoData?.customer?.name || detailExtratoData?.localTitle?.cliente_nome_db || selectedExtratoDetail.cliente_nome || selectedExtratoDetail.description}
                      </p>
                      {(detailExtratoData?.customer?.cpfCnpj || detailExtratoData?.localTitle?.cliente_doc_db) && (
                        <p className="text-xs font-mono font-extrabold text-slate-600 dark:text-slate-400 mt-0.5">
                          CNPJ / CPF: {detailExtratoData?.customer?.cpfCnpj || detailExtratoData?.localTitle?.cliente_doc_db}
                        </p>
                      )}
                      {(detailExtratoData?.customer?.email || detailExtratoData?.customer?.phone) && (
                        <p className="text-[11px] text-slate-500 font-medium mt-1">
                          {detailExtratoData?.customer?.email} {detailExtratoData?.customer?.phone ? `• ${detailExtratoData.customer.phone}` : ''}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Grid Valores */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl">
                      <span className="text-[9.5px] font-extrabold uppercase text-slate-400 block">Valor Pago / Total</span>
                      <span className="font-mono font-black text-emerald-600 text-sm">
                        {fmtBRL(detailExtratoData?.payment?.value || selectedExtratoDetail.value)}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl">
                      <span className="text-[9.5px] font-extrabold uppercase text-slate-400 block">Valor Original</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200 text-xs">
                        {fmtBRL(
                          detailExtratoData?.payment?.calculatedOriginalValue ?? 
                          (detailExtratoData?.localTitle?.valor ? parseFloat(detailExtratoData.localTitle.valor) : null) ?? 
                          detailExtratoData?.payment?.originalValue ?? 
                          selectedExtratoDetail.value
                        )}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl">
                      <span className="text-[9.5px] font-extrabold uppercase text-slate-400 block">Juros e Multa</span>
                      <span className="font-mono font-bold text-amber-600 text-xs">
                        {fmtBRL(
                          detailExtratoData?.payment?.calculatedInterestValue ?? 
                          (detailExtratoData?.payment?.interestValue && detailExtratoData.payment.interestValue > 0 ? detailExtratoData.payment.interestValue : null) ?? 
                          (detailExtratoData?.localTitle?.valor && selectedExtratoDetail.value > parseFloat(detailExtratoData.localTitle.valor) 
                            ? selectedExtratoDetail.value - parseFloat(detailExtratoData.localTitle.valor) 
                            : 0)
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Datas e Forma de Pagamento */}
                  <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs space-y-0">
                    <div>
                      <span className="text-[9.5px] font-extrabold uppercase text-slate-400 block">Forma de Pagamento</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1 mt-0.5">
                        <CreditCard size={13} className="text-indigo-600" />
                        {detailExtratoData?.payment?.billingType || 'Pix / Boleto'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[9.5px] font-extrabold uppercase text-slate-400 block">Vencimento</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200 block mt-0.5">
                        {fmtDate(detailExtratoData?.payment?.dueDate || selectedExtratoDetail.date)}
                      </span>
                    </div>

                    <div className="pt-2">
                      <span className="text-[9.5px] font-extrabold uppercase text-slate-400 block">Data de Criação</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300 block mt-0.5">
                        {fmtDate(detailExtratoData?.payment?.dateCreated || selectedExtratoDetail.date)}
                      </span>
                    </div>

                    <div className="pt-2">
                      <span className="text-[9.5px] font-extrabold uppercase text-slate-400 block">Crédito / Liquidação</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300 block mt-0.5">
                        {fmtDate(detailExtratoData?.payment?.creditDate || detailExtratoData?.payment?.paymentDate || selectedExtratoDetail.date)}
                      </span>
                    </div>
                  </div>

                  {/* Valor Líquido Recebido */}
                  {detailExtratoData?.payment?.netValue != null && (
                    <div className="p-3.5 bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-xl flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Valor Líquido Creditado</span>
                      <span className="text-base font-extrabold font-mono text-emerald-700 dark:text-emerald-400">
                        {fmtBRL(detailExtratoData.payment.netValue)}
                      </span>
                    </div>
                  )}

                  {/* Descrição Original */}
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
                    <span className="text-[9.5px] font-extrabold uppercase text-slate-400 block">Descrição do Lançamento</span>
                    <p className="text-xs text-slate-700 dark:text-slate-300 font-medium italic">
                      {detailExtratoData?.payment?.description || selectedExtratoDetail.description || 'Campo não informado'}
                    </p>
                  </div>

                  {/* Vínculo Coliseu Transporte */}
                  <div className="p-3.5 bg-indigo-50/30 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/40 rounded-xl space-y-1.5">
                    <span className="text-[9.5px] font-extrabold uppercase text-indigo-600 dark:text-indigo-400 block">Vínculo com Título Coliseu Transporte</span>
                    {selectedExtratoDetail.titulo_local || detailExtratoData?.localTitle ? (
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                          <CheckCircle2 size={14} />
                          Vinculado: {selectedExtratoDetail.titulo_local?.descricao || detailExtratoData?.localTitle?.descricao}
                        </span>
                        <span className="font-mono font-bold text-indigo-700">
                          {fmtBRL(selectedExtratoDetail.titulo_local?.valor || detailExtratoData?.localTitle?.valor)}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-amber-600 font-bold flex items-center gap-1">
                          <AlertCircle size={14} /> Lançamento sem vínculo no Coliseu Transporte
                        </span>
                        {selectedExtratoDetail.paymentId && (
                          <button
                            type="button"
                            onClick={() => {
                              const tx = selectedExtratoDetail;
                              setSelectedExtratoDetail(null);
                              openConciliacao(tx);
                            }}
                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-md text-[10px] cursor-pointer transition-all"
                          >
                            + Conciliar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850">
              <button
                type="button"
                onClick={() => setSelectedExtratoDetail(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
