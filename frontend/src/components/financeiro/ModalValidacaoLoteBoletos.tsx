import { useState, useEffect, useMemo } from 'react'
import { X, CheckCircle2, AlertTriangle, AlertCircle, RefreshCw, Send, Check, Ban, FileText, User, Mail, MapPin, Building, ShieldCheck, Play } from 'lucide-react'
import api from '../../services/api'
import clsx from 'clsx'
import { formatBRL, formatDate } from '../../utils/format'

export interface ItemLoteBoleto {
  id: number
  id_firebird?: string | number | null
  cliente: string
  cliente_id_firebird?: number
  cpf_cnpj?: string
  email?: string
  telefone?: string
  endereco?: string
  cidade?: string
  valor: number
  data_vencimento: string
  nosso_numero?: string
  asaas_payment_id?: string
}

interface ModalValidacaoLoteBoletosProps {
  isOpen: boolean
  titulos: ItemLoteBoleto[]
  mensagemEmail: string
  onClose: () => void
  onCompleted: () => void
}

interface ItemEstadoLote extends ItemLoteBoleto {
  cpfCnpjInput: string
  emailInput: string
  enderecoInput: string
  cidadeInput: string
  isCpfCnpjValid: boolean
  isEmailValid: boolean
  isAddressValid: boolean
  isSaved?: boolean
  saving?: boolean
  status?: 'pending' | 'processing' | 'success' | 'error'
  errorMsg?: string
  nossoNumeroRetornado?: string
  emailEnviado?: boolean
}

export default function ModalValidacaoLoteBoletos({
  isOpen,
  titulos,
  mensagemEmail,
  onClose,
  onCompleted
}: ModalValidacaoLoteBoletosProps) {
  const [step, setStep] = useState<'validation' | 'sending' | 'completed'>('validation')
  const [selectedBank, setSelectedBank] = useState<'asaas' | 'cora'>('asaas')
  const [items, setItems] = useState<ItemEstadoLote[]>([])
  const [currentSendingIndex, setCurrentSendingIndex] = useState(0)
  const [sending, setSending] = useState(false)

  // Inicializa os itens com estado de formulário
  useEffect(() => {
    if (isOpen && titulos) {
      const initialItems: ItemEstadoLote[] = titulos.map(t => {
        const cleanDoc = (t.cpf_cnpj || '').replace(/\D/g, '')
        const isDocValid = cleanDoc.length === 11 || cleanDoc.length === 14
        const mail = (t.email || '').trim()
        const isMailValid = Boolean(mail && mail.includes('@'))
        const end = (t.endereco || '').trim()
        const isEndValid = Boolean(end && end.length > 3)

        return {
          ...t,
          cpfCnpjInput: t.cpf_cnpj || '',
          emailInput: t.email || '',
          enderecoInput: t.endereco || '',
          cidadeInput: t.cidade || '',
          isCpfCnpjValid: isDocValid,
          isEmailValid: isMailValid,
          isAddressValid: isEndValid,
          status: 'pending'
        }
      })
      setItems(initialItems)
      setStep('validation')
      setCurrentSendingIndex(0)
      setSending(false)
    }
  }, [isOpen, titulos])

  if (!isOpen) return null

  // Métricas de validação
  const totalItems = items.length
  const itemsComCpfInvalido = items.filter(i => !i.isCpfCnpjValid)
  const totalAptos = items.filter(i => i.isCpfCnpjValid).length
  const canStartTransmission = totalAptos === totalItems && totalItems > 0

  // Atualiza um campo de um item na tabela de conferência
  const handleItemFieldChange = (id: number, field: 'cpfCnpjInput' | 'emailInput' | 'enderecoInput' | 'cidadeInput', value: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item

      const updated = { ...item, [field]: value }
      if (field === 'cpfCnpjInput') {
        const clean = value.replace(/\D/g, '')
        updated.isCpfCnpjValid = clean.length === 11 || clean.length === 14
      }
      if (field === 'emailInput') {
        updated.isEmailValid = Boolean(value && value.includes('@'))
      }
      if (field === 'enderecoInput') {
        updated.isAddressValid = Boolean(value && value.trim().length > 3)
      }
      return updated
    }))
  }

  // Salvar edições do cliente no banco PostgreSQL
  const handleSaveClientData = async (item: ItemEstadoLote) => {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, saving: true } : i))
    try {
      if (item.cliente_id_firebird) {
        await api.put(`/clientes/${item.cliente_id_firebird}`, {
          cpf_cnpj: item.cpfCnpjInput,
          email: item.emailInput,
          endereco: item.enderecoInput,
          cidade: item.cidadeInput
        })
      }
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, saving: false, isSaved: true } : i))
    } catch (err: any) {
      alert('Erro ao atualizar cadastro do cliente: ' + (err.response?.data?.error || err.message))
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, saving: false } : i))
    }
  }

  // Iniciar Transmissão em Lote
  const handleStartTransmission = async () => {
    if (!canStartTransmission) {
      alert('⚠️ Preencha os CPFs/CNPJs válidos de todos os clientes antes de transmitir o lote.')
      return
    }

    setStep('sending')
    setSending(true)

    let successCount = 0
    let failureCount = 0

    for (let i = 0; i < items.length; i++) {
      const currentItem = items[i]
      setCurrentSendingIndex(i)

      // Atualiza status para processando
      setItems(prev => prev.map((it, idx) => idx === i ? { ...it, status: 'processing' } : it))

      try {
        // Se houver dados editados não salvos, garante a atualização prévia
        if (currentItem.cliente_id_firebird && (currentItem.cpfCnpjInput !== currentItem.cpf_cnpj || currentItem.emailInput !== currentItem.email)) {
          await api.put(`/clientes/${currentItem.cliente_id_firebird}`, {
            cpf_cnpj: currentItem.cpfCnpjInput,
            email: currentItem.emailInput,
            endereco: currentItem.enderecoInput,
            cidade: currentItem.cidadeInput
          }).catch(() => {})
        }

        const res = await api.post('/financeiro/boletos-emitidos/gerar-lote-item', {
          titulo_id: currentItem.id,
          banco: selectedBank,
          mensagem: mensagemEmail
        })

        if (res.data?.success) {
          successCount++
          setItems(prev => prev.map((it, idx) => idx === i ? {
            ...it,
            status: 'success',
            nossoNumeroRetornado: res.data.nosso_numero,
            emailEnviado: res.data.emailEnviado
          } : it))
        } else {
          failureCount++
          setItems(prev => prev.map((it, idx) => idx === i ? {
            ...it,
            status: 'error',
            errorMsg: res.data?.error || res.data?.message || `Falha na transmissão ao ${selectedBank === 'cora' ? 'Banco Cora' : 'Banco Asaas'}`
          } : it))
        }
      } catch (err: any) {
        failureCount++
        const detailedError = err.response?.data?.error || err.response?.data?.message || (err.response?.status === 502 ? 'Servidor indisponível na API do Asaas / E-mail (HTTP 502)' : err.message) || 'Erro de conexão com o servidor'
        setItems(prev => prev.map((it, idx) => idx === i ? {
          ...it,
          status: 'error',
          errorMsg: detailedError
        } : it))
      }

      // Pausa de segurança (350ms) para ritmo de transmissão e evitar bloqueios em lote
      await new Promise(r => setTimeout(r, 350))
    }

    setSending(false)
    setStep('completed')
  }

  // Re-tentar apenas os boletos com falha
  const handleRetryFailed = async () => {
    const failedIndices = items.map((it, idx) => it.status === 'error' ? idx : -1).filter(idx => idx !== -1)
    if (failedIndices.length === 0) return

    setStep('sending')
    setSending(true)

    for (const i of failedIndices) {
      const currentItem = items[i]
      setCurrentSendingIndex(i)

      setItems(prev => prev.map((it, idx) => idx === i ? { ...it, status: 'processing', errorMsg: undefined } : it))

      try {
        const res = await api.post('/financeiro/boletos-emitidos/gerar-lote-item', {
          titulo_id: currentItem.id,
          banco: selectedBank,
          mensagem: mensagemEmail
        })

        if (res.data?.success) {
          setItems(prev => prev.map((it, idx) => idx === i ? {
            ...it,
            status: 'success',
            nossoNumeroRetornado: res.data.nosso_numero,
            emailEnviado: res.data.emailEnviado
          } : it))
        } else {
          setItems(prev => prev.map((it, idx) => idx === i ? {
            ...it,
            status: 'error',
            errorMsg: res.data?.error || res.data?.message || `Falha na transmissão ao ${selectedBank === 'cora' ? 'Banco Cora' : 'Banco Asaas'}`
          } : it))
        }
      } catch (err: any) {
        const detailedError = err.response?.data?.error || err.response?.data?.message || err.message || 'Erro de conexão'
        setItems(prev => prev.map((it, idx) => idx === i ? {
          ...it,
          status: 'error',
          errorMsg: detailedError
        } : it))
      }

      // Pausa de segurança (350ms)
      await new Promise(r => setTimeout(r, 350))
    }

    setSending(false)
    setStep('completed')
  }

  const successTotal = items.filter(i => i.status === 'success').length
  const errorTotal = items.filter(i => i.status === 'error').length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col max-h-[95vh] text-slate-800 dark:text-slate-100">
        
        {/* CABEÇALHO DO MODAL COM LOGO COLISEU TRANSPORTE */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 pr-3 border-r border-slate-200 dark:border-slate-700">
              <img src="/assets/nexus-logo-horizontal.png" alt="Coliseu Transporte" className="h-6 object-contain" />
            </div>
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg ${selectedBank === 'cora' ? 'bg-pink-50 border-pink-200 text-pink-600 dark:bg-pink-950/40 dark:border-pink-800 dark:text-pink-400' : 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-400'} border flex items-center justify-center shrink-0`}>
                <ShieldCheck size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
                    Conferência & Emissão de Boletos em Lote
                  </h3>
                  <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border ${selectedBank === 'cora' ? 'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950 dark:text-pink-300 dark:border-pink-800' : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800'}`}>
                    {selectedBank === 'cora' ? 'Banco Cora' : 'Banco Asaas'}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 font-semibold border border-slate-200 dark:border-slate-700">
                    {totalItems} {totalItems === 1 ? 'título' : 'títulos'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Validação prévia de cadastros, CPF/CNPJ, e-mail e transmissão automatizada</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Seletor de Banco */}
            {step === 'validation' && (
              <div className="flex items-center bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedBank('asaas')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    selectedBank === 'asaas'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  🏦 Asaas
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBank('cora')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    selectedBank === 'cora'
                      ? 'bg-pink-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  🏦 Cora
                </button>
              </div>
            )}

            <button
              onClick={onClose}
              disabled={sending}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-30"
              title="Fechar"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* BANNERS E RESUMOS DE STATUS */}
        <div className="px-5 py-2.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          {step === 'validation' && (
            <>
              <div className="flex flex-wrap items-center gap-2.5 text-xs">
                <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800 rounded-lg font-bold flex items-center gap-1.5 text-xs shadow-2xs">
                  <CheckCircle2 size={14} className="text-emerald-600" /> Aptos para Envio: {totalAptos} de {totalItems}
                </span>

                {itemsComCpfInvalido.length > 0 && (
                  <span className="px-3 py-1 bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-800 rounded-lg font-extrabold flex items-center gap-1.5 animate-pulse text-xs shadow-2xs">
                    <AlertTriangle size={14} className="text-rose-600" /> CPF/CNPJ Pendente: {itemsComCpfInvalido.length}
                  </span>
                )}
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                <span>💡</span>
                <span>Confira os títulos abaixo antes de confirmar o lote para faturamento.</span>
              </div>
            </>
          )}

          {(step === 'sending' || step === 'completed') && (
            <div className="w-full space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                <span className="flex items-center gap-2">
                  {sending ? <RefreshCw size={14} className="animate-spin text-blue-600" /> : <CheckCircle2 size={14} className="text-emerald-600" />}
                  {sending ? `Transmitindo lote no ${selectedBank === 'cora' ? 'Banco Cora' : 'Banco Asaas'}: ${currentSendingIndex + 1} de ${totalItems}` : 'Varredura de Emissão Concluída!'}
                </span>
                <span className="font-mono text-blue-600 dark:text-blue-400 text-xs font-bold">
                  {Math.round(((currentSendingIndex + 1) / totalItems) * 100)}%
                </span>
              </div>

              <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-300 dark:border-slate-700">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 to-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.round(((currentSendingIndex + 1) / totalItems) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* LISTAGEM CLARA E ELEGANTE EM 3 COLUNAS */}
        <div className="flex-1 overflow-y-auto max-h-[68vh] p-4 bg-slate-50/60 dark:bg-slate-900/50">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {items.map((item) => {
              const vencStr = formatDate(item.data_vencimento)

              return (
                <div
                  key={item.id}
                  className={clsx(
                    'p-2.5 rounded-xl border transition-all flex flex-col justify-between gap-1.5 text-xs shadow-2xs',
                    item.status === 'processing'
                      ? 'bg-blue-50/90 border-blue-400 text-blue-950 shadow-md shadow-blue-100 ring-2 ring-blue-400/40 dark:bg-blue-950/90 dark:border-blue-500 dark:text-white'
                      : item.status === 'success'
                      ? 'bg-emerald-50/40 dark:bg-slate-800/90 border-emerald-200 dark:border-emerald-800 text-slate-800 dark:text-slate-100'
                      : item.status === 'error'
                      ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-950 dark:text-rose-100'
                      : 'bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700/80 hover:border-blue-300 hover:shadow-xs'
                  )}
                >
                  {/* Linha 1: ID Título + Nome do Cliente + Valor */}
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="font-mono font-bold text-blue-700 dark:text-blue-400 text-[10.5px] shrink-0 bg-blue-50 dark:bg-blue-950/80 px-1.5 py-0.5 rounded border border-blue-200/80 dark:border-blue-800/50">
                        #{item.id_firebird || item.id}
                      </span>
                      <span className="font-bold text-slate-800 dark:text-white text-[11.5px] truncate" title={item.cliente}>
                        {item.cliente}
                      </span>
                    </div>

                    <span className="font-mono font-extrabold text-emerald-600 dark:text-emerald-400 text-xs shrink-0">
                      {formatBRL(item.valor || 0)}
                    </span>
                  </div>

                  {/* Linha 2: Vencimento + Status Badge */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                    <div className="flex items-center gap-1 text-[10.5px] text-slate-500 dark:text-slate-400">
                      <span>Venc:</span>
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{vencStr}</span>
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {step === 'validation' && (
                        item.isCpfCnpjValid ? (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/90 dark:text-emerald-300 dark:border-emerald-800/80 rounded-full text-[10px] font-bold flex items-center gap-1">
                            <CheckCircle2 size={11} className="text-emerald-600" /> Apto
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/90 dark:text-rose-300 dark:border-rose-800/80 rounded-full text-[10px] font-bold flex items-center gap-1">
                            <AlertCircle size={11} className="text-rose-600" /> CPF Pendente
                          </span>
                        )
                      )}

                      {step !== 'validation' && (
                        <>
                          {item.status === 'pending' && (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 rounded-md text-[10px] font-bold border border-slate-200 dark:border-slate-700">
                              Pendente
                            </span>
                          )}

                          {item.status === 'processing' && (
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800 rounded-md text-[10px] font-bold flex items-center gap-1 animate-pulse">
                              <RefreshCw size={10} className="animate-spin text-blue-600" /> Enviando...
                            </span>
                          )}

                          {item.status === 'success' && (
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800 rounded-md text-[10px] font-extrabold flex items-center gap-1" title={`Nosso Nº: ${item.nossoNumeroRetornado || 'Sim'}`}>
                              <Check size={11} className="text-emerald-600" /> Emitido {item.nossoNumeroRetornado ? `(#${item.nossoNumeroRetornado})` : ''}
                            </span>
                          )}

                          {item.status === 'error' && (
                            <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800 rounded-md text-[10px] font-bold flex items-center gap-1" title={item.errorMsg}>
                              <Ban size={11} className="text-rose-600" /> Erro Emissão
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Linha 3 (opcional): Detalhe do Erro se houver */}
                  {item.status === 'error' && item.errorMsg && (
                    <div className="text-[10px] text-rose-600 dark:text-rose-400 font-medium truncate pt-0.5" title={item.errorMsg}>
                      ⚠️ {item.errorMsg}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* RODAPÉ DO MODAL COM AÇÕES */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-wrap items-center justify-between gap-3">
          <div>
            {step === 'completed' && (
              <div className="text-xs flex items-center gap-3">
                <span className="text-emerald-600 dark:text-emerald-400 font-extrabold flex items-center gap-1">
                  <CheckCircle2 size={14} /> {successTotal} Emitido(s) com Sucesso
                </span>
                {errorTotal > 0 && (
                  <span className="text-rose-600 dark:text-rose-400 font-extrabold flex items-center gap-1">
                    <Ban size={14} /> {errorTotal} Falha(s)
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {step === 'validation' && (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 rounded-xl font-bold transition-all cursor-pointer text-xs border border-slate-200 dark:border-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleStartTransmission}
                  disabled={!canStartTransmission}
                  className={clsx(
                    'px-5 py-2 rounded-xl font-extrabold shadow-sm flex items-center gap-2 transition-all text-xs cursor-pointer',
                    canStartTransmission
                      ? selectedBank === 'cora'
                        ? 'bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-pink-200'
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-200'
                      : 'bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed border border-slate-200 dark:border-slate-700'
                  )}
                >
                  <Play size={14} />
                  <span>Confirmar e Transmitir via {selectedBank === 'cora' ? 'Cora' : 'Asaas'} ({totalAptos}/{totalItems})</span>
                </button>
              </>
            )}

            {step === 'completed' && (
              <>
                {errorTotal > 0 && (
                  <button
                    type="button"
                    onClick={handleRetryFailed}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold transition-all cursor-pointer text-xs flex items-center gap-1.5 shadow-sm"
                  >
                    <RefreshCw size={13} />
                    <span>Re-tentar falhas ({errorTotal})</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onCompleted()
                    onClose()
                  }}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-extrabold transition-all cursor-pointer text-xs flex items-center gap-1.5 shadow-sm"
                >
                  <Check size={14} />
                  <span>Concluir</span>
                </button>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
