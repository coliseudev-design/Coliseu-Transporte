import { useState, useEffect } from 'react'
import { 
  X, Calendar, DollarSign, RefreshCw, Printer, Ban, Check, Mail, MessageCircle, ChevronDown,
  Clock, User, FileText, Building2, PieChart, FolderTree, Hash, ArrowUpDown, ShieldCheck, Layers, Trash2
} from 'lucide-react'
import api from '../../services/api'
import { formatBRL, formatDate } from '../../utils/format'
import { useAuthStore } from '../../store/authStore'
import clsx from 'clsx'

export interface TituloDetalhado {
  id: number
  id_firebird?: number
  descricao: string
  cliente_nome_full?: string
  cliente_nome?: string
  cliente_documento?: string
  cliente_email?: string
  cliente_email_financeiro?: string
  cliente_email_pref?: string
  cliente_telefone?: string
  data_emissao: string
  data_vencimento: string
  data_pagamento?: string
  valor: number
  valor_pago?: number
  status_pagamento: string
  nosso_numero?: string
  numero_documento?: string
  asaas_payment_id?: string
  portador_nome?: string
  especie_nome?: string
  alerta_bloqueio?: boolean
  bank_slip_url?: string
  asaas_bank_slip_url?: string
  centro_custo_real?: string
  plano_contas_real?: string
  centro_custo?: string
  setor?: string
  plano_contas?: string
  tipo?: string
  historico?: string
  tipo_movimento?: string
  parcela?: number
  dias_carencia?: number
  desconto_percentual?: number
  juros_percentual?: number
  multa_percentual?: number
  multa_valor?: number
  juros_valor?: number
  dias_atraso?: number
  usuario_id?: string | number
  vendedor_nome?: string
  pedido_id?: string | number
  numero_pedido?: string
  serie?: string
  nfe?: string
  nfs?: string
  nfce?: string
  dav?: string
  npv?: string
}

export interface TituloLog {
  id: number
  tipo_evento: string
  data_evento: string
  usuario: string
  nosso_numero?: string
  descricao: string
}

interface Props {
  isOpen: boolean
  tituloId: number | null
  onClose: () => void
  onUpdated?: () => void
}

export default function ModalDetalhesTitulo({ isOpen, tituloId, onClose, onUpdated }: Props) {
  const { user } = useAuthStore()
  const canEliminar = user?.role === 'master' || user?.permissoes_acoes?.permitir_eliminar_titulos !== false

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [unlinking, setUnlinking] = useState(false)
  const [eliminating, setEliminating] = useState(false)
  const [showConfirmEliminar, setShowConfirmEliminar] = useState(false)
  const [motivoEliminacao, setMotivoEliminacao] = useState('')
  const [titulo, setTitulo] = useState<TituloDetalhado | null>(null)
  const [logs, setLogs] = useState<TituloLog[]>([])
  const [activeTab, setActiveTab] = useState<'gerais' | 'descontos' | 'eventos'>('gerais')

  const handleConfirmEliminar = async () => {
    if (!tituloId) return
    setEliminating(true)
    try {
      const res = await api.post(`/financeiro/titulos/${tituloId}/eliminar`, {
        motivo: motivoEliminacao.trim() || 'Eliminação manual efetuada pelo operador'
      })
      alert(res.data?.message || 'Título eliminado com sucesso!')
      setShowConfirmEliminar(false)
      onClose()
      if (onUpdated) onUpdated()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao eliminar título.')
    } finally {
      setEliminating(false)
    }
  }

  // Editable title fields
  const [portador, setPortador] = useState('')
  const [centroCusto, setCentroCusto] = useState('')
  const [planoContas, setPlanoContas] = useState('')
  const [historico, setHistorico] = useState('')

  // ERP options lists
  const [centrosCustoOptions, setCentrosCustoOptions] = useState<string[]>([
    'COLISEU CAMPO GRANDE', 'COLISEU DOURADOS', 'COLISEU PONTA PORÃ', 'MATRIZ', 'GERAL'
  ])
  const [planosContasOptions, setPlanosContasOptions] = useState<string[]>([
    'VENDA DENTRO DO ESTADO', 'VENDA FORA DO ESTADO', 'PRESTAÇÃO DE SERVIÇOS', 'MENSALIDADE / SERVIÇO', 'RECEITAS FINANCEIRAS', 'OUTRAS RECEITAS'
  ])

  const fetchDetails = async () => {
    if (!tituloId) return
    setLoading(true)
    try {
      const [detRes, opcRes] = await Promise.allSettled([
        api.get(`/financeiro/titulos/${tituloId}/detalhes-log`),
        api.get('/financeiro/opcoes-erp')
      ])

      let currentCC = 'MATRIZ'
      let currentPC = 'VENDA DENTRO DO ESTADO'

      if (detRes.status === 'fulfilled' && detRes.value.data?.data) {
        const t = detRes.value.data.data
        setTitulo(t)
        setLogs(detRes.value.data.logs || [])

        currentCC = t?.centro_custo_real || t?.centro_custo || t?.centro_custo_nome || 'MATRIZ'
        currentPC = t?.plano_contas_real || t?.plano_contas_nome || t?.plano_contas || 'VENDA DENTRO DO ESTADO'

        setPortador(t?.portador_nome || 'CARTEIRA')
        setCentroCusto(currentCC)
        setPlanoContas(currentPC)
        setHistorico(t?.historico || t?.descricao || '')
      }

      if (opcRes.status === 'fulfilled' && opcRes.value.data) {
        const fetchedCC = opcRes.value.data.centrosCusto || []
        const fetchedPC = opcRes.value.data.planosContas || []
        setCentrosCustoOptions(Array.from(new Set([...fetchedCC, currentCC])).filter(Boolean))
        setPlanosContasOptions(Array.from(new Set([...fetchedPC, currentPC])).filter(Boolean))
      }
    } catch (err) {
      console.error('Erro ao buscar detalhes do título:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveTitleDetails = async () => {
    if (!tituloId) return
    setSaving(true)
    try {
      await api.put(`/financeiro/titulos/${tituloId}`, {
        portador_nome: portador,
        centro_custo: centroCusto,
        plano_contas: planoContas,
        historico: historico
      })
      alert('✅ Alterações do título salvas com sucesso!')
      fetchDetails()
      if (onUpdated) onUpdated()
    } catch (err) {
      console.error(err)
      alert('Erro ao salvar alterações do título.')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (isOpen && tituloId) {
      fetchDetails()
    }
  }, [isOpen, tituloId])

  const handleDesvincularBoleto = async () => {
    if (!tituloId || !titulo) return
    if (!confirm(`Deseja cancelar o boleto (Nosso Nº ${titulo.nosso_numero || '—'}) deste título?\n\nEsta ação registrará o cancelamento do boleto no histórico de eventos e manterá o título em aberto.`)) return

    setUnlinking(true)
    try {
      const { data } = await api.post(`/financeiro/titulos/${tituloId}/desvincular-boleto`)
      alert(data.message || 'Boleto cancelado com sucesso!')
      setActiveTab('eventos')
      await fetchDetails()
      if (onUpdated) onUpdated()
    } catch (err) {
      console.error(err)
      alert('Erro ao cancelar o boleto do título.')
    } finally {
      setUnlinking(false)
    }
  }

  const handleReimprimirBoleto = async () => {
    if (!titulo) return

    const isCora = (titulo.portador_nome || titulo.portador || '').toUpperCase().includes('CORA') || 
                  String(titulo.asaas_payment_id || '').startsWith('inv_')

    // Se for Cora, abre na visualização com layout executivo oficial da Coliseu
    if (isCora && titulo.asaas_payment_id) {
      window.open(`/api/cora/boleto/${titulo.asaas_payment_id}?format=html`, '_blank')
      return
    }

    const directUrl = titulo.bank_slip_url || titulo.pdf_url || titulo.asaas_bank_slip_url
    if (directUrl) {
      window.open(directUrl, '_blank')
      return
    }

    if (titulo.asaas_payment_id) {
      try {
        const res = await api.get(`/asaas/bank-slip/${titulo.asaas_payment_id}`)
        const url = res.data?.bankSlipUrl || res.data?.url
        if (url) {
          window.open(url, '_blank')
        } else {
          alert('Não foi possível obter a URL do boleto no banco emissor.')
        }
      } catch (err: any) {
        console.error(err)
        alert(err.response?.data?.error || 'Erro ao obter o link do boleto.')
      }
      return
    }

    alert(`O boleto para o Nosso Nº ${titulo.nosso_numero || 'N/A'} não possui link de impressão ativo.`)
  }

  const [showBoletoMenu, setShowBoletoMenu] = useState(false)
  
  // States for Email Modal
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailDestino, setEmailDestino] = useState('')
  const [sendingBoletoEmail, setSendingBoletoEmail] = useState(false)

  // States for WhatsApp Modal
  const [showWhatsModal, setShowWhatsModal] = useState(false)
  const [whatsDestino, setWhatsDestino] = useState('')
  const [preparingWhats, setPreparingWhats] = useState(false)

  const handleOpenEmailModal = () => {
    if (!titulo) return
    setShowBoletoMenu(false)
    const initialEmail = titulo.cliente_email_pref || titulo.cliente_email_financeiro || titulo.cliente_email || ''
    setEmailDestino(initialEmail)
    setShowEmailModal(true)
  }

  const handleConfirmSendEmail = async () => {
    if (!titulo || !emailDestino.trim()) {
      alert('Por favor, informe um endereço de e-mail válido.')
      return
    }
    setSendingBoletoEmail(true)
    try {
      const res = await api.post('/financeiro/boletos-emitidos/reenviar-email', {
        titulo_id: titulo.id,
        email_destino: emailDestino.trim()
      })
      alert(res.data?.message || 'E-mail enviado com sucesso!')
      setShowEmailModal(false)
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao enviar boleto por e-mail.')
    } finally {
      setSendingBoletoEmail(false)
    }
  }

  const handleOpenWhatsModal = () => {
    if (!titulo) return
    setShowBoletoMenu(false)
    const initialPhone = titulo.cliente_telefone || ''
    setWhatsDestino(initialPhone)
    setShowWhatsModal(true)
  }

  const handleConfirmSendWhats = async () => {
    if (!titulo) return
    setPreparingWhats(true)
    try {
      let link = titulo.bank_slip_url || titulo.pdf_url || titulo.asaas_bank_slip_url || ''
      if (!link && titulo.asaas_payment_id) {
        try {
          const isCora = (titulo.portador_nome || titulo.portador || '').toUpperCase().includes('CORA') || 
                        String(titulo.asaas_payment_id || '').startsWith('inv_')
          if (isCora) {
            const res = await api.get(`/cora/boleto/${titulo.asaas_payment_id}`)
            const coraBs = res.data?.payment_options?.bank_slip || res.data?.payment_details?.bank_slip
            link = coraBs?.url || coraBs?.pdf_url || res.data?.pdf_url || ''
          }
          if (!link) {
            const res = await api.get(`/asaas/bank-slip/${titulo.asaas_payment_id}`)
            link = res.data?.bankSlipUrl || res.data?.url || ''
          }
        } catch (err) {}
      }
      let rawPhone = whatsDestino.replace(/\D/g, '')
      if (rawPhone.length >= 10 && !rawPhone.startsWith('55') && rawPhone.length <= 11) {
        rawPhone = `55${rawPhone}`
      }
      const vencStr = titulo.data_vencimento ? formatDate(titulo.data_vencimento) : '—'
      const valorStr = formatBRL(Math.abs(titulo.valor || 0))
      const msg = `Olá *${titulo.cliente_nome || 'Cliente'}*!\n\nSegue o link do seu boleto referente ao título *#${titulo.id_firebird || titulo.id}* - ${titulo.descricao}.\n\n📅 *Vencimento:* ${vencStr}\n💰 *Valor:* ${valorStr}\n\n🔗 *Link do Boleto:* ${link || 'Solicite a 2ª via'}\n\nQualquer dúvida, estamos à disposição!`
      
      const whatsUrl = rawPhone 
        ? `https://wa.me/${rawPhone}?text=${encodeURIComponent(msg)}` 
        : `https://wa.me/?text=${encodeURIComponent(msg)}`
      
      window.open(whatsUrl, '_blank')
      setShowWhatsModal(false)
    } catch (err) {
      alert('Erro ao preparar envio por WhatsApp.')
    } finally {
      setPreparingWhats(false)
    }
  }

  if (!isOpen || !tituloId) return null

  const getDiaSemana = (dateStr?: string) => {
    if (!dateStr) return ''
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return ''
      return date.toLocaleDateString('pt-BR', { weekday: 'long' })
    } catch {
      return ''
    }
  }

  const getHora = (dateStr?: string) => {
    if (!dateStr) return ''
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return ''
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    } catch {
      return ''
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-fade-in font-sans text-slate-900">
      {/* CONTAINER JANELA ESTILO ERP COMPACTO */}
      <div className="bg-[#e9ecef] dark:bg-slate-900 border-2 border-[#808c9c] rounded shadow-2xl w-full max-w-3xl flex flex-col max-h-[92vh] text-[11px] overflow-hidden">
        
        {/* SUB-BARRA TÍTULO DA JANELA */}
        <div className="bg-[#d5dbe3] dark:bg-slate-800 px-2 py-0.5 border-b border-[#a6b1c0] flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">Visualização do Lançamento</span>
          <button
            onClick={onClose}
            className="p-0.5 hover:bg-red-500 hover:text-white rounded text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        {/* CABLEÇALHO PRINCIPAL DO LANÇAMENTO DE TÍTULOS */}
        <div className="px-3 py-1 bg-white dark:bg-slate-850 border-b border-[#a6b1c0] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-emerald-100 border border-emerald-400 text-emerald-700 flex items-center justify-center shrink-0">
              <DollarSign size={18} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800 dark:text-white tracking-tight leading-none">
                Lançamento de Títulos
              </h2>
            </div>
          </div>
          {titulo?.nosso_numero && (
            <div className="flex items-center gap-1 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded border border-indigo-200">
              <span>Nosso Nº:</span>
              <span className="font-mono">{titulo.nosso_numero}</span>
            </div>
          )}
        </div>

        {/* CORPO DO FORMULÁRIO DENSE / COMPACTO SEM ROLAGEM */}
        <div className="p-2 space-y-1.5 flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-slate-500 flex flex-col items-center gap-1.5">
              <RefreshCw size={24} className="animate-spin text-indigo-600" />
              <span>Carregando dados do lançamento...</span>
            </div>
          ) : titulo ? (
            <>
              {/* CAMPOS PRINCIPAIS DE LANÇAMENTO */}
              <div className="bg-white dark:bg-slate-800 p-2 rounded border border-[#b8c2d0] space-y-1.5 shadow-2xs">
                
                {/* LINHA 1: Código + Fornecedor/Cliente */}
                <div className="flex items-center gap-1.5">
                  <div className="w-28 shrink-0">
                    <label className="block text-[10px] font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                      <Hash size={11} className="text-indigo-600 dark:text-indigo-400" />
                      Codigo:
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={titulo.id_firebird || titulo.id || ''}
                      className="w-full bg-[#f4f4f4] dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 font-bold text-red-600 dark:text-red-400 font-mono text-[11px] h-6 rounded"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="block text-[10px] font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                      <User size={11} className="text-indigo-600 dark:text-indigo-400" />
                      Cliente / Fornecedor ERP:
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={titulo.cliente_nome_full || titulo.cliente_nome || titulo.descricao || ''}
                      className="w-full bg-[#fffde7] dark:bg-amber-950/40 border border-[#a0a0a0] px-1.5 py-0.5 font-bold text-slate-900 dark:text-amber-200 text-[11px] h-6 rounded"
                    />
                  </div>
                </div>

                {/* LINHA 2: Descrição Completa ERP */}
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                    <FileText size={11} className="text-indigo-600 dark:text-indigo-400" />
                    Descrição do Título (ERP):
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={titulo.descricao || titulo.historico || titulo.cliente_nome_full || ''}
                    className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 font-bold text-slate-900 dark:text-slate-100 text-[11px] h-6 rounded"
                  />
                </div>

                {/* LINHA 3: Emissão | Vencimento | Dia Semana | Dias Restantes (Calculados) */}
                {(() => {
                  const diasRestantesCalculados = (() => {
                    if (!titulo.data_vencimento) return 0
                    try {
                      const today = new Date()
                      today.setHours(0, 0, 0, 0)
                      const venc = new Date(titulo.data_vencimento)
                      venc.setHours(0, 0, 0, 0)
                      return Math.round((venc.getTime() - today.getTime()) / (1000 * 3600 * 24))
                    } catch {
                      return 0
                    }
                  })()

                  return (
                    <div className="grid grid-cols-12 gap-1.5 items-center">
                      <div className="col-span-3">
                        <label className="block text-[10px] font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                          <Calendar size={11} className="text-indigo-600 dark:text-indigo-400" />
                          Emissão:
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            readOnly
                            value={formatDate(titulo.data_emissao)}
                            className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-semibold rounded"
                          />
                        </div>
                      </div>

                      <div className="col-span-3">
                        <label className="block text-[10px] font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                          <Calendar size={11} className="text-indigo-600 dark:text-indigo-400" />
                          Vencimento:
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            readOnly
                            value={formatDate(titulo.data_vencimento)}
                            className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-bold text-slate-900 dark:text-white rounded"
                          />
                        </div>
                      </div>

                      <div className="col-span-4">
                        <label className="block text-[10px] font-bold text-slate-800 dark:text-slate-200">&nbsp;</label>
                        <input
                          type="text"
                          readOnly
                          value={getDiaSemana(titulo.data_vencimento)}
                          className="w-full bg-[#f4f4f4] dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 text-slate-700 dark:text-slate-300 capitalize font-medium rounded"
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="block text-[10px] font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                          <Clock size={11} className="text-indigo-600 dark:text-indigo-400" />
                          Dias Car.:
                        </label>
                        <div className={clsx(
                          "w-full px-1 py-0.5 text-[11px] h-6 font-mono font-black rounded border flex items-center justify-center shadow-2xs",
                          diasRestantesCalculados < 0 
                            ? "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950 dark:text-rose-300" 
                            : diasRestantesCalculados === 0 
                              ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300"
                              : "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300"
                        )}>
                          {diasRestantesCalculados > 0 ? `+${diasRestantesCalculados}` : diasRestantesCalculados}
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* LINHA 4: Nº Doc. | Parcela | Moeda | Portador */}
                <div className="grid grid-cols-12 gap-1.5 items-center">
                  <div className="col-span-3">
                    <label className="block text-[10px] font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                      <FileText size={11} className="text-indigo-600 dark:text-indigo-400" />
                      Nº Doc.:
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={titulo.numero_documento || titulo.id_firebird || titulo.id}
                      className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-mono font-bold rounded"
                    />
                  </div>

                  <div className="col-span-3">
                    <label className="block text-[10px] font-extrabold text-slate-800 dark:text-slate-200">Parcela:</label>
                    <input
                      type="text"
                      readOnly
                      value={titulo.parcela || 1}
                      className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-mono font-bold text-center rounded"
                    />
                  </div>

                  <div className="col-span-3">
                    <label className="block text-[10px] font-extrabold text-slate-800 dark:text-slate-200">Moeda:</label>
                    <input
                      type="text"
                      readOnly
                      value="REAL, R$"
                      className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-semibold rounded"
                    />
                  </div>

                  <div className="col-span-3">
                    <label className="block text-[10px] font-extrabold text-slate-800 dark:text-slate-200">Portador:</label>
                    <select
                      value={portador}
                      onChange={(e) => setPortador(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1 py-0.5 text-[11px] h-6 font-bold text-indigo-700 dark:text-indigo-300 rounded"
                    >
                      <option value="CARTEIRA">CARTEIRA</option>
                      <option value="BANCO DO BRASIL">BANCO DO BRASIL</option>
                      <option value="BRADESCO">BRADESCO</option>
                      <option value="ITAÚ">ITAÚ</option>
                      <option value="SANTANDER">SANTANDER</option>
                      <option value="ASAAS">ASAAS</option>
                      <option value="CORA">CORA</option>
                    </select>
                  </div>
                </div>

                {/* LINHA 5: Espécie | Antec. | Juros | Multa */}
                <div className="grid grid-cols-12 gap-1.5 items-center">
                  <div className="col-span-4">
                    <label className="block text-[10px] font-extrabold text-slate-800 dark:text-slate-200">Espécie:</label>
                    <input
                      type="text"
                      readOnly
                      value={titulo.especie_nome || 'BOLETO BANCARIO'}
                      className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-bold rounded"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-[10px] font-extrabold text-slate-800 dark:text-slate-200">Antec. (%):</label>
                    <input
                      type="text"
                      readOnly
                      value={titulo.desconto_percentual || ''}
                      className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-mono text-center rounded"
                    />
                  </div>

                  <div className="col-span-3">
                    <label className="block text-[10px] font-extrabold text-slate-800 dark:text-slate-200">Juros (%):</label>
                    <input
                      type="text"
                      readOnly
                      value={titulo.juros_percentual || ''}
                      className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-mono text-center rounded"
                    />
                  </div>

                  <div className="col-span-3">
                    <label className="block text-[10px] font-extrabold text-slate-800 dark:text-slate-200">Multa (%):</label>
                    <input
                      type="text"
                      readOnly
                      value={titulo.multa_percentual || ''}
                      className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-6 font-mono text-center rounded"
                    />
                  </div>
                </div>

                {/* LINHA 6: Histórico (Aumentado para 2 Linhas) */}
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                    <MessageCircle size={11} className="text-indigo-600 dark:text-indigo-400" />
                    Histórico:
                  </label>
                  <textarea
                    rows={2}
                    value={historico}
                    onChange={(e) => setHistorico(e.target.value)}
                    placeholder="Histórico / Observações do lançamento..."
                    className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 px-2 py-1 text-[11px] font-medium text-slate-800 dark:text-slate-200 rounded resize-none shadow-2xs transition-colors"
                  />
                </div>

                {/* LINHA 7: Rec/Pag (Compacto) + Tipo (Compacto) + VALOR DESTACADO AO LADO */}
                <div className="grid grid-cols-12 gap-2 items-end pt-1">
                  <div className="col-span-3">
                    <label className="block text-[10px] font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                      <ArrowUpDown size={11} className="text-indigo-600 dark:text-indigo-400" />
                      Rec/Pag:
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={titulo.tipo_movimento || 'RECEBER/DÉBITO'}
                      className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-7 font-bold rounded"
                    />
                  </div>

                  <div className="col-span-3">
                    <label className="block text-[10px] font-extrabold text-slate-800 dark:text-slate-200">Tipo:</label>
                    <input
                      type="text"
                      readOnly
                      value={titulo.tipo || 'RECEBER'}
                      className="w-full bg-white dark:bg-slate-900 border border-[#a0a0a0] px-1.5 py-0.5 text-[11px] h-7 font-bold rounded"
                    />
                  </div>

                  {/* VALOR DO TÍTULO COM DESTAQUE IMPACTANTE AO LADO */}
                  <div className="col-span-6">
                    <label className="block text-[10px] font-black text-emerald-800 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                      <DollarSign size={13} className="text-emerald-600 dark:text-emerald-400" />
                      Valor do Título (R$):
                    </label>
                    <div className="w-full bg-gradient-to-r from-emerald-50 via-emerald-100/60 to-emerald-50 dark:from-emerald-950 dark:via-emerald-900/60 dark:to-emerald-950 border-2 border-emerald-500/90 px-3 py-1 rounded-lg flex items-center justify-between h-7 shadow-xs">
                      <span className="text-[10px] font-black text-emerald-800 dark:text-emerald-300 uppercase tracking-widest">TOTAL</span>
                      <span className="font-black font-mono text-base text-emerald-800 dark:text-emerald-300">
                        {formatBRL(Math.abs(titulo.valor || 0))}
                      </span>
                    </div>
                  </div>
                </div>

              </div>

              {/* SEÇÃO INFORMAÇÕES ERP (CENTRO DE CUSTO & PLANO DE CONTAS - CONFORME ERP COLISEU) */}
              <fieldset className="border border-indigo-200 dark:border-indigo-800/60 rounded-xl p-3 bg-gradient-to-br from-indigo-50/40 via-white to-slate-50 dark:from-indigo-950/20 dark:via-slate-900 dark:to-slate-900 space-y-2 shadow-xs">
                <legend className="px-2 text-[10.5px] font-black text-indigo-800 dark:text-indigo-300 uppercase tracking-wider flex items-center gap-1.5 bg-indigo-100/70 dark:bg-indigo-950 rounded-md border border-indigo-200 dark:border-indigo-800 py-0.5">
                  <FolderTree size={13} className="text-indigo-600 dark:text-indigo-400" /> Informações ERP (Centro de Custo & Plano de Contas)
                </legend>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase flex items-center gap-1 mb-1">
                      <Building2 size={12} className="text-indigo-600 dark:text-indigo-400" />
                      Centro de Custo (ERP):
                    </label>
                    <select
                      value={centroCusto}
                      onChange={(e) => setCentroCusto(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 px-2 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100 rounded-lg shadow-2xs focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {Array.from(new Set([centroCusto, ...centrosCustoOptions])).filter(Boolean).map((cc) => (
                        <option key={cc} value={cc}>{cc}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase flex items-center gap-1 mb-1">
                      <PieChart size={12} className="text-indigo-600 dark:text-indigo-400" />
                      Plano de Contas (ERP):
                    </label>
                    <select
                      value={planoContas}
                      onChange={(e) => setPlanoContas(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 px-2 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100 rounded-lg shadow-2xs focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {Array.from(new Set([planoContas, ...planosContasOptions])).filter(Boolean).map((pc) => (
                        <option key={pc} value={pc}>{pc}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </fieldset>

              {/* ABA INFERIOR COMPACTA (Informações Gerais, Descontos, Eventos) */}
              <div className="border border-[#a6b1c0] rounded bg-white dark:bg-slate-800 overflow-hidden">
                <div className="flex border-b border-[#a6b1c0] bg-[#e2e7ee] dark:bg-slate-850">
                  <button
                    onClick={() => setActiveTab('gerais')}
                    className={clsx(
                      "px-2.5 py-1 text-[11px] font-bold cursor-pointer transition-colors border-r border-[#a6b1c0]",
                      activeTab === 'gerais'
                        ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white border-b-2 border-b-indigo-600"
                        : "text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    Informações Gerais
                  </button>

                  <button
                    onClick={() => setActiveTab('descontos')}
                    className={clsx(
                      "px-2.5 py-1 text-[11px] font-bold cursor-pointer transition-colors border-r border-[#a6b1c0]",
                      activeTab === 'descontos'
                        ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white border-b-2 border-b-indigo-600"
                        : "text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    Descontos
                  </button>

                  <button
                    onClick={() => setActiveTab('eventos')}
                    className={clsx(
                      "px-2.5 py-1 text-[11px] font-bold cursor-pointer transition-colors",
                      activeTab === 'eventos'
                        ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white border-b-2 border-b-indigo-600"
                        : "text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    Eventos ({logs.length})
                  </button>
                </div>

                {/* CONTEÚDO DAS ABAS */}
                <div className="p-1.5">
                  {/* ABA 1: INFORMAÇÕES GERAIS */}
                  {activeTab === 'gerais' && (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-12 gap-1 items-center">
                        <div className="col-span-3">
                          <label className="block text-[9.5px] font-bold text-slate-700">Situação:</label>
                          <input
                            type="text"
                            readOnly
                            value={titulo.status_pagamento || 'EM ABERTO'}
                            className="w-full bg-white border border-[#a0a0a0] px-1 py-0.5 text-[11px] font-bold text-slate-900 uppercase text-center h-5.5"
                          />
                        </div>

                        <div className="col-span-2">
                          <label className="block text-[9.5px] font-bold text-slate-700">Dias Atraso:</label>
                          <input
                            type="text"
                            readOnly
                            value={titulo.dias_atraso ?? -1}
                            className="w-full bg-white border border-[#a0a0a0] px-1 py-0.5 text-[11px] font-mono text-center h-5.5"
                          />
                        </div>

                        <div className="col-span-2">
                          <label className="block text-[9.5px] font-bold text-slate-700">Multa:</label>
                          <input
                            type="text"
                            readOnly
                            value={formatBRL(titulo.multa_valor || 0)}
                            className="w-full bg-white border border-[#a0a0a0] px-1 py-0.5 text-[11px] font-mono text-right h-5.5"
                          />
                        </div>

                        <div className="col-span-2">
                          <label className="block text-[9.5px] font-bold text-slate-700">Juros:</label>
                          <input
                            type="text"
                            readOnly
                            value={formatBRL(titulo.juros_valor || 0)}
                            className="w-full bg-white border border-[#a0a0a0] px-1 py-0.5 text-[11px] font-mono text-right h-5.5"
                          />
                        </div>

                        <div className="col-span-3">
                          <label className="block text-[9.5px] font-bold text-slate-700">Valor Calc.:</label>
                          <input
                            type="text"
                            readOnly
                            value={formatBRL(titulo.valor)}
                            className="w-full bg-white border border-[#a0a0a0] px-1 py-0.5 text-[11px] font-black text-right font-mono h-5.5"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-12 gap-1 items-center">
                        <div className="col-span-4">
                          <label className="block text-[9.5px] font-bold text-slate-700">Usuário:</label>
                          <input
                            type="text"
                            readOnly
                            value={titulo.usuario_id || '16'}
                            className="w-full bg-white border border-[#a0a0a0] px-1 py-0.5 text-[11px] h-5.5"
                          />
                        </div>
                        <div className="col-span-8">
                          <label className="block text-[9.5px] font-bold text-slate-700">Vendedor:</label>
                          <input
                            type="text"
                            readOnly
                            value={titulo.vendedor_nome || ''}
                            className="w-full bg-white border border-[#a0a0a0] px-1 py-0.5 text-[11px] h-5.5"
                          />
                        </div>
                      </div>

                      {/* Tabela de Referência de Documentos */}
                      <div className="overflow-x-auto border border-[#a0a0a0]">
                        <table className="w-full text-[10.5px] text-left">
                          <thead className="bg-[#e4e7eb] border-b border-[#a0a0a0] text-slate-800 font-bold uppercase">
                            <tr>
                              <th className="px-1.5 py-0.5 border-r border-[#a0a0a0]">Cód. Pedido</th>
                              <th className="px-1.5 py-0.5 border-r border-[#a0a0a0]">Nº Pedido</th>
                              <th className="px-1.5 py-0.5 border-r border-[#a0a0a0]">Série</th>
                              <th className="px-1.5 py-0.5 border-r border-[#a0a0a0]">NFe</th>
                              <th className="px-1.5 py-0.5 border-r border-[#a0a0a0]">NFS</th>
                              <th className="px-1.5 py-0.5 border-r border-[#a0a0a0]">NFCe</th>
                              <th className="px-1.5 py-0.5 border-r border-[#a0a0a0]">DAV</th>
                              <th className="px-1.5 py-0.5">NPV</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="px-1.5 py-0.5 font-mono border-r border-[#a0a0a0]">{titulo.pedido_id || '—'}</td>
                              <td className="px-1.5 py-0.5 font-mono border-r border-[#a0a0a0]">{titulo.numero_pedido || '—'}</td>
                              <td className="px-1.5 py-0.5 border-r border-[#a0a0a0]">{titulo.serie || '—'}</td>
                              <td className="px-1.5 py-0.5 border-r border-[#a0a0a0]">{titulo.nfe || '—'}</td>
                              <td className="px-1.5 py-0.5 border-r border-[#a0a0a0]">{titulo.nfs || '—'}</td>
                              <td className="px-1.5 py-0.5 border-r border-[#a0a0a0]">{titulo.nfce || '—'}</td>
                              <td className="px-1.5 py-0.5 border-r border-[#a0a0a0]">{titulo.dav || '—'}</td>
                              <td className="px-1.5 py-0.5">{titulo.npv || '—'}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ABA 2: DESCONTOS */}
                  {activeTab === 'descontos' && (
                    <div className="p-2 text-center text-slate-500">
                      Nenhum desconto cadastrado para este lançamento.
                    </div>
                  )}

                  {/* ABA 3: EVENTOS */}
                  {activeTab === 'eventos' && (
                    <div className="space-y-1">
                      <h4 className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                        Histórico de Eventos do Título
                      </h4>

                      <div className="border border-[#a0a0a0] rounded overflow-hidden max-h-36 overflow-y-auto">
                        <table className="w-full text-[10.5px] text-left">
                          <thead className="bg-[#e4e7eb] border-b border-[#a0a0a0] font-bold text-slate-800 sticky top-0">
                            <tr>
                              <th className="px-1.5 py-1 border-r border-[#a0a0a0] w-20">Data</th>
                              <th className="px-1.5 py-1 border-r border-[#a0a0a0] w-16">Hora</th>
                              <th className="px-1.5 py-1 border-r border-[#a0a0a0] w-28">Processo</th>
                              <th className="px-1.5 py-1 border-r border-[#a0a0a0] w-24">Usuário</th>
                              <th className="px-1.5 py-1">Log</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 bg-white">
                            {logs.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="px-2 py-4 text-center text-slate-400">
                                  Nenhum evento registrado no histórico deste título.
                                </td>
                              </tr>
                            ) : (
                              logs.map((log) => (
                                <tr key={log.id} className="hover:bg-slate-50">
                                  <td className="px-1.5 py-0.5 border-r border-slate-200 font-mono text-[10px]">
                                    {formatDate(log.data_evento)}
                                  </td>
                                  <td className="px-1.5 py-0.5 border-r border-slate-200 font-mono text-[10px]">
                                    {getHora(log.data_evento)}
                                  </td>
                                  <td className="px-1.5 py-0.5 border-r border-slate-200 font-bold uppercase text-[10px] text-indigo-700">
                                    {log.tipo_evento}
                                  </td>
                                  <td className="px-1.5 py-0.5 border-r border-slate-200 text-[10px]">
                                    {log.usuario || 'Sistema'}
                                  </td>
                                  <td className="px-1.5 py-0.5 text-[10px] text-slate-700">
                                    {log.descricao}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                </div>
              </div>

            </>
          ) : (
            <div className="p-4 text-center text-red-600 font-bold">
              Não foi possível carregar as informações do título.
            </div>
          )}
        </div>

        {/* RODAPÉ COMPACTO ESTILO ERP */}
        <div className="bg-[#d5dbe3] dark:bg-slate-800 px-3 py-1 border-t border-[#a6b1c0] flex items-center justify-between gap-1.5 shrink-0 relative">
          
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => alert('Opções de Impressão de Ficha / Relatório')}
              className="px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-800 border border-[#a0a0a0] rounded font-bold text-[10.5px] flex items-center gap-1 cursor-pointer h-6.5 whitespace-nowrap"
            >
              <Printer size={12} className="text-slate-600" />
              <span>Imprimir ▼</span>
            </button>

            {titulo?.nosso_numero && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowBoletoMenu(!showBoletoMenu)}
                  className="px-2.5 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold text-[10.5px] flex items-center gap-1 cursor-pointer h-6.5 whitespace-nowrap shadow-2xs"
                >
                  <Printer size={11} />
                  <span>Boleto ▼</span>
                </button>

                {showBoletoMenu && (
                  <div className="absolute left-0 bottom-8 z-50 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl py-1 text-xs animate-fade-in">
                    <button
                      type="button"
                      onClick={() => { setShowBoletoMenu(false); handleReimprimirBoleto(); }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
                    >
                      <Printer size={13} className="text-indigo-600" />
                      <span>Reimprimir / Ver Boleto</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenEmailModal}
                      disabled={sendingBoletoEmail}
                      className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 text-slate-700 dark:text-slate-200 font-bold border-t border-slate-100 dark:border-slate-800 cursor-pointer disabled:opacity-50"
                    >
                      <Mail size={13} className="text-blue-600" />
                      <span>Enviar por E-mail</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenWhatsModal}
                      className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 text-slate-700 dark:text-slate-200 font-bold border-t border-slate-100 dark:border-slate-800 cursor-pointer"
                    >
                      <MessageCircle size={13} className="text-emerald-600" />
                      <span>Enviar por WhatsApp</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {titulo?.nosso_numero && (
              <button
                type="button"
                onClick={handleDesvincularBoleto}
                disabled={unlinking}
                className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded font-bold text-[10.5px] flex items-center gap-1 cursor-pointer h-6.5 disabled:opacity-50 whitespace-nowrap"
              >
                {unlinking ? <RefreshCw size={11} className="animate-spin" /> : <Ban size={11} />}
                <span>Cancelar Boleto</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {canEliminar && (
              <button
                type="button"
                onClick={() => setShowConfirmEliminar(true)}
                disabled={eliminating}
                className="px-2.5 py-0.5 bg-rose-700 hover:bg-rose-800 text-white rounded font-extrabold text-[10.5px] flex items-center gap-1 cursor-pointer h-6.5 shadow-2xs disabled:opacity-50 whitespace-nowrap"
                title="Eliminar este título definitivamente e registrar no log de auditoria do sistema"
              >
                {eliminating ? <RefreshCw size={11} className="animate-spin" /> : <Trash2 size={12} />}
                <span>Eliminar Título</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleSaveTitleDetails}
              disabled={saving}
              className="px-2.5 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-extrabold text-[10.5px] flex items-center gap-1 cursor-pointer h-6.5 shadow-2xs disabled:opacity-50 whitespace-nowrap"
            >
              {saving ? <RefreshCw size={11} className="animate-spin" /> : <Check size={13} />}
              <span>Salvar Alterações</span>
            </button>

            <button
              type="button"
              onClick={() => { onClose(); if (onUpdated) onUpdated(); }}
              className="px-3 py-0.5 bg-[#008a45] hover:bg-[#007038] text-white rounded font-bold text-[10.5px] flex items-center gap-1 cursor-pointer h-6.5 shadow-2xs whitespace-nowrap"
            >
              <Check size={13} />
              <span>OK</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-3 py-0.5 bg-[#c82333] hover:bg-[#bd2130] text-white rounded font-bold text-[10.5px] flex items-center gap-1 cursor-pointer h-6.5 shadow-2xs whitespace-nowrap"
            >
              <X size={13} />
              <span>Fechar</span>
            </button>
          </div>

        </div>

      </div>

      {/* MODAL EDITAR & ENVIAR POR E-MAIL */}
      {showEmailModal && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in font-sans">
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-md p-4 space-y-4 text-xs text-slate-800 dark:text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100 text-sm">
                <Mail size={16} className="text-blue-600" />
                <span>Enviar Boleto por E-mail</span>
              </div>
              <button onClick={() => setShowEmailModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                Endereço de E-mail do Destinatário:
              </label>
              <input
                type="email"
                value={emailDestino}
                onChange={(e) => setEmailDestino(e.target.value)}
                placeholder="exemplo@cliente.com"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
              <p className="text-[10px] text-slate-500">
                O e-mail do cadastro foi pré-preenchido. Você pode editá-lo para enviar a 2ª via a qualquer outro endereço.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowEmailModal(false)}
                className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 rounded-lg font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSendEmail}
                disabled={sendingBoletoEmail || !emailDestino.trim()}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {sendingBoletoEmail ? <RefreshCw size={14} className="animate-spin" /> : <Mail size={14} />}
                <span>{sendingBoletoEmail ? 'Enviando...' : 'Enviar E-mail'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDITAR & ENVIAR POR WHATSAPP */}
      {showWhatsModal && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in font-sans">
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-md p-4 space-y-4 text-xs text-slate-800 dark:text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100 text-sm">
                <MessageCircle size={16} className="text-emerald-600" />
                <span>Enviar Boleto por WhatsApp</span>
              </div>
              <button onClick={() => setShowWhatsModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                Número de Celular / WhatsApp:
              </label>
              <input
                type="text"
                value={whatsDestino}
                onChange={(e) => setWhatsDestino(e.target.value)}
                placeholder="(67) 99999-9999"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              />
              <p className="text-[10px] text-slate-500">
                O telefone do cadastro foi pré-preenchido. Você pode editá-lo ou alterar o número com DDD antes de abrir a conversa.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowWhatsModal(false)}
                className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 rounded-lg font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSendWhats}
                disabled={preparingWhats}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {preparingWhats ? <RefreshCw size={14} className="animate-spin" /> : <MessageCircle size={14} />}
                <span>Abrir no WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMAÇÃO DE ELIMINAÇÃO DE TÍTULO (GRAVAÇÃO EM AUDITORIA) */}
      {showConfirmEliminar && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in font-sans">
          <div className="bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 rounded-xl shadow-2xl w-full max-w-md p-4 space-y-4 text-xs text-slate-800 dark:text-slate-100">
            <div className="flex items-center justify-between border-b border-rose-100 dark:border-rose-900/50 pb-2">
              <div className="flex items-center gap-2 font-bold text-rose-700 dark:text-rose-400 text-sm">
                <Trash2 size={18} className="text-rose-600 animate-pulse" />
                <span>Confirmar Eliminação Definitiva do Título</span>
              </div>
              <button onClick={() => setShowConfirmEliminar(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2 bg-rose-50 dark:bg-rose-950/40 p-3 rounded-lg border border-rose-200 dark:border-rose-900/60">
              <p className="text-[11px] font-bold text-rose-900 dark:text-rose-200">
                Você tem certeza de que deseja ELIMINAR este lançamento?
              </p>
              <div className="text-[10.5px] text-rose-800 dark:text-rose-300 space-y-1 font-mono">
                <div>• Código: #{titulo?.id_firebird || titulo?.id}</div>
                <div>• Cliente: {titulo?.cliente_nome_full || titulo?.cliente_nome || '—'}</div>
                <div>• Valor: {formatBRL(titulo?.valor || 0)}</div>
              </div>
              <p className="text-[10px] text-rose-700 dark:text-rose-400 italic mt-1">
                ⚠️ Esta ação removerá o título do sistema e registrará no <strong>Log de Auditoria</strong> o operador que executou a ação (<strong>{user?.nome || user?.email}</strong>) e a data/hora exata.
              </p>
            </div>

            <div className="space-y-1">
              <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300">
                Motivo da Eliminação (Opcional):
              </label>
              <input
                type="text"
                value={motivoEliminacao}
                onChange={(e) => setMotivoEliminacao(e.target.value)}
                placeholder="Ex: Título lançado em duplicidade ou cancelado a pedido da diretoria"
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 font-medium text-xs focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowConfirmEliminar(false)}
                className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 rounded-lg font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmEliminar}
                disabled={eliminating}
                className="px-4 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-lg font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
              >
                {eliminating ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                <span>{eliminating ? 'Eliminando...' : 'Confirmar Eliminação'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
