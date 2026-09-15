import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApiQuery } from '../hooks/useApi'
import api from '../services/api'
import { 
  FileText, Search, Calendar, X, DollarSign, TrendingUp, RefreshCw,
  Play, Pause, CheckCircle, AlertTriangle, Send, Loader2, Settings
} from 'lucide-react'
import { formatBRL, formatDateTime } from '../utils/format'

interface PedidoFaturado {
  id: string
  numero_pedido: string
  numero_nota: string | null
  data: string
  cliente: string
  cliente_codigo: number
  cliente_telefone?: string | null
  cliente_celular_secundario?: string | null
  vendedor: string
  tipo: 'Venda' | 'Devolução'
  valor_total: number
}

interface ApiResponse {
  data: PedidoFaturado[]
  summary: {
    total_notas: number
    acumulado: number
  }
}

interface Template {
  id: number
  nome: string
  categoria: string
  subcategoria?: string | null
}

export default function Pedidos() {
  const navigate = useNavigate()
  useEffect(() => {
    document.title = "Pedidos Faturados - Coliseu Transporte"
  }, [])
  // Date initialization: first day of current month to today
  const getInitialDates = () => {
    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    return {
      start: `${yyyy}-${mm}-01`,
      end: `${yyyy}-${mm}-${dd}`
    }
  }

  const initialDates = getInitialDates()
  const [startDate, setStartDate] = useState(initialDates.start)
  const [endDate, setEndDate] = useState(initialDates.end)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Checkbox selection state
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([])

  // Campaign States
  const [campaignStatus, setCampaignStatus] = useState<'idle' | 'running' | 'paused' | 'finished'>('idle')
  const [progress, setProgress] = useState(0)
  const [campaignName, setCampaignName] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false)
  const [logMessages, setLogMessages] = useState<string[]>([])

  // Automation States
  const [isRunningAuto, setIsRunningAuto] = useState(false)

  const handleRunAutoNow = async () => {
    setIsRunningAuto(true)
    try {
      await api.post("/automacoes/run", { subcategoria: "pos_venda" })
      alert("Automações de Pós-Venda disparadas com sucesso!")
    } catch (err) {
      console.error(err)
      alert("Erro ao disparar automações de pós-venda.")
    } finally {
      setIsRunningAuto(false)
    }
  }

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
    }, 400)
    return () => clearTimeout(timer)
  }, [search])

  // Reset checkboxes when filters or data change
  useEffect(() => {
    setSelectedOrderIds([])
  }, [startDate, endDate, debouncedSearch])

  // API query
  const queryParams = {
    start_date: startDate,
    end_date: endDate,
    search: debouncedSearch.trim() || undefined
  }

  const { data, isLoading, isFetching } = useApiQuery<ApiResponse>(
    '/vendas/pedidos-faturados',
    queryParams,
    { placeholderData: (prev: any) => prev }
  )

  const { data: templatesRes } = useApiQuery<{ data: Template[] }>('/templates')
  const { data: automacoesRes, refetch: refetchAutomacoes } = useApiQuery<{ data: any[] }>('/automacoes')

  const posVendaTemplates = (templatesRes?.data || []).filter(
    t => t.subcategoria === 'pos_venda'
  )
  const whatsappTemplates = posVendaTemplates.filter(
    t => t.categoria === 'Mensagem WhatsApp'
  )
  const automacoes = automacoesRes?.data || []
  
  const posVendaTriggers = ['pedido_onboarding', 'auditoria_terminais', 'pos_venda_suporte', 'nps_periodico']
  const posVendaRules = automacoes.filter(a => posVendaTriggers.includes(a.gatilho))
  const isAutoDispatchActive = posVendaRules.length > 0 && posVendaRules.some(a => a.ativo)

  const handleUpdateTriggerTemplate = async (gatilho: string, templateIdVal: string, existing: any) => {
    if (!templateIdVal) return;
    const templateId = parseInt(templateIdVal, 10);
    try {
      if (existing) {
        await api.put(`/automacoes/${existing.id}`, {
          template_id: templateId
        })
      } else {
        let defaultSec = 0;
        if (gatilho === 'pedido_onboarding') defaultSec = 600;
        else if (gatilho === 'auditoria_terminais') defaultSec = 0;
        else if (gatilho === 'pos_venda_suporte') defaultSec = 1728000;
        else if (gatilho === 'nps_periodico') defaultSec = 2592000;

        await api.post('/automacoes', {
          gatilho,
          template_id: templateId,
          ativo: false,
          dias_vencimento: 0,
          tempo_segundos: defaultSec,
          canal: 'whatsapp',
          meta: {}
        })
      }
      refetchAutomacoes()
      alert('Modelo de mensagem da regra atualizado com sucesso!')
    } catch (err) {
      console.error(err)
      alert('Erro ao atualizar modelo de mensagem da regra.')
    }
  }

  const handleToggleTriggerActive = async (gatilho: string, existing: any) => {
    if (!existing) {
      alert('Selecione um modelo de mensagem para esta regra antes de iniciá-la.')
      return
    }
    try {
      await api.put(`/automacoes/${existing.id}`, {
        ativo: !existing.ativo
      })
      refetchAutomacoes()
    } catch (err) {
      console.error(err)
      alert('Erro ao alterar status da automação.')
    }
  }

  const handleToggleAutoDispatch = async () => {
    if (posVendaTemplates.length === 0) {
      alert('Por favor, crie um template de WhatsApp com a subcategoria "Pós-Venda" no menu de Acervos.')
      return
    }
    try {
      const nextActive = !isAutoDispatchActive
      for (const trig of posVendaTriggers) {
        const existing = automacoes.find(a => a.gatilho === trig)
        if (existing) {
          await api.put(`/automacoes/${existing.id}`, {
            ativo: nextActive
          })
        } else {
          const defaultTemplate = posVendaTemplates[0]?.id
          if (defaultTemplate) {
            let defaultSec = 0
            if (trig === 'pedido_onboarding') defaultSec = 600
            else if (trig === 'pos_venda_suporte') defaultSec = 1728000
            else if (trig === 'nps_periodico') defaultSec = 2592000

            await api.post('/automacoes', {
              gatilho: trig,
              template_id: defaultTemplate,
              ativo: nextActive,
              dias_vencimento: 0,
              tempo_segundos: defaultSec,
              canal: 'whatsapp',
              meta: {}
            })
          }
        }
      }
      refetchAutomacoes()
      alert(`Pós-Venda Automático ${nextActive ? 'ativado' : 'desativado'} com sucesso!`)
    } catch (err) {
      console.error(err)
      alert('Erro ao alterar status do pós-venda automático.')
    }
  }

  const pedidos = data?.data || []
  const summary = data?.summary || { total_notas: 0, acumulado: 0 }

  // Checkbox handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedOrderIds(pedidos.map(p => p.id))
    } else {
      setSelectedOrderIds([])
    }
  }

  const handleSelectOrder = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedOrderIds(prev => [...prev, id])
    } else {
      setSelectedOrderIds(prev => prev.filter(oid => oid !== id))
    }
  }

  const handleClearFilters = () => {
    const dates = getInitialDates()
    setStartDate(dates.start)
    setEndDate(dates.end)
    setSearch('')
    setDebouncedSearch('')
  }

  // Open campaign setup config modal
  const handleStartCampaignSetup = () => {
    if (selectedOrderIds.length === 0) {
      alert('Por favor, selecione ao menos um pedido na tabela utilizando as caixas de seleção (checkboxes).')
      return
    }
    const today = new Date().toLocaleDateString('pt-BR')
    setCampaignName(`Agradecimento de Compra - ${today}`)
    if (whatsappTemplates.length > 0) {
      setSelectedTemplateId(String(whatsappTemplates[0].id))
    } else {
      setSelectedTemplateId('')
    }
    setLogMessages([])
    setIsConfigModalOpen(true)
  }

  // Start the background sending loop
  const handleConfirmStartCampaign = () => {
    if (!campaignName.trim()) {
      alert('Informe o nome do disparo/campanha.')
      return
    }
    if (!selectedTemplateId) {
      alert('Selecione um template de WhatsApp para o agradecimento.')
      return
    }
    setIsConfigModalOpen(false)
    setProgress(0)
    setCampaignStatus('running')
    setLogMessages([`[INÍCIO] Iniciando disparos de agradecimento para ${selectedOrderIds.length} clientes...`])
  }

  // Pause campaign
  const handlePauseCampaign = () => {
    setCampaignStatus('paused')
    setLogMessages(prev => [...prev, '[PAUSADO] O disparo em lote foi pausado pelo operador.'])
  }

  // Resume campaign
  const handleResumeCampaign = () => {
    setCampaignStatus('running')
    setLogMessages(prev => [...prev, '[RETOMADO] Retomando os disparos pendentes...'])
  }

  // Reset campaign state
  const handleResetCampaign = () => {
    setCampaignStatus('idle')
    setProgress(0)
    setLogMessages([])
    setSelectedOrderIds([])
  }

  // Real-time sending loop execution
  useEffect(() => {
    if (campaignStatus !== 'running') return

    if (progress >= selectedOrderIds.length) {
      setCampaignStatus('finished')
      setLogMessages(prev => [...prev, '[FIM] Todos os disparos de agradecimento foram finalizados!'])
      return
    }

    const timer = setTimeout(async () => {
      const orderId = selectedOrderIds[progress]
      const order = pedidos.find(p => p.id === orderId)
      
      if (order) {
        const phone = order.cliente_telefone || order.cliente_celular_secundario || ''
        const clientName = order.cliente
        
        if (!phone || phone.trim().length < 8) {
          setLogMessages(prev => [
            ...prev,
            `[FALHA] ${clientName}: Não possui telefone/WhatsApp válido cadastrado.`
          ])
        } else {
          try {
            await api.post('/campanhas/disparar', {
              nome: `${campaignName} - Pedido ${order.numero_pedido}`,
              template_id: parseInt(selectedTemplateId, 10),
              destinatarios: [{ nome: clientName, telefone: phone }]
            })
            setLogMessages(prev => [
              ...prev,
              `[ENVIADO] Agradecimento disparado para ${clientName} (${phone})`
            ])
          } catch (err: any) {
            setLogMessages(prev => [
              ...prev,
              `[ERRO] Falha de comunicação ao enviar para ${clientName}: ${err.message || 'Erro'}`
            ])
          }
        }
      }
      
      setProgress(prev => prev + 1)
    }, 2000) // 2 second delay between messages to simulate natural queue

    return () => clearTimeout(timer)
  }, [campaignStatus, progress, selectedOrderIds, pedidos, selectedTemplateId, campaignName])

  return (
    <div className="space-y-3 sm:space-y-4 animate-scale-up">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-text-primary flex items-center gap-1.5">
            <FileText className="text-brand-500" size={20} />
            Pedidos Faturados
          </h1>
          <p className="text-[10px] sm:text-xs text-text-secondary mt-0.5">
            Relação e acompanhamento de notas de vendas e devoluções faturadas.
          </p>
        </div>
        
        {/* Campaign Action Button (Play/Pause/Dashboard) in Header - WHERE THE SETA IN RED POINTS */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          {/* Configuração do Pós-Venda Automático */}
          <div className="flex items-center gap-2 border border-divider bg-bg-secondary/40 p-1.5 rounded-lg shadow-sm">
            <button
              onClick={handleToggleAutoDispatch}
              className={`py-1 px-3 text-[11px] font-bold rounded-md flex items-center gap-2 transition-all cursor-pointer ${
                isAutoDispatchActive
                  ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 hover:bg-emerald-500/20'
                  : 'bg-slate-200 dark:bg-slate-800 text-text-secondary hover:text-text-primary border border-transparent'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isAutoDispatchActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              {isAutoDispatchActive ? 'Pós-Venda Automático: ATIVADO' : 'Começar o Envio Automático'}
            </button>
            
            <button
              onClick={handleRunAutoNow}
              disabled={isRunningAuto}
              className="btn-secondary !py-1 !px-2.5 text-[11px] flex items-center gap-1.5 rounded-md cursor-pointer transition-all hover:bg-bg-secondary"
              title="Disparar Agora"
            >
              {isRunningAuto ? (
                <Loader2 size={12} className="animate-spin text-brand-500" />
              ) : (
                <Play size={12} className="text-brand-500 fill-brand-500/10" />
              )}
              Disparar Agora
            </button>

            <button
              onClick={() => navigate('/config-integracoes?tab=automacoes')}
              className="p-1.5 hover:bg-bg-secondary text-text-secondary hover:text-text-primary rounded-md transition-all flex items-center justify-center cursor-pointer border border-transparent hover:border-divider"
              title="Configurar Parâmetros de Disparo"
            >
              <Settings size={14} />
            </button>
          </div>

          <div className="h-5 w-[1px] bg-divider mx-1" />

          {isFetching && !isLoading && (
            <div className="flex items-center gap-1 text-[10px] text-brand-500 font-semibold bg-brand-500/10 px-2 py-1 rounded-sm border border-brand-100/20 mr-2">
              <RefreshCw size={10} className="animate-spin" />
              Sincronizando...
            </div>
          )}

          {campaignStatus === 'idle' && (
            <button
              onClick={handleStartCampaignSetup}
              disabled={selectedOrderIds.length === 0}
              className={`py-1.5 px-3 text-[11px] font-bold rounded-sm flex items-center gap-1.5 shadow-sm transition-all ${
                selectedOrderIds.length > 0
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                  : 'bg-slate-200 dark:bg-slate-800 text-text-muted cursor-not-allowed border border-divider'
              }`}
              title="Selecione os pedidos abaixo para iniciar o envio automático de mensagens de agradecimento."
            >
              <Play size={12} fill="currentColor" />
              Agradecer Clientes ({selectedOrderIds.length})
            </button>
          )}

          {campaignStatus === 'running' && (
            <button
              onClick={handlePauseCampaign}
              className="py-1.5 px-3 text-[11px] font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-sm flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Pause size={12} fill="currentColor" className="animate-pulse" />
              Pausar Agradecimentos ({progress}/{selectedOrderIds.length})
            </button>
          )}

          {campaignStatus === 'paused' && (
            <div className="flex gap-1.5">
              <button
                onClick={handleResumeCampaign}
                className="py-1.5 px-2.5 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-sm flex items-center gap-1 shadow-sm transition-all"
              >
                <Play size={10} fill="currentColor" />
                Retomar ({progress}/{selectedOrderIds.length})
              </button>
              <button
                onClick={handleResetCampaign}
                className="py-1.5 px-2 text-[11px] font-bold bg-slate-200 hover:bg-slate-350 dark:bg-slate-800 dark:hover:bg-slate-700 text-text-primary rounded-sm border border-divider shadow-sm"
              >
                Cancelar
              </button>
            </div>
          )}

          {campaignStatus === 'finished' && (
            <button
              onClick={handleResetCampaign}
              className="py-1.5 px-3 text-[11px] font-bold bg-slate-600 hover:bg-slate-700 text-white rounded-sm flex items-center gap-1.5 shadow-sm transition-all"
            >
              <CheckCircle size={12} />
              Finalizado! Limpar ({progress})
            </button>
          )}
        </div>
      </div>

      {/* Real-time sending progress banner */}
      {campaignStatus !== 'idle' && (
        <div className="card p-3 border-l-4 border-l-brand-500 bg-bg-secondary flex flex-col gap-2 rounded-sm">
          <div className="flex justify-between items-center text-[10px] font-bold text-text-secondary">
            <span className="flex items-center gap-1 uppercase tracking-wide">
              {campaignStatus === 'running' && <Loader2 size={12} className="animate-spin text-brand-500" />}
              {campaignStatus === 'paused' && <AlertTriangle size={12} className="text-amber-500" />}
              Status do Envio: <span className={campaignStatus === 'running' ? 'text-brand-500' : 'text-amber-500'}>{campaignStatus.toUpperCase()}</span>
            </span>
            <span>{progress} de {selectedOrderIds.length} mensagens enviadas ({Math.round((progress / selectedOrderIds.length) * 100)}%)</span>
          </div>
          
          {/* Progress bar container */}
          <div className="w-full bg-divider h-2 rounded-full overflow-hidden">
            <div 
              className="bg-brand-500 h-full transition-all duration-500" 
              style={{ width: `${(progress / selectedOrderIds.length) * 100}%` }}
            />
          </div>

          {/* Logs console */}
          <div className="bg-bg-primary border border-divider rounded-sm p-2 h-20 overflow-y-auto text-[9px] font-mono text-text-secondary space-y-0.5">
            {logMessages.slice().reverse().map((msg, i) => (
              <div key={i} className={
                msg.startsWith('[ERRO]') || msg.startsWith('[FALHA]') ? 'text-red-500 font-semibold' :
                msg.startsWith('[ENVIADO]') ? 'text-emerald-500 font-semibold' : 'text-text-muted'
              }>
                {msg}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {/* KPI: Total de Notas */}
        <div className="card flex items-center justify-between p-3.5 sm:p-4 rounded-sm border border-divider">
          <div className="space-y-0.5">
            <span className="text-[9px] font-bold text-text-secondary uppercase tracking-wider block">
              Notas no Período
            </span>
            {isLoading ? (
              <div className="h-6 w-16 bg-bg-tertiary animate-pulse rounded mt-1" />
            ) : (
              <div className="text-lg sm:text-xl font-extrabold text-text-primary tracking-tight">
                {summary.total_notas} <span className="text-xs font-medium text-text-secondary">notas</span>
              </div>
            )}
            <p className="text-[9px] text-text-muted">
              Total de documentos fiscais emitidos
            </p>
          </div>
          <div className="w-8 h-8 rounded-sm bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 flex-shrink-0">
            <FileText size={16} />
          </div>
        </div>

        {/* KPI: Valor Acumulado Líquido */}
        <div className="card flex items-center justify-between p-3.5 sm:p-4 rounded-sm border border-divider">
          <div className="space-y-0.5">
            <span className="text-[9px] font-bold text-text-secondary uppercase tracking-wider block">
              Valor Acumulado Líquido
            </span>
            {isLoading ? (
              <div className="h-6 w-24 bg-bg-tertiary animate-pulse rounded mt-1" />
            ) : (
              <div className={`text-lg sm:text-xl font-extrabold tracking-tight ${
                summary.acumulado >= 0 ? 'text-green-600 font-mono' : 'text-red-600 font-mono'
              }`}>
                {formatBRL(summary.acumulado)}
              </div>
            )}
            <p className="text-[9px] text-text-muted">
              Faturamento líquido (vendas menos devoluções)
            </p>
          </div>
          <div className={`w-8 h-8 rounded-sm flex items-center justify-center flex-shrink-0 ${
            summary.acumulado >= 0 
              ? 'bg-green-500/10 text-green-500' 
              : 'bg-red-500/10 text-red-500'
          }`}>
            {summary.acumulado >= 0 ? <TrendingUp size={16} /> : <DollarSign size={16} />}
          </div>
        </div>
      </div>

      {/* Filters bar */}
      <div className="card p-3.5 space-y-3 border border-divider rounded-sm">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5">
          
          {/* Search bar */}
          <div className="relative flex-1">
            <label htmlFor="search-input" className="sr-only">Buscar pedidos</label>
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" size={13} />
            <input
              id="search-input"
              type="text"
              placeholder="Buscar por cliente, código, pedido ou nota..."
              value={search}
              onChange={(e) => setSearch(e.target.value.toUpperCase())}
              className="input pl-8 pr-8 !py-1 text-xs rounded-sm uppercase"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-text-muted hover:text-text-primary rounded-full hover:bg-bg-tertiary transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Date range filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="flex items-center gap-1.5 flex-1">
              <label htmlFor="start-date" className="text-[10px] font-bold text-text-secondary shrink-0 uppercase">De:</label>
              <div className="relative flex-1 sm:w-32">
                <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" size={12} />
                <input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="input !py-1 pl-7 text-[10px] w-full rounded-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-1">
              <label htmlFor="end-date" className="text-[10px] font-bold text-text-secondary shrink-0 uppercase">Até:</label>
              <div className="relative flex-1 sm:w-32">
                <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" size={12} />
                <input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="input !py-1 pl-7 text-[10px] w-full rounded-sm"
                />
              </div>
            </div>

            {/* Clear Filters */}
            {(startDate !== initialDates.start || endDate !== initialDates.end || search) && (
              <button
                onClick={handleClearFilters}
                className="btn-secondary !py-1 text-xs flex items-center justify-center gap-1 shrink-0 rounded-sm"
              >
                <X size={12} />
                Limpar Filtros
              </button>
            )}
          </div>
        </div>
      </div>

      {/* High-density, single-line table */}
      <div className="card p-0 overflow-hidden border border-divider rounded-sm">
        <div className="table-scroll">
          <table className="w-full text-left border-collapse text-[10px] sm:text-xs">
            <thead>
              <tr className="bg-bg-secondary border-b border-divider text-text-secondary font-bold select-none text-[9px] uppercase tracking-wider">
                <th className="p-2 w-8 text-center">
                  <input
                    type="checkbox"
                    checked={pedidos.length > 0 && selectedOrderIds.length === pedidos.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="w-3.5 h-3.5 text-brand-600 border-divider rounded focus:ring-brand-500 cursor-pointer"
                    title="Marcar / Desmarcar Todos"
                  />
                </th>
                <th className="p-2 py-2.5 font-bold">Data</th>
                <th className="p-2 py-2.5 font-bold">Pedido / Nota</th>
                <th className="p-2 py-2.5 font-bold">Cliente (Código)</th>
                <th className="p-2 py-2.5 font-bold">Vendedor</th>
                <th className="p-2 py-2.5 font-bold text-center">Tipo</th>
                <th className="p-2 py-2.5 font-bold text-right">Valor Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider font-medium">
              {isLoading ? (
                // Skeletons
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="p-2 text-center"><div className="h-3 w-3 bg-bg-tertiary rounded mx-auto" /></td>
                    <td className="p-2 py-1.5"><div className="h-3 bg-bg-tertiary rounded w-20" /></td>
                    <td className="p-2 py-1.5"><div className="h-3 bg-bg-tertiary rounded w-24" /></td>
                    <td className="p-2 py-1.5"><div className="h-3 bg-bg-tertiary rounded w-40" /></td>
                    <td className="p-2 py-1.5"><div className="h-3 bg-bg-tertiary rounded w-20" /></td>
                    <td className="p-2 py-1.5 text-center"><div className="h-4 bg-bg-tertiary rounded w-12 mx-auto" /></td>
                    <td className="p-2 py-1.5 text-right"><div className="h-3 bg-bg-tertiary rounded w-14 ml-auto" /></td>
                  </tr>
                ))
              ) : pedidos.length === 0 ? (
                // Empty state
                <tr>
                  <td colSpan={7} className="p-6 text-center text-text-secondary">
                    <div className="flex flex-col items-center justify-center gap-1">
                      <FileText size={24} className="text-text-muted opacity-50" />
                      <span className="font-semibold text-xs">Nenhum pedido faturado encontrado</span>
                      <span className="text-[10px] text-text-muted">Ajuste seus filtros de data ou pesquisa.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                // Pedidos table rows (tight padding, single lines)
                pedidos.map((p) => {
                  const isSelected = selectedOrderIds.includes(p.id)
                  return (
                    <tr 
                      key={p.id} 
                      className={`hover:bg-bg-secondary/30 transition-colors duration-100 border-b border-divider/40 ${
                        isSelected 
                          ? 'bg-brand-500/5 dark:bg-brand-500/10' 
                          : 'odd:bg-bg-primary even:bg-bg-secondary/10'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="p-2 text-center select-none">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleSelectOrder(p.id, e.target.checked)}
                          className="w-3.5 h-3.5 text-brand-600 border-divider rounded focus:ring-brand-500 cursor-pointer"
                        />
                      </td>

                      {/* Data (Formatted Single Line) */}
                      <td className="p-2 py-1.5 text-text-secondary whitespace-nowrap font-mono text-[10px]">
                        {formatDateTime(p.data)}
                      </td>
                      
                      {/* Pedido / Nota (Single Line) */}
                      <td className="p-2 py-1.5 whitespace-nowrap text-text-primary text-[10px] font-semibold">
                        <span>Ped: <span className="font-mono">{p.numero_pedido}</span></span>
                        {p.numero_nota ? (
                          <span className="text-text-secondary ml-1.5 pl-1.5 border-l border-divider/60">
                            NF: <span className="font-mono text-text-primary">{p.numero_nota}</span>
                          </span>
                        ) : (
                          <span className="text-text-muted ml-1.5 pl-1.5 border-l border-divider/60 text-[9px] font-medium italic">Sem Nota</span>
                        )}
                      </td>
                      
                      {/* Cliente (Single Line) */}
                      <td className="p-2 py-1.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 max-w-xs md:max-w-sm truncate" title={p.cliente}>
                          <span className="font-bold text-text-primary text-[10px] truncate">
                            {p.cliente}
                          </span>
                          <span className="text-[9px] text-text-muted font-bold whitespace-nowrap">
                            (Cód: <span className="font-mono">{p.cliente_codigo || '1'}</span>)
                          </span>
                          {/* Display small phone indicator */}
                          {(p.cliente_telefone || p.cliente_celular_secundario) && (
                            <span className="text-[8px] px-1 py-0.2 bg-emerald-500/10 text-emerald-600 font-extrabold rounded-sm uppercase tracking-wider">
                              whats
                            </span>
                          )}
                        </div>
                      </td>
                      
                      {/* Vendedor (Single Line) */}
                      <td className="p-2 py-1.5 text-text-secondary truncate max-w-[100px] whitespace-nowrap">
                        {p.vendedor}
                      </td>
                      
                      {/* Tipo */}
                      <td className="p-2 py-1.5 text-center whitespace-nowrap">
                        {p.tipo === 'Venda' ? (
                          <span className="badge-success text-[8px] py-0.5 px-1 bg-green-500/10 text-green-600 border-none font-bold uppercase rounded-sm">
                            Venda
                          </span>
                        ) : (
                          <span className="badge-danger text-[8px] py-0.5 px-1 bg-red-500/10 text-red-600 border-none font-bold uppercase rounded-sm">
                            Devolução
                          </span>
                        )}
                      </td>
                      
                      {/* Valor Total */}
                      <td className={`p-2 py-1.5 text-right font-bold font-mono whitespace-nowrap text-[11px] ${
                        p.valor_total >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {p.valor_total < 0 ? '-' : ''}{formatBRL(Math.abs(p.valor_total))}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CAMPAIGN CONFIGURATION MODAL (DIALOG) */}
      {isConfigModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="card w-full max-w-md p-0 bg-bg-primary rounded-sm overflow-hidden border border-divider shadow-2xl animate-scale-up">
            {/* Header */}
            <div className="p-3.5 border-b border-divider bg-bg-secondary flex justify-between items-center">
              <h3 className="font-bold text-text-primary text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Send size={14} className="text-emerald-500" />
                Configurar Agradecimento
              </h3>
              <button
                className="p-1 text-text-secondary hover:bg-bg-tertiary rounded-sm"
                onClick={() => setIsConfigModalOpen(false)}
              >
                <X size={14} />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-4 text-xs">
              <div className="bg-emerald-500/5 border border-emerald-500/20 p-3 rounded-sm text-text-secondary space-y-1">
                <span className="font-bold text-emerald-600 uppercase tracking-wide text-[9px] block">Lote de Destinatários</span>
                <p>Você selecionou <strong>{selectedOrderIds.length}</strong> pedido(s) de compra para enviar mensagens automáticas de agradecimento pós-venda.</p>
              </div>

              {/* Campaign name */}
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-text-secondary uppercase tracking-wider block">Nome do Envio / Campanha</label>
                <input
                  type="text"
                  className="input !py-1.5 text-xs rounded-sm"
                  placeholder="Ex: Agradecimento de Pedidos - 15/06"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                />
              </div>

              {/* Template selection */}
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-text-secondary uppercase tracking-wider block">Template do WhatsApp (Agradecimento)</label>
                {whatsappTemplates.length === 0 ? (
                  <div className="text-[10px] text-red-500 border border-red-200/25 bg-red-500/5 p-2 rounded-sm font-semibold">
                    Nenhum template cadastrado na categoria "Mensagem WhatsApp". Cadastre um primeiro no menu Acervos.
                  </div>
                ) : (
                  <select
                    className="input !py-1.5 text-xs rounded-sm"
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                  >
                    {whatsappTemplates.map(t => (
                      <option key={t.id} value={t.id}>{t.nome}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-divider bg-bg-secondary/40 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary !py-1.5 text-xs rounded-sm"
                onClick={() => setIsConfigModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={whatsappTemplates.length === 0 || !campaignName.trim()}
                onClick={handleConfirmStartCampaign}
                className={`py-1.5 px-4 text-xs font-bold rounded-sm shadow-sm transition-all ${
                  whatsappTemplates.length > 0 && campaignName.trim()
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-divider'
                }`}
              >
                Iniciar Disparos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
