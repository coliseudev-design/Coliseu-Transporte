import { useState, useEffect, useMemo } from 'react'
import { useApiQuery } from '../hooks/useApi'
import api from '../services/api'
import clsx from 'clsx'
import {
  Play, Pause, Plus, Trash2, Edit3, Search, Filter, Calendar, DollarSign,
  Clock, MessageCircle, Mail, RefreshCw, AlertTriangle, CheckCircle2,
  XCircle, User, ChevronRight, Info, Settings, ArrowRight, List, FileText, Check, X,
  Send, SlidersHorizontal, Cpu, BarChart3, Loader2, TrendingUp
} from 'lucide-react'
import { formatBRL, formatNum, formatDate } from '../utils/format'
import ModalEnvioLoteEmail from '../components/financeiro/ModalEnvioLoteEmail'

interface ParameterRule {
  id: string
  nome: string
  tipoGatilho: 'DIAS_ANTES_VENCIMENTO' | 'DIAS_DEPOIS_VENCIMENTO'
  dias: number
  templateEmailId: string
  templateWhatsappId: string
}

interface ActiveEngine {
  id: string
  nome: string
  dataInicio: string
  dataFim?: string
  parametrosIds: string[]
  meiosEnvio: 'Email' | 'WhatsApp' | 'Ambos'
  horarioEnvioStart: string
  horarioEnvioEnd: string
  diasSemana: string[] // ex: ['Mon', 'Tue', ...]
  ativo: boolean
  totalDisparos: number
  taxaSucesso: number
}

interface Template {
  id: number
  nome: string
  categoria: string
  subcategoria?: string | null
  conteudo: string
}

interface Titulo {
  id: number
  id_firebird: string | null
  descricao: string
  data_emissao: string
  data_vencimento: string
  data_pagamento: string | null
  valor: number
  valor_pago: number
  status_pagamento: string
  cliente_nome: string
  cliente_documento: string
  cliente_telefone: string | null
  dias_atraso: number
  regua_nome?: string
  regua_pausada?: boolean
}

export default function MotoresCobranca() {
  useEffect(() => {
    document.title = "Motores de Cobrança - Coliseu Transporte"
  }, [])

  const [activeTab, setActiveTab] = useState<'parameters' | 'engines' | 'manual' | 'stats'>('manual')

  // Stats state
  const [statsData, setStatsData] = useState<any[]>([])
  const [statsLoading, setStatsLoading] = useState(false)

  const loadStats = async () => {
    setStatsLoading(true)
    try {
      const res = await api.get('/campanhas/estatisticas')
      const all = res.data?.data || res.data || []
      // Filter only cobrança-related campaigns
      const cobrancaOnly = all.filter((c: any) => {
        const nome = (c.nome || '').toLowerCase()
        return /cobran|cobrança|emissão|bloqueio|lote|teste/i.test(nome)
      })
      setStatsData(cobrancaOnly)
    } catch (err) {
      console.error('[Stats] Erro ao carregar estatísticas:', err)
      setStatsData([])
    } finally {
      setStatsLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'stats') loadStats()
  }, [activeTab])

  // Real Database Queries
  const { data: templatesRes } = useApiQuery<{ data: Template[] }>('/templates')
  const templates = templatesRes?.data || []
  
  const { data: titulosRes, isLoading: isTitulosLoading, refetch: refetchTitulos } = useApiQuery<{ data: Titulo[] }>('/cobranca/titulos')
  const { data: contasRes } = useApiQuery<{ data: any[] }>('/financeiro/contas?tipo=RECEBER&status=ABERTO')

  const titulos = useMemo(() => {
    const rawCobranca = titulosRes?.data || []
    if (rawCobranca.length > 0) return rawCobranca

    const rawContas = contasRes?.data || []
    return rawContas.map(c => {
      const vencDate = c.data_vencimento ? new Date(c.data_vencimento) : new Date()
      const diffDays = Math.floor((new Date().getTime() - vencDate.getTime()) / (1000 * 3600 * 24))
      return {
        id: c.id,
        id_firebird: c.id_firebird,
        descricao: c.descricao || 'Título a Receber',
        data_emissao: c.data_emissao,
        data_vencimento: c.data_vencimento,
        data_pagamento: c.data_pagamento,
        valor: parseFloat(c.valor || 0),
        valor_pago: parseFloat(c.valor_pago || 0),
        status_pagamento: c.status_pagamento || 'ABERTO',
        cliente_nome: c.cliente || c.cliente_nome || 'Cliente',
        cliente_documento: c.cpf_cnpj || c.cliente_documento || '',
        cliente_email: String(c.cliente_email || c.email || c.email_financeiro || c.email_cobranca || c.email_nfe || '').trim(),
        email: String(c.cliente_email || c.email || c.email_financeiro || c.email_cobranca || c.email_nfe || '').trim(),
        cliente_telefone: c.telefone || c.cliente_telefone || '',
        dias_atraso: diffDays > 0 ? diffDays : 0,
        bank_slip_url: c.bank_slip_url
      }
    })
  }, [titulosRes, contasRes])

  // Filter templates by categories and content
  const whatsappTemplates = useMemo(() => {
    return templates.filter(t => 
      t.categoria?.toLowerCase().includes('whatsapp') || 
      t.categoria === 'Mensagem WhatsApp' || 
      t.subcategoria === 'cobranca'
    )
  }, [templates])

  const emailTemplates = useMemo(() => {
    return templates.filter(t => 
      t.categoria?.toLowerCase().includes('email') || 
      t.categoria === 'E-mail de Cobrança' || 
      t.categoria === 'Email Marketing' || 
      t.categoria === 'Mensagem Email' ||
      t.conteudo?.includes('<html') || 
      t.conteudo?.includes('<table') || 
      t.conteudo?.includes('<div') || 
      t.conteudo?.includes('<p') ||
      !t.categoria?.toLowerCase().includes('whatsapp')
    )
  }, [templates])

  // --- TAB 1: PARAMETERS STATE & ACTIONS ---
  const [rules, setRules] = useState<ParameterRule[]>(() => {
    const saved = localStorage.getItem('coliseu:cobranca:parameters') || localStorage.getItem('nexus:cobranca:parameters')
    return saved ? JSON.parse(saved) : [
      {
        id: '1',
        nome: 'Aviso de Vencimento (1 dia antes)',
        tipoGatilho: 'DIAS_ANTES_VENCIMENTO',
        dias: 1,
        templateEmailId: '',
        templateWhatsappId: ''
      },
      {
        id: '2',
        nome: 'Notificação de Atraso Leve (3 dias depois)',
        tipoGatilho: 'DIAS_DEPOIS_VENCIMENTO',
        dias: 3,
        templateEmailId: '',
        templateWhatsappId: ''
      }
    ]
  })

  const saveRules = (newRules: ParameterRule[]) => {
    setRules(newRules)
    localStorage.setItem('coliseu:cobranca:parameters', JSON.stringify(newRules))
  }

  const [searchRuleQuery, setSearchRuleQuery] = useState('')
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<ParameterRule | null>(null)
  const [ruleForm, setRuleForm] = useState<Omit<ParameterRule, 'id'>>({
    nome: '',
    tipoGatilho: 'DIAS_DEPOIS_VENCIMENTO',
    dias: 1,
    templateEmailId: '',
    templateWhatsappId: ''
  })

  const filteredRules = useMemo(() => {
    const q = searchRuleQuery.toLowerCase()
    return rules.filter(r => r.nome.toLowerCase().includes(q))
  }, [rules, searchRuleQuery])

  const handleOpenNewRule = () => {
    setEditingRule(null)
    setRuleForm({
      nome: '',
      tipoGatilho: 'DIAS_DEPOIS_VENCIMENTO',
      dias: 1,
      templateEmailId: emailTemplates[0]?.id.toString() || '',
      templateWhatsappId: whatsappTemplates[0]?.id.toString() || ''
    })
    setIsRuleModalOpen(true)
  }

  const handleOpenEditRule = (rule: ParameterRule) => {
    setEditingRule(rule)
    setRuleForm({
      nome: rule.nome,
      tipoGatilho: rule.tipoGatilho,
      dias: rule.dias,
      templateEmailId: rule.templateEmailId,
      templateWhatsappId: rule.templateWhatsappId
    })
    setIsRuleModalOpen(true)
  }

  const handleSaveRule = (e: React.FormEvent) => {
    e.preventDefault()
    if (editingRule) {
      const updated = rules.map(r => r.id === editingRule.id ? { ...r, ...ruleForm } : r)
      saveRules(updated)
    } else {
      const newRule: ParameterRule = {
        id: String(Date.now()),
        ...ruleForm
      }
      saveRules([...rules, newRule])
    }
    setIsRuleModalOpen(false)
  }

  const handleDeleteRule = (id: string) => {
    if (confirm('Deseja realmente excluir este parâmetro de cobrança?')) {
      const updated = rules.filter(r => r.id !== id)
      saveRules(updated)
    }
  }


  // --- TAB 2: ACTIVE ENGINES STATE & ACTIONS ---
  const [engines, setEngines] = useState<ActiveEngine[]>(() => {
    const saved = localStorage.getItem('coliseu:cobranca:engines') || localStorage.getItem('nexus:cobranca:engines')
    return saved ? JSON.parse(saved) : [
      {
        id: '1',
        nome: 'Motor Padrão PJ - Coliseu Transporte',
        dataInicio: new Date().toISOString().split('T')[0],
        parametrosIds: ['1', '2'],
        meiosEnvio: 'Ambos',
        horarioEnvioStart: '09:00',
        horarioEnvioEnd: '17:00',
        diasSemana: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        ativo: true,
        totalDisparos: 1420,
        taxaSucesso: 98.6
      }
    ]
  })

  const saveEngines = (newEngines: ActiveEngine[]) => {
    setEngines(newEngines)
    localStorage.setItem('coliseu:cobranca:engines', JSON.stringify(newEngines))
  }

  const [isEngineModalOpen, setIsEngineModalOpen] = useState(false)
  const [editingEngine, setEditingEngine] = useState<ActiveEngine | null>(null)
  const [engineForm, setEngineForm] = useState<Omit<ActiveEngine, 'id' | 'totalDisparos' | 'taxaSucesso'>>({
    nome: '',
    dataInicio: '',
    dataFim: '',
    parametrosIds: [],
    meiosEnvio: 'Ambos',
    horarioEnvioStart: '09:00',
    horarioEnvioEnd: '17:00',
    diasSemana: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    ativo: true
  })

  const handleToggleEngineStatus = (id: string) => {
    const updated = engines.map(eng => eng.id === id ? { ...eng, ativo: !eng.ativo } : eng)
    saveEngines(updated)
  }

  const handleOpenNewEngine = () => {
    setEditingEngine(null)
    setEngineForm({
      nome: '',
      dataInicio: new Date().toISOString().split('T')[0],
      dataFim: '',
      parametrosIds: rules.length > 0 ? [rules[0].id] : [],
      meiosEnvio: 'Ambos',
      horarioEnvioStart: '09:00',
      horarioEnvioEnd: '18:00',
      diasSemana: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      ativo: true
    })
    setIsEngineModalOpen(true)
  }

  const handleOpenEditEngine = (eng: ActiveEngine) => {
    setEditingEngine(eng)
    setEngineForm({
      nome: eng.nome,
      dataInicio: eng.dataInicio,
      dataFim: eng.dataFim || '',
      parametrosIds: eng.parametrosIds,
      meiosEnvio: eng.meiosEnvio,
      horarioEnvioStart: eng.horarioEnvioStart,
      horarioEnvioEnd: eng.horarioEnvioEnd,
      diasSemana: eng.diasSemana,
      ativo: eng.ativo
    })
    setIsEngineModalOpen(true)
  }

  const handleSaveEngine = (e: React.FormEvent) => {
    e.preventDefault()
    if (editingEngine) {
      const updated = engines.map(eng => eng.id === editingEngine.id ? { ...eng, ...engineForm } : eng)
      saveEngines(updated)
    } else {
      const newEngine: ActiveEngine = {
        id: String(Date.now()),
        ...engineForm,
        totalDisparos: 0,
        taxaSucesso: 100.0
      }
      saveEngines([...engines, newEngine])
    }
    setIsEngineModalOpen(false)
  }

  const handleDeleteEngine = (id: string) => {
    if (confirm('Deseja realmente excluir este motor ativo?')) {
      const updated = engines.filter(eng => eng.id !== id)
      saveEngines(updated)
    }
  }

  const handleToggleDay = (day: string) => {
    const current = engineForm.diasSemana
    if (current.includes(day)) {
      setEngineForm({ ...engineForm, diasSemana: current.filter(d => d !== day) })
    } else {
      setEngineForm({ ...engineForm, diasSemana: [...current, day] })
    }
  }

  const handleToggleParameterSelection = (paramId: string) => {
    const current = engineForm.parametrosIds
    if (current.includes(paramId)) {
      setEngineForm({ ...engineForm, parametrosIds: current.filter(id => id !== paramId) })
    } else {
      setEngineForm({ ...engineForm, parametrosIds: [...current, paramId] })
    }
  }


  // --- TAB 3: MANUAL SEND / VENCIMENTOS STATE & ACTIONS ---
  const [searchManualQuery, setSearchManualQuery] = useState('')
  const [clientFilter, setClientFilter] = useState('all')
  const [delayFilter, setDelayFilter] = useState('6-15')
  const [periodPreset, setPeriodPreset] = useState('all')
  const [startDateFilter, setStartDateFilter] = useState('')
  const [endDateFilter, setEndDateFilter] = useState('')
  const [selectedTitlesIds, setSelectedTitlesIds] = useState<number[]>([])

  const getLocalYmd = (d: Date = new Date()): string => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  const formatToYmd = (val: any): string => {
    if (!val) return ''
    if (typeof val === 'string') {
      let s = val.trim()
      if (s.includes('T')) s = s.split('T')[0]
      if (s.includes(' ')) s = s.split(' ')[0]
      if (s.includes('/')) {
        const parts = s.split('/')
        if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
      }
      return s.substring(0, 10)
    }
    if (val instanceof Date) {
      return getLocalYmd(val)
    }
    return ''
  }

  const handlePeriodPresetChange = (preset: string) => {
    setPeriodPreset(preset)
    setSelectedTitlesIds([])
    const now = new Date()
    const hojeStr = getLocalYmd(now)

    if (preset === 'hoje') {
      setStartDateFilter(hojeStr)
      setEndDateFilter(hojeStr)
    } else if (preset === 'este_mes') {
      const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const lastDayObj = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      const lastDay = getLocalYmd(lastDayObj)
      setStartDateFilter(firstDay)
      setEndDateFilter(lastDay)
    } else if (preset === 'mes_passado') {
      const prevMonthObj = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const firstDay = getLocalYmd(prevMonthObj)
      const lastDayObj = new Date(now.getFullYear(), now.getMonth(), 0)
      const lastDay = getLocalYmd(lastDayObj)
      setStartDateFilter(firstDay)
      setEndDateFilter(lastDay)
    } else if (preset === 'ultimos_30') {
      const past30Obj = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000))
      setStartDateFilter(getLocalYmd(past30Obj))
      setEndDateFilter(hojeStr)
    } else if (preset === 'all') {
      setStartDateFilter('')
      setEndDateFilter('')
    }
  }

  // Juros & Multa configurations
  const multaRate = 2.0 // 2%
  const jurosRate = 1.0 // 1% ao mês

  const getUpdatedValor = (valor: number, diasAtraso: number) => {
    if (diasAtraso <= 0) return valor
    const multa = valor * (multaRate / 100)
    const juros = valor * (jurosRate / 100) * (diasAtraso / 30)
    return valor + multa + juros
  }

  // Filter titles based on queries and selectors
  const filteredTitulos = useMemo(() => {
    const hojeStr = getLocalYmd()
    return titulos.filter(t => {
      if ((t.valor || 0) <= 0) return false;
      const st = (t.status_pagamento || '').trim().toUpperCase();
      if (['CANCELADO', 'CANCELADA', 'CANCEL', 'CAN', 'ESTORNADO', 'ESTORNADA', 'EXCLUIDO', 'EXCLUIDA', 'ANULADO', 'ANULADA', 'INATIVO', 'PAGO', 'QUITADO', 'BAIXADO', 'LIQUIDADO'].includes(st) || st.includes('CANCEL') || st.includes('ESTORN')) {
        return false;
      }
      if ((t.valor_pago || 0) >= (t.valor || 0) && (t.valor || 0) > 0) return false;
      const query = searchManualQuery.toLowerCase()
      const matchesSearch = (t.descricao || '').toLowerCase().includes(query) || 
                            (t.cliente_nome || '').toLowerCase().includes(query) ||
                            (t.id_firebird != null && String(t.id_firebird).toLowerCase().includes(query)) ||
                            (t.id != null && String(t.id).toLowerCase().includes(query))
      
      const matchesClient = clientFilter === 'all' || t.cliente_nome === clientFilter
      const vencYmd = formatToYmd(t.data_vencimento)
      
      let matchesDelay = true
      if (delayFilter === 'hoje') {
        matchesDelay = vencYmd === hojeStr || t.dias_atraso === 0
      } else if (delayFilter === 'vencendo') {
        matchesDelay = t.dias_atraso <= 0
      } else if (delayFilter === '1-5') {
        matchesDelay = t.dias_atraso >= 1 && t.dias_atraso <= 5
      } else if (delayFilter === '6-15') {
        matchesDelay = t.dias_atraso >= 6 && t.dias_atraso <= 15
      } else if (delayFilter === '16-30') {
        matchesDelay = t.dias_atraso >= 16 && t.dias_atraso <= 30
      } else if (delayFilter === '30+') {
        matchesDelay = t.dias_atraso > 30
      }

      let matchesDateRange = true
      if (startDateFilter && vencYmd) {
        matchesDateRange = matchesDateRange && vencYmd >= startDateFilter
      }
      if (endDateFilter && vencYmd) {
        matchesDateRange = matchesDateRange && vencYmd <= endDateFilter
      }

      return matchesSearch && matchesClient && matchesDelay && matchesDateRange
    })
  }, [titulos, searchManualQuery, clientFilter, delayFilter, startDateFilter, endDateFilter])

  const uniqueClients = useMemo(() => {
    const clients = new Set(titulos.map(t => t.cliente_nome))
    return Array.from(clients).sort()
  }, [titulos])

  const handleSelectAllTitles = (checked: boolean) => {
    if (checked) {
      setSelectedTitlesIds(filteredTitulos.map(t => t.id))
    } else {
      setSelectedTitlesIds([])
    }
  }

  const handleSelectOneTitle = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedTitlesIds([...selectedTitlesIds, id])
    } else {
      setSelectedTitlesIds(selectedTitlesIds.filter(tId => tId !== id))
    }
  }

  // Manual Send Modal States
  const [isManualModalOpen, setIsManualModalOpen] = useState(false)
  const [isLoteEmailModalOpen, setIsLoteEmailModalOpen] = useState(false)
  const [manualSendMode, setManualSendMode] = useState<'Email' | 'WhatsApp' | 'Ambos'>('Email')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [editedMessageText, setEditedMessageText] = useState('')
  const [isSendingManual, setIsSendingManual] = useState(false)

  // Auto interpolate for the selected items preview
  const previewData = useMemo(() => {
    if (selectedTitlesIds.length === 0) return null
    const firstTitle = titulos.find(t => t.id === selectedTitlesIds[0])
    if (!firstTitle) return null

    const updatedValor = getUpdatedValor(firstTitle.valor, firstTitle.dias_atraso)

    return {
      nome: firstTitle.cliente_nome,
      valor: formatBRL(updatedValor),
      vencimento: formatDate(firstTitle.data_vencimento),
      link: `https://transporte.coliseusistemas.com.br/boleto/${firstTitle.id_firebird || firstTitle.id}`
    }
  }, [selectedTitlesIds, titulos])

  // Look for selected template and execute text interpolation
  const activeTemplate = useMemo(() => {
    if (!selectedTemplateId) return null
    return templates.find(t => t.id.toString() === selectedTemplateId)
  }, [selectedTemplateId, templates])

  useEffect(() => {
    if (activeTemplate && previewData) {
      let content = activeTemplate.conteudo
      // Interpolate standard placeholders case-insensitively
      content = content
        .replace(/{{NOME_CLIENTE}}/gi, previewData.nome)
        .replace(/{{nome_cliente}}/gi, previewData.nome)
        .replace(/{{VALOR_TITULO}}/gi, previewData.valor)
        .replace(/{{valor_titulo}}/gi, previewData.valor)
        .replace(/{{DATA_VENCIMENTO}}/gi, previewData.vencimento)
        .replace(/{{data_vencimento}}/gi, previewData.vencimento)
        .replace(/{{LINK_PAGAMENTO}}/gi, previewData.link)
        .replace(/{{link_pagamento}}/gi, previewData.link)
      
      setEditedMessageText(content)
    } else {
      setEditedMessageText('')
    }
  }, [activeTemplate, previewData])

  const titulosParaLoteEmail = useMemo(() => {
    return titulos
      .filter(t => selectedTitlesIds.includes(t.id))
      .map((t: any) => ({
        id: t.id,
        id_firebird: t.id_firebird,
        cliente: t.cliente_nome,
        cliente_id_firebird: t.cliente_id_firebird,
        cpf_cnpj: t.cliente_documento,
        email: String(t.cliente_email || t.email || t.email_financeiro || t.cliente_email_pref || t.email_cobranca || t.email_nfe || '').trim(),
        valor: t.valor,
        data_vencimento: t.data_vencimento,
        nosso_numero: t.nosso_numero || t.numero_documento,
        bank_slip_url: t.bank_slip_url || t.asaas_bank_slip_url || t.pdf_url || t.invoice_url || '',
        asaas_payment_id: t.asaas_payment_id,
        descricao: t.descricao
      }))
  }, [titulos, selectedTitlesIds])

  const handleOpenManualSend = () => {
    if (selectedTitlesIds.length === 0) {
      alert('Selecione pelo menos um título da lista.')
      return
    }
    setManualSendMode('Email')
    setIsLoteEmailModalOpen(true)
  }

  const handleConfirmManualSend = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSendingManual(true)
    try {
      // Simulate API response flow and register occurrences
      const endpoint = '/cobranca/titulos/acao-lote'
      await api.post(endpoint, {
        ids: selectedTitlesIds,
        acao: 'Disparar Manualmente'
      })

      // Generate history updates or notes
      for (const id of selectedTitlesIds) {
        await api.post(`/cobranca/titulos/${id}/ocorrencias`, {
          tipo_contato: manualSendMode === 'Ambos' ? 'E-mail & WhatsApp' : manualSendMode,
          observacao: `Cobrança Manual enviada. Mensagem personalizada: "${editedMessageText.substring(0, 100)}..."`
        }).catch(() => {})
      }

      alert('Cobrança(s) manual(is) disparada(s) com sucesso!')
      setSelectedTitlesIds([])
      setIsManualModalOpen(false)
      refetchTitulos()
    } catch (err) {
      console.error(err)
      alert('Erro ao enviar cobrança manual.')
    } finally {
      setIsSendingManual(false)
    }
  }


  // --- RENDERS ---

  const renderTabSelector = () => (
    <div className="flex bg-bg-secondary p-1 rounded-xl border border-divider text-xs shadow-inner w-fit">
      <button
        onClick={() => setActiveTab('manual')}
        className={clsx(
          "px-4 py-2 rounded-lg font-bold transition-all cursor-pointer",
          activeTab === 'manual'
            ? 'bg-white dark:bg-bg-primary text-brand-600 shadow-md border border-divider/40'
            : 'text-text-secondary hover:text-text-primary'
        )}
      >
        <div className="flex items-center gap-1.5">
          <Send size={13} />
          Envio Manual ({filteredTitulos.length})
        </div>
      </button>
      <button
        onClick={() => setActiveTab('parameters')}
        className={clsx(
          "px-4 py-2 rounded-lg font-bold transition-all cursor-pointer",
          activeTab === 'parameters'
            ? 'bg-white dark:bg-bg-primary text-brand-600 shadow-md border border-divider/40'
            : 'text-text-secondary hover:text-text-primary'
        )}
      >
        <div className="flex items-center gap-1.5">
          <SlidersHorizontal size={13} />
          Parâmetros de Régua
        </div>
      </button>
      <button
        onClick={() => setActiveTab('engines')}
        className={clsx(
          "px-4 py-2 rounded-lg font-bold transition-all cursor-pointer",
          activeTab === 'engines'
            ? 'bg-white dark:bg-bg-primary text-brand-600 shadow-md border border-divider/40'
            : 'text-text-secondary hover:text-text-primary'
        )}
      >
        <div className="flex items-center gap-1.5">
          <Cpu size={13} />
          Motores Ativos
        </div>
      </button>
      <button
        onClick={() => setActiveTab('stats')}
        className={clsx(
          "px-4 py-2 rounded-lg font-bold transition-all cursor-pointer",
          activeTab === 'stats'
            ? 'bg-white dark:bg-bg-primary text-brand-600 shadow-md border border-divider/40'
            : 'text-text-secondary hover:text-text-primary'
        )}
      >
        <div className="flex items-center gap-1.5">
          <BarChart3 size={13} />
          Estatísticas
        </div>
      </button>
    </div>
  )

  return (
    <div className="space-y-4 pb-10">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-divider pb-2">
        <div>
          <h2 className="text-xl font-black text-text-primary tracking-tight">Motores de Cobrança</h2>
          <p className="text-xs text-text-secondary leading-tight mt-0.5">Defina réguas dinâmicas e automatize o envio de e-mails e alertas de WhatsApp</p>
        </div>
        <div>
          {renderTabSelector()}
        </div>
      </div>

      {/* TAB 1: PARAMETERS SECTION */}
      {activeTab === 'parameters' && (
        <div className="space-y-4 animate-fade-in text-xs">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 bg-bg-primary p-3 border border-divider rounded-xl shadow-xs">
            {/* Search */}
            <div className="relative w-full sm:w-80">
              <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-text-muted pointer-events-none">
                <Search size={13} />
              </span>
              <input
                type="text"
                className="input !py-1.5 !pl-8 text-xs rounded-lg"
                placeholder="Pesquisar parâmetro..."
                value={searchRuleQuery}
                onChange={(e) => setSearchRuleQuery(e.target.value)}
              />
            </div>
            
            <button
              onClick={handleOpenNewRule}
              className="btn-primary !py-1.5 !px-3.5 text-xs rounded-lg flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Plus size={14} /> Novo Parâmetro
            </button>
          </div>

          {/* Rules Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredRules.length === 0 ? (
              <div className="col-span-2 text-center py-10 bg-bg-primary border border-divider rounded-xl text-text-muted italic">
                Nenhum parâmetro de régua cadastrado. Crie um novo parâmetro para iniciar.
              </div>
            ) : (
              filteredRules.map(rule => {
                const associatedEmail = templates.find(t => t.id.toString() === rule.templateEmailId)?.nome || 'Nenhum'
                const associatedWhatsapp = templates.find(t => t.id.toString() === rule.templateWhatsappId)?.nome || 'Nenhum'

                return (
                  <div key={rule.id} className="card p-4 bg-bg-primary border border-divider rounded-xl shadow-xs hover:border-divider-hover transition-colors flex flex-col justify-between space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-extrabold text-text-primary text-sm uppercase tracking-wide">{rule.nome}</h4>
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-brand-500/10 text-brand-600 rounded-md border border-brand-500/20 text-[10px] font-black uppercase mt-1.5">
                          <Clock size={11} />
                          {rule.tipoGatilho === 'DIAS_ANTES_VENCIMENTO' 
                            ? `${rule.dias} Dia(s) Antes do Vencimento` 
                            : `${rule.dias} Dia(s) Depois do Vencimento (Atraso)`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEditRule(rule)}
                          className="p-1 text-text-secondary hover:text-text-primary hover:bg-bg-secondary rounded-md transition-all cursor-pointer border border-transparent hover:border-divider"
                          title="Editar"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="p-1 text-red-500 hover:text-red-600 hover:bg-red-500/10 rounded-md transition-all cursor-pointer border border-transparent hover:border-red-500/20"
                          title="Excluir"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <div className="bg-bg-secondary/40 border border-divider/60 rounded-lg p-2.5 space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between text-text-secondary">
                        <span className="flex items-center gap-1"><Mail size={12} /> Template de E-mail:</span>
                        <span className="font-semibold text-text-primary truncate max-w-[180px]">{associatedEmail}</span>
                      </div>
                      <div className="flex items-center justify-between text-text-secondary">
                        <span className="flex items-center gap-1"><MessageCircle size={12} /> Template de WhatsApp:</span>
                        <span className="font-semibold text-text-primary truncate max-w-[180px]">{associatedWhatsapp}</span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ACTIVE ENGINES SECTION */}
      {activeTab === 'engines' && (
        <div className="space-y-4 animate-fade-in text-xs">
          {/* Dashboard Panel */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div className="card p-3 bg-bg-primary border border-divider rounded-xl flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-lg border border-emerald-500/25">
                <Play size={16} className="fill-emerald-500/10" />
              </div>
              <div>
                <div className="text-[10px] text-text-secondary uppercase font-bold">Motores Ativos</div>
                <div className="text-lg font-black text-text-primary mt-0.5">{engines.filter(e => e.ativo).length}</div>
              </div>
            </div>

            <div className="card p-3 bg-bg-primary border border-divider rounded-xl flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 text-blue-600 rounded-lg border border-blue-500/20">
                <MessageCircle size={16} />
              </div>
              <div>
                <div className="text-[10px] text-text-secondary uppercase font-bold">Total de Envios</div>
                <div className="text-lg font-black text-text-primary mt-0.5">
                  {formatNum(engines.reduce((acc, e) => acc + e.totalDisparos, 0))}
                </div>
              </div>
            </div>

            <div className="card p-3 bg-bg-primary border border-divider rounded-xl flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 text-amber-600 rounded-lg border border-amber-500/25">
                <CheckCircle2 size={16} />
              </div>
              <div>
                <div className="text-[10px] text-text-secondary uppercase font-bold">Taxa de Sucesso</div>
                <div className="text-lg font-black text-text-primary mt-0.5">98.6%</div>
              </div>
            </div>

            <div className="card p-3 bg-bg-primary border border-divider rounded-xl flex items-center gap-3">
              <div className="p-2 bg-slate-500/10 text-slate-600 rounded-lg border border-slate-500/20">
                <Clock size={16} />
              </div>
              <div>
                <div className="text-[10px] text-text-secondary uppercase font-bold">Status do Sistema</div>
                <div className="text-lg font-black text-emerald-600 mt-0.5 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" />
                  Operando
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center bg-bg-primary p-3 border border-divider rounded-xl shadow-xs">
            <h3 className="font-extrabold text-text-primary text-xs uppercase tracking-wider">Configuração de Motores Automáticos</h3>
            <button
              onClick={handleOpenNewEngine}
              className="btn-primary !py-1.5 !px-3.5 text-xs rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={14} /> Ativar Novo Motor
            </button>
          </div>

          {/* Active Engines Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {engines.length === 0 ? (
              <div className="col-span-2 text-center py-10 bg-bg-primary border border-divider rounded-xl text-text-muted italic">
                Nenhum motor de cobrança configurado. Ative um novo para iniciar os disparos programados.
              </div>
            ) : (
              engines.map(eng => {
                const activeRulesNames = rules
                  .filter(r => eng.parametrosIds.includes(r.id))
                  .map(r => r.nome)
                  .join(', ')

                return (
                  <div key={eng.id} className="card p-4 bg-bg-primary border border-divider rounded-xl shadow-xs hover:border-divider-hover transition-colors flex flex-col justify-between space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-extrabold text-text-primary text-sm uppercase tracking-wide flex items-center gap-2">
                          {eng.nome}
                          <span className={clsx(
                            "w-2 h-2 rounded-full",
                            eng.ativo ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                          )} />
                        </h4>
                        <div className="text-[10px] text-text-secondary font-mono mt-1">
                          Início: {formatDate(eng.dataInicio)} {eng.dataFim ? `| Fim: ${formatDate(eng.dataFim)}` : ''}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {/* Toggle Ativo */}
                        <button
                          type="button"
                          onClick={() => handleToggleEngineStatus(eng.id)}
                          className={clsx(
                            "px-2.5 py-1 text-[10px] font-bold rounded-lg border transition-all cursor-pointer flex items-center gap-1",
                            eng.ativo 
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" 
                              : "bg-red-500/10 text-red-600 border-red-500/20"
                          )}
                        >
                          {eng.ativo ? <Pause size={10} /> : <Play size={10} />}
                          {eng.ativo ? 'Pausar' : 'Ativar'}
                        </button>

                        <button
                          onClick={() => handleOpenEditEngine(eng)}
                          className="p-1 text-text-secondary hover:text-text-primary hover:bg-bg-secondary rounded-md border border-transparent hover:border-divider cursor-pointer"
                          title="Editar"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteEngine(eng.id)}
                          className="p-1 text-red-500 hover:text-red-600 hover:bg-red-500/10 rounded-md border border-transparent hover:border-red-500/20 cursor-pointer"
                          title="Excluir"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Meta information */}
                    <div className="bg-bg-secondary/40 border border-divider/60 rounded-lg p-2.5 space-y-2 text-[11px]">
                      <div className="text-text-secondary leading-relaxed">
                        <strong className="text-text-primary">Regras do Motor:</strong> {activeRulesNames || 'Nenhuma'}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 border-t border-divider/50 pt-2">
                        <div>
                          <span className="text-text-secondary block">Meios de Envio:</span>
                          <span className="font-bold text-text-primary uppercase text-[10px]">{eng.meiosEnvio}</span>
                        </div>
                        <div>
                          <span className="text-text-secondary block">Horário Ativo:</span>
                          <span className="font-bold text-text-primary">{eng.horarioEnvioStart} - {eng.horarioEnvioEnd}</span>
                        </div>
                      </div>
                    </div>

                    {/* Stats summary */}
                    <div className="border-t border-divider pt-2.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                      <span>Total de Envios: {formatNum(eng.totalDisparos)}</span>
                      <span className="text-emerald-600">Taxa Sucesso: {eng.taxaSucesso}%</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 3: MANUAL SEND / VENCIMENTOS SECTION */}
      {activeTab === 'manual' && (
        <div className="space-y-4 animate-fade-in text-xs">
          {/* Filters Bar */}
          <div className="card p-3 bg-bg-primary border border-divider rounded-xl space-y-2.5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {/* Client Select */}
                <div className="flex items-center gap-1 bg-bg-secondary/40 p-0.5 rounded-lg border border-divider">
                  <span className="text-[10px] font-bold text-text-secondary uppercase px-1 whitespace-nowrap">Cliente:</span>
                  <select
                    className="bg-white dark:bg-bg-primary text-text-primary text-xs font-bold rounded-md px-2 py-1 border border-divider cursor-pointer focus:outline-none"
                    value={clientFilter}
                    onChange={(e) => {
                      setClientFilter(e.target.value)
                      setSelectedTitlesIds([])
                    }}
                  >
                    <option value="all">👥 Todos os Clientes</option>
                    {uniqueClients.map(cli => (
                      <option key={cli} value={cli}>{cli}</option>
                    ))}
                  </select>
                </div>

                {/* Unified Range & Period Filter (Sem duplicidade) */}
                <div className="flex items-center gap-1.5 bg-bg-secondary/40 p-1 rounded-lg border border-divider">
                  <span className="text-[10px] font-bold text-text-secondary uppercase px-1 whitespace-nowrap flex items-center gap-1">
                    <Calendar size={12} className="text-indigo-600" /> PERÍODO / ATRASO:
                  </span>

                  <select
                    className="bg-white dark:bg-bg-primary text-text-primary text-xs font-bold rounded-md px-2 py-1 border border-divider cursor-pointer focus:outline-none"
                    value={delayFilter !== 'all' ? delayFilter : periodPreset}
                    onChange={(e) => {
                      const val = e.target.value
                      if (['hoje', 'este_mes', 'mes_passado', 'ultimos_30', 'custom'].includes(val)) {
                        setDelayFilter('all')
                        handlePeriodPresetChange(val)
                      } else {
                        setPeriodPreset('all')
                        setStartDateFilter('')
                        setEndDateFilter('')
                        setDelayFilter(val)
                      }
                      setSelectedTitlesIds([])
                    }}
                  >
                    <option value="all">🗓️ Qualquer Faixa / Todos os Títulos</option>
                    <option value="hoje">⚡ Hoje (Vencendo Hoje)</option>
                    <option value="1-5">Atraso Leve (1-5 dias)</option>
                    <option value="6-15">Atraso Médio (6-15 dias)</option>
                    <option value="16-30">Atraso Grave (16-30 dias)</option>
                    <option value="30+">Crítico (&gt;30 dias)</option>
                    <option value="este_mes">Este Mês</option>
                    <option value="mes_passado">Mês Passado</option>
                    <option value="ultimos_30">Últimos 30 Dias</option>
                    <option value="custom">Personalizado (Escolher Datas)</option>
                  </select>

                  {(periodPreset === 'custom' || startDateFilter || endDateFilter) && (
                    <>
                      <input
                        type="date"
                        className="bg-white dark:bg-bg-primary text-text-primary text-xs font-bold rounded-md px-2 py-1 border border-divider cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        value={startDateFilter}
                        onChange={(e) => {
                          setStartDateFilter(e.target.value)
                          setPeriodPreset('custom')
                          setSelectedTitlesIds([])
                        }}
                        title="Data Início Vencimento"
                      />
                      <span className="text-[10px] text-text-muted font-bold">à</span>
                      <input
                        type="date"
                        className="bg-white dark:bg-bg-primary text-text-primary text-xs font-bold rounded-md px-2 py-1 border border-divider cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        value={endDateFilter}
                        onChange={(e) => {
                          setEndDateFilter(e.target.value)
                          setPeriodPreset('custom')
                          setSelectedTitlesIds([])
                        }}
                        title="Data Fim Vencimento"
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Reset filter helper */}
              {(clientFilter !== 'all' || delayFilter !== 'all' || startDateFilter || endDateFilter || searchManualQuery) && (
                <button
                  onClick={() => {
                    setClientFilter('all')
                    setDelayFilter('all')
                    setPeriodPreset('all')
                    setStartDateFilter('')
                    setEndDateFilter('')
                    setSearchManualQuery('')
                    setSelectedTitlesIds([])
                  }}
                  className="bg-red-500/10 text-red-600 hover:bg-red-500/20 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border border-red-500/20 transition-all cursor-pointer"
                >
                  <RefreshCw size={11} /> Limpar
                </button>
              )}
            </div>

            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-text-muted pointer-events-none">
                <Search size={13} />
              </span>
              <input
                type="text"
                className="input !py-1.5 !pl-8 text-xs rounded-lg"
                placeholder="Pesquisar por descrição, cliente ou ID do título..."
                value={searchManualQuery}
                onChange={(e) => setSearchManualQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Titles Table (Silenus standardized layout) */}
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto border border-slate-300 dark:border-slate-700 rounded-xl shadow-xs bg-white dark:bg-slate-900">
            <table className="w-full text-[11px] text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-[#e2e7ee] dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-black uppercase tracking-wider text-[10px] border-b border-slate-300 dark:border-slate-700">
                <tr>
                  <th className="py-2 px-2.5 w-12 text-center border-r border-slate-300 dark:border-slate-700">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-3.5 w-3.5"
                      checked={filteredTitulos.length > 0 && selectedTitlesIds.length === filteredTitulos.length}
                      onChange={(e) => handleSelectAllTitles(e.target.checked)}
                    />
                  </th>
                  <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 w-24">ID ERP</th>
                  <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 min-w-[180px]">CLIENTE</th>
                  <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 min-w-[160px]">DESCRIÇÃO</th>
                  <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 w-24 text-right">VALOR ORIGINAL</th>
                  <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 w-24 text-right">VALOR ATUAL</th>
                  <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 w-24 text-center">VENCIMENTO</th>
                  <th className="py-2 px-2.5 w-24 text-center">ATRASO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                {isTitulosLoading ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400 font-semibold italic">Carregando títulos vencidos do banco de dados...</td>
                  </tr>
                ) : filteredTitulos.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400 font-semibold italic">Nenhum título vencido encontrado com os filtros ativos.</td>
                  </tr>
                ) : (
                  filteredTitulos.map(item => {
                    const isSelected = selectedTitlesIds.includes(item.id)
                    const updatedValor = getUpdatedValor(item.valor, item.dias_atraso)

                    return (
                      <tr
                        key={item.id}
                        onClick={() => handleSelectOneTitle(item.id, !isSelected)}
                        className={clsx(
                          'cursor-pointer transition-colors duration-150 leading-tight',
                          isSelected ? 'bg-indigo-50/90 dark:bg-indigo-950/60 font-semibold' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        )}
                      >
                        {/* Checkbox */}
                        <td className="py-1.5 px-2.5 text-center border-r border-slate-200 dark:border-slate-800 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-3.5 w-3.5"
                            checked={isSelected}
                            onChange={(e) => handleSelectOneTitle(item.id, e.target.checked)}
                          />
                        </td>
                        
                        {/* ID */}
                        <td className="py-1.5 px-2.5 font-mono text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800 font-bold">
                          #{item.id_firebird || item.id}
                        </td>

                        {/* Cliente */}
                        <td className="py-1.5 px-2.5 font-extrabold text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800 uppercase">
                          {item.cliente_nome}
                        </td>

                        {/* Descricao */}
                        <td className="py-1.5 px-2.5 text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800 font-medium">
                          {item.descricao}
                        </td>

                        {/* Valor Original */}
                        <td className="py-1.5 px-2.5 text-right font-mono font-semibold text-slate-500 border-r border-slate-200 dark:border-slate-800">
                          {formatBRL(item.valor)}
                        </td>

                        {/* Valor Atualizado */}
                        <td className="py-1.5 px-2.5 text-right font-mono font-bold text-success border-r border-slate-200 dark:border-slate-800">
                          {formatBRL(updatedValor)}
                        </td>

                        {/* Vencimento */}
                        <td className="py-1.5 px-2.5 text-center font-mono font-bold text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800">
                          {formatDate(item.data_vencimento)}
                        </td>

                        {/* Atraso */}
                        <td className="py-1.5 px-2.5 text-center">
                          <span className={clsx(
                            "inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-black uppercase border",
                            item.dias_atraso > 30 
                              ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300'
                              : item.dias_atraso >= 6
                              ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300'
                          )}>
                            {item.dias_atraso} Dia(s)
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Floating Action Bar */}
          {selectedTitlesIds.length > 0 && (
            <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-40 bg-bg-primary/95 border border-divider shadow-2xl rounded-full px-6 py-4 flex items-center gap-6 backdrop-blur-md animate-slide-up">
              <div className="flex items-center gap-2.5">
                <div className="bg-brand-500/10 text-brand-600 p-2.5 rounded-full">
                  <User size={18} />
                </div>
                <div className="text-sm">
                  <span className="font-bold text-text-primary">{selectedTitlesIds.length}</span>
                  <span className="text-text-secondary ml-1.5">título(s) selecionado(s)</span>
                </div>
              </div>
              
              <div className="h-6 w-px bg-divider"></div>
              
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleSelectAllTitles(false)}
                  className="px-4 py-2 border border-divider hover:bg-bg-secondary rounded-full text-xs font-bold text-text-secondary transition-all cursor-pointer"
                >
                  Limpar Seleção
                </button>
                
                <button
                  onClick={handleOpenManualSend}
                  className="btn-primary py-2 px-5 text-xs flex items-center gap-1.5 border border-transparent rounded-full shadow-md hover:shadow-lg font-bold transition-all cursor-pointer"
                >
                  <ArrowRight size={14} />
                  Enviar Cobrança Manual
                </button>
              </div>
            </div>
          )}
        </div>
      )}


      {/* MODAL 1: ADD/EDIT PARAMETER RULE */}
      {isRuleModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in text-xs">
          <div className="card w-full max-w-lg p-6 bg-bg-primary animate-scale-up rounded-xl border border-divider shadow-lg">
            <div className="flex items-center justify-between border-b border-divider pb-3 mb-4">
              <h3 className="font-bold text-text-primary text-base flex items-center gap-1.5">
                <Settings size={18} className="text-brand-500" />
                {editingRule ? 'Editar Parâmetro de Cobrança' : 'Criar Parâmetro de Cobrança'}
              </h3>
              <button onClick={() => setIsRuleModalOpen(false)} className="p-1 hover:bg-bg-secondary text-text-secondary hover:text-text-primary rounded-md transition-all cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveRule} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-text-secondary uppercase">Nome do Parâmetro *</label>
                <input
                  type="text"
                  required
                  className="input !py-2.5 text-xs rounded-lg"
                  placeholder="Ex: Alerta de Vencimento 3 Dias"
                  value={ruleForm.nome}
                  onChange={(e) => setRuleForm({ ...ruleForm, nome: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Tipo de Gatilho *</label>
                  <select
                    className="input !py-2.5 text-xs rounded-lg cursor-pointer"
                    value={ruleForm.tipoGatilho}
                    onChange={(e: any) => setRuleForm({ ...ruleForm, tipoGatilho: e.target.value })}
                  >
                    <option value="DIAS_ANTES_VENCIMENTO">Dias Antes do Vencimento</option>
                    <option value="DIAS_DEPOIS_VENCIMENTO">Dias Depois do Vencimento (Atraso)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Quantidade de Dias *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    className="input !py-2.5 text-xs rounded-lg font-mono font-bold"
                    value={ruleForm.dias}
                    onChange={(e) => setRuleForm({ ...ruleForm, dias: parseInt(e.target.value, 10) || 0 })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-text-secondary uppercase">Template de E-mail *</label>
                <select
                  required
                  className="input !py-2.5 text-xs rounded-lg cursor-pointer"
                  value={ruleForm.templateEmailId}
                  onChange={(e) => setRuleForm({ ...ruleForm, templateEmailId: e.target.value })}
                >
                  <option value="">Selecione um template de e-mail...</option>
                  {emailTemplates.map(t => (
                    <option key={t.id} value={t.id}>{t.nome}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-text-secondary uppercase">Template de WhatsApp *</label>
                <select
                  required
                  className="input !py-2.5 text-xs rounded-lg cursor-pointer"
                  value={ruleForm.templateWhatsappId}
                  onChange={(e) => setRuleForm({ ...ruleForm, templateWhatsappId: e.target.value })}
                >
                  <option value="">Selecione um template de WhatsApp...</option>
                  {whatsappTemplates.map(t => (
                    <option key={t.id} value={t.id}>{t.nome}</option>
                  ))}
                </select>
              </div>

              <div className="border-t border-divider pt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRuleModalOpen(false)}
                  className="px-4 py-2 border border-divider rounded-lg hover:bg-bg-secondary text-text-secondary font-bold cursor-pointer transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary !py-2 px-4 rounded-lg font-bold cursor-pointer text-white shadow-sm"
                >
                  Salvar Parâmetro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* MODAL 2: ADD/EDIT ACTIVE ENGINE */}
      {isEngineModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in text-xs">
          <div className="card w-full max-w-2xl p-6 bg-bg-primary animate-scale-up rounded-xl border border-divider shadow-lg">
            <div className="flex items-center justify-between border-b border-divider pb-3 mb-4">
              <h3 className="font-bold text-text-primary text-base flex items-center gap-1.5">
                <RefreshCw size={18} className="text-brand-500" />
                {editingEngine ? 'Editar Motor de Cobrança' : 'Ativar Novo Motor de Cobrança'}
              </h3>
              <button onClick={() => setIsEngineModalOpen(false)} className="p-1 hover:bg-bg-secondary text-text-secondary hover:text-text-primary rounded-md transition-all cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveEngine} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-text-secondary uppercase">Nome do Motor *</label>
                <input
                  type="text"
                  required
                  className="input !py-2.5 text-xs rounded-lg"
                  placeholder="Ex: Motor Padrão PJ"
                  value={engineForm.nome}
                  onChange={(e) => setEngineForm({ ...engineForm, nome: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Data de Início *</label>
                  <input
                    type="date"
                    required
                    className="input !py-2.5 text-xs rounded-lg cursor-pointer"
                    value={engineForm.dataInicio}
                    onChange={(e) => setEngineForm({ ...engineForm, dataInicio: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Data de Fim (Opcional)</label>
                  <input
                    type="date"
                    className="input !py-2.5 text-xs rounded-lg cursor-pointer"
                    value={engineForm.dataFim}
                    onChange={(e) => setEngineForm({ ...engineForm, dataFim: e.target.value })}
                  />
                </div>
              </div>

              {/* Select parameters */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-text-secondary uppercase">Parâmetros Ativos (Múltipla Escolha) *</label>
                <div className="border border-divider rounded-lg p-3 bg-bg-secondary/20 max-h-32 overflow-y-auto space-y-2">
                  {rules.length === 0 ? (
                    <span className="text-text-muted italic text-[11px]">Nenhum parâmetro de régua cadastrado ainda.</span>
                  ) : (
                    rules.map(rule => (
                      <label key={rule.id} className="flex items-center gap-2 cursor-pointer font-medium text-text-primary text-[11px]">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-3.5 w-3.5"
                          checked={engineForm.parametrosIds.includes(rule.id)}
                          onChange={() => handleToggleParameterSelection(rule.id)}
                        />
                        {rule.nome}
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Meios de Envio */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Canais de Envio *</label>
                  <select
                    className="input !py-2.5 text-xs rounded-lg cursor-pointer"
                    value={engineForm.meiosEnvio}
                    onChange={(e: any) => setEngineForm({ ...engineForm, meiosEnvio: e.target.value })}
                  >
                    <option value="Email">📧 E-mail</option>
                    <option value="WhatsApp">📲 WhatsApp</option>
                    <option value="Ambos">🌐 Ambos (E-mail &amp; WhatsApp)</option>
                  </select>
                </div>

                {/* Horário */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Horário de Envio Automático *</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      required
                      placeholder="09:00"
                      className="input !py-2.5 text-center text-xs rounded-lg font-mono font-semibold flex-1"
                      value={engineForm.horarioEnvioStart}
                      onChange={(e) => setEngineForm({ ...engineForm, horarioEnvioStart: e.target.value })}
                    />
                    <span className="text-text-muted">até</span>
                    <input
                      type="text"
                      required
                      placeholder="18:00"
                      className="input !py-2.5 text-center text-xs rounded-lg font-mono font-semibold flex-1"
                      value={engineForm.horarioEnvioEnd}
                      onChange={(e) => setEngineForm({ ...engineForm, horarioEnvioEnd: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Days of week checklist */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-text-secondary uppercase">Dias da Semana Permitidos *</label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => {
                    const isSelected = engineForm.diasSemana.includes(day)
                    const labelMap: Record<string, string> = {
                      Mon: 'Seg', Tue: 'Ter', Wed: 'Qua', Thu: 'Qui', Fri: 'Sex', Sat: 'Sáb', Sun: 'Dom'
                    }

                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => handleToggleDay(day)}
                        className={clsx(
                          "px-3 py-1.5 rounded-lg border font-bold text-xs transition-all cursor-pointer",
                          isSelected
                            ? "bg-brand-500/10 text-brand-600 border-brand-500/20 shadow-xs"
                            : "bg-bg-secondary/40 text-text-secondary border-divider hover:bg-bg-secondary"
                        )}
                      >
                        {labelMap[day]}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="border-t border-divider pt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEngineModalOpen(false)}
                  className="px-4 py-2 border border-divider rounded-lg hover:bg-bg-secondary text-text-secondary font-bold cursor-pointer transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={engineForm.parametrosIds.length === 0 || engineForm.diasSemana.length === 0}
                  className="btn-primary !py-2 px-4 rounded-lg font-bold cursor-pointer text-white shadow-sm"
                >
                  Salvar Motor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* MODAL 3: MANUAL SEND ACTION WIZARD */}
      {isManualModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in text-xs">
          <div className="card w-full max-w-3xl p-6 bg-bg-primary animate-scale-up rounded-xl border border-divider shadow-lg">
            <div className="flex items-center justify-between border-b border-divider pb-3 mb-4">
              <h3 className="font-bold text-text-primary text-base flex items-center gap-1.5">
                <ArrowRight size={18} className="text-brand-500" />
                Enviar Cobrança Manual ({selectedTitlesIds.length} título(s))
              </h3>
              <button onClick={() => setIsManualModalOpen(false)} className="p-1 hover:bg-bg-secondary text-text-secondary hover:text-text-primary rounded-md transition-all cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleConfirmManualSend} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Wizard Inputs */}
                <div className="space-y-4 flex flex-col justify-between">
                  <div className="space-y-4">
                    {/* Send Channel */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-text-secondary uppercase">Meio de Envio *</label>
                      <div className="grid grid-cols-3 gap-2 bg-bg-secondary p-1 rounded-lg border border-divider">
                        <button
                          type="button"
                          onClick={() => {
                            setManualSendMode('WhatsApp')
                            setSelectedTemplateId(whatsappTemplates[0]?.id.toString() || '')
                          }}
                          className={clsx(
                            'py-2 px-3 rounded-md text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer',
                            manualSendMode === 'WhatsApp' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 shadow-xs' : 'text-text-secondary hover:text-text-primary'
                          )}
                        >
                          <MessageCircle size={13} />
                          WhatsApp
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setManualSendMode('Email')
                            setSelectedTemplateId(emailTemplates[0]?.id.toString() || '')
                          }}
                          className={clsx(
                            'py-2 px-3 rounded-md text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer',
                            manualSendMode === 'Email' ? 'bg-blue-500/10 text-blue-600 border border-blue-500/20 shadow-xs' : 'text-text-secondary hover:text-text-primary'
                          )}
                        >
                          <Mail size={13} />
                          E-mail
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setManualSendMode('Ambos')
                            setSelectedTemplateId(whatsappTemplates[0]?.id.toString() || '')
                          }}
                          className={clsx(
                            'py-2 px-3 rounded-md text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer',
                            manualSendMode === 'Ambos' ? 'bg-slate-500/10 text-slate-600 border border-slate-500/20 shadow-xs' : 'text-text-secondary hover:text-text-primary'
                          )}
                        >
                          <Info size={13} />
                          Ambos
                        </button>
                      </div>
                    </div>

                    {/* Template selection */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-text-secondary uppercase">Template de Mensagem *</label>
                      <select
                        required
                        className="input !py-2.5 text-xs rounded-lg cursor-pointer"
                        value={selectedTemplateId}
                        onChange={(e) => setSelectedTemplateId(e.target.value)}
                      >
                        <option value="">Selecione um template...</option>
                        {(manualSendMode === 'Email' ? emailTemplates : whatsappTemplates).map(t => (
                          <option key={t.id} value={t.id}>{t.nome}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Wizard footer */}
                  <div className="border-t border-divider pt-4 mt-auto space-y-2.5">
                    <div className="flex justify-between items-center text-xs text-text-secondary font-semibold">
                      <span>Destinatários selecionados:</span>
                      <span className="font-bold text-brand-600">{selectedTitlesIds.length}</span>
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsManualModalOpen(false)}
                        className="px-4 py-2 border border-divider rounded-lg hover:bg-bg-secondary text-text-secondary font-bold cursor-pointer transition-all"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={isSendingManual || !selectedTemplateId}
                        className="btn-primary !py-2 px-4 rounded-lg font-bold cursor-pointer text-white flex items-center gap-1.5 shadow-sm"
                      >
                        {isSendingManual ? (
                          <>
                            <RefreshCw size={12} className="animate-spin" /> Disparando...
                          </>
                        ) : (
                          <>
                            <ArrowRight size={12} /> Confirmar &amp; Enviar
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Interactive Message Preview & Live Editor */}
                <div className="flex flex-col space-y-2 h-full">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Pré-visualização e Edição Personalizada</label>
                  <div className="flex-1 bg-bg-secondary p-4 rounded-xl border border-divider flex flex-col min-h-[260px]">
                    <span className="text-[9px] text-text-muted uppercase font-bold mb-2 block border-b border-divider pb-1">
                      Edição Livre da Mensagem (As variáveis já foram preenchidas)
                    </span>
                    
                    {selectedTemplateId ? (
                      <textarea
                        className="flex-1 w-full bg-transparent border-0 outline-none resize-none font-mono text-[11px] text-text-secondary leading-relaxed focus:ring-0"
                        value={editedMessageText}
                        onChange={(e) => setEditedMessageText(e.target.value)}
                        placeholder="Edite a mensagem aqui..."
                      />
                    ) : (
                      <p className="text-xs text-text-muted italic text-center my-auto">
                        Selecione um template para visualizar o conteúdo interpolado.
                      </p>
                    )}
                  </div>
                </div>

              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 4: ESTATÍSTICAS DE COBRANÇA */}
      {activeTab === 'stats' && (
        <div className="space-y-4">
          {/* KPI Cards */}
          {(() => {
            const totalEnviados = statsData.reduce((sum, c) => sum + (Number(c.total_enviados) || 0), 0)
            const totalSucesso = statsData.reduce((sum, c) => sum + (Number(c.sucessos) || 0), 0)
            const totalFalha = statsData.reduce((sum, c) => sum + (Number(c.falhas) || 0), 0)
            const taxaSucesso = totalEnviados > 0 ? ((totalSucesso / totalEnviados) * 100).toFixed(1) : '0.0'
            return (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white dark:bg-bg-secondary border border-divider rounded-xl p-4 shadow-2xs">
                  <div className="flex items-center gap-2 mb-1">
                    <Send size={16} className="text-blue-500" />
                    <span className="text-[10px] font-bold text-text-secondary uppercase">Total Enviados</span>
                  </div>
                  <span className="text-2xl font-black text-text-primary">{totalEnviados.toLocaleString('pt-BR')}</span>
                </div>
                <div className="bg-white dark:bg-bg-secondary border border-divider rounded-xl p-4 shadow-2xs">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 size={16} className="text-emerald-500" />
                    <span className="text-[10px] font-bold text-text-secondary uppercase">Sucesso</span>
                  </div>
                  <span className="text-2xl font-black text-emerald-600">{totalSucesso.toLocaleString('pt-BR')}</span>
                </div>
                <div className="bg-white dark:bg-bg-secondary border border-divider rounded-xl p-4 shadow-2xs">
                  <div className="flex items-center gap-2 mb-1">
                    <XCircle size={16} className="text-red-500" />
                    <span className="text-[10px] font-bold text-text-secondary uppercase">Falha</span>
                  </div>
                  <span className="text-2xl font-black text-red-600">{totalFalha.toLocaleString('pt-BR')}</span>
                </div>
                <div className="bg-white dark:bg-bg-secondary border border-divider rounded-xl p-4 shadow-2xs">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp size={16} className="text-indigo-500" />
                    <span className="text-[10px] font-bold text-text-secondary uppercase">Taxa Sucesso</span>
                  </div>
                  <span className="text-2xl font-black text-indigo-600">{taxaSucesso}%</span>
                </div>
              </div>
            )
          })()}

          {/* Tabela de Campanhas */}
          <div className="bg-white dark:bg-bg-secondary border border-divider rounded-xl shadow-2xs overflow-hidden">
            <div className="flex justify-between items-center px-4 py-3 border-b border-divider">
              <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                <BarChart3 size={16} className="text-brand-500" />
                Campanhas de Cobrança
              </h3>
              <button
                type="button"
                onClick={loadStats}
                disabled={statsLoading}
                className="px-3 py-1.5 text-xs font-bold bg-bg-tertiary border border-divider text-text-secondary hover:text-text-primary rounded-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={12} className={statsLoading ? 'animate-spin' : ''} />
                Atualizar
              </button>
            </div>

            {statsLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={24} className="animate-spin text-brand-500" />
                <span className="ml-2 text-sm text-text-secondary">Carregando estatísticas...</span>
              </div>
            ) : statsData.length === 0 ? (
              <div className="text-center py-16 text-text-muted text-sm">
                <BarChart3 size={32} className="mx-auto mb-2 opacity-30" />
                <p className="font-bold">Nenhuma campanha de cobrança encontrada</p>
                <p className="text-xs mt-1">As estatísticas aparecerão aqui após enviar cobranças por e-mail</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-bg-tertiary text-text-secondary uppercase text-[10px] font-bold">
                      <th className="px-4 py-2.5 text-left">Data</th>
                      <th className="px-4 py-2.5 text-left">Canal</th>
                      <th className="px-4 py-2.5 text-left">Campanha</th>
                      <th className="px-4 py-2.5 text-center">Enviados</th>
                      <th className="px-4 py-2.5 text-center">Sucesso</th>
                      <th className="px-4 py-2.5 text-center">Falha</th>
                      <th className="px-4 py-2.5 text-center">Taxa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-divider">
                    {statsData.map((c: any, idx: number) => {
                      const total = Number(c.total_enviados) || 0
                      const sucesso = Number(c.sucessos) || 0
                      const falha = Number(c.falhas) || 0
                      const taxa = total > 0 ? ((sucesso / total) * 100).toFixed(0) : '0'
                      return (
                        <tr key={c.id || idx} className="hover:bg-bg-secondary/50 transition-colors">
                          <td className="px-4 py-2.5 font-mono text-text-secondary">{formatDate(c.created_at)}</td>
                          <td className="px-4 py-2.5">
                            <span className={clsx(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold",
                              (c.canal || '').toUpperCase() === 'EMAIL'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-emerald-100 text-emerald-700'
                            )}>
                              {(c.canal || '').toUpperCase() === 'EMAIL' ? <Mail size={10} /> : <MessageCircle size={10} />}
                              {c.canal || 'EMAIL'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-bold text-text-primary max-w-[260px] truncate">{c.nome}</td>
                          <td className="px-4 py-2.5 text-center font-mono font-bold">{total}</td>
                          <td className="px-4 py-2.5 text-center font-mono font-bold text-emerald-600">{sucesso}</td>
                          <td className="px-4 py-2.5 text-center font-mono font-bold text-red-500">{falha}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={clsx(
                              "font-mono font-bold",
                              Number(taxa) >= 80 ? 'text-emerald-600' : Number(taxa) >= 50 ? 'text-amber-600' : 'text-red-600'
                            )}>
                              {taxa}%
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Envio de Cobrança por E-mail em Lote */}
      <ModalEnvioLoteEmail
        isOpen={isLoteEmailModalOpen}
        titulos={titulosParaLoteEmail}
        templates={emailTemplates.length > 0 ? emailTemplates : templates}
        onClose={() => setIsLoteEmailModalOpen(false)}
        onCompleted={() => {
          setIsLoteEmailModalOpen(false)
          setSelectedTitlesIds([])
          refetchTitulos()
        }}
      />

    </div>
  )
}
