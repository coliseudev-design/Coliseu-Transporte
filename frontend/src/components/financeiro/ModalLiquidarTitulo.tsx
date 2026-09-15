import { useState, useEffect } from 'react'
import { X, Check, DollarSign, Calendar, Calculator, AlertCircle, Building2 } from 'lucide-react'
import api from '../../services/api'
import { formatBRL, formatDate } from '../../utils/format'

interface AccountOption {
  id: number
  apelido: string
  banco?: string
}

interface CaixaOption {
  id: number | string
  nome: string
}

interface Props {
  isOpen: boolean
  titulo: any
  onClose: () => void
  onSuccess: () => void
}

export default function ModalLiquidarTitulo({ isOpen, titulo, onClose, onSuccess }: Props) {
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [caixas, setCaixas] = useState<CaixaOption[]>([])
  
  const [dataLiquidacao, setDataLiquidacao] = useState(new Date().toISOString().split('T')[0])
  const [juros, setJuros] = useState<number>(0)
  const [multa, setMulta] = useState<number>(0)
  const [desconto, setDesconto] = useState<number>(0)
  const [valorRecebido, setValorRecebido] = useState<number>(0)
  
  const [contaBancariaId, setContaBancariaId] = useState<string>('')
  const [caixaId, setCaixaId] = useState<string>('')
  const [formaPagamento, setFormaPagamento] = useState<string>('DINHEIRO')
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    if (isOpen && titulo) {
      const valorOriginal = parseFloat(titulo.valor || 0)
      const valorJaPago = parseFloat(titulo.valor_pago || 0)
      const saldoDevedor = Math.max(valorOriginal - valorJaPago, 0)
      
      // Auto-calculate overdue days & juros
      let diasAtraso = 0
      let jurosCalculado = 0
      let multaCalculada = 0

      if (titulo.data_vencimento) {
        const dtVenc = new Date(titulo.data_vencimento)
        const dtHoje = new Date()
        const diffTime = dtHoje.getTime() - dtVenc.getTime()
        diasAtraso = Math.floor(diffTime / (1000 * 3600 * 24))
        
        if (diasAtraso > 0) {
          multaCalculada = parseFloat((saldoDevedor * 0.02).toFixed(2))
          jurosCalculado = parseFloat((saldoDevedor * 0.00033 * diasAtraso).toFixed(2))
        }
      }

      setJuros(jurosCalculado)
      setMulta(multaCalculada)
      setDesconto(0)
      
      const totalLiquidar = saldoDevedor + jurosCalculado + multaCalculada
      setValorRecebido(parseFloat(totalLiquidar.toFixed(2)))
      setError('')
      
      // Load accounts & caixas
      api.get('/financeiro/contas-bancarias').then(r => {
        const list = r.data?.data || []
        setAccounts(list)
        if (list.length > 0) setContaBancariaId(String(list[0].id))
      }).catch(() => {})

      api.get('/financeiro/caixas').then(r => {
        const list = r.data?.data || []
        setCaixas(list)
        if (list.length > 0) setCaixaId(String(list[0].id))
      }).catch(() => {})
    }
  }, [isOpen, titulo])

  if (!isOpen || !titulo) return null

  const valorOriginal = parseFloat(titulo.valor || 0)
  const valorJaPago = parseFloat(titulo.valor_pago || 0)
  const saldoDevedor = Math.max(valorOriginal - valorJaPago, 0)

  // Calculations
  const totalALiquidar = Math.max(0, saldoDevedor + (juros || 0) + (multa || 0) - (desconto || 0))
  const saldoRemanescente = Math.max(0, totalALiquidar - (valorRecebido || 0))
  const isParcial = (valorRecebido || 0) < totalALiquidar - 0.01

  // Days overdue calculation
  const dtVenc = titulo.data_vencimento ? new Date(titulo.data_vencimento) : new Date()
  const dtLiq = new Date(dataLiquidacao)
  const diffTime = dtLiq.getTime() - dtVenc.getTime()
  const diasAtraso = Math.floor(diffTime / (1000 * 3600 * 24))

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (valorRecebido <= 0) {
      setError('Informe o valor recebido/liquidado válido.')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      await api.post('/financeiro/quitacao', {
        financeiro_id: titulo.id,
        conta_bancaria_id: contaBancariaId ? parseInt(contaBancariaId, 10) : null,
        caixa_id: caixaId || null,
        forma_pagamento: formaPagamento,
        data_recebimento: dataLiquidacao,
        valor_recebido: valorRecebido,
        juros_valor: juros,
        multa_valor: multa,
        desconto_valor: desconto,
        tipo_baixa: isParcial ? 'PARCIAL' : 'TOTAL'
      })

      onSuccess()
      onClose()
    } catch (err: any) {
      console.error(err)
      setError(err.response?.data?.error || 'Erro ao efetuar liquidação do título.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 animate-fade-in font-sans text-slate-900 dark:text-slate-100">
      {/* JANELA DE LIQUIDAÇÃO ESTILO ERP COLISEU */}
      <div className="bg-[#e9ecef] dark:bg-slate-900 border-2 border-[#808c9c] rounded-lg shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[95vh] text-[11px]">
        
        {/* SUB-BARRA TÍTULO DA JANELA */}
        <div className="bg-slate-900 text-white px-3 py-1.5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <DollarSign size={16} className="text-emerald-400" />
            <span className="text-xs font-black uppercase tracking-tight">Pagamento / Liquidação de Título</span>
          </div>
          <button
            onClick={onClose}
            className="p-0.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleConfirm} className="p-2 space-y-2 flex-1 overflow-y-auto">
          {error && (
            <div className="p-2 bg-rose-50 border border-rose-300 text-rose-700 rounded text-xs font-semibold flex items-center gap-1.5">
              <AlertCircle size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* PAINEL 1: INFORMAÇÕES DO TÍTULO */}
          <fieldset className="border border-[#a6b1c0] rounded p-2 bg-white dark:bg-slate-800 space-y-1 shadow-2xs">
            <legend className="px-1 text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase">Informações do Título</legend>
            
            <div className="grid grid-cols-12 gap-1.5 items-center">
              <div className="col-span-3">
                <label className="block text-[9.5px] font-bold text-slate-700 dark:text-slate-300">Código:</label>
                <input
                  type="text"
                  readOnly
                  value={titulo.id_firebird || titulo.id}
                  className="w-full bg-[#f4f4f4] dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 font-bold font-mono text-slate-900 dark:text-slate-100 text-[11px] h-6"
                />
              </div>

              <div className="col-span-9">
                <label className="block text-[9.5px] font-bold text-slate-700 dark:text-slate-300">Descrição / Cliente:</label>
                <input
                  type="text"
                  readOnly
                  value={titulo.cliente || titulo.cliente_nome || titulo.descricao}
                  className="w-full bg-[#fffde7] dark:bg-amber-950/40 border border-[#a0a0a0] px-1.5 py-0.5 font-extrabold text-slate-900 dark:text-amber-200 text-[11px] h-6 truncate"
                />
              </div>
            </div>

            <div className="grid grid-cols-12 gap-1.5 items-center">
              <div className="col-span-4">
                <label className="block text-[9.5px] font-bold text-slate-700 dark:text-slate-300">Vencimento:</label>
                <input
                  type="text"
                  readOnly
                  value={formatDate(titulo.data_vencimento)}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 font-bold font-mono text-[11px] h-6"
                />
              </div>

              <div className="col-span-4">
                <label className="block text-[9.5px] font-bold text-slate-700 dark:text-slate-300">Dias em Atraso:</label>
                <input
                  type="text"
                  readOnly
                  value={diasAtraso > 0 ? `${diasAtraso} dia(s)` : 'Em dia'}
                  className={`w-full border border-[#a0a0a0] px-1.5 py-0.5 font-extrabold font-mono text-[11px] h-6 text-center ${
                    diasAtraso > 0 ? 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  }`}
                />
              </div>

              <div className="col-span-4">
                <label className="block text-[9.5px] font-bold text-slate-700 dark:text-slate-300">Valor Título (R$):</label>
                <input
                  type="text"
                  readOnly
                  value={formatBRL(saldoDevedor).replace('R$', '').trim()}
                  className="w-full bg-[#f4f4f4] dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 font-black text-right text-slate-900 dark:text-white font-mono text-[12px] h-6"
                />
              </div>
            </div>
          </fieldset>

          {/* PAINEL 2: ACRÉSCIMOS E DESCONTOS */}
          <fieldset className="border border-[#a6b1c0] rounded p-2 bg-white dark:bg-slate-800 space-y-1 shadow-2xs">
            <legend className="px-1 text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase">Acréscimos / Descontos</legend>
            
            <div className="grid grid-cols-12 gap-1.5 items-center">
              <div className="col-span-4">
                <label className="block text-[9.5px] font-bold text-slate-700 dark:text-slate-300">Juros (R$):</label>
                <input
                  type="number"
                  step="0.01"
                  value={juros}
                  onChange={(e) => setJuros(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 font-mono text-slate-900 dark:text-slate-100 text-[11px] h-6 text-right font-bold"
                />
              </div>

              <div className="col-span-4">
                <label className="block text-[9.5px] font-bold text-slate-700 dark:text-slate-300">Multa (R$):</label>
                <input
                  type="number"
                  step="0.01"
                  value={multa}
                  onChange={(e) => setMulta(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 font-mono text-slate-900 dark:text-slate-100 text-[11px] h-6 text-right font-bold"
                />
              </div>

              <div className="col-span-4">
                <label className="block text-[9.5px] font-bold text-slate-700 dark:text-slate-300">Desconto (R$):</label>
                <input
                  type="number"
                  step="0.01"
                  value={desconto}
                  onChange={(e) => setDesconto(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 font-mono text-emerald-700 dark:text-emerald-400 text-[11px] h-6 text-right font-bold"
                />
              </div>
            </div>
          </fieldset>

          {/* PAINEL 3: DADOS DA LIQUIDAÇÃO */}
          <fieldset className="border border-[#a6b1c0] rounded p-2 bg-white dark:bg-slate-800 space-y-1.5 shadow-2xs">
            <legend className="px-1 text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase">Dados da Liquidação</legend>
            
            <div className="grid grid-cols-12 gap-1.5 items-center">
              <div className="col-span-4">
                <label className="block text-[9.5px] font-bold text-slate-700 dark:text-slate-300">Data Liquidação:</label>
                <input
                  type="date"
                  value={dataLiquidacao}
                  onChange={(e) => setDataLiquidacao(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 font-bold font-mono text-[11px] h-6"
                />
              </div>

              <div className="col-span-4">
                <label className="block text-[9.5px] font-bold text-slate-700 dark:text-slate-300">Total a Liquidar:</label>
                <input
                  type="text"
                  readOnly
                  value={formatBRL(totalALiquidar).replace('R$', '').trim()}
                  className="w-full bg-[#f4f4f4] dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 font-black text-right text-slate-900 dark:text-white font-mono text-[11px] h-6"
                />
              </div>

              <div className="col-span-4">
                <label className="block text-[9.5px] font-bold text-slate-900 dark:text-white">Valor Liquidado / Recebido (R$):</label>
                <input
                  type="number"
                  step="0.01"
                  value={valorRecebido}
                  onChange={(e) => setValorRecebido(parseFloat(e.target.value) || 0)}
                  className="w-full bg-emerald-50 dark:bg-emerald-950 border-2 border-emerald-500 px-1.5 py-0.5 font-black text-right text-emerald-800 dark:text-emerald-200 font-mono text-[12px] h-6"
                />
              </div>
            </div>

            {/* SELEÇÃO CAIXA & CONTA BANCÁRIA */}
            <div className="grid grid-cols-12 gap-1.5 items-center">
              <div className="col-span-4">
                <label className="block text-[9.5px] font-bold text-slate-700 dark:text-slate-300">Caixa:</label>
                <select
                  value={caixaId}
                  onChange={(e) => setCaixaId(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1 py-0.5 font-bold text-[10.5px] h-6"
                >
                  <option value="">CAIXA DIÁRIO - LOJA</option>
                  {caixas.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>

              <div className="col-span-4">
                <label className="block text-[9.5px] font-bold text-slate-700 dark:text-slate-300">Conta Bancária:</label>
                <select
                  value={contaBancariaId}
                  onChange={(e) => setContaBancariaId(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1 py-0.5 font-bold text-[10.5px] h-6"
                >
                  {accounts.length === 0 ? <option value="">CONTA PRINCIPAL</option> : null}
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.apelido}</option>
                  ))}
                </select>
              </div>

              <div className="col-span-4">
                <label className="block text-[9.5px] font-bold text-slate-700 dark:text-slate-300">Espécie / Forma:</label>
                <select
                  value={formaPagamento}
                  onChange={(e) => setFormaPagamento(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1 py-0.5 font-bold text-[10.5px] h-6"
                >
                  <option value="DINHEIRO">DINHEIRO</option>
                  <option value="PIX">PIX</option>
                  <option value="BOLETO">BOLETO</option>
                  <option value="CARTÃO DE CRÉDITO">CARTÃO DE CRÉDITO</option>
                  <option value="CARTÃO DE DÉBITO">CARTÃO DE DÉBITO</option>
                  <option value="TED">TED / DOC</option>
                </select>
              </div>
            </div>

            {/* STATUS DA BAIXA E SALDO REMANESCENTE */}
            <div className="bg-[#e2e7ee] dark:bg-slate-850 p-1.5 rounded border border-[#b8c2d0] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase">Tipo da Baixa:</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${
                  isParcial 
                    ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300' 
                    : 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                }`}>
                  {isParcial ? 'BAIXA PARCIAL' : 'BAIXA TOTAL (QUITAÇÃO)'}
                </span>
              </div>

              <div className="flex items-center gap-2 font-mono">
                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase">Saldo Remanescente:</span>
                <span className={`font-black text-xs ${saldoRemanescente > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500'}`}>
                  {formatBRL(saldoRemanescente)}
                </span>
              </div>
            </div>
          </fieldset>

          {/* BOTÕES DE AÇÃO */}
          <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#a6b1c0]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1"
            >
              <X size={13} />
              <span>Cancelar</span>
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-extrabold text-[11px] transition-colors shadow-xs cursor-pointer flex items-center gap-1"
            >
              {submitting ? (
                <span>Processando...</span>
              ) : (
                <>
                  <Check size={13} />
                  <span>Confirmar Liquidação (OK)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
