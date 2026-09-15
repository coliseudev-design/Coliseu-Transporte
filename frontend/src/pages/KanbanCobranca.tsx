import { useState, useEffect, useMemo } from 'react'
import { useApiQuery } from '../hooks/useApi'
import api from '../services/api'
import {
  AlertTriangle, Calendar, Clock, MessageSquare, Phone, Mail, Pause, Play,
  Check, CheckSquare, Plus, X, Search, Filter, TrendingUp, User, DollarSign,
  History, Eye, ShieldAlert, ArrowRight, Zap, Printer, Copy, Send, FileDown, Loader2, ChevronDown
} from 'lucide-react'
import { formatBRL, formatDate } from '../utils/format'

interface Titulo {
  id: number;
  id_firebird: string | null;
  descricao: string;
  data_emissao: string;
  data_vencimento: string;
  data_pagamento: string | null;
  valor: number;
  valor_pago: number;
  status_pagamento: string;
  regua_id: number | null;
  regua_pausada: boolean;
  cliente_nome: string;
  cliente_documento: string;
  cliente_telefone: string;
  dias_atraso: number;
  regua_nome: string | null;
}

interface Ocorrencia {
  id: number;
  tipo_contato: string;
  observacao: string;
  operador: string;
  created_at: string;
}

interface Agendamento {
  id: number;
  financeiro_id: number;
  data_agendamento: string;
  descricao: string;
  concluido: boolean;
  created_at: string;
  titulo_descricao?: string;
  titulo_valor?: number;
  titulo_vencimento?: string;
  cliente_nome?: string;
  cliente_telefone?: string;
}

interface AutomacaoLog {
  id: number;
  canal: string;
  data_envio: string;
  status: string;
  erro: string | null;
  dias_relativos: number;
  tipo_acao: string;
}

interface HistoryRes {
  ocorrencias: Ocorrencia[];
  agendamentos: Agendamento[];
  automacoes: AutomacaoLog[];
}

export default function KanbanCobranca() {
  const [activeTab, setActiveTab] = useState<'kanban' | 'today' | 'appointments'>('kanban')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTitleId, setSelectedTitleId] = useState<number | null>(null)
  
  // Drawer Internal Tabs
  const [drawerTab, setDrawerTab] = useState<'acordo' | 'history' | 'schedule_followup'>('acordo')

  // Dynamic Cobrança & Calculator State
  const [jurosRate, setJurosRate] = useState<number>(2) // 2% a.m.
  const [multaRate, setMultaRate] = useState<number>(1) // 1% multa
  const [novoVencimento, setNovoVencimento] = useState<string>(() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d.toISOString().split('T')[0]
  })
  const [activeTemplate, setActiveTemplate] = useState<'formal' | 'amigavel' | 'urgente'>('formal')
  const [pausarAteRetorno, setPausarAteRetorno] = useState<boolean>(true)
  const [showBoletoModal, setShowBoletoModal] = useState<boolean>(false)
  const [show360List, setShow360List] = useState<boolean>(false)
  const [aplicarOutrosDebitos, setAplicarOutrosDebitos] = useState<boolean>(true)

  // Email sending state
  const [emailToSend, setEmailToSend] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const [anexarBoletoEmail, setAnexarBoletoEmail] = useState(true)
  const [sendingEmail, setSendingEmail] = useState(false)

  // Queries
  const { data: titulosRes, refetch: refetchTitulos } = useApiQuery<{ data: Titulo[] }>('/cobranca/titulos')
  const { data: agendamentosRes, refetch: refetchAgendamentos } = useApiQuery<{ data: Agendamento[] }>('/cobranca/agendamentos')
  const { data: templatesRes } = useApiQuery<{ data: any[] }>('/templates')
  
  const { data: historyRes, refetch: refetchHistory } = useApiQuery<HistoryRes>(
    selectedTitleId ? `/cobranca/titulos/${selectedTitleId}/historico` : '',
    undefined,
    { enabled: !!selectedTitleId }
  )

  const titulos = useMemo(() => {
    const raw = titulosRes?.data || []
    return raw.filter(t => {
      if ((t.valor || 0) <= 0) return false;
      const st = (t.status_pagamento || '').trim().toUpperCase();
      if (['CANCELADO', 'CANCELADA', 'CANCEL', 'CAN', 'ESTORNADO', 'ESTORNADA', 'EXCLUIDO', 'EXCLUIDA', 'ANULADO', 'ANULADA', 'INATIVO', 'PAGO', 'QUITADO', 'BAIXADO', 'LIQUIDADO'].includes(st) || st.includes('CANCEL') || st.includes('ESTORN')) {
        return false;
      }
      if ((t.valor_pago || 0) >= (t.valor || 0) && (t.valor || 0) > 0) return false;
      return true;
    })
  }, [titulosRes])
  const globalAgendamentos = agendamentosRes?.data || []

  // Filter templates to only cobrança-related
  const cobrancaTemplates = (templatesRes?.data || []).filter((t: any) => {
    const nome = (t.nome || t.name || '').toLowerCase()
    const tipo = (t.tipo || t.type || '').toLowerCase()
    return tipo.includes('cob') || tipo.includes('email') ||
      /cobran|financeiro|atraso|vencimento|bloqueio|inadimpl/i.test(nome) ||
      tipo.startsWith('cob_')
  })

  // Handle email send from drawer
  const handleSendEmailCobranca = async () => {
    if (!selectedTitle || !emailToSend || sendingEmail) return
    setSendingEmail(true)
    try {
      await api.post('/cobranca/testar-email-template', {
        titulo_id: selectedTitle.id,
        email_destino: emailToSend,
        template_id: selectedTemplateId || undefined,
        anexar_boleto: anexarBoletoEmail
      })
      alert('✅ E-mail de cobrança enviado com sucesso!')
    } catch (err: any) {
      alert(`❌ Erro ao enviar e-mail: ${err.response?.data?.error || err.message}`)
    } finally {
      setSendingEmail(false)
    }
  }

  const isTituloEmAberto = (t: Titulo) => {
    if (t.data_pagamento) return false
    const status = (t.status_pagamento || '').trim().toUpperCase()
    if (status === 'PAGO' || status === 'QUITADO' || status === 'LIQUIDADO' || status === 'BAIXADO' || status.includes('PAGO') || status.includes('QUITADO')) {
      return false
    }
    if (t.valor_pago && t.valor_pago >= t.valor) {
      return false
    }
    return true
  }

  // Mutate forms
  const [contactForm, setContactForm] = useState({ tipo_contato: 'Telefone / Ligação', observacao: '' })
  const [followupForm, setFollowupForm] = useState({ data_agendamento: '', descricao: '' })
  const [loadingAction, setLoadingAction] = useState(false)

  // Filtered titles
  const filteredTitulos = titulos.filter(t => {
    const query = searchQuery.toLowerCase()
    return (
      t.descricao.toLowerCase().includes(query) ||
      (t.cliente_nome && t.cliente_nome.toLowerCase().includes(query)) ||
      (t.cliente_documento && t.cliente_documento.includes(query))
    )
  })

  // Identifica títulos com agendamento ativo no futuro/hoje OU régua pausada
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const activeScheduledTitleIds = new Set(
    globalAgendamentos
      .filter(a => !a.concluido && new Date(a.data_agendamento) >= todayStart)
      .map(a => a.financeiro_id)
  )

  const isTitlePausadoOuAgendado = (t: Titulo) => {
    return activeScheduledTitleIds.has(t.id) || t.regua_pausada
  }

  // Group columns for Kanban (Oculta títulos quitados/pagos ou com agendamento futuro/régua pausada)
  const columns = {
    leve: {
      title: 'Atraso Leve',
      range: '1-5 dias',
      color: 'border-amber-500',
      badgeColor: 'bg-amber-100 text-amber-800',
      items: filteredTitulos.filter(t => isTituloEmAberto(t) && !isTitlePausadoOuAgendado(t) && t.dias_atraso >= 1 && t.dias_atraso <= 5)
    },
    medio: {
      title: 'Atraso Médio',
      range: '6-15 dias',
      color: 'border-orange-500',
      badgeColor: 'bg-orange-100 text-orange-800',
      items: filteredTitulos.filter(t => isTituloEmAberto(t) && !isTitlePausadoOuAgendado(t) && t.dias_atraso >= 6 && t.dias_atraso <= 15)
    },
    grave: {
      title: 'Atraso Grave',
      range: '16-30 dias',
      color: 'border-red-500',
      badgeColor: 'bg-red-100 text-red-800',
      items: filteredTitulos.filter(t => isTituloEmAberto(t) && !isTitlePausadoOuAgendado(t) && t.dias_atraso >= 16 && t.dias_atraso <= 30)
    },
    critico: {
      title: 'Inadimplência Crítica',
      range: '>30 dias',
      color: 'border-red-800',
      badgeColor: 'bg-red-200 text-red-900',
      items: filteredTitulos.filter(t => isTituloEmAberto(t) && !isTitlePausadoOuAgendado(t) && t.dias_atraso > 30)
    }
  }

  const countInadimplentes = new Set(
    titulos.filter(t => isTituloEmAberto(t) && t.dias_atraso > 0).map(t => t.cliente_documento)
  ).size

  const activeFollowupsCount = globalAgendamentos.filter(a => !a.concluido).length

  // Handlers
  const handleOpenDetail = (titleId: number) => {
    setSelectedTitleId(titleId)
    setDrawerTab('acordo')
    const titulo = titulos.find(t => t.id === titleId)
    if (titulo) {
      setEmailToSend((titulo as any).email_financeiro || (titulo as any).cliente_email || (titulo as any).email || '')
    }
  }

  const handleTogglePauseAutomation = async (title: Titulo) => {
    try {
      await api.post('/cobranca/titulos/acao-lote', {
        ids: [title.id],
        acao: title.regua_pausada ? 'Retomar Cobrança' : 'Pausar Cobrança'
      })
      refetchTitulos()
    } catch (err) {
      console.error(err)
      alert('Erro ao alterar status de automação.')
    }
  }

  const goToNextTitle = () => {
    if (!selectedTitleId) {
      setSelectedTitleId(null)
      return
    }
    const currentIndex = filteredTitulos.findIndex(t => t.id === selectedTitleId)
    if (currentIndex >= 0 && currentIndex < filteredTitulos.length - 1) {
      const nextTitle = filteredTitulos[currentIndex + 1]
      setSelectedTitleId(nextTitle.id)
    } else {
      setSelectedTitleId(null)
    }
  }

  const handleRegisterContact = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTitleId || !selectedTitle) return
    setLoadingAction(true)
    try {
      const targetIds = (aplicarOutrosDebitos && otherTitles.length > 0)
        ? [selectedTitle.id, ...otherTitles.map(ot => ot.id)]
        : [selectedTitle.id]

      for (const id of targetIds) {
        await api.post(`/cobranca/titulos/${id}/ocorrencias`, contactForm)
      }

      setContactForm({ tipo_contato: 'Telefone / Ligação', observacao: '' })
      refetchHistory()
      refetchTitulos()
      goToNextTitle()
    } catch (err) {
      console.error(err)
      alert('Erro ao registrar ocorrência.')
    } finally {
      setLoadingAction(false)
    }
  }

  const handleScheduleFollowup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTitleId || !selectedTitle) return
    setLoadingAction(true)
    try {
      const targetIds = (aplicarOutrosDebitos && otherTitles.length > 0)
        ? [selectedTitle.id, ...otherTitles.map(ot => ot.id)]
        : [selectedTitle.id]

      for (const id of targetIds) {
        await api.post(`/cobranca/titulos/${id}/agendamentos`, followupForm)
      }
      
      // Se solicitou pausar régua de cobrança até o retorno
      if (pausarAteRetorno) {
        await api.post('/cobranca/titulos/acao-lote', {
          ids: targetIds,
          acao: 'Pausar Cobrança'
        })
      }

      setFollowupForm({ data_agendamento: '', descricao: '' })
      refetchHistory()
      refetchAgendamentos()
      refetchTitulos()
      goToNextTitle()
    } catch (err) {
      console.error(err)
      alert('Erro ao agendar retorno.')
    } finally {
      setLoadingAction(false)
    }
  }

  const handleToggleAgendamentoConcluido = async (ag: Agendamento) => {
    try {
      await api.put(`/cobranca/agendamentos/${ag.id}`, { concluido: !ag.concluido })
      refetchAgendamentos()
      if (selectedTitleId === ag.financeiro_id) {
        refetchHistory()
      }
    } catch (err) {
      console.error(err)
      alert('Erro ao concluir agendamento.')
    }
  }

  const getSelectedTitleDetails = () => {
    return titulos.find(t => t.id === selectedTitleId)
  }

  const selectedTitle = getSelectedTitleDetails()



  // Visão 360º de Outros Títulos em Aberto do mesmo cliente (Exclui quitados/pagos)
  const otherTitles = selectedTitle
    ? titulos.filter(t => t.id !== selectedTitle.id && isTituloEmAberto(t) && (
        (t.cliente_documento && t.cliente_documento === selectedTitle.cliente_documento) ||
        (t.cliente_nome && t.cliente_nome === selectedTitle.cliente_nome)
      ))
    : []

  const otherTitlesTotal = otherTitles.reduce((acc, t) => acc + t.valor, 0)
  const grandTotal360 = selectedTitle ? selectedTitle.valor + otherTitlesTotal : 0

  // Valor Base para Recálculo (Individual vs Todos em Lote)
  const baseValorCalc = (aplicarOutrosDebitos && otherTitles.length > 0) ? grandTotal360 : (selectedTitle ? selectedTitle.valor : 0)

  // Cálculo Dinâmico de Juros & Multa
  const multaval = baseValorCalc * (multaRate / 100)
  const jurosVal = selectedTitle ? baseValorCalc * (jurosRate / 100) * (selectedTitle.dias_atraso / 30) : 0
  const valorAtualizado = baseValorCalc + multaval + jurosVal

  // Barcode / Linha Digitável Simulado
  const linhaDigitavel = selectedTitle
    ? `34191.79001 ${selectedTitle.id}00.510047 91020.150008 5 96420000${Math.round(valorAtualizado)}`
    : ''

  // Template Messages for WhatsApp
  const getWhatsAppMessage = (type: 'formal' | 'amigavel' | 'urgente') => {
    if (!selectedTitle) return ''
    const vencStr = new Date(selectedTitle.data_vencimento).toLocaleDateString('pt-BR')
    const novoVencStr = novoVencimento ? new Date(novoVencimento + 'T12:00:00').toLocaleDateString('pt-BR') : 'a definir'
    const linkBoleto = `https://transporte.coliseusistemas.com.br/boleto/${selectedTitle.id_firebird || selectedTitle.id}`
    const qtdTitulosStr = (aplicarOutrosDebitos && otherTitles.length > 0) ? `referente aos ${otherTitles.length + 1} débitos em aberto` : `vencido em ${vencStr}`

    if (type === 'formal') {
      return `Prezado(a) ${selectedTitle.cliente_nome}, boa tarde.\n\nComunicamos que o seu saldo devedor (${qtdTitulosStr}), no valor de ${formatBRL(baseValorCalc)}, encontra-se em aberto.\n\nO valor atualizado com juros e multa é de ${formatBRL(valorAtualizado)}.\n\nPara facilitar o pagamento com novo vencimento para ${novoVencStr}, segue a linha digitável do boleto:\n${linhaDigitavel}\n\nLink de pagamento: ${linkBoleto}\n\nEstamos à disposição para negociar condições de pagamento.\n\nAtenciosamente,\nEquipe de Cobrança — Coliseu Transporte`
    } else if (type === 'amigavel') {
      return `Oi ${selectedTitle.cliente_nome}, tudo bem? 😊\n\nVi que temos um saldo pendente aqui no sistema (${qtdTitulosStr}) no valor total de ${formatBRL(baseValorCalc)}. Nada que não possamos resolver!\n\nCom o recálculo de juros atualizados, fica em ${formatBRL(valorAtualizado)}.\n\nPosso te enviar o boleto atualizado com vencimento para ${novoVencStr}?\n\nLinha digitável:\n${linhaDigitavel}\n\nFico no aguardo! 😃`
    } else {
      return `⚠️ ATENÇÃO — ÚLTIMO AVISO DE COBRANÇA\n\nSr(a). ${selectedTitle.cliente_nome}, seu débito total de ${formatBRL(baseValorCalc)} (${qtdTitulosStr}) possui parcelas em atraso.\n\nCaso não seja regularizado até ${novoVencStr}, o débito será encaminhado para as providências cabíveis.\n\nValor atualizado: ${formatBRL(valorAtualizado)}\nLinha Digitável: ${linhaDigitavel}\n\nRegularize agora para evitar maiores custos.`
    }
  }

  // Sincroniza a data do novo vencimento com o agendamento de retorno
  useEffect(() => {
    if (novoVencimento) {
      setFollowupForm(f => ({
        ...f,
        data_agendamento: novoVencimento,
        descricao: f.descricao || `Retorno agendado para o novo vencimento em ${new Date(novoVencimento + 'T12:00:00').toLocaleDateString('pt-BR')}`
      }))
    }
  }, [novoVencimento])

  // Execução "Tudo em 1 Clique"
  const handleTudoEmUmClique = async () => {
    if (!selectedTitle) return
    setLoadingAction(true)
    try {
      const targetIds = (aplicarOutrosDebitos && otherTitles.length > 0)
        ? [selectedTitle.id, ...otherTitles.map(ot => ot.id)]
        : [selectedTitle.id]

      // 1. Grava Ocorrência e Agendamento automático para a nova data em lote
      for (const id of targetIds) {
        await api.post(`/cobranca/titulos/${id}/ocorrencias`, {
          tipo_contato: 'WhatsApp / Acordo 1-Clique',
          observacao: `Acordo em lote (${targetIds.length} títulos). Valor atualizado total: ${formatBRL(valorAtualizado)}. Novo Vencimento: ${novoVencimento}.`
        })
        if (novoVencimento) {
          await api.post(`/cobranca/titulos/${id}/agendamentos`, {
            data_agendamento: novoVencimento,
            descricao: `Novo vencimento negociado para ${new Date(novoVencimento + 'T12:00:00').toLocaleDateString('pt-BR')}`
          })
        }
      }

      // 2. Pausa a automação na régua para todos os débitos marcados
      await api.post('/cobranca/titulos/acao-lote', {
        ids: targetIds,
        acao: 'Pausar Cobrança'
      })

      // 3. Dispara WhatsApp Web
      const message = getWhatsAppMessage(activeTemplate)
      const phoneClean = selectedTitle.cliente_telefone?.replace(/\D/g, '') || ''
      const url = `https://wa.me/55${phoneClean}?text=${encodeURIComponent(message)}`
      window.open(url, '_blank')

      // 4. Atualiza histórico e avança para o próximo cliente
      refetchHistory()
      refetchAgendamentos()
      refetchTitulos()
      goToNextTitle()
    } catch (err) {
      console.error(err)
      alert('Erro ao executar Ação em 1-Clique.')
    } finally {
      setLoadingAction(false)
    }
  }

  // Emissão de Boleto Bancário via API Asaas
  const [emittingBoleto, setEmittingBoleto] = useState(false)
  const handleEmitirBoletoAsaas = async () => {
    if (!selectedTitle) return
    setEmittingBoleto(true)
    try {
      const res = await api.post('/asaas/emitir-boleto', {
        titleId: selectedTitle.id,
        vencimento: novoVencimento,
        valor: valorAtualizado
      })

      if (res.data.linhaDigitavel) {
        navigator.clipboard.writeText(res.data.linhaDigitavel)
      }

      alert(`✅ Boleto bancário emitido com sucesso no Banco Asaas!\n\nLinha Digitável: ${res.data.linhaDigitavel || 'Gerada'}\n(Copiada para a área de transferência!)\n\nLink PDF: ${res.data.bankSlipUrl || 'Disponível no histórico'}`)
      
      refetchHistory()
      refetchTitulos()
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message
      alert(`❌ Erro ao emitir boleto no Asaas:\n${msg}`)
    } finally {
      setEmittingBoleto(false)
    }
  }

  // Filter Today's Tasks
  const todayStr = new Date().toISOString().split('T')[0]
  const todayCobranças = filteredTitulos.filter(t => {
    if (t.status_pagamento === 'PAGO') return false
    const vencimentoStr = t.data_vencimento.split('T')[0]
    const hasTodayFollowup = globalAgendamentos.some(
      a => a.financeiro_id === t.id && !a.concluido && a.data_agendamento.split('T')[0] === todayStr
    )
    return vencimentoStr === todayStr || hasTodayFollowup || t.dias_atraso > 0
  })

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card !p-4 flex items-center gap-4 bg-bg-primary">
          <div className="p-3 bg-amber-500/10 text-amber-500 rounded-sm">
            <ShieldAlert size={20} />
          </div>
          <div>
            <div className="text-[10px] text-text-secondary uppercase font-bold tracking-wider">Clientes Inadimplentes</div>
            <div className="text-lg font-bold text-text-primary">{countInadimplentes} empresas</div>
          </div>
        </div>

        <div className="card !p-4 flex items-center gap-4 bg-bg-primary">
          <div className="p-3 bg-blue-500/10 text-blue-500 rounded-sm">
            <Clock size={20} />
          </div>
          <div>
            <div className="text-[10px] text-text-secondary uppercase font-bold tracking-wider">Retornos Pendentes</div>
            <div className="text-lg font-bold text-text-primary">{activeFollowupsCount} retornos</div>
          </div>
        </div>

        <div className="card !p-4 flex items-center gap-4 bg-bg-primary">
          <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-sm">
            <TrendingUp size={20} />
          </div>
          <div>
            <div className="text-[10px] text-text-secondary uppercase font-bold tracking-wider">Fila de Hoje</div>
            <div className="text-lg font-bold text-text-primary">{todayCobranças.length} títulos</div>
          </div>
        </div>
      </div>

      {/* Tabs and Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-divider pb-2">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('kanban')}
            className={`py-2 px-4 text-xs font-semibold rounded-sm transition-all ${
              activeTab === 'kanban' ? 'bg-brand-500 text-white shadow-sm' : 'bg-transparent text-text-secondary hover:bg-bg-secondary'
            }`}
          >
            Kanban de Atraso
          </button>
          <button
            onClick={() => setActiveTab('today')}
            className={`py-2 px-4 text-xs font-semibold rounded-sm transition-all ${
              activeTab === 'today' ? 'bg-brand-500 text-white shadow-sm' : 'bg-transparent text-text-secondary hover:bg-bg-secondary'
            }`}
          >
            Cobranças de Hoje ({todayCobranças.length})
          </button>
          <button
            onClick={() => setActiveTab('appointments')}
            className={`py-2 px-4 text-xs font-semibold rounded-sm transition-all ${
              activeTab === 'appointments' ? 'bg-brand-500 text-white shadow-sm' : 'bg-transparent text-text-secondary hover:bg-bg-secondary'
            }`}
          >
            Retornos Agendados ({globalAgendamentos.filter(a => !a.concluido).length})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por cliente ou título..."
            className="input !pl-8 !py-1 text-xs w-full"
          />
        </div>
      </div>

      {/* Tab 1: KANBAN BOARD */}
      {activeTab === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          {Object.entries(columns).map(([colKey, col]) => (
            <div key={colKey} className={`card !p-3 border-t-4 ${col.color} bg-bg-secondary/30 min-h-[500px] flex flex-col gap-3 rounded-sm`}>
              <div className="flex justify-between items-center pb-2 border-b border-divider">
                <div>
                  <h3 className="font-bold text-text-primary text-xs uppercase tracking-wider">{col.title}</h3>
                  <span className="text-[10px] text-text-secondary">{col.range}</span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${col.badgeColor}`}>
                  {col.items.length}
                </span>
              </div>

              <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[650px] pr-1">
                {col.items.length === 0 ? (
                  <div className="text-center py-8 text-xs text-text-muted italic">Nenhum título nesta faixa</div>
                ) : (
                  col.items.slice(0, 100).map((t) => (
                    <div
                      key={t.id}
                      onClick={() => handleOpenDetail(t.id)}
                      className="card !p-3 bg-bg-primary hover:border-brand-500 transition-all cursor-pointer shadow-xs space-y-2 border border-divider rounded-sm relative group"
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-[9px] font-mono text-text-muted font-bold">#{t.id_firebird || t.id}</span>
                        {t.regua_pausada && (
                          <span className="bg-amber-500/10 text-amber-600 text-[8px] font-bold px-1.5 py-0.2 rounded-sm flex items-center gap-0.5">
                            <Pause size={8} /> Pausada
                          </span>
                        )}
                      </div>

                      <div>
                        <h4 className="font-bold text-text-primary text-xs line-clamp-1 group-hover:text-brand-500 transition-colors">
                          {t.cliente_nome || 'Cliente não identificado'}
                        </h4>
                        <p className="text-[10px] text-text-secondary line-clamp-1">{t.descricao}</p>
                      </div>

                      <div className="pt-2 border-t border-divider flex justify-between items-end text-xs">
                        <div>
                          <span className="text-[8px] text-text-muted uppercase font-bold block">Vencimento</span>
                          <span className="font-mono font-bold text-text-primary text-[10px]">
                            {formatDate(t.data_vencimento)}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[8px] text-text-muted uppercase font-bold block">Valor</span>
                          <span className="font-mono font-bold text-text-primary text-xs">{formatBRL(t.valor)}</span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-[9px] pt-1">
                        <span className="text-red-500 font-bold">{t.dias_atraso} dias atrasado</span>
                        <span className="text-text-muted">{t.regua_nome || 'Sem régua'}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 2: COBRANÇAS DE HOJE */}
      {activeTab === 'today' && (
        <div className="card !p-0 overflow-hidden border border-divider rounded-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-bg-secondary/60 text-text-secondary font-bold uppercase tracking-wider text-[10px] border-b border-divider">
                <tr>
                  <th className="p-3">Título / Cliente</th>
                  <th className="p-3">Vencimento</th>
                  <th className="p-3 text-right">Valor</th>
                  <th className="p-3">Atraso</th>
                  <th className="p-3">Status Automação</th>
                  <th className="p-3 text-center">Ações Rápidas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {todayCobranças.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-text-muted">Nenhum título pendente para hoje.</td>
                  </tr>
                ) : (
                  todayCobranças.map((t) => (
                    <tr key={t.id} className="hover:bg-bg-secondary/20">
                      <td className="p-3">
                        <div className="font-bold text-text-primary">{t.cliente_nome}</div>
                        <div className="text-[10px] text-text-secondary">{t.descricao} (#{t.id_firebird || t.id})</div>
                      </td>
                      <td className="p-3 font-semibold font-mono">
                        {new Date(t.data_vencimento).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="p-3 text-right font-bold font-mono text-text-primary">
                        {formatBRL(t.valor)}
                      </td>
                      <td className="p-3">
                        <span className="text-red-500 font-bold text-[10px]">{t.dias_atraso} dias</span>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-sm text-[9px] font-bold ${
                          t.regua_pausada ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600'
                        }`}>
                          {t.regua_pausada ? 'Pausada' : 'Ativa'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleOpenDetail(t.id)}
                            className="btn-secondary !py-1 text-[10px] font-semibold flex items-center gap-1"
                          >
                            Abrir <ArrowRight size={10} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: AGENDAMENTOS */}
      {activeTab === 'appointments' && (
        <div className="card !p-0 overflow-hidden border border-divider rounded-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-bg-secondary/60 text-text-secondary font-bold uppercase tracking-wider text-[10px] border-b border-divider">
                <tr>
                  <th className="p-3 w-10 text-center">Status</th>
                  <th className="p-3">Data Agendamento</th>
                  <th className="p-3">Cliente / Contato</th>
                  <th className="p-3">Título Ref</th>
                  <th className="p-3">Descrição / Compromisso</th>
                  <th className="p-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {globalAgendamentos.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-text-muted">Nenhum retorno agendado localizado.</td>
                  </tr>
                ) : (
                  globalAgendamentos.map((ag) => (
                    <tr key={ag.id} className={`hover:bg-bg-secondary/20 ${ag.concluido ? 'opacity-60 line-through' : ''}`}>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleToggleAgendamentoConcluido(ag)}
                          className={`p-1 rounded-sm ${ag.concluido ? 'text-emerald-500' : 'text-text-muted hover:text-emerald-500'}`}
                        >
                          <CheckSquare size={16} />
                        </button>
                      </td>
                      <td className="p-3 font-semibold font-mono">
                        {new Date(ag.data_agendamento).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-text-primary">{ag.cliente_nome || '—'}</div>
                        <div className="text-[10px] text-text-secondary font-mono">{ag.cliente_telefone}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-text-primary">{ag.titulo_descricao}</div>
                        <div className="text-[10px] text-text-secondary font-mono">Valor: {ag.titulo_valor ? formatBRL(ag.titulo_valor) : '—'}</div>
                      </td>
                      <td className="p-3 max-w-[300px] truncate text-text-secondary">
                        {ag.descricao}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleOpenDetail(ag.financeiro_id)}
                          className="btn-secondary !py-1 text-[10px] font-semibold flex items-center gap-1"
                        >
                          Abrir Título <ArrowRight size={10} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Drawer Overlay - Largura Expandida (max-w-5xl) para Layout Horizontal Lado a Lado */}
      {selectedTitle && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex justify-end backdrop-blur-xs">
          <div className="w-full max-w-4xl lg:max-w-5xl bg-bg-primary h-full shadow-2xl flex flex-col animate-slide-in p-0 border-l border-divider rounded-l-[4px]">
            {/* Header Compacto Otimizado */}
            <div className="p-3 border-b border-divider bg-bg-secondary flex justify-between items-center rounded-tl-[4px]">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-text-primary text-base leading-tight">{selectedTitle.cliente_nome}</h3>
                  <span className="text-[9px] font-mono bg-red-500/10 text-red-600 px-1.5 py-0.5 rounded-sm font-semibold uppercase">
                    ATRASO: {selectedTitle.dias_atraso} DIAS
                  </span>
                  <button
                    onClick={() => handleTogglePauseAutomation(selectedTitle)}
                    className={`px-1.5 py-0.5 rounded-sm text-[9px] font-bold inline-flex items-center gap-0.5 ${
                      selectedTitle.regua_pausada ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'
                    }`}
                  >
                    {selectedTitle.regua_pausada ? <Pause size={8} /> : <Play size={8} />}
                    {selectedTitle.regua_pausada ? 'Pausada' : 'Régua Ativa'}
                  </button>
                </div>
                <p className="text-xs text-text-secondary font-medium mt-0.5">
                  Doc #{selectedTitle.id_firebird || selectedTitle.id} | Venc: {formatDate(selectedTitle.data_vencimento)} | Documento: {selectedTitle.cliente_documento || 'CNPJ N/I'} | <strong className="text-slate-800">{formatBRL(selectedTitle.valor)}</strong>
                </p>
              </div>
              <button
                className="p-1.5 text-text-secondary hover:bg-bg-tertiary rounded-sm"
                onClick={() => setSelectedTitleId(null)}
              >
                <X size={18} />
              </button>
            </div>

            {/* VISÃO 360º DO CLIENTE COM SELEÇÃO EM LOTE */}
            {otherTitles.length > 0 && (
              <div className="bg-amber-50 border-b border-amber-200 p-2.5 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="aplicarOutrosDebitos"
                      checked={aplicarOutrosDebitos}
                      onChange={(e) => setAplicarOutrosDebitos(e.target.checked)}
                      className="rounded border-amber-400 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                    />
                    <label htmlFor="aplicarOutrosDebitos" className="font-bold text-amber-950 text-xs cursor-pointer select-none">
                      ⚡ Aplicar este acordo/agendamento em LOTE para todos os +{otherTitles.length} débitos deste cliente ({formatBRL(grandTotal360)})
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShow360List(!show360List)}
                    className="text-[10px] font-bold text-amber-800 underline hover:text-amber-950 cursor-pointer shrink-0"
                  >
                    {show360List ? 'Ocultar' : 'Ver Todos'}
                  </button>
                </div>
                {show360List && (
                  <div className="mt-1.5 max-h-32 overflow-y-auto space-y-1 pr-1 border-t border-amber-200 pt-1 animate-fade-in">
                    {otherTitles.map(ot => (
                      <div key={ot.id} className="flex justify-between items-center bg-white border border-amber-200 px-2 py-0.5 rounded text-[11px] font-mono text-slate-700">
                        <span>Doc #{ot.id_firebird || ot.id} — Venc: {formatDate(ot.data_vencimento)}</span>
                        <span className="font-bold text-amber-900">{formatBRL(ot.valor)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Drawer internal tabs */}
            <div className="flex border-b border-divider bg-bg-primary text-xs">
              <button
                onClick={() => setDrawerTab('acordo')}
                className={`flex-1 py-2 px-3 border-b-2 font-bold text-center ${
                  drawerTab === 'acordo' ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50' : 'border-transparent text-text-secondary'
                }`}
              >
                <span className="flex items-center justify-center gap-1">
                  <Phone size={12} /> Registrar Acordo/Contato
                </span>
              </button>
              <button
                onClick={() => setDrawerTab('history')}
                className={`flex-1 py-2 px-3 border-b-2 font-bold text-center ${
                  drawerTab === 'history' ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50' : 'border-transparent text-text-secondary'
                }`}
              >
                <span className="flex items-center justify-center gap-1">
                  <History size={12} /> Histórico & Ocorrências
                </span>
              </button>
              <button
                onClick={() => setDrawerTab('schedule_followup')}
                className={`flex-1 py-2 px-3 border-b-2 font-bold text-center ${
                  drawerTab === 'schedule_followup' ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50' : 'border-transparent text-text-secondary'
                }`}
              >
                <span className="flex items-center justify-center gap-1">
                  <Calendar size={12} /> Agendar Retorno
                </span>
              </button>
            </div>

            {/* Content Tab container */}
            <div className="flex-1 overflow-y-auto p-3 text-xs">
              
              {drawerTab === 'acordo' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                  
                  {/* COLUNA ESQUERDA: Ações Rápidas + Envio E-mail + Modelo WhatsApp */}
                  <div className="space-y-3">
                    {/* Ações Rápidas de Cobrança */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Ações Rápidas de Cobrança</span>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={handleTudoEmUmClique}
                          disabled={loadingAction}
                          className="py-1.5 px-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-bold rounded-lg shadow-2xs hover:opacity-90 flex items-center gap-1.5 cursor-pointer text-xs"
                        >
                          <Zap size={14} className="fill-white/20" />
                          ⚡ Tudo em 1 Clique
                        </button>
                        <a
                          href={`https://wa.me/55${selectedTitle.cliente_telefone?.replace(/\D/g, '')}?text=${encodeURIComponent(getWhatsAppMessage(activeTemplate))}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="py-1.5 px-3 bg-emerald-600 text-white font-bold rounded-lg shadow-2xs hover:bg-emerald-700 flex items-center gap-1.5 cursor-pointer text-xs"
                        >
                          <MessageSquare size={14} />
                          Enviar WhatsApp
                        </a>
                        {/* Condicional: Gerar Boleto (se não existe) OU Reenviar Boleto (se existe) */}
                        {!(selectedTitle as any).nosso_numero && !(selectedTitle as any).asaas_payment_id ? (
                          <button
                            type="button"
                            onClick={handleEmitirBoletoAsaas}
                            disabled={emittingBoleto}
                            className="py-1.5 px-3 bg-white border border-slate-300 text-slate-800 font-bold rounded-lg hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer text-xs"
                          >
                            <Printer size={14} className={emittingBoleto ? 'animate-spin text-indigo-600' : 'text-slate-600'} />
                            {emittingBoleto ? 'Emitindo no Asaas...' : 'Gerar Boleto (Asaas)'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleSendEmailCobranca}
                            disabled={sendingEmail}
                            className="py-1.5 px-3 bg-blue-50 border border-blue-300 text-blue-700 font-bold rounded-lg hover:bg-blue-100 flex items-center gap-1.5 cursor-pointer text-xs"
                          >
                            <Send size={14} className={sendingEmail ? 'animate-spin' : ''} />
                            {sendingEmail ? 'Reenviando...' : 'Reenviar Boleto'}
                          </button>
                        )}
                      </div>
                      {/* Badge de boleto existente */}
                      {((selectedTitle as any).nosso_numero || (selectedTitle as any).asaas_payment_id) && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                            <Check size={10} /> Boleto Emitido — Nº {(selectedTitle as any).nosso_numero || (selectedTitle as any).asaas_payment_id}
                          </span>
                          {(selectedTitle as any).asaas_bank_slip_url && (
                            <a
                              href={(selectedTitle as any).asaas_bank_slip_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-[9px] font-bold text-blue-600 hover:text-blue-800 underline"
                            >
                              <FileDown size={10} /> Baixar PDF
                            </a>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Seção: Enviar Cobrança por E-mail */}
                    <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-3 space-y-2.5">
                      <h4 className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                        <Mail size={14} className="text-blue-600" />
                        Enviar Cobrança por E-mail
                      </h4>

                      <div className="space-y-2">
                        <div>
                          <label className="text-[9px] font-bold text-slate-500 uppercase block mb-0.5">Template</label>
                          <select
                            value={selectedTemplateId ?? ''}
                            onChange={(e) => setSelectedTemplateId(e.target.value ? Number(e.target.value) : null)}
                            className="input !py-1 !px-2 font-semibold text-xs w-full rounded border-slate-300 bg-white"
                          >
                            <option value="">Modelo Padrão de Cobrança</option>
                            {cobrancaTemplates.map((t: any) => (
                              <option key={t.id} value={t.id}>{t.nome || t.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-slate-500 uppercase block mb-0.5">E-mail Destino</label>
                          <input
                            type="email"
                            value={emailToSend}
                            onChange={(e) => setEmailToSend(e.target.value)}
                            placeholder="email@cliente.com.br"
                            className="input !py-1 !px-2 font-mono text-xs w-full rounded border-slate-300 bg-white"
                          />
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={anexarBoletoEmail}
                            onChange={(e) => setAnexarBoletoEmail(e.target.checked)}
                            className="accent-blue-600 w-3.5 h-3.5"
                          />
                          <span className="text-[10px] font-bold text-slate-700">Anexar Boleto PDF</span>
                        </label>
                        <button
                          type="button"
                          onClick={handleSendEmailCobranca}
                          disabled={sendingEmail || !emailToSend}
                          className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer text-xs disabled:opacity-50 transition-colors"
                        >
                          {sendingEmail ? (
                            <><Loader2 size={14} className="animate-spin" /> Enviando...</>
                          ) : (
                            <><Send size={14} /> Enviar E-mail de Cobrança</>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Modelo de Mensagem WhatsApp */}
                    <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-3 space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold text-slate-700 uppercase flex items-center gap-1">
                          <MessageSquare size={12} className="text-emerald-600" />
                          Modelo de Mensagem WhatsApp
                        </label>
                        <div className="flex gap-1">
                          <button type="button" onClick={() => setActiveTemplate('formal')} className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer ${activeTemplate === 'formal' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 border border-slate-300'}`}>Formal</button>
                          <button type="button" onClick={() => setActiveTemplate('amigavel')} className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer ${activeTemplate === 'amigavel' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 border border-slate-300'}`}>Amigável</button>
                          <button type="button" onClick={() => setActiveTemplate('urgente')} className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer ${activeTemplate === 'urgente' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 border border-slate-300'}`}>Urgente</button>
                        </div>
                      </div>
                      <textarea
                        rows={3}
                        value={getWhatsAppMessage(activeTemplate)}
                        readOnly
                        className="input font-mono text-[10px] bg-white border-slate-300 resize-none text-slate-800 leading-tight"
                      />
                    </div>
                  </div>

                  {/* COLUNA DIREITA: Formulário de Ocorrência + Atalhos + Botão Gravar */}
                  <form onSubmit={handleRegisterContact} className="bg-white border border-slate-200 rounded-xl p-3 space-y-3 shadow-2xs">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-700 uppercase">Canal do Contato</label>
                      <select className="input font-semibold text-xs rounded border-slate-300 bg-white" value={contactForm.tipo_contato} onChange={(e) => setContactForm({ ...contactForm, tipo_contato: e.target.value })}>
                        <option>Telefone / Ligação</option>
                        <option>WhatsApp / Chat</option>
                        <option>E-mail</option>
                        <option>Acordo Extrajudicial</option>
                        <option>Promessa de Pagamento</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-700 uppercase block">Atalhos RÁPIDOS (Clique para preencher):</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setContactForm(f => ({ ...f, observacao: 'Cliente prometeu pagamento para a nova data acordada' }))}
                          className="p-1.5 bg-slate-50 border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-left rounded text-[10px] font-bold transition-all cursor-pointer"
                        >
                          📞 Prometeu Pagamento
                        </button>
                        <button
                          type="button"
                          onClick={() => setContactForm(f => ({ ...f, observacao: 'Enviado boleto atualizado via WhatsApp com novo vencimento' }))}
                          className="p-1.5 bg-slate-50 border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-left rounded text-[10px] font-bold transition-all cursor-pointer"
                        >
                          💬 Enviado Boleto WhatsApp
                        </button>
                        <button
                          type="button"
                          onClick={() => setContactForm(f => ({ ...f, observacao: 'Solicitou prorrogação do prazo para pagamento' }))}
                          className="p-1.5 bg-slate-50 border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-left rounded text-[10px] font-bold transition-all cursor-pointer"
                        >
                          ⏳ Solicitou Prorrogação
                        </button>
                        <button
                          type="button"
                          onClick={() => setContactForm(f => ({ ...f, observacao: 'Tentativa de contato sem sucesso / telefone recado' }))}
                          className="p-1.5 bg-slate-50 border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-left rounded text-[10px] font-bold transition-all cursor-pointer"
                        >
                          ❌ Sem Sucesso / Recado
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-700 uppercase">Resumo da Conversa / Observações *</label>
                      <textarea rows={4} className="input text-xs rounded border-slate-300 bg-white resize-none" required placeholder="Descreva a negociação realizada com o cliente..." value={contactForm.observacao} onChange={(e) => setContactForm({ ...contactForm, observacao: e.target.value })} />
                    </div>

                    <button type="submit" disabled={loadingAction} className="btn-primary w-full !py-2.5 text-xs font-black shadow-md bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer flex items-center justify-center gap-1.5">
                      {loadingAction ? 'Salvando...' : 'Gravar Ocorrência & Ir para Próximo ➔'}
                    </button>
                  </form>
                </div>
              )}

              {drawerTab === 'history' && (
                <div className="space-y-5">
                  {historyRes?.agendamentos.some(a => !a.concluido) && (
                    <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-sm text-xs space-y-1">
                      <div className="font-bold text-amber-800 flex items-center gap-1"><Clock size={12} /> Retorno Programado Pendente</div>
                      {historyRes.agendamentos.filter(a => !a.concluido).map(a => (
                        <div key={a.id} className="flex justify-between items-center text-[11px] text-amber-900 mt-1">
                          <span>{new Date(a.data_agendamento).toLocaleDateString('pt-BR')}: {a.descricao}</span>
                          <button onClick={() => handleToggleAgendamentoConcluido(a)} className="text-[9px] bg-amber-500/20 px-1 py-0.2 rounded-sm font-bold hover:bg-amber-500/30 cursor-pointer">Marcar Feito</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="space-y-3">
                    <span className="text-[9px] text-text-secondary uppercase font-bold tracking-wider">Histórico de Eventos</span>
                    {(!historyRes || (historyRes.ocorrencias.length === 0 && historyRes.agendamentos.length === 0 && historyRes.automacoes.length === 0)) ? (
                      <p className="text-xs text-text-muted text-center py-8">Nenhum evento registrado para este título.</p>
                    ) : (
                      <div className="relative border-l border-divider pl-4 ml-2 space-y-4 text-xs">
                        {historyRes.ocorrencias.map(oc => (
                          <div key={oc.id} className="relative">
                            <span className="absolute -left-[21px] top-0.5 bg-brand-500 text-white rounded-full p-0.5"><User size={8} /></span>
                            <div className="font-bold text-text-primary">{oc.tipo_contato}</div>
                            <p className="text-[10px] text-text-secondary mt-0.5">{oc.observacao}</p>
                            <span className="text-[8px] text-text-muted block mt-1 font-mono">Registrado por {oc.operador} em {new Date(oc.created_at).toLocaleString('pt-BR')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {drawerTab === 'schedule_followup' && (
                <form onSubmit={handleScheduleFollowup} className="space-y-4 text-xs">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-text-secondary uppercase">Data Programada para Retorno *</label>
                    <input type="date" className="input font-mono rounded border-slate-300 bg-white" required value={followupForm.data_agendamento} onChange={(e) => setFollowupForm({ ...followupForm, data_agendamento: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-text-secondary uppercase">Objetivo do Retorno *</label>
                    <input type="text" className="input rounded border-slate-300 bg-white" required placeholder="Ex: Ligar para confirmar se o PIX prometido foi realizado..." value={followupForm.descricao} onChange={(e) => setFollowupForm({ ...followupForm, descricao: e.target.value })} />
                  </div>
                  <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                    <input type="checkbox" id="pausarAteRetorno" checked={pausarAteRetorno} onChange={(e) => setPausarAteRetorno(e.target.checked)} className="rounded border-amber-300 text-amber-600 focus:ring-amber-500 h-4 w-4 cursor-pointer" />
                    <label htmlFor="pausarAteRetorno" className="text-amber-900 font-bold text-xs cursor-pointer select-none">Pausar régua de cobrança automática até a data do retorno agendado?</label>
                  </div>
                  <button type="submit" disabled={loadingAction} className="btn-primary w-full !py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer">
                    {loadingAction ? 'Salvando...' : 'Agendar Compromisso & Mover para Agendamentos'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* BOLETO SIMULADO MODAL */}
      {showBoletoModal && selectedTitle && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Printer size={16} className="text-indigo-600" />
                Boleto Bancário Atualizado — Coliseu Transporte
              </h3>
              <button onClick={() => setShowBoletoModal(false)} className="p-1 hover:bg-slate-100 rounded text-slate-500"><X size={16} /></button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <div className="font-bold text-slate-800">{selectedTitle.cliente_nome}</div>
                <div className="text-slate-500 font-mono text-[11px]">CPF/CNPJ: {selectedTitle.cliente_documento}</div>
                <div className="text-slate-500 font-mono text-[11px]">Novo Vencimento: {new Date(novoVencimento + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
                <div className="text-indigo-700 font-bold text-sm font-mono mt-1">Valor Atualizado: {formatBRL(valorAtualizado)}</div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Linha Digitável:</label>
                <div className="p-2 bg-slate-100 border border-slate-200 rounded font-mono text-[11px] font-bold text-slate-800 break-all">{linhaDigitavel}</div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => { navigator.clipboard.writeText(linhaDigitavel); alert('Linha digitável copiada!'); }} className="btn-secondary !py-1.5 text-xs font-bold"><Copy size={12} /> Copiar Código</button>
                <button onClick={() => { alert('Imprimindo boleto...'); setShowBoletoModal(false); }} className="btn-primary !py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white"><Printer size={12} /> Imprimir Boleto</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
