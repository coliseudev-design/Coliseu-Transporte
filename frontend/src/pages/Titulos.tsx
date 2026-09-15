import { useState } from 'react'
import { useApiQuery } from '../hooks/useApi'
import DataTable from '../components/DataTable'
import { Filter, ArrowDownCircle, ArrowUpCircle, AlertCircle, CheckCircle, Calendar } from 'lucide-react'
import { formatBRL, formatDate } from '../utils/format'

const PERIODS = [
  { label: 'Este mês',       value: 'thisMonth' },
  { label: 'Mês passado',    value: 'lastMonth' },
  { label: 'Últimos 3 meses',value: '3m' },
  { label: 'Últimos 6 meses',value: '6m' },
  { label: 'Este ano',       value: 'thisYear' },
  { label: 'Todos',          value: 'all' },
]

function getPeriodDates(period: string): { startDate?: string; endDate?: string } {
  const now = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]

  if (period === 'thisMonth') {
    return {
      startDate: fmt(new Date(now.getFullYear(), now.getMonth(), 1)),
      endDate: fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    }
  }
  if (period === 'lastMonth') {
    return {
      startDate: fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      endDate: fmt(new Date(now.getFullYear(), now.getMonth(), 0)),
    }
  }
  if (period === '3m') {
    const s = new Date(now); s.setMonth(s.getMonth() - 3)
    return { startDate: fmt(s), endDate: fmt(now) }
  }
  if (period === '6m') {
    const s = new Date(now); s.setMonth(s.getMonth() - 6)
    return { startDate: fmt(s), endDate: fmt(now) }
  }
  if (period === 'thisYear') {
    return {
      startDate: fmt(new Date(now.getFullYear(), 0, 1)),
      endDate: fmt(new Date(now.getFullYear(), 11, 31)),
    }
  }
  return {} // 'all'
}

export default function Titulos() {
  const [tipo, setTipo] = useState<'' | 'RECEBER' | 'PAGAR'>('')
  const [status, setStatus] = useState<'' | 'ABERTO' | 'PAGO' | 'VENCIDA'>('')
  const [period, setPeriod] = useState('thisMonth')

  const { startDate, endDate } = getPeriodDates(period)

  const { data: res, isLoading } = useApiQuery<any>('/financeiro/contas', {
    tipo: tipo || undefined,
    status: status || undefined,
    limit: 5000,
    ...(startDate ? { startDate } : {}),
    ...(endDate   ? { endDate }   : {}),
  })

  const titulos = res?.data || []

  const totalReceber = titulos
    .filter((t: any) => String(t.tipo || '').trim() === 'RECEBER')
    .reduce((acc: number, t: any) => acc + (parseFloat(t.valor) || 0), 0)

  const totalPagar = titulos
    .filter((t: any) => String(t.tipo || '').trim() === 'PAGAR')
    .reduce((acc: number, t: any) => acc + (parseFloat(t.valor) || 0), 0)

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* KPI Strip */}
      {!isLoading && titulos.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card !p-3 text-center">
            <p className="text-xs text-text-secondary mb-1">Total Títulos</p>
            <p className="text-xl font-bold text-text-primary">{titulos.length}</p>
          </div>
          <div className="card !p-3 text-center">
            <p className="text-xs text-text-secondary mb-1 flex items-center justify-center gap-1"><ArrowDownCircle size={12} className="text-success" /> A Receber</p>
            <p className="text-lg font-bold text-success">{formatBRL(totalReceber)}</p>
          </div>
          <div className="card !p-3 text-center">
            <p className="text-xs text-text-secondary mb-1 flex items-center justify-center gap-1"><ArrowUpCircle size={12} className="text-danger" /> A Pagar</p>
            <p className="text-lg font-bold text-danger">{formatBRL(totalPagar)}</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="card !p-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-text-secondary" />
          <span className="text-sm font-medium text-text-primary">Filtros:</span>
        </div>

        {/* Período */}
        <div className="flex items-center gap-1.5">
          <Calendar size={14} className="text-text-secondary" />
          <select
            id="filtro-periodo"
            className="input !w-auto min-w-[140px]"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            {PERIODS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        <select
          id="filtro-tipo"
          className="input !w-auto min-w-[150px]"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as any)}
        >
          <option value="">Todas as Contas</option>
          <option value="RECEBER">A Receber</option>
          <option value="PAGAR">A Pagar</option>
        </select>

        <select
          id="filtro-status"
          className="input !w-auto min-w-[150px]"
          value={status}
          onChange={(e) => setStatus(e.target.value as any)}
        >
          <option value="">Todos os Status</option>
          <option value="ABERTO">Em Aberto</option>
          <option value="PAGO">Pago</option>
          <option value="VENCIDA">Vencida</option>
        </select>

        <div className="flex-1" />
        <span className="text-xs text-text-secondary">
          {isLoading ? 'Carregando...' : `${titulos.length} títulos encontrados`}
        </span>
      </div>

      <DataTable
        loading={isLoading}
        data={titulos}
        empty="Nenhum título encontrado com os filtros atuais."
        columns={[
          {
            key: 'tipo',
            label: 'TIPO',
            render: (r: any) => {
              const rTipo = String(r.tipo || '').trim()
              return (
                <span className={`flex items-center gap-1.5 text-xs font-bold ${rTipo === 'RECEBER' ? 'text-success' : 'text-danger'}`}>
                  {rTipo === 'RECEBER' ? <ArrowDownCircle size={14} /> : <ArrowUpCircle size={14} />}
                  {rTipo}
                </span>
              )
            }
          },
          { key: 'descricao', label: 'DESCRIÇÃO', render: (r: any) => <span className="font-medium">{r.descricao || '—'}</span> },
          { key: 'cliente', label: 'CLIENTE/FORNECEDOR', render: (r: any) => <span className="text-sm text-text-secondary">{r.cliente || '—'}</span> },
          { key: 'data_vencimento', label: 'VENCIMENTO', render: (r: any) => <span className="mono text-xs">{formatDate(r.data_vencimento)}</span> },
          {
            key: 'valor',
            label: 'VALOR',
            align: 'right',
            render: (r: any) => <span className="font-semibold">{formatBRL(r.valor)}</span>
          },
          {
            key: 'status_pagamento',
            label: 'STATUS',
            align: 'right',
            render: (r: any) => {
              const rStatus = String(r.status_pagamento || '').trim()
              const isPaid = rStatus === 'PAGO' || (r.valor_pago || 0) >= r.valor
              const isVencida = !isPaid && rStatus === 'ABERTO' && new Date(r.data_vencimento) < new Date(new Date().setHours(0,0,0,0))
              const statusText = isPaid ? 'PAGO' : isVencida ? 'VENCIDA' : 'ABERTO'

              let badgeClass = 'bg-bg-tertiary text-text-secondary border-border'
              let Icon: any = null

              if (statusText === 'PAGO') {
                badgeClass = 'bg-green-100 text-green-700 border-green-200'
                Icon = CheckCircle
              } else if (statusText === 'VENCIDA') {
                badgeClass = 'bg-red-100 text-red-700 border-red-200'
                Icon = AlertCircle
              } else if (statusText === 'ABERTO') {
                badgeClass = 'bg-blue-100 text-blue-700 border-blue-200'
              }

              return (
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${badgeClass}`}>
                  {Icon && <Icon size={12} />}
                  {statusText}
                </span>
              )
            }
          }
        ]}
      />
    </div>
  )
}
