import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApiQuery } from '../hooks/useApi'
import api from '../services/api'
import clsx from 'clsx'
import {
  Send, Users, FileText, CheckCircle2, XCircle, Search, Filter, Play, Check, X,
  Clock, RefreshCw, AlertTriangle, Layers, Calendar, ChevronRight, ShoppingBag,
  MapPin, User, Package, Tag, MessageCircle, Plus, Settings, Trash2, Pause, Loader2, Mail,
  ShieldCheck, ChevronDown, CheckSquare, Sparkles, Cpu, FileCode, BarChart3, Eye,
  MousePointerClick, ExternalLink, MailOpen, TrendingUp, Globe
} from 'lucide-react'

interface AudienceMember {
  codigo: number;
  nome: string;
  telefone: string;
  celular_secundario?: string | null;
  email?: string | null;
  email_financeiro?: string | null;
  documento?: string | null;
  saldo_devedor?: number;
  cidade: string;
  estado: string;
  origem: 'Cliente' | 'Fornecedor' | 'Lead';
  estagio: string | null;
  aniversario: string;
  ultimo_envio?: string | null;
  tem_whatsapp?: boolean;
  tem_whatsapp_primario?: boolean;
  tem_whatsapp_secundario?: boolean;
  tem_email?: boolean;
  usa_nfe?: string;
  usa_nfce?: string;
  usa_nfse?: string;
  usa_mdfe?: string;
  usa_cte?: string;
  usa_sped?: string;
  usa_boleto?: string;
  usa_folha?: string;
  usa_whats?: string;
  usa_pix?: string;
  usa_cobranca?: string;
  usa_pontuacao?: string;
  usa_os?: string;
  usa_sales?: string;
  usa_dash?: string;
  usa_coletor?: string;
  softwares?: any;
  certificado_vencimento_br?: string | null;
  certificado_dias_restantes?: number | null;
  certificado_vencido?: boolean;
  tem_certificado?: boolean;
}

export const AVAILABLE_MODULES = [
  { key: 'usa_nfe', label: 'NFe (Nota Fiscal Eletrônica)', short: 'NFe' },
  { key: 'usa_nfce', label: 'NFCe (Cupom Fiscal)', short: 'NFCe' },
  { key: 'usa_nfse', label: 'NFSe (Nota de Serviços)', short: 'NFSe' },
  { key: 'usa_mdfe', label: 'MDFe (Manifesto)', short: 'MDFe' },
  { key: 'usa_cte', label: 'CTe (Transporte)', short: 'CTe' },
  { key: 'usa_sped', label: 'SPED Fiscal / Contribuições', short: 'SPED' },
  { key: 'usa_boleto', label: 'Boleto Bancário', short: 'Boleto' },
  { key: 'usa_folha', label: 'Folha de Pagamento', short: 'Folha' },
  { key: 'usa_whats', label: 'Envio Orçamento WhatsApp', short: 'WhatsApp' },
  { key: 'usa_pix', label: 'PIX Integrado', short: 'PIX' },
  { key: 'usa_cobranca', label: 'Régua de Cobrança', short: 'Régua' },
  { key: 'usa_pontuacao', label: 'Pontuação / Fidelidade', short: 'Pontos' },
  { key: 'usa_os', label: 'Ordem de Serviço (OS)', short: 'OS' },
  { key: 'usa_sales', label: 'Módulo Sales (Vendas)', short: 'Sales' },
  { key: 'usa_dash', label: 'Dashboard & BI Mobile', short: 'BI/Dash' },
  { key: 'usa_coletor', label: 'Coletor de Dados', short: 'Coletor' },
];

interface Campaign {
  id: number;
  nome: string;
  created_at: string;
  template_nome: string;
  sucessos: number;
  falhas: number;
}

interface Template {
  id: number;
  nome: string;
  categoria: string;
  subcategoria?: string | null;
  conteudo: string;
  imagem_url?: string | null;
}

interface LogItem {
  nome: string;
  telefone: string;
  status: 'Sucesso' | 'Falha';
  erro: string | null;
}

// Helper functions for masking and validation
const formatNiverInput = (value: string) => {
  let clean = value.replace(/\D/g, '').slice(0, 4);
  
  if (clean.length > 0) {
    const d1 = clean[0];
    if (!['0', '1', '2', '3'].includes(d1)) {
      clean = '';
    }
  }
  if (clean.length > 1) {
    const day = parseInt(clean.slice(0, 2), 10);
    if (day < 1 || day > 31) {
      clean = clean[0];
    }
  }
  if (clean.length > 2) {
    const m1 = clean[2];
    if (!['0', '1'].includes(m1)) {
      clean = clean.slice(0, 2);
    }
  }
  if (clean.length > 3) {
    const month = parseInt(clean.slice(2, 4), 10);
    if (month < 1 || month > 12) {
      clean = clean.slice(0, 3);
    }
  }

  if (clean.length > 2) {
    return `${clean.slice(0, 2)}/${clean.slice(2)}`;
  }
  return clean;
};

const formatDateInput = (value: string) => {
  let clean = value.replace(/\D/g, '').slice(0, 8);

  if (clean.length > 0) {
    const d1 = clean[0];
    if (!['0', '1', '2', '3'].includes(d1)) {
      clean = '';
    }
  }
  if (clean.length > 1) {
    const day = parseInt(clean.slice(0, 2), 10);
    if (day < 1 || day > 31) {
      clean = clean[0];
    }
  }
  if (clean.length > 2) {
    const m1 = clean[2];
    if (!['0', '1'].includes(m1)) {
      clean = clean.slice(0, 2);
    }
  }
  if (clean.length > 3) {
    const month = parseInt(clean.slice(2, 4), 10);
    if (month < 1 || month > 12) {
      clean = clean.slice(0, 3);
    }
  }

  if (clean.length > 4) {
    return `${clean.slice(0, 2)}/${clean.slice(2, 4)}/${clean.slice(4)}`;
  } else if (clean.length > 2) {
    return `${clean.slice(0, 2)}/${clean.slice(2)}`;
  }
  return clean;
};

const isValidNiverString = (val: string) => {
  if (!val) return true;
  if (val.length < 5) return false;
  const [dStr, mStr] = val.split('/');
  const d = parseInt(dStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(d) || isNaN(m)) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  
  const daysInMonth = new Date(2023, m, 0).getDate();
  return d <= daysInMonth;
};

const isValidDateString = (val: string) => {
  if (!val) return true;
  if (val.length < 10) return false;
  const [dStr, mStr, yStr] = val.split('/');
  const d = parseInt(dStr, 10);
  const m = parseInt(mStr, 10);
  const y = parseInt(yStr, 10);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  if (yStr.length < 4) return false;
  
  const daysInMonth = new Date(y, m, 0).getDate();
  return d <= daysInMonth;
};

const translateToYMD = (val: string) => {
  if (!val || val.length < 10) return undefined;
  const [d, m, y] = val.split('/');
  if (d && m && y && y.length === 4) {
    return `${y}-${m}-${d}`;
  }
  return undefined;
};

export default function MarketingMassa() {
  const navigate = useNavigate()
  useEffect(() => {
    document.title = "Marketing em Massa - Coliseu Transporte"
  }, [])
  const [activeTab, setActiveTab] = useState<'manual' | 'auto' | 'history' | 'ocorrencias' | 'estatisticas'>('manual')
  
  // Refs for date picker inputs
  const comprouDeRef = useRef<HTMLInputElement>(null)
  const comprouAteRef = useRef<HTMLInputElement>(null)
  
  // Create Campaign State
  const [campaignName, setCampaignName] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  // Default to 'cliente' (Clientes Ativos como padrão)
  const [audienceFilter, setAudienceFilter] = useState<string>('cliente')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDestinations, setSelectedDestinations] = useState<AudienceMember[]>([])

  // Filter ONLY recipients with open balance (Saldo devedor)
  const [apenasComSaldo, setApenasComSaldo] = useState<boolean>(false)

  // Dynamic Module Filter & Certificate Filter State
  const [selectedModules, setSelectedModules] = useState<string[]>([])
  const [certFilter, setCertFilter] = useState<string>('all')
  const [isModuleDropdownOpen, setIsModuleDropdownOpen] = useState<boolean>(false)
  const moduleDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (moduleDropdownRef.current && !moduleDropdownRef.current.contains(event.target as Node)) {
        setIsModuleDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Dispatch Channel Mode: WhatsApp vs Email Marketing Batch
  const [channelMode, setChannelMode] = useState<'whatsapp' | 'email'>('whatsapp')

  // Advanced Filters State
  const [cidade, setCidade] = useState('all')
  const [vendedorId, setVendedorId] = useState('all')
  const [produto, setProduto] = useState('all')
  const [marca, setMarca] = useState('all')
  const [comprouDe, setComprouDe] = useState('')
  const [comprouAte, setComprouAte] = useState('')
  const [niverDe, setNiverDe] = useState('')
  const [niverAte, setNiverAte] = useState('')

  // Advanced Filters Visibility State
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(true)

  // Selection Mode: 'unsent' (only clients not contacted today) or 'all' (everyone)
  const [selectionMode, setSelectionMode] = useState<'unsent' | 'all'>('unsent')

  // Only validated WhatsApp filter state
  const [onlyWhatsApp, setOnlyWhatsApp] = useState(false)

  // Campaign Config Modal State
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false)

  // Automation States
  const { data: automacoesRes, refetch: refetchAutomacoes } = useApiQuery<{ data: any[] }>('/automacoes')
  const automacoes = automacoesRes?.data || []
  const marketingAutomations = automacoes.filter(a => a.template_subcategoria === 'marketing')

  // Queries
  const { data: configRes } = useApiQuery<{ data: { whatsapp_permitir_multiplos_envios_dia?: boolean } }>('/configuracoes/integracoes')
  const permitiMultiplosEnvios = configRes?.data?.whatsapp_permitir_multiplos_envios_dia || false

  const { data: templatesRes } = useApiQuery<{ data: Template[] }>('/templates')
  const templates = templatesRes?.data || []
  const whatsappTemplates = templates.filter(t => t.categoria === 'Mensagem WhatsApp' && t.subcategoria === 'marketing')
  const emailTemplates = templates.filter(t => (t.categoria === 'E-mail de Cobrança' || t.categoria === 'Mensagem Email' || t.categoria === 'Email Marketing' || !t.categoria.includes('WhatsApp')) && t.subcategoria === 'marketing')

  // Auto Config Modal States
  const [isAutoModalOpen, setIsAutoModalOpen] = useState(false)
  const [selectedAuto, setSelectedAuto] = useState<any | null>(null)
  const [autoTemplateId, setAutoTemplateId] = useState('')
  const [autoTempoSegundos, setAutoTempoSegundos] = useState('86400') // 1 dia padrão (86400s)

  // New Automation States
  const [isMarketingSettingsOpen, setIsMarketingSettingsOpen] = useState(false)
  const [isRunningMarketing, setIsRunningMarketing] = useState(false)

  // Periodic state
  const [periodicActive, setPeriodicActive] = useState(false)
  const [periodicTemplateId, setPeriodicTemplateId] = useState('')
  const [periodicDelay, setPeriodicDelay] = useState(86400)

  // Birthday state
  const [birthdayActive, setBirthdayActive] = useState(false)
  const [birthdayTemplateId, setBirthdayTemplateId] = useState('')

  // Post-Purchase state
  const [postPurchaseActive, setPostPurchaseActive] = useState(false)
  const [postPurchaseTemplateId, setPostPurchaseTemplateId] = useState('')
  const [postPurchaseDelay, setPostPurchaseDelay] = useState(86400)
  const [postPurchaseDelayUnit, setPostPurchaseDelayUnit] = useState<'seconds' | 'days'>('seconds')

  // Brand X state
  const [brandXActive, setBrandXActive] = useState(false)
  const [brandXTemplateId, setBrandXTemplateId] = useState('')
  const [brandXName, setBrandXName] = useState('Coliseu')

  const [isQuickAutoModalOpen, setIsQuickAutoModalOpen] = useState(false)
  const [togglingGatilho, setTogglingGatilho] = useState<string | null>(null)

  const marketingTriggers = ['tempo_em_tempo', 'aniversario', 'pos_compra', 'compra_marca']
  const marketingRules = automacoes.filter(a => marketingTriggers.includes(a.gatilho))
  const activeMarketingRulesCount = marketingRules.filter(a => a.ativo).length
  const isMarketingAutoActive = activeMarketingRulesCount > 0

  const handleToggleSingleTrigger = async (gatilho: string) => {
    setTogglingGatilho(gatilho)
    try {
      const existing = automacoes.find(a => a.gatilho === gatilho)
      if (existing) {
        await api.put(`/automacoes/${existing.id}`, {
          ativo: !existing.ativo
        })
      } else {
        const defaultTemplate = whatsappTemplates[0]?.id
        await api.post('/automacoes', {
          gatilho,
          template_id: defaultTemplate || null,
          ativo: true,
          canal: 'whatsapp',
          tempo_segundos: gatilho === 'tempo_em_tempo' || gatilho === 'pos_compra' ? 86400 : 0,
          meta: gatilho === 'compra_marca' ? { marca: 'Coliseu' } : {}
        })
      }
      await refetchAutomacoes()
    } catch (err) {
      console.error(err)
      alert('Erro ao alterar status do módulo.')
    } finally {
      setTogglingGatilho(null)
    }
  }

  // Toggle ALL marketing automations on/off at once
  const [isTogglingAll, setIsTogglingAll] = useState(false)
  const handleToggleAllMarketing = async (novoAtivo: boolean) => {
    setIsTogglingAll(true)
    try {
      await api.post('/automacoes/toggle-all', {
        ativo: novoAtivo,
        subcategoria: 'marketing'
      })
      await refetchAutomacoes()
    } catch (err) {
      console.error(err)
      alert('Erro ao alterar status de todas as automações.')
    } finally {
      setIsTogglingAll(false)
    }
  }

  const handleRunMarketingNow = async () => {
    setIsRunningMarketing(true)
    try {
      await api.post("/automacoes/run", { subcategoria: "marketing" })
      alert("Automações de Marketing disparadas com sucesso!")
    } catch (err) {
      console.error(err)
      alert("Erro ao disparar automações de marketing.")
    } finally {
      setIsRunningMarketing(false)
    }
  }

  // Estatísticas & Tracking de Campanhas Query and State
  const [statsChannelFilter, setStatsChannelFilter] = useState<'all' | 'email' | 'whatsapp'>('all')
  const { data: statsRes, refetch: refetchStats, isLoading: isLoadingStats } = useApiQuery<{ data: any[] }>('/campanhas/estatisticas')
  const statsList = statsRes?.data || []
  
  const filteredStatsList = useMemo(() => {
    if (statsChannelFilter === 'all') return statsList
    return statsList.filter(c => (c.canal || 'WHATSAPP').toLowerCase() === statsChannelFilter.toLowerCase())
  }, [statsList, statsChannelFilter])

  // Detailed Recipient Tracking Modal ("Quem Abriu")
  const [selectedStatsCampaign, setSelectedStatsCampaign] = useState<any | null>(null)
  const [trackingDestinatarios, setTrackingDestinatarios] = useState<any[]>([])
  const [loadingTracking, setLoadingTracking] = useState(false)
  const [trackingSearch, setTrackingSearch] = useState('')
  const [trackingFilter, setTrackingFilter] = useState<'all' | 'abertos' | 'nao_abertos' | 'clicados' | 'erros'>('all')

  const handleOpenTrackingModal = async (campaign: any) => {
    setSelectedStatsCampaign(campaign)
    setTrackingSearch('')
    setTrackingFilter('all')
    setLoadingTracking(true)
    try {
      const res = await api.get(`/campanhas/${campaign.id}/tracking-destinatarios`)
      setTrackingDestinatarios(res.data?.data || [])
    } catch (err) {
      console.error(err)
      alert('Erro ao carregar lista de destinatários.')
    } finally {
      setLoadingTracking(false)
    }
  }

  const filteredTrackingDestinatarios = useMemo(() => {
    let list = trackingDestinatarios
    if (trackingSearch) {
      const q = trackingSearch.toLowerCase()
      list = list.filter(d => 
        (d.destinatario_nome || '').toLowerCase().includes(q) ||
        (d.destinatario_email || '').toLowerCase().includes(q) ||
        (d.destinatario_telefone || '').includes(q)
      )
    }
    if (trackingFilter === 'abertos') {
      list = list.filter(d => d.aberto || d.total_aberturas > 0)
    } else if (trackingFilter === 'nao_abertos') {
      list = list.filter(d => !d.aberto && (!d.total_aberturas || d.total_aberturas === 0) && d.status !== 'Falha' && !d.erro)
    } else if (trackingFilter === 'clicados') {
      list = list.filter(d => d.total_cliques > 0)
    } else if (trackingFilter === 'erros') {
      list = list.filter(d => d.status === 'Falha' || !!d.erro)
    }
    return list
  }, [trackingDestinatarios, trackingSearch, trackingFilter])

  // Ocorrências logs query and filter state
  const [logFilter, setLogFilter] = useState<'all' | 'marketing' | 'cobranca' | 'pos_venda'>('all')
  const { data: logsRes, refetch: refetchLogs } = useApiQuery<{ data: any[] }>('/automacoes/logs')
  const logs = logsRes?.data || []
  const filteredLogs = useMemo(() => {
    if (logFilter === 'all') return logs
    return logs.filter(l => l.subcategoria === logFilter)
  }, [logs, logFilter])

  // Trigger Template and Active state updates
  const handleUpdateTriggerTemplate = async (gatilho: string, templateIdVal: string, existing: any) => {
    if (!templateIdVal) return;
    const templateId = parseInt(templateIdVal, 10);
    try {
      if (existing) {
        await api.put(`/automacoes/${existing.id}`, {
          template_id: templateId
        })
      } else {
        await api.post('/automacoes', {
          gatilho,
          template_id: templateId,
          ativo: false
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

  useEffect(() => {
    const periodic = automacoes.find(a => a.gatilho === 'tempo_em_tempo')
    if (periodic) {
      setPeriodicActive(periodic.ativo)
      setPeriodicTemplateId(String(periodic.template_id))
      setPeriodicDelay(periodic.tempo_segundos || 86400)
    } else if (whatsappTemplates.length > 0) {
      setPeriodicTemplateId(String(whatsappTemplates[0].id))
    }

    const birthday = automacoes.find(a => a.gatilho === 'aniversario')
    if (birthday) {
      setBirthdayActive(birthday.ativo)
      setBirthdayTemplateId(String(birthday.template_id))
    } else if (whatsappTemplates.length > 0) {
      setBirthdayTemplateId(String(whatsappTemplates[0].id))
    }

    const postPurchase = automacoes.find(a => a.gatilho === 'pos_compra')
    if (postPurchase) {
      setPostPurchaseActive(postPurchase.ativo)
      setPostPurchaseTemplateId(String(postPurchase.template_id))
      const sec = postPurchase.tempo_segundos || 86400
      if (sec >= 86400 && sec % 86400 === 0) {
        setPostPurchaseDelay(sec / 86400)
        setPostPurchaseDelayUnit('days')
      } else {
        setPostPurchaseDelay(sec)
        setPostPurchaseDelayUnit('seconds')
      }
    } else if (whatsappTemplates.length > 0) {
      setPostPurchaseTemplateId(String(whatsappTemplates[0].id))
    }

    const brandX = automacoes.find(a => a.gatilho === 'compra_marca')
    if (brandX) {
      setBrandXActive(brandX.ativo)
      setBrandXTemplateId(String(brandX.template_id))
      setBrandXName(brandX.meta?.marca || 'Coliseu')
    } else if (whatsappTemplates.length > 0) {
      setBrandXTemplateId(String(whatsappTemplates[0].id))
    }
  }, [automacoes, isMarketingSettingsOpen, whatsappTemplates])

  // Sending progress feedback modal
  const [isSending, setIsSending] = useState(false)
  const [sendProgress, setSendProgress] = useState({ processados: 0, total: 0 })
  const [sendResults, setSendResults] = useState<{
    sucessos: number;
    falhas: number;
    logs: LogItem[];
  } | null>(null)



  // Fetch Audience with filters
  const filterParams = {
    search: searchQuery || undefined,
    origem: audienceFilter !== 'all' ? audienceFilter : undefined,
    cidade: cidade !== 'all' ? cidade : undefined,
    vendedor_id: vendedorId !== 'all' ? vendedorId : undefined,
    produto: produto !== 'all' ? produto : undefined,
    marca: marca !== 'all' ? marca : undefined,
    comprou_de: translateToYMD(comprouDe) || undefined,
    comprou_ate: translateToYMD(comprouAte) || undefined,
    niver_de: niverDe || undefined,
    niver_ate: niverAte || undefined,
    apenas_com_saldo: apenasComSaldo ? 'true' : undefined
  }

  const { data: audienceRes, isLoading: isAudienceLoading, refetch: refetchAudience } = useApiQuery<{ 
    data: AudienceMember[];
    filters: {
      cidades: string[];
      vendedores: { id: number; nome: string }[];
      produtos: string[];
      marcas: string[];
    }
  }>(
    '/campanhas/audiencia',
    filterParams
  )
  const rawAudience = audienceRes?.data || []
  const audience = useMemo(() => {
    let list = rawAudience
    if (onlyWhatsApp) {
      list = list.filter(item => item.tem_whatsapp)
    }

    // Filtro Dinâmico de Módulos (Apenas se o usuário selecionou módulos)
    if (selectedModules.length > 0) {
      list = list.filter(item => {
        return selectedModules.every(modKey => {
          const val = String((item as any)[modKey] || '').toUpperCase()
          return val === 'SIM' || val === 'TRUE' || val === '1' || val === 'S'
        })
      })
    }

    // Filtro de Certificado Digital (Apenas se o usuário selecionou uma regra de certificado)
    if (certFilter !== 'all') {
      if (certFilter === 'com_cert') {
        list = list.filter(item => item.tem_certificado && !item.certificado_vencido)
      } else if (certFilter === 'vencido') {
        list = list.filter(item => item.tem_certificado && item.certificado_vencido)
      } else if (certFilter === 'sem_cert') {
        list = list.filter(item => !item.tem_certificado)
      } else {
        const maxDays = parseInt(certFilter, 10)
        if (!isNaN(maxDays)) {
          list = list.filter(item => 
            item.tem_certificado && 
            !item.certificado_vencido && 
            item.certificado_dias_restantes !== null && 
            item.certificado_dias_restantes !== undefined && 
            item.certificado_dias_restantes >= 0 && 
            item.certificado_dias_restantes <= maxDays
          )
        }
      }

      // Ordenar do que vai vencer mais próximo (1 dia, 2 dias... 10 dias) para o mais distante
      return [...list].sort((a, b) => {
        const diasA = a.certificado_dias_restantes !== null && a.certificado_dias_restantes !== undefined ? a.certificado_dias_restantes : 999999
        const diasB = b.certificado_dias_restantes !== null && b.certificado_dias_restantes !== undefined ? b.certificado_dias_restantes : 999999
        if (diasA !== diasB) {
          return diasA - diasB
        }
        return a.nome.localeCompare(b.nome)
      })
    }

    return [...list].sort((a, b) => a.nome.localeCompare(b.nome))
  }, [rawAudience, onlyWhatsApp, selectedModules, certFilter])
  
  // Available dropdown options
  const cidadesOptions = audienceRes?.filters?.cidades || []
  const vendedoresOptions = audienceRes?.filters?.vendedores || []
  const produtosOptions = audienceRes?.filters?.produtos || []
  const marcasOptions = audienceRes?.filters?.marcas || []

  // Fetch Campaign History
  const { data: campaignsRes, refetch: refetchCampaigns } = useApiQuery<{ data: Campaign[] }>('/campanhas')
  const campaigns = campaignsRes?.data || []

  const selectedTemplate = whatsappTemplates.find(t => t.id === parseInt(selectedTemplateId, 10))

  // Clear Filters helper
  const handleClearFilters = () => {
    setCidade('all')
    setVendedorId('all')
    setProduto('all')
    setMarca('all')
    setComprouDe('')
    setComprouAte('')
    setNiverDe('')
    setNiverAte('')
    setSelectedModules([])
    setCertFilter('all')
    setSearchQuery('')
    setSelectedDestinations([])
  }

  // Helper to check if contacted today
  const isSentToday = (ultimoEnvio?: string | null) => {
    if (!ultimoEnvio) return false
    const lastSent = new Date(ultimoEnvio)
    const today = new Date()
    return (
      lastSent.getFullYear() === today.getFullYear() &&
      lastSent.getMonth() === today.getMonth() &&
      lastSent.getDate() === today.getDate()
    )
  }

  // Get selectable audience members (all vs unsent today)
  const getSelectableAudience = () => {
    if (selectionMode === 'unsent' && !permitiMultiplosEnvios) {
      return audience.filter(item => !isSentToday(item.ultimo_envio))
    }
    return audience
  }

  // Toggle selection
  const handleSelectOne = (member: AudienceMember, checked: boolean) => {
    if (checked) {
      setSelectedDestinations([...selectedDestinations, member])
    } else {
      setSelectedDestinations(selectedDestinations.filter(d => d.telefone !== member.telefone))
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedDestinations([...getSelectableAudience()])
    } else {
      setSelectedDestinations([])
    }
  }

  // Execute Dispatch
  const handleDispatchCampaign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!campaignName) {
      alert('Por favor, informe o nome da campanha.')
      return
    }
    if (!selectedTemplateId) {
      alert(channelMode === 'email' ? 'Por favor, selecione um template de e-mail.' : 'Por favor, selecione um template do WhatsApp.')
      return
    }
    if (selectedDestinations.length === 0) {
      alert('Selecione ao menos um destinatário na lista de audiência.')
      return
    }

    setIsSending(true)
    setSendResults(null)
    setSendProgress({ processados: 0, total: selectedDestinations.length })

    try {
      const endpoint = channelMode === 'email' ? '/campanhas/disparar-email' : '/campanhas/disparar'
      
      const payload = {
        nome: campaignName,
        template_id: parseInt(selectedTemplateId, 10),
        destinatarios: selectedDestinations.map(d => {
          const targetPhone = d.tem_whatsapp_secundario && !d.tem_whatsapp_primario && d.celular_secundario
            ? d.celular_secundario
            : d.telefone;
          return { 
            codigo: d.codigo,
            nome: d.nome, 
            telefone: targetPhone,
            email: d.email,
            email_financeiro: d.email_financeiro,
            cidade: d.cidade,
            documento: d.documento,
            saldo_devedor: d.saldo_devedor
          };
        })
      };

      const res = await api.post(endpoint, payload);

      const campanhaId = res.data.campanhaId;
      const totalRecipients = res.data.total;
      setSendProgress({ processados: 0, total: totalRecipients })

      // Clean up inputs early
      setCampaignName('')
      setSelectedTemplateId('')
      setSelectedDestinations([])
      setIsConfigModalOpen(false)

      // Start Polling
      const pollInterval = setInterval(async () => {
        try {
          const progRes = await api.get(`/campanhas/${campanhaId}/progresso`);
          const { processados, sucessos, falhas, logs } = progRes.data;
          
          setSendProgress({ processados, total: totalRecipients });

          if (processados >= totalRecipients) {
            clearInterval(pollInterval);
            setSendResults({
              sucessos,
              falhas,
              logs
            });
            refetchCampaigns();
          }
        } catch (pollErr) {
          console.error("Error polling progress:", pollErr);
        }
      }, 1500);

    } catch (err: any) {
      console.error(err)
      alert(err?.response?.data?.error || 'Erro ao disparar campanha.')
      setIsSending(false)
    }
  }

  const handleOpenEditAuto = (aut: any) => {
    setSelectedAuto(aut)
    setAutoTemplateId(String(aut.template_id))
    setAutoTempoSegundos(String(aut.tempo_segundos))
    setIsAutoModalOpen(true)
  }

  const handleOpenCreateAuto = () => {
    setSelectedAuto(null)
    if (whatsappTemplates.length > 0) {
      setAutoTemplateId(String(whatsappTemplates[0].id))
    } else {
      setAutoTemplateId('')
    }
    setAutoTempoSegundos('86400')
    setIsAutoModalOpen(true)
  }

  const handleSaveAuto = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!autoTemplateId) {
      alert('Selecione um template de WhatsApp.')
      return
    }
    try {
      await api.post('/automacoes', {
        template_id: parseInt(autoTemplateId, 10),
        ativo: selectedAuto ? selectedAuto.ativo : true,
        gatilho: 'tempo_em_tempo',
        tempo_segundos: parseInt(autoTempoSegundos, 10) || 86400
      })
      refetchAutomacoes()
      setIsAutoModalOpen(false)
    } catch (err) {
      console.error(err)
      alert('Erro ao salvar automação.')
    }
  }

  const handleToggleAutoActive = async (aut: any) => {
    try {
      await api.put(`/automacoes/${aut.id}`, {
        ativo: !aut.ativo
      })
      refetchAutomacoes()
    } catch (err) {
      console.error(err)
      alert('Erro ao alterar status da automação.')
    }
  }

  const handleDeleteAuto = async (id: number) => {
    if (!confirm('Deseja excluir esta regra de disparo automático?')) return
    try {
      await api.delete(`/automacoes/${id}`)
      refetchAutomacoes()
    } catch (err) {
      console.error(err)
      alert('Erro ao excluir automação.')
    }
  }

  function formatInterval(seconds: number) {
    if (seconds >= 86400) {
      const days = Math.round(seconds / 86400);
      return `${days} dia(s)`;
    }
    if (seconds >= 3600) {
      const hours = Math.round(seconds / 3600);
      return `${hours} hora(s)`;
    }
    return `${seconds} segundo(s)`;
  }

  const selectableAudience = getSelectableAudience()
  const isAllSelected = audience.length > 0 && selectableAudience.length > 0 && selectableAudience.every(item => selectedDestinations.some(d => d.telefone === item.telefone))

  return (
    <div className="space-y-2">
      {/* Header & Tab Switcher (Unified Row on Desktop) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-divider pb-2">
        <div>
          <h2 className="text-xl font-black text-text-primary tracking-tight">Disparo de Marketing em Massa</h2>
          <p className="text-xs text-text-secondary leading-tight mt-0.5">Filtre contatos e programe ou dispare mensagens via WhatsApp</p>
        </div>

        {/* Linha Unificada e Harmoniosa: Abas à Esquerda + Automação Discreta à Direita */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Tabs switcher pills */}
          <div className="flex bg-bg-secondary p-1 rounded-xl border border-divider text-xs shadow-inner">
            <button
              onClick={() => setActiveTab('manual')}
              className={`px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                activeTab === 'manual' 
                  ? 'bg-white dark:bg-bg-primary text-brand-600 shadow-md border border-divider/40' 
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Disparo Manual
            </button>

            <button
              onClick={() => { setActiveTab('history'); refetchCampaigns(); }}
              className={`px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                activeTab === 'history' 
                  ? 'bg-white dark:bg-bg-primary text-brand-600 shadow-md border border-divider/40' 
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Histórico ({campaigns.length})
            </button>
            <button
              onClick={() => setActiveTab('ocorrencias')}
              className={`px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                activeTab === 'ocorrencias' 
                  ? 'bg-white dark:bg-bg-primary text-brand-600 shadow-md border border-divider/40' 
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Ocorrências
            </button>
            <button
              onClick={() => { setActiveTab('estatisticas'); refetchStats(); }}
              className={`px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'estatisticas' 
                  ? 'bg-white dark:bg-bg-primary text-brand-600 shadow-md border border-divider/40' 
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <BarChart3 size={13} />
              <span>Estatísticas</span>
            </button>
          </div>

          {/* Automation Widget Bar (Discreto e Harmonioso no Canto Direito) */}
          <div className="flex items-center gap-1.5 border border-divider bg-bg-secondary/40 p-1 rounded-xl shadow-xs">
            <button
              onClick={() => setIsQuickAutoModalOpen(true)}
              className={`py-1 px-2.5 text-[11px] font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                isMarketingAutoActive
                  ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 hover:bg-emerald-500/20 shadow-xs'
                  : 'bg-slate-200 dark:bg-slate-800 text-text-secondary hover:text-text-primary border border-transparent'
              }`}
              title="Gerenciar Módulos de Envio Automático"
            >
              <span className={`w-2 h-2 rounded-full ${isMarketingAutoActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              <span className="hidden sm:inline">
                {isMarketingAutoActive ? `Envio Automático (${activeMarketingRulesCount} ativo${activeMarketingRulesCount > 1 ? 's' : ''})` : 'Envio Automático (Desativado)'}
              </span>
              <span className="sm:hidden">{isMarketingAutoActive ? `Auto: ${activeMarketingRulesCount}` : 'Auto: OFF'}</span>
            </button>
            
            <button
              onClick={handleRunMarketingNow}
              disabled={isRunningMarketing}
              className="btn-secondary !py-1 !px-2 text-[11px] flex items-center gap-1 rounded-lg cursor-pointer transition-all hover:bg-bg-secondary"
              title="Disparar Agora"
            >
              {isRunningMarketing ? (
                <Loader2 size={12} className="animate-spin text-brand-500" />
              ) : (
                <Play size={12} className="text-brand-500 fill-brand-500/10" />
              )}
              <span className="hidden sm:inline">Disparar Agora</span>
            </button>

            <button
              onClick={() => navigate('/config-integracoes?tab=automacoes')}
              className="p-1 hover:bg-bg-secondary text-text-secondary hover:text-text-primary rounded-lg transition-all flex items-center justify-center cursor-pointer border border-transparent hover:border-divider"
              title="Configurar Parâmetros de Disparo"
            >
              <Settings size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Content Tab 2: DISPARO MANUAL (Filtros e Clientes) */}
      {activeTab === 'manual' && (
        <div className="space-y-4 animate-fade-in">
          {/* Unified Filters and Search Card */}
          <div className="card p-3 bg-bg-primary border border-divider rounded-xl space-y-2.5 shadow-xs">
            {/* Top Row: Target Audience Filters (Origem, Com Saldo, WhatsApp Válido, Filtros Avançados) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-divider/60 pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-black text-text-primary text-xs uppercase tracking-wider whitespace-nowrap mr-1">Base de Destinatários</h3>
                
                {/* Tipo de Registro (Origem): Clientes (PADRÃO), Fornecedores, Todos, Leads */}
                <div className="flex items-center gap-1 bg-bg-secondary/40 p-0.5 rounded-lg border border-divider">
                  <span className="text-[10px] font-bold text-text-secondary uppercase px-1 whitespace-nowrap">ORIGEM:</span>
                  <select
                    className="bg-white dark:bg-bg-primary text-text-primary text-xs font-bold rounded-md px-2 py-1 border border-divider cursor-pointer focus:outline-none"
                    value={audienceFilter}
                    onChange={(e) => {
                      setAudienceFilter(e.target.value);
                      setSelectedDestinations([]);
                    }}
                  >
                    <option value="cliente">👥 Clientes (Padrão)</option>
                    <option value="fornecedor">🏢 Fornecedores</option>
                    <option value="todos">🌐 Clientes &amp; Fornecedores</option>
                    <option value="lead">🎯 Leads</option>
                  </select>
                </div>

                {/* Checkbox Button: Com Saldo */}
                <button
                  type="button"
                  onClick={() => { setApenasComSaldo(!apenasComSaldo); setSelectedDestinations([]); }}
                  title="Filtrar clientes/fornecedores com saldo financeiro em aberto (> 0)"
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg border whitespace-nowrap transition-all cursor-pointer ${
                    apenasComSaldo
                      ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                      : 'bg-bg-secondary/40 text-text-secondary border-divider hover:bg-bg-secondary'
                  }`}
                >
                  <input
                    type="checkbox"
                    readOnly
                    checked={apenasComSaldo}
                    className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer h-3.5 w-3.5"
                  />
                  <span className="text-amber-500 font-black">$</span>
                  Com Saldo
                </button>

                {/* Checkbox Button: WhatsApp Válido */}
                <button
                  type="button"
                  onClick={() => { setOnlyWhatsApp(!onlyWhatsApp); setSelectedDestinations([]); }}
                  title="Filtrar contatos com número de celular WhatsApp verificado"
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg border whitespace-nowrap transition-all cursor-pointer ${
                    onlyWhatsApp
                      ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                      : 'bg-bg-secondary/40 text-text-secondary border-divider hover:bg-bg-secondary'
                  }`}
                >
                  <input
                    type="checkbox"
                    readOnly
                    checked={onlyWhatsApp}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer h-3.5 w-3.5"
                  />
                  <MessageCircle size={13} className={onlyWhatsApp ? 'text-emerald-500 fill-emerald-500/10' : ''} />
                  WhatsApp Válido
                </button>
              </div>

              {/* Right Side: Advanced Filters Trigger */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg border transition-all cursor-pointer whitespace-nowrap ${
                    showAdvancedFilters 
                      ? 'bg-brand-500/10 text-brand-600 border-brand-500/20' 
                      : 'bg-bg-secondary/40 text-text-secondary border-divider hover:bg-bg-secondary'
                  }`}
                >
                  <Filter size={12} />
                  Filtros Avançados
                  {(niverDe || niverAte || cidade !== 'all' || vendedorId !== 'all' || produto !== 'all' || marca !== 'all' || comprouDe || comprouAte) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse"></span>
                  )}
                </button>
              </div>
            </div>

            {/* Bottom Row: Customer Search, Botão Buscar, Filtro de Módulos, Filtro de Certificado & Send Filter Pills */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                {/* Search Input com Botão Buscar Integrado */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    refetchAudience();
                  }}
                  className="flex items-center gap-1.5 w-full sm:w-auto"
                >
                  <div className="relative w-full sm:w-64 min-w-[180px]">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-text-muted pointer-events-none">
                      <Search size={13} />
                    </span>
                    <input
                      type="text"
                      className="input !py-1.5 !pl-8 text-xs rounded-lg border border-divider bg-bg-secondary/20 hover:border-divider-hover focus:border-brand-500 transition-all w-full"
                      placeholder="Pesquisar cliente/fornecedor..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn-primary !py-1.5 !px-3 text-xs font-black rounded-lg flex items-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap"
                    title="Buscar contatos da audiência"
                  >
                    {isAudienceLoading ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Search size={13} />
                    )}
                    <span>Buscar</span>
                  </button>
                </form>

                {/* FILTRO DINÂMICO DE MÓDULOS (Dropdown com Multi-Seleção) */}
                <div className="relative" ref={moduleDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsModuleDropdownOpen(!isModuleDropdownOpen)}
                    className={clsx(
                      "flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer whitespace-nowrap shadow-2xs",
                      selectedModules.length > 0
                        ? "bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700 font-extrabold"
                        : "bg-bg-secondary/40 text-text-secondary border-divider hover:bg-bg-secondary hover:text-text-primary"
                    )}
                    title="Filtrar clientes por módulos de software contratados"
                  >
                    <Layers size={13} className={selectedModules.length > 0 ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400"} />
                    <span>Módulos</span>
                    {selectedModules.length > 0 ? (
                      <span className="px-1.5 py-0.2 bg-indigo-600 text-white rounded-full text-[10px] font-black">
                        {selectedModules.length}
                      </span>
                    ) : (
                      <ChevronDown size={12} className="opacity-60" />
                    )}
                  </button>

                  {/* Popover Dropdown de Módulos */}
                  {isModuleDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1.5 w-72 sm:w-80 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 animate-scale-up space-y-2.5">
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                        <span className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5 uppercase tracking-wide">
                          <FileCode size={13} className="text-indigo-500" /> Filtrar por Módulos
                        </span>
                        {selectedModules.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setSelectedModules([])}
                            className="text-[10.5px] font-bold text-rose-600 hover:underline cursor-pointer"
                          >
                            Limpar ({selectedModules.length})
                          </button>
                        )}
                      </div>

                      <div className="max-h-60 overflow-y-auto space-y-1 pr-1 font-medium">
                        {AVAILABLE_MODULES.map(m => {
                          const isChecked = selectedModules.includes(m.key);
                          return (
                            <label
                              key={m.key}
                              className={clsx(
                                "flex items-center justify-between p-1.5 rounded-lg text-xs cursor-pointer transition-all select-none",
                                isChecked
                                  ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200 font-bold"
                                  : "hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300"
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedModules([...selectedModules, m.key]);
                                    } else {
                                      setSelectedModules(selectedModules.filter(k => k !== m.key));
                                    }
                                  }}
                                  className="checkbox rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                                />
                                <span className="text-[11.5px]">{m.label}</span>
                              </div>
                              <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-mono">
                                {m.short}
                              </span>
                            </label>
                          );
                        })}
                      </div>

                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-[11px]">
                        <span className="text-slate-500">
                          {selectedModules.length === 0 ? "Nenhum módulo ativo no filtro" : `${selectedModules.length} módulo(s) marcado(s)`}
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsModuleDropdownOpen(false)}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg cursor-pointer text-xs"
                        >
                          Aplicar
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* FILTRO DE CERTIFICADO DIGITAL E VENCIMENTOS */}
                <div className="flex items-center gap-1 bg-bg-secondary/40 p-0.5 rounded-lg border border-divider">
                  <span className="text-[10px] font-bold text-text-secondary uppercase px-1.5 whitespace-nowrap flex items-center gap-1">
                    <ShieldCheck size={12} className={certFilter !== 'all' ? "text-emerald-500" : "text-slate-400"} />
                    CERTIFICADO:
                  </span>
                  <select
                    className={clsx(
                      "text-xs font-bold rounded-md px-2 py-1 border border-divider cursor-pointer focus:outline-none transition-all",
                      certFilter !== 'all'
                        ? "bg-emerald-50 text-emerald-950 dark:bg-emerald-950/70 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700 font-extrabold"
                        : "bg-white dark:bg-bg-primary text-text-primary"
                    )}
                    value={certFilter}
                    onChange={(e) => {
                      setCertFilter(e.target.value);
                      setSelectedDestinations([]);
                    }}
                  >
                    <option value="all">📜 Todos os Certificados (Sem Filtro)</option>
                    <option value="com_cert">✅ Com Certificado Ativo</option>
                    <option value="10">⏳ Vencem nos Próximos 10 Dias</option>
                    <option value="20">⏳ Vencem nos Próximos 20 Dias</option>
                    <option value="30">⏳ Vencem nos Próximos 30 Dias</option>
                    <option value="45">⏳ Vencem nos Próximos 45 Dias</option>
                    <option value="60">⏳ Vencem nos Próximos 60 Dias</option>
                    <option value="vencido">❌ Certificados Vencidos</option>
                    <option value="sem_cert">⚪ Sem Certificado Digital</option>
                  </select>
                </div>

                {/* Badges de filtros ativos para remoção rápida */}
                {selectedModules.length > 0 && (
                  <div className="hidden xl:flex items-center gap-1">
                    {selectedModules.slice(0, 3).map(mk => {
                      const modObj = AVAILABLE_MODULES.find(m => m.key === mk);
                      return (
                        <span
                          key={mk}
                          className="px-2 py-0.5 bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800 rounded-full text-[10px] font-bold flex items-center gap-1"
                        >
                          {modObj?.short || mk}
                          <button
                            type="button"
                            onClick={() => setSelectedModules(selectedModules.filter(k => k !== mk))}
                            className="hover:text-rose-600 cursor-pointer"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                    {selectedModules.length > 3 && (
                      <span className="text-[10px] text-slate-500 font-bold">+{selectedModules.length - 3}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Botões de Seleção: Apenas Não Enviados Hoje vs Todos */}
              <div className="flex items-center gap-1 bg-bg-secondary/40 p-0.5 rounded-lg border border-divider shrink-0">
                <button
                  type="button"
                  onClick={() => { setSelectionMode('unsent'); setSelectedDestinations([]); }}
                  className={clsx(
                    'px-2 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer',
                    selectionMode === 'unsent'
                      ? 'bg-white dark:bg-bg-primary text-brand-600 shadow-xs'
                      : 'text-text-secondary hover:text-text-primary'
                  )}
                >
                  Apenas Não Enviados Hoje
                </button>
                <button
                  type="button"
                  onClick={() => { setSelectionMode('all'); setSelectedDestinations([]); }}
                  className={clsx(
                    'px-2 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer',
                    selectionMode === 'all'
                      ? 'bg-white dark:bg-bg-primary text-brand-600 shadow-xs'
                      : 'text-text-secondary hover:text-text-primary'
                  )}
                >
                  Todos
                </button>
              </div>
            </div>

            {/* Collapsible Advanced Filters Grid (Layout Compacto) */}
            {showAdvancedFilters && (
              <div className="bg-bg-secondary/30 border border-divider p-2.5 rounded-xl space-y-2 animate-slide-down">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                  {/* 1. Aniversário De / Até */}
                  <div className="space-y-1 lg:col-span-1">
                    <label className="text-[10px] font-bold text-text-secondary uppercase flex items-center gap-1">
                      <Calendar size= {11} className="text-brand-500" />
                      Aniversário
                    </label>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        className={`input !py-1 !px-1.5 text-[11px] rounded-md w-full ${
                          !isValidNiverString(niverDe) ? 'border-red-500' : ''
                        }`}
                        placeholder="De DD/MM"
                        value={niverDe}
                        onChange={(e) => {
                          setNiverDe(formatNiverInput(e.target.value));
                          setSelectedDestinations([]);
                        }}
                      />
                      <input
                        type="text"
                        className={`input !py-1 !px-1.5 text-[11px] rounded-md w-full ${
                          !isValidNiverString(niverAte) ? 'border-red-500' : ''
                        }`}
                        placeholder="Até DD/MM"
                        value={niverAte}
                        onChange={(e) => {
                          setNiverAte(formatNiverInput(e.target.value));
                          setSelectedDestinations([]);
                        }}
                      />
                    </div>
                  </div>

                  {/* 2. Região (Cidade) - COMPACT */}
                  <div className="space-y-1 lg:col-span-1">
                    <label className="text-[10px] font-bold text-text-secondary uppercase flex items-center gap-1">
                      <MapPin size={11} className="text-brand-500" />
                      Região (Cidade)
                    </label>
                    <select
                      className="input !py-1 !px-1.5 text-[11px] rounded-md w-full"
                      value={cidade}
                      onChange={(e) => { setCidade(e.target.value); setSelectedDestinations([]); }}
                    >
                      <option value="all">Todas as Regiões</option>
                      {cidadesOptions.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  {/* 3. Vendedor - COMPACT */}
                  <div className="space-y-1 lg:col-span-1">
                    <label className="text-[10px] font-bold text-text-secondary uppercase flex items-center gap-1">
                      <User size={11} className="text-brand-500" />
                      Vendedor
                    </label>
                    <select
                      className="input !py-1 !px-1.5 text-[11px] rounded-md w-full"
                      value={vendedorId}
                      onChange={(e) => { setVendedorId(e.target.value); setSelectedDestinations([]); }}
                    >
                      <option value="all">Todos os Vendedores</option>
                      {vendedoresOptions.map(v => <option key={v.id} value={v.id.toString()}>{v.nome}</option>)}
                    </select>
                  </div>

                  {/* 4. Comprou no Período (De / Até) */}
                  <div className="space-y-1 lg:col-span-1">
                    <label className="text-[10px] font-bold text-text-secondary uppercase flex items-center gap-1">
                      <ShoppingBag size={11} className="text-brand-500" />
                      Período Compra
                    </label>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        className={`input !py-1 !px-1.5 text-[11px] rounded-md w-full ${
                          !isValidDateString(comprouDe) ? 'border-red-500' : ''
                        }`}
                        placeholder="De DD/MM/AA"
                        value={comprouDe}
                        onChange={(e) => {
                          setComprouDe(formatDateInput(e.target.value));
                          setSelectedDestinations([]);
                        }}
                      />
                      <input
                        type="text"
                        className={`input !py-1 !px-1.5 text-[11px] rounded-md w-full ${
                          !isValidDateString(comprouAte) ? 'border-red-500' : ''
                        }`}
                        placeholder="Até DD/MM/AA"
                        value={comprouAte}
                        onChange={(e) => {
                          setComprouAte(formatDateInput(e.target.value));
                          setSelectedDestinations([]);
                        }}
                      />
                    </div>
                  </div>

                  {/* 5. Produto Comprado - COMPACT */}
                  <div className="space-y-1 lg:col-span-1">
                    <label className="text-[10px] font-bold text-text-secondary uppercase flex items-center gap-1">
                      <Package size={11} className="text-brand-500" />
                      Produto Comprado
                    </label>
                    <select
                      className="input !py-1 !px-1.5 text-[11px] rounded-md w-full"
                      value={produto}
                      onChange={(e) => { setProduto(e.target.value); setSelectedDestinations([]); }}
                    >
                      <option value="all">Todos os Produtos</option>
                      {produtosOptions.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>

                  {/* 6. Marca do Produto - COMPACT */}
                  <div className="space-y-1 lg:col-span-1">
                    <label className="text-[10px] font-bold text-text-secondary uppercase flex items-center gap-1">
                      <Tag size={11} className="text-brand-500" />
                      Marca do Produto
                    </label>
                    <select
                      className="input !py-1 !px-1.5 text-[11px] rounded-md w-full"
                      value={marca}
                      onChange={(e) => { setMarca(e.target.value); setSelectedDestinations([]); }}
                    >
                      <option value="all">Todas as Marcas</option>
                      {marcasOptions.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Audience Table (Estilo Padronizado Gestão Financeira com Linhas e Colunas) */}
            <div className="overflow-x-auto max-h-[540px] overflow-y-auto border border-slate-300 dark:border-slate-700 rounded-xl shadow-xs bg-white dark:bg-slate-900">
              <table className="w-full text-[11px] text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-[#e2e7ee] dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-black uppercase tracking-wider text-[10px] border-b border-slate-300 dark:border-slate-700">
                  <tr>
                    <th className="py-2 px-2.5 w-12 text-center border-r border-slate-300 dark:border-slate-700">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-3.5 w-3.5"
                        checked={isAllSelected}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                      />
                    </th>
                    <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 min-w-[170px]">NOME</th>
                    <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 w-36">TELEFONE / WHATSAPP</th>
                    <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 min-w-[130px]">E-MAIL</th>
                    <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 min-w-[120px]">CIDADE / UF</th>
                    {selectedModules.length > 0 && (
                      <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 min-w-[120px]">MÓDULOS</th>
                    )}
                    <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 min-w-[130px] text-center">
                      {certFilter !== 'all' ? 'VENCIMENTO CERTIFICADO' : 'ANIVERSÁRIO'}
                    </th>
                    <th className="py-2 px-2.5 w-24 text-center">ORIGEM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                  {isAudienceLoading ? (
                    <tr>
                      <td colSpan={6 + (selectedModules.length > 0 ? 1 : 0)} className="py-8 text-center text-slate-400 font-semibold italic">Carregando contatos da audiência...</td>
                    </tr>
                  ) : audience.length === 0 ? (
                    <tr>
                      <td colSpan={6 + (selectedModules.length > 0 ? 1 : 0)} className="py-8 text-center text-slate-400 font-semibold italic">Nenhum contato encontrado com os filtros selecionados.</td>
                    </tr>
                  ) : (
                    audience.map((item, idx) => {
                      const sentToday = isSentToday(item.ultimo_envio);
                      const isUnsentMode = selectionMode === 'unsent';
                      const isSelected = selectedDestinations.some(d => d.telefone === item.telefone);

                      return (
                        <tr 
                          key={idx} 
                          onClick={() => {
                            if (!permitiMultiplosEnvios && isUnsentMode && sentToday) return;
                            handleSelectOne(item, !isSelected);
                          }}
                          className={clsx(
                            'cursor-pointer transition-colors duration-150 text-[11px] leading-tight',
                            isSelected ? 'bg-indigo-50/90 dark:bg-indigo-950/60 font-semibold' :
                            sentToday && isUnsentMode && !permitiMultiplosEnvios
                              ? 'opacity-60 bg-slate-50 dark:bg-slate-900' 
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          )}
                        >
                          <td className="py-1.5 px-2.5 text-center border-r border-slate-200 dark:border-slate-800 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1.5">
                              <input
                                type="checkbox"
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-3.5 w-3.5"
                                disabled={!permitiMultiplosEnvios && isUnsentMode && sentToday}
                                checked={isSelected}
                                onChange={(e) => handleSelectOne(item, e.target.checked)}
                              />
                              {sentToday ? (
                                <span 
                                  title={permitiMultiplosEnvios ? "Mensagem já enviada hoje. Envio liberado por configuração." : "Mensagem enviada hoje. Envio bloqueado até amanhã."} 
                                  className={`${permitiMultiplosEnvios ? 'text-blue-500' : 'text-emerald-500'} hover:scale-110 transition-transform`}
                                >
                                  {permitiMultiplosEnvios ? <Clock size={12} /> : <CheckCircle2 size={12} />}
                                </span>
                              ) : (
                                <span title="Ainda não enviado hoje" className="text-slate-300 dark:text-slate-600">
                                  <Clock size={12} />
                                </span>
                              )}
                            </div>
                          </td>
                          
                          {/* Nome */}
                          <td className="py-1.5 px-2.5 font-extrabold text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800 uppercase min-w-[170px]">
                            {item.nome}
                          </td>

                          {/* Telefone */}
                          <td className="py-1.5 px-2.5 font-mono text-[11px] text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold">{item.telefone}</span>
                              {item.tem_whatsapp_primario && (
                                <span title="WhatsApp Válido" className="text-emerald-600 flex items-center">
                                  <MessageCircle size={12} className="fill-emerald-500/20" />
                                </span>
                              )}
                            </div>
                          </td>

                          {/* E-mail */}
                          <td className="py-1.5 px-2.5 font-mono text-[10px] text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                            {item.email || item.email_financeiro ? (
                              <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                                <Mail size={12} />
                                <span className="truncate max-w-[120px]" title={item.email || item.email_financeiro || ''}>
                                  {item.email || item.email_financeiro}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">Sem e-mail</span>
                            )}
                          </td>

                          {/* Cidade / UF */}
                          <td className="py-1.5 px-2.5 text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800 uppercase font-semibold">
                            {item.cidade}{item.estado && item.estado !== '—' ? ` - ${item.estado}` : ''}
                          </td>

                          {/* Módulos (Aparece apenas quando há filtro de módulos ativo) */}
                          {selectedModules.length > 0 && (
                            <td className="py-1.5 px-2.5 border-r border-slate-200 dark:border-slate-800">
                              {(() => {
                                const activeMods = AVAILABLE_MODULES.filter(m => {
                                  const v = String((item as any)[m.key] || '').toUpperCase();
                                  return v === 'SIM' || v === 'TRUE' || v === '1' || v === 'S';
                                });
                                if (activeMods.length === 0) {
                                  return <span className="text-slate-400 italic text-[10px]">Sem módulos</span>;
                                }
                                return (
                                  <div className="flex flex-wrap gap-1 max-w-[140px]" title={activeMods.map(m => m.label).join(', ')}>
                                    {activeMods.slice(0, 3).map(m => (
                                      <span key={m.key} className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                        {m.short}
                                      </span>
                                    ))}
                                    {activeMods.length > 3 && (
                                      <span className="px-1 py-0.2 rounded text-[8.5px] font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-500">
                                        +{activeMods.length - 3}
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                          )}

                          {/* Coluna Dinâmica: VENCIMENTO CERTIFICADO (quando filtro de cert ativo) OU ANIVERSÁRIO */}
                          <td className="py-1.5 px-2.5 text-center font-mono text-[10.5px] border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                            {certFilter !== 'all' ? (
                              item.tem_certificado && item.certificado_vencimento_br ? (
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className="font-bold text-slate-800 dark:text-slate-200">{item.certificado_vencimento_br}</span>
                                  {item.certificado_vencido ? (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                      VENCIDO
                                    </span>
                                  ) : item.certificado_dias_restantes !== null && item.certificado_dias_restantes !== undefined && item.certificado_dias_restantes <= 30 ? (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                      {item.certificado_dias_restantes}d restantes
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800">
                                      {item.certificado_dias_restantes ? `${item.certificado_dias_restantes}d` : 'Ativo'}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400 italic text-[10px]">Sem certificado</span>
                              )
                            ) : (
                              <span className="font-bold text-slate-700 dark:text-slate-300">{item.aniversario}</span>
                            )}
                          </td>

                          {/* Origem */}
                          <td className="py-1.5 px-2.5 text-center">
                            <span className={clsx(
                              "inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-black uppercase border",
                              item.origem === 'Cliente'
                                ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300'
                                : item.origem === 'Fornecedor'
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300'
                                : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300'
                            )}>
                              {item.origem}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Content Tab 2: HISTORY (Estilo Padronizado Gestão Financeira com Linhas e Colunas) */}
      {activeTab === 'history' && (
        <div className="overflow-x-auto max-h-[540px] overflow-y-auto border border-slate-300 dark:border-slate-700 rounded-xl shadow-xs bg-white dark:bg-slate-900 animate-fade-in">
          <table className="w-full text-[11px] text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-[#e2e7ee] dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-black uppercase tracking-wider text-[10px] border-b border-slate-300 dark:border-slate-700">
              <tr>
                <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 min-w-[200px]">CAMPANHA</th>
                <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 min-w-[160px]">TEMPLATE UTILIZADO</th>
                <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 w-40">DATA DO ENVIO</th>
                <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 w-24 text-center">SUCESSOS</th>
                <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 w-24 text-center">FALHAS</th>
                <th className="py-2 px-2.5 w-32 text-center">TAXA DE SUCESSO</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 font-semibold italic">Nenhuma campanha disparada.</td>
                </tr>
              ) : (
                campaigns.map((cp) => {
                  const total = cp.sucessos + cp.falhas
                  const rate = total > 0 ? ((cp.sucessos / total) * 100).toFixed(1) : '0'
                  return (
                    <tr key={cp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors text-[11px] leading-tight">
                      <td className="py-1.5 px-2.5 border-r border-slate-200 dark:border-slate-800">
                        <div className="font-extrabold text-slate-900 dark:text-slate-100">{cp.nome}</div>
                        <div className="text-[9.5px] font-mono text-slate-500">ID: #{cp.id}</div>
                      </td>
                      <td className="py-1.5 px-2.5 font-bold text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800">
                        {cp.template_nome || 'Livre/Nenhum'}
                      </td>
                      <td className="py-1.5 px-2.5 font-mono font-semibold text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800">
                        {new Date(cp.created_at).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-1.5 px-2.5 text-center text-emerald-600 font-black font-mono border-r border-slate-200 dark:border-slate-800">
                        {cp.sucessos}
                      </td>
                      <td className="py-1.5 px-2.5 text-center text-rose-600 font-black font-mono border-r border-slate-200 dark:border-slate-800">
                        {cp.falhas}
                      </td>
                      <td className="py-1.5 px-2.5 text-center">
                        <span className={`inline-block font-mono font-extrabold text-[10px] px-2 py-0.5 rounded uppercase border ${
                          parseFloat(rate) > 90 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300' 
                            : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300'
                        }`}>
                          {rate}%
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* DISPATCH PROGRESS & RESULTS MODAL */}
      {isSending && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="card w-full max-w-lg p-6 bg-bg-primary animate-scale-up rounded-xl border border-divider shadow-lg">
            <h3 className="font-bold text-text-primary text-base mb-2 flex items-center gap-1.5">
              {!sendResults ? (
                <>
                  <RefreshCw size={18} className="animate-spin text-brand-500" />
                  {channelMode === 'email' ? 'Disparando E-mails em Lote...' : 'Disparando Mensagens...'} ({sendProgress.processados} de {sendProgress.total})
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} className="text-emerald-500" />
                  {channelMode === 'email' ? 'E-mails Disparados com Sucesso!' : 'Campanha Disparada com Sucesso!'}
                </>
              )}
            </h3>
            
            <p className="text-xs text-text-secondary mb-4">
              {!sendResults 
                ? (channelMode === 'email'
                    ? 'Enviando e-mails marketing em lote via servidor seguro para todos os e-mails cadastrados...'
                    : 'Enviando mensagens via Uazapi com intervalo de segurança de 2.1s para evitar bloqueios...') 
                : (channelMode === 'email'
                    ? 'Relatório de envio e logs de e-mails processados:'
                    : 'Relatório de envio e logs do webhook de WhatsApp recebidos:')}
            </p>

            {!sendResults && sendProgress.total > 0 && (
              <div className="w-full bg-bg-secondary rounded-full h-2 border border-divider mb-4 overflow-hidden">
                <div 
                  className="bg-brand-500 h-full transition-all duration-500 rounded-full" 
                  style={{ width: `${(sendProgress.processados / sendProgress.total) * 100}%` }}
                ></div>
              </div>
            )}

            {sendResults && (
              <div className="space-y-4">
                {/* Stats panel */}
                <div className="grid grid-cols-2 gap-3 text-center text-xs">
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 dark:bg-emerald-950/20 dark:border-emerald-900/30">
                    <div className="text-[10px] text-emerald-800 dark:text-emerald-400 font-bold uppercase">Entregues com Sucesso</div>
                    <div className="text-xl font-bold text-emerald-600 font-mono mt-1">{sendResults.sucessos}</div>
                  </div>
                  <div className="bg-red-50 border border-red-100 rounded-xl p-3 dark:bg-red-950/20 dark:border-red-900/30">
                    <div className="text-[10px] text-red-800 dark:text-red-400 font-bold uppercase">Falhas / Rejeitados</div>
                    <div className="text-xl font-bold text-red-600 font-mono mt-1">{sendResults.falhas}</div>
                  </div>
                </div>

                {/* Logs console */}
                <div className="bg-bg-secondary p-3 rounded-xl border border-divider max-h-[220px] overflow-y-auto font-mono text-[9px] space-y-1 text-text-primary">
                  {sendResults.logs.map((log, idx) => (
                    <div key={idx} className="flex justify-between items-center py-0.5 border-b border-divider/30 last:border-0">
                      <span>[{idx + 1}] {log.nome} ({log.telefone})</span>
                      <span className={log.status === 'Sucesso' ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>
                        {log.status === 'Sucesso' ? '✓ OK' : `✗ Erro: ${log.erro}`}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end pt-3 border-t border-divider mt-4">
                  <button className="btn-primary text-xs rounded-xl cursor-pointer" onClick={() => setIsSending(false)}>
                    Concluir Campanha
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* FLOATING ACTION BAR FOR SELECTED CONTACTS */}
      {selectedDestinations.length > 0 && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-40 bg-bg-primary/95 border border-divider shadow-2xl rounded-full px-6 py-4 flex items-center gap-6 backdrop-blur-md animate-slide-up">
          <div className="flex items-center gap-2.5">
            <div className="bg-brand-500/10 text-brand-600 p-2.5 rounded-full">
              <Users size={18} />
            </div>
            <div className="text-sm">
              <span className="font-bold text-text-primary">{selectedDestinations.length}</span>
              <span className="text-text-secondary ml-1.5">contatos selecionados</span>
            </div>
          </div>
          
          <div className="h-6 w-px bg-divider"></div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const selectable = getSelectableAudience();
                const allSelectableChecked = selectable.length > 0 && selectable.every(item => selectedDestinations.some(d => d.telefone === item.telefone));
                if (allSelectableChecked) {
                  setSelectedDestinations([]);
                } else {
                  setSelectedDestinations([...selectable]);
                }
              }}
              className="px-4 py-2 border border-divider hover:bg-bg-secondary rounded-full text-xs font-bold text-text-secondary transition-all cursor-pointer"
            >
              {isAllSelected ? 'Desmarcar Todos' : 'Marcar Todos'}
            </button>
            
            <button
              onClick={() => setIsConfigModalOpen(true)}
              className="btn-primary py-2 px-5 text-xs flex items-center gap-1.5 border border-transparent rounded-full shadow-md hover:shadow-lg font-bold transition-all cursor-pointer"
            >
              <Send size={14} />
              Configurar Disparo
            </button>
          </div>
        </div>
      )}

      {/* CAMPAIGN CONFIGURATION / DISPATCH MODAL */}
      {isConfigModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="card w-full max-w-3xl p-6 bg-bg-primary animate-scale-up rounded-xl border border-divider shadow-lg text-xs">
            <h3 className="font-bold text-text-primary text-base mb-2 flex items-center gap-1.5 border-b border-divider pb-3">
              <Send size={18} className="text-brand-500" />
              Configurar Disparo de Marketing
            </h3>
            
            <form onSubmit={handleDispatchCampaign} className="mt-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column: Form Fields and Actions */}
                <div className="space-y-4 flex flex-col justify-between">
                  <div className="space-y-4">
                    {/* Canal de Disparo: WhatsApp vs E-mail */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-text-secondary uppercase">Canal de Disparo *</label>
                      <div className="grid grid-cols-2 gap-2 bg-bg-secondary p-1 rounded-lg border border-divider">
                        <button
                          type="button"
                          onClick={() => { setChannelMode('whatsapp'); setSelectedTemplateId(''); }}
                          className={`py-2 px-3 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                            channelMode === 'whatsapp' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 shadow-xs' : 'text-text-secondary hover:text-text-primary'
                          }`}
                        >
                          <MessageCircle size={14} />
                          📲 WhatsApp
                        </button>
                        <button
                          type="button"
                          onClick={() => { setChannelMode('email'); setSelectedTemplateId(''); }}
                          className={`py-2 px-3 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                            channelMode === 'email' ? 'bg-blue-500/10 text-blue-600 border border-blue-500/20 shadow-xs' : 'text-text-secondary hover:text-text-primary'
                          }`}
                        >
                          <Mail size={14} />
                          📧 E-mail Marketing
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-text-secondary uppercase">Nome da Campanha *</label>
                      <input
                        type="text"
                        required
                        className="input !py-2.5 text-xs rounded-lg"
                        placeholder="Ex: Campanha Informativa Reforma Tributária 2026"
                        value={campaignName}
                        onChange={(e) => setCampaignName(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-text-secondary uppercase">
                        {channelMode === 'email' ? 'Template de E-mail *' : 'Template do WhatsApp *'}
                      </label>
                      <select
                        required
                        className="input !py-2.5 text-xs rounded-lg"
                        value={selectedTemplateId}
                        onChange={(e) => setSelectedTemplateId(e.target.value)}
                      >
                        <option value="">Selecione um template...</option>
                        {(channelMode === 'email' ? (emailTemplates.length > 0 ? emailTemplates : templates) : whatsappTemplates).map(t => (
                          <option key={t.id} value={t.id}>{t.nome}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="border-t border-divider pt-4 flex flex-col gap-2 mt-auto">
                    <div className="flex justify-between items-center text-xs text-text-secondary mb-1">
                      <span>Destinatários selecionados:</span>
                      <span className="font-bold text-brand-600">{selectedDestinations.length}</span>
                    </div>
                    
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsConfigModalOpen(false)}
                        className="px-4 py-2 border border-divider rounded-lg hover:bg-bg-secondary text-text-secondary text-xs font-bold cursor-pointer transition-all"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={selectedDestinations.length === 0 || !campaignName || !selectedTemplateId}
                        className={`!py-2 px-4 text-xs flex items-center gap-2 rounded-lg cursor-pointer font-bold text-white transition-all ${
                          channelMode === 'email' ? 'bg-blue-600 hover:bg-blue-700' : 'btn-primary'
                        }`}
                      >
                        {channelMode === 'email' ? (
                          <><Mail size={14} /> Disparar E-mail Marketing em Lote</>
                        ) : (
                          <><Send size={14} /> Disparar WhatsApp</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Column: Template Content Preview */}
                <div className="flex flex-col h-full space-y-2">
                  {channelMode === 'email' && (
                    <div className="bg-blue-500/10 border border-blue-500/20 p-2.5 rounded-lg text-[11px] text-blue-700 dark:text-blue-300 flex items-start gap-2">
                      <Mail size={14} className="shrink-0 mt-0.5" />
                      <span>
                        <strong>Envio em Lote Multi-Endereço:</strong> O modelo de e-mail marketing será enviado em lote para <strong>TODOS os endereços de e-mail</strong> cadastrados no perfil de cada destinatário.
                      </span>
                    </div>
                  )}

                  <div className="flex-1 bg-bg-secondary p-4 rounded-lg border border-divider flex flex-col min-h-[220px]">
                    <span className="text-[10px] text-text-muted uppercase font-bold mb-2 block border-b border-divider pb-1">
                      {channelMode === 'email' ? 'Visualização do E-mail Marketing' : 'Conteúdo do WhatsApp'}
                    </span>
                    <div className="flex-1 overflow-y-auto max-h-[250px] pr-1 scrollbar-thin">
                      {(() => {
                        const currentTemplate = templates.find(t => String(t.id) === selectedTemplateId);
                        if (!currentTemplate) {
                          return (
                            <p className="text-xs text-text-muted italic text-center my-auto">
                              Selecione um template para visualizar o conteúdo.
                            </p>
                          );
                        }

                        if (channelMode === 'email' || currentTemplate.conteudo.includes('<') && currentTemplate.conteudo.includes('>')) {
                          return (
                            <div 
                              className="text-xs text-text-secondary leading-relaxed bg-white p-3 rounded border border-slate-200"
                              dangerouslySetInnerHTML={{ __html: currentTemplate.conteudo }}
                            />
                          );
                        }

                        return (
                          <>
                            {currentTemplate.imagem_url && (
                              <div className="relative rounded-lg overflow-hidden border border-divider max-h-[150px] bg-bg-primary flex items-center justify-center mb-3">
                                <img src={currentTemplate.imagem_url} alt="Media Preview" className="max-h-[150px] object-contain w-full" />
                              </div>
                            )}
                            <p className="text-xs text-text-secondary whitespace-pre-wrap leading-relaxed italic">
                              {currentTemplate.conteudo}
                            </p>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Content Tab 4: OCORRÊNCIAS */}
      {activeTab === 'ocorrencias' && (
        <div className="space-y-4 animate-fade-in text-xs">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-bg-primary p-4 border border-divider rounded-xl shadow-xs">
            <div>
              <h3 className="font-black text-text-primary text-xs uppercase tracking-wider">Histórico de Ocorrências (Disparos)</h3>
              <p className="text-xs text-text-secondary mt-0.5">Mapeie todos os envios automáticos e manuais de mensagens no sistema.</p>
            </div>
            
            <div className="flex items-center gap-1.5 bg-bg-secondary p-1 rounded-lg border border-divider">
              <button
                onClick={() => setLogFilter('all')}
                className={`py-1 px-3 rounded-md font-bold transition-all cursor-pointer ${logFilter === 'all' ? 'bg-white dark:bg-bg-primary text-brand-600 shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
              >
                Todos
              </button>
              <button
                onClick={() => setLogFilter('marketing')}
                className={`py-1 px-3 rounded-md font-bold transition-all cursor-pointer ${logFilter === 'marketing' ? 'bg-white dark:bg-bg-primary text-brand-600 shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
              >
                Marketing
              </button>
              <button
                onClick={() => setLogFilter('cobranca')}
                className={`py-1 px-3 rounded-md font-bold transition-all cursor-pointer ${logFilter === 'cobranca' ? 'bg-white dark:bg-bg-primary text-brand-600 shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
              >
                Cobrança
              </button>
              <button
                onClick={() => setLogFilter('pos_venda')}
                className={`py-1 px-3 rounded-md font-bold transition-all cursor-pointer ${logFilter === 'pos_venda' ? 'bg-white dark:bg-bg-primary text-brand-600 shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
              >
                Pedidos
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[540px] overflow-y-auto border border-slate-300 dark:border-slate-700 rounded-xl shadow-xs bg-white dark:bg-slate-900">
            <table className="w-full text-[11px] text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-[#e2e7ee] dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-black uppercase tracking-wider text-[10px] border-b border-slate-300 dark:border-slate-700">
                <tr>
                  <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 w-36">DATA/HORA</th>
                  <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 w-36">TIPO</th>
                  <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 min-w-[160px]">GATILHO</th>
                  <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 w-20 uppercase">CANAL</th>
                  <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 min-w-[180px]">DESTINATÁRIO</th>
                  <th className="py-2 px-2.5 border-r border-slate-300 dark:border-slate-700 w-32">TEMPLATE</th>
                  <th className="py-2 px-2.5 w-28 text-center">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 font-semibold italic">
                      Nenhuma ocorrência registrada para esta categoria.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => {
                    const dateStr = new Date(log.enviado_em).toLocaleString('pt-BR');
                    const typeLabel = 
                      log.tipo === 'EMISSAO_LOTE' ? 'Emissão em Lote' :
                      log.tipo === 'COBRANCA_LOTE' ? 'Cobrança em Lote' :
                      log.subcategoria === 'marketing' ? 'Marketing' :
                      log.subcategoria === 'cobranca' ? 'Cobrança' :
                      log.subcategoria === 'pos_venda' ? 'Pedido' : 'Outro';
                    
                    const typeBadgeColor = 
                      log.tipo === 'EMISSAO_LOTE' || log.tipo === 'COBRANCA_LOTE' ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300' :
                      log.subcategoria === 'marketing' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300' :
                      log.subcategoria === 'cobranca' ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300' :
                      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300';

                    const gatilhoDisplay = 
                      log.tipo === 'EMISSAO_LOTE' ? 'Emissão de Boleto em Lote' :
                      log.tipo === 'COBRANCA_LOTE' ? 'Cobrança em Lote' :
                      log.gatilho || 'Disparo Automático';

                    return (
                      <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors text-[11px] leading-tight">
                        <td className="py-1.5 px-2.5 font-mono text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">{dateStr}</td>
                        <td className="py-1.5 px-2.5 border-r border-slate-200 dark:border-slate-800">
                          <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-black uppercase border ${typeBadgeColor}`}>
                            {typeLabel}
                          </span>
                        </td>
                        <td className="py-1.5 px-2.5 font-bold text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800">{gatilhoDisplay}</td>
                        <td className="py-1.5 px-2.5 uppercase text-[10px] font-bold text-slate-600 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800">{log.canal || 'email'}</td>
                        <td className="py-1.5 px-2.5 border-r border-slate-200 dark:border-slate-800">
                          <div className="font-extrabold text-slate-900 dark:text-slate-100 uppercase">{log.cliente_nome || log.destinatario || 'Cliente Geral'}</div>
                          {log.destinatario && log.destinatario.includes('@') && <div className="text-[9.5px] text-slate-500 font-mono">{log.destinatario}</div>}
                          {log.venda_numero_pedido && <div className="text-[9.5px] text-slate-500">Pedido: {log.venda_numero_pedido}</div>}
                        </td>
                        <td className="py-1.5 px-2.5 text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800 font-semibold">{log.template_nome || '—'}</td>
                        <td className="py-1.5 px-2.5 text-center">
                          {log.status === 'Sucesso' || log.status === 'ENVIADO' ? (
                            <span className="px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 flex items-center justify-center gap-1 w-fit mx-auto">
                              <CheckCircle2 size={10} /> Sucesso
                            </span>
                          ) : (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950 dark:text-rose-300 flex items-center justify-center gap-1 w-fit mx-auto">
                                <XCircle size={10} /> Falha
                              </span>
                              {log.erro && <span className="text-[9px] text-rose-600 font-mono block max-w-[140px] truncate" title={log.erro}>{log.erro}</span>}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA 4: ESTATÍSTICAS & RASTREAMENTO EM TEMPO REAL (PIXEL DE ABERTURA + CLIQUES) */}
      {activeTab === 'estatisticas' && (
        <div className="space-y-4 animate-fade-in">
          {/* Top Filter and Actions Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-bg-primary border border-divider rounded-xl shadow-xs">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="text-brand-500" size={18} />
                <h3 className="text-sm font-black text-text-primary uppercase tracking-wider">Estatísticas & Rastreamento de Campanhas</h3>
              </div>
              <p className="text-xs text-text-secondary mt-0.5">Acompanhe taxas de entrega, aberturas reais (pixel) e cliques de cada comunicado.</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 bg-bg-secondary p-1 rounded-lg border border-divider text-xs">
                <button
                  onClick={() => setStatsChannelFilter('all')}
                  className={`py-1 px-3 rounded-md font-bold transition-all cursor-pointer ${statsChannelFilter === 'all' ? 'bg-white dark:bg-bg-primary text-brand-600 shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setStatsChannelFilter('email')}
                  className={`py-1 px-3 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1 ${statsChannelFilter === 'email' ? 'bg-white dark:bg-bg-primary text-brand-600 shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
                >
                  <Mail size={12} /> E-mail
                </button>
                <button
                  onClick={() => setStatsChannelFilter('whatsapp')}
                  className={`py-1 px-3 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1 ${statsChannelFilter === 'whatsapp' ? 'bg-white dark:bg-bg-primary text-brand-600 shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
                >
                  <MessageCircle size={12} /> WhatsApp
                </button>
              </div>

              <button
                onClick={() => refetchStats()}
                disabled={isLoadingStats}
                className="btn-secondary !py-1 !px-2.5 text-xs flex items-center gap-1 font-bold rounded-lg cursor-pointer hover:bg-bg-secondary"
                title="Atualizar Estatísticas"
              >
                <RefreshCw size={13} className={isLoadingStats ? "animate-spin text-brand-500" : "text-brand-500"} />
                <span>Atualizar</span>
              </button>
            </div>
          </div>

          {/* Cards de Métricas Analíticas */}
          {(() => {
            const emailCampaigns = statsList.filter(c => (c.canal || '').toLowerCase() === 'email');
            const totalEmailEnviados = emailCampaigns.reduce((acc, c) => acc + parseInt(c.total_enviados || 0, 10), 0);
            const totalEmailSucessos = emailCampaigns.reduce((acc, c) => acc + parseInt(c.sucessos || 0, 10), 0);
            const totalEmailAbertos = emailCampaigns.reduce((acc, c) => acc + parseInt(c.total_abertos || 0, 10), 0);
            const totalEmailAberturas = emailCampaigns.reduce((acc, c) => acc + parseInt(c.total_aberturas || 0, 10), 0);
            const totalEmailNaoAbertos = Math.max(0, totalEmailSucessos - totalEmailAbertos);
            const taxaAberturaGeral = totalEmailSucessos > 0 ? ((totalEmailAbertos / totalEmailSucessos) * 100).toFixed(1) : '0.0';
            const totalCliquesGeral = emailCampaigns.reduce((acc, c) => acc + parseInt(c.total_cliques || 0, 10), 0);

            const waCampaigns = statsList.filter(c => (c.canal || 'WHATSAPP').toLowerCase() !== 'email');
            const totalWaEnviados = waCampaigns.reduce((acc, c) => acc + parseInt(c.total_enviados || 0, 10), 0);
            const totalWaSucessos = waCampaigns.reduce((acc, c) => acc + parseInt(c.sucessos || 0, 10), 0);

            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {/* Card 1: E-mails Entregues */}
                <div className="p-3.5 rounded-xl bg-bg-primary border border-divider shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-text-secondary">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider">E-mails Disparados</span>
                    <Mail className="text-blue-500" size={16} />
                  </div>
                  <div className="mt-2">
                    <div className="text-xl font-black text-text-primary">{totalEmailSucessos} <span className="text-xs font-normal text-text-secondary">entregues</span></div>
                    <div className="text-[10px] text-text-secondary mt-0.5">Total de {totalEmailEnviados} destinatários processados</div>
                  </div>
                </div>

                {/* Card 2: Taxa de Abertura Real */}
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-emerald-500/10 via-bg-primary to-bg-primary border border-emerald-500/30 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider">Taxa de Abertura</span>
                    <TrendingUp size={16} />
                  </div>
                  <div className="mt-2">
                    <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">{taxaAberturaGeral}%</div>
                    <div className="text-[10px] text-text-secondary mt-0.5">{totalEmailAbertos} leitores únicos ({totalEmailAberturas} aberturas)</div>
                  </div>
                </div>

                {/* Card 3: Abertos vs Não Abertos */}
                <div className="p-3.5 rounded-xl bg-bg-primary border border-divider shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-text-secondary">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider">Abertos vs Não Abertos</span>
                    <MailOpen className="text-indigo-500" size={16} />
                  </div>
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs font-extrabold">
                      <span className="text-emerald-600">👁️ {totalEmailAbertos} abertos</span>
                      <span className="text-slate-400">⏳ {totalEmailNaoAbertos} pendentes</span>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full mt-1.5 overflow-hidden flex">
                      <div 
                        className="bg-emerald-500 h-full transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(0, parseFloat(taxaAberturaGeral)))}%` }}
                        title={`${taxaAberturaGeral}% Abertos`}
                      />
                    </div>
                  </div>
                </div>

                {/* Card 4: Cliques em Links */}
                <div className="p-3.5 rounded-xl bg-bg-primary border border-divider shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-text-secondary">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider">Cliques em Links</span>
                    <MousePointerClick className="text-amber-500" size={16} />
                  </div>
                  <div className="mt-2">
                    <div className="text-xl font-black text-amber-500">{totalCliquesGeral} <span className="text-xs font-normal text-text-secondary">interações</span></div>
                    <div className="text-[10px] text-text-secondary mt-0.5">Destinatários que clicaram nos links/CTAs</div>
                  </div>
                </div>

                {/* Card 5: WhatsApp Disparados */}
                <div className="p-3.5 rounded-xl bg-bg-primary border border-divider shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-text-secondary">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider">WhatsApp Disparados</span>
                    <MessageCircle className="text-emerald-500" size={16} />
                  </div>
                  <div className="mt-2">
                    <div className="text-xl font-black text-text-primary">{totalWaSucessos} <span className="text-xs font-normal text-text-secondary">recebidos</span></div>
                    <div className="text-[10px] text-text-secondary mt-0.5">{totalWaEnviados} mensagens processadas</div>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Tabela de Campanhas com Rastreamento Completo */}
          <div className="overflow-x-auto max-h-[580px] overflow-y-auto border border-slate-300 dark:border-slate-700 rounded-xl shadow-xs bg-white dark:bg-slate-900">
            <table className="w-full text-[11px] text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-[#e2e7ee] dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-black uppercase tracking-wider text-[10px] border-b border-slate-300 dark:border-slate-700">
                <tr>
                  <th className="py-2.5 px-3 border-r border-slate-300 dark:border-slate-700 w-36">DATA DE ENVIO</th>
                  <th className="py-2.5 px-3 border-r border-slate-300 dark:border-slate-700 w-24 text-center">CANAL</th>
                  <th className="py-2.5 px-3 border-r border-slate-300 dark:border-slate-700 min-w-[200px]">CAMPANHA & ASSUNTO / TEXTO</th>
                  <th className="py-2.5 px-3 border-r border-slate-300 dark:border-slate-700 w-32 text-center">ENVIADOS / RECEBIDOS</th>
                  <th className="py-2.5 px-3 border-r border-slate-300 dark:border-slate-700 w-32 text-center">ABERTOS (TAXA %)</th>
                  <th className="py-2.5 px-3 border-r border-slate-300 dark:border-slate-700 w-24 text-center">NÃO ABERTOS</th>
                  <th className="py-2.5 px-3 border-r border-slate-300 dark:border-slate-700 w-24 text-center">CLIQUES</th>
                  <th className="py-2.5 px-3 w-32 text-center">AÇÕES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                {filteredStatsList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 font-semibold italic">
                      Nenhuma campanha encontrada para este filtro. Realize um disparo para visualizar as estatísticas de abertura e cliques.
                    </td>
                  </tr>
                ) : (
                  filteredStatsList.map((c) => {
                    const dateStr = new Date(c.created_at).toLocaleString('pt-BR');
                    const isEmail = (c.canal || '').toUpperCase() === 'EMAIL';
                    const totalEnviados = parseInt(c.total_enviados || 0, 10);
                    const sucessos = parseInt(c.sucessos || 0, 10);
                    const abertos = parseInt(c.total_abertos || 0, 10);
                    const naoAbertos = parseInt(c.total_nao_abertos || 0, 10);
                    const cliques = parseInt(c.total_cliques || 0, 10);
                    const taxaNum = parseFloat(c.taxa_abertura || 0);

                    return (
                      <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors text-[11px] leading-tight">
                        {/* Data */}
                        <td className="py-2 px-3 font-mono text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                          {dateStr}
                        </td>

                        {/* Canal */}
                        <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 text-center">
                          {isEmail ? (
                            <span className="px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950 dark:text-blue-300 inline-flex items-center gap-1">
                              <Mail size={10} /> E-mail
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 inline-flex items-center gap-1">
                              <MessageCircle size={10} /> WhatsApp
                            </span>
                          )}
                        </td>

                        {/* Nome & Assunto / Conteúdo */}
                        <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800">
                          <div className="font-extrabold text-slate-900 dark:text-slate-100 uppercase">{c.nome}</div>
                          <div className="text-[10px] text-slate-500 truncate max-w-[280px]" title={c.assunto || c.conteudo}>
                            {c.assunto || c.conteudo || '—'}
                          </div>
                          {c.template_nome && (
                            <div className="text-[9px] text-brand-600 font-semibold mt-0.5">Modelo: {c.template_nome}</div>
                          )}
                        </td>

                        {/* Enviados / Recebidos */}
                        <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 text-center">
                          <div className="font-black text-slate-900 dark:text-slate-100">{sucessos} <span className="text-[9.5px] font-normal text-emerald-600 font-bold">recebidos</span></div>
                          <div className="text-[9.5px] text-slate-400 font-mono">de {totalEnviados} enviados</div>
                        </td>

                        {/* Aberturas (Pixel) */}
                        <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 text-center">
                          {isEmail ? (
                            <div className="flex flex-col items-center gap-1">
                              <div className="flex items-center gap-1.5 font-black text-emerald-600 dark:text-emerald-400">
                                <span>👁️ {abertos} ({taxaNum.toFixed(1)}%)</span>
                              </div>
                              <div className="w-24 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div 
                                  className="bg-emerald-500 h-full rounded-full"
                                  style={{ width: `${Math.min(100, Math.max(0, taxaNum))}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[10px] font-bold">— (WhatsApp)</span>
                          )}
                        </td>

                        {/* Não Abertos */}
                        <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 text-center">
                          {isEmail ? (
                            <span className="font-bold text-slate-600 dark:text-slate-400 font-mono">
                              {naoAbertos}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px] font-bold">—</span>
                          )}
                        </td>

                        {/* Cliques */}
                        <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 text-center">
                          {isEmail ? (
                            <span className={clsx(
                              "font-black font-mono px-2 py-0.5 rounded text-[10.5px]",
                              cliques > 0 ? "bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950 dark:text-amber-300" : "text-slate-400"
                            )}>
                              {cliques} clique{cliques !== 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px] font-bold">—</span>
                          )}
                        </td>

                        {/* Ações */}
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleOpenTrackingModal(c)}
                            className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/80 dark:text-indigo-300 dark:border-indigo-800 rounded-lg font-extrabold text-[10.5px] flex items-center justify-center gap-1 transition-all cursor-pointer shadow-2xs mx-auto"
                            title="Ver detalhes de quem abriu o e-mail"
                          >
                            <Eye size={12} />
                            <span>{isEmail ? 'Ver Quem Abriu' : 'Ver Destinatários'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL DE DETALHAMENTO: QUEM ABRIU O E-MAIL (PIXEL DE ABERTURA E CLIQUES) */}
      {selectedStatsCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-bg-primary border border-divider rounded-2xl max-w-4xl w-full p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-divider pb-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <MailOpen size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-text-primary">
                      {selectedStatsCampaign.nome}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200">
                      {selectedStatsCampaign.canal || 'E-MAIL'}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Assunto: <strong className="text-text-primary">{selectedStatsCampaign.assunto || selectedStatsCampaign.nome}</strong> • Disparo: {new Date(selectedStatsCampaign.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedStatsCampaign(null)}
                className="p-1 rounded-lg hover:bg-bg-secondary text-text-secondary hover:text-text-primary cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 shrink-0">
              <div className="relative flex-1 w-full">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                <input
                  type="text"
                  placeholder="Pesquisar por nome, e-mail ou documento..."
                  value={trackingSearch}
                  onChange={(e) => setTrackingSearch(e.target.value)}
                  className="w-full bg-bg-secondary text-xs rounded-xl pl-9 pr-3 py-2 border border-divider focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="flex items-center gap-1 bg-bg-secondary p-1 rounded-xl border border-divider text-xs shrink-0">
                <button
                  onClick={() => setTrackingFilter('all')}
                  className={`py-1 px-2.5 rounded-lg font-bold transition-all cursor-pointer ${trackingFilter === 'all' ? 'bg-white dark:bg-bg-primary text-brand-600 shadow-sm' : 'text-text-secondary'}`}
                >
                  Todos ({trackingDestinatarios.length})
                </button>
                <button
                  onClick={() => setTrackingFilter('abertos')}
                  className={`py-1 px-2.5 rounded-lg font-bold transition-all cursor-pointer ${trackingFilter === 'abertos' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 shadow-sm' : 'text-text-secondary'}`}
                >
                  👁️ Abertos ({trackingDestinatarios.filter(d => d.aberto || d.total_aberturas > 0).length})
                </button>
                <button
                  onClick={() => setTrackingFilter('nao_abertos')}
                  className={`py-1 px-2.5 rounded-lg font-bold transition-all cursor-pointer ${trackingFilter === 'nao_abertos' ? 'bg-white dark:bg-bg-primary text-slate-700 shadow-sm' : 'text-text-secondary'}`}
                >
                  ⏳ Não Abertos ({trackingDestinatarios.filter(d => !d.aberto && (!d.total_aberturas || d.total_aberturas === 0)).length})
                </button>
                <button
                  onClick={() => setTrackingFilter('clicados')}
                  className={`py-1 px-2.5 rounded-lg font-bold transition-all cursor-pointer ${trackingFilter === 'clicados' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 shadow-sm' : 'text-text-secondary'}`}
                >
                  🖱️ Clicaram ({trackingDestinatarios.filter(d => d.total_cliques > 0).length})
                </button>
                <button
                  onClick={() => setTrackingFilter('erros')}
                  className={`py-1 px-2.5 rounded-lg font-bold transition-all cursor-pointer ${trackingFilter === 'erros' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 shadow-sm' : 'text-text-secondary'}`}
                >
                  ❌ Com Erro / Falha ({trackingDestinatarios.filter(d => d.status === 'Falha' || !!d.erro).length})
                </button>
              </div>
            </div>

            {/* Modal Body: Recipient Tracking Table */}
            <div className="flex-1 overflow-y-auto border border-slate-300 dark:border-slate-700 rounded-xl shadow-inner bg-white dark:bg-slate-900">
              {loadingTracking ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                  <Loader2 className="animate-spin text-brand-500" size={24} />
                  <span className="text-xs font-bold">Carregando rastreamento de aberturas...</span>
                </div>
              ) : filteredTrackingDestinatarios.length === 0 ? (
                <div className="py-16 text-center text-slate-400 font-semibold italic text-xs">
                  Nenhum destinatário encontrado com os filtros selecionados.
                </div>
              ) : (
                <table className="w-full text-[11px] text-left border-collapse">
                  <thead className="sticky top-0 z-10 bg-[#e2e7ee] dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-black uppercase tracking-wider text-[10px] border-b border-slate-300 dark:border-slate-700">
                    <tr>
                      <th className="py-2.5 px-3 border-r border-slate-300 dark:border-slate-700">DESTINATÁRIO</th>
                      <th className="py-2.5 px-3 border-r border-slate-300 dark:border-slate-700">E-MAIL / CONTATO</th>
                      <th className="py-2.5 px-3 border-r border-slate-300 dark:border-slate-700 text-center w-36">STATUS DE ABERTURA</th>
                      <th className="py-2.5 px-3 border-r border-slate-300 dark:border-slate-700 w-36">1ª ABERTURA</th>
                      <th className="py-2.5 px-3 border-r border-slate-300 dark:border-slate-700 w-36">ÚLTIMA ABERTURA</th>
                      <th className="py-2.5 px-3 text-center w-28">CLIQUES</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredTrackingDestinatarios.map((dest, idx) => {
                      const isErro = dest.status === 'Falha' || !!dest.erro;
                      const foiAberto = !isErro && (!!dest.aberto || dest.total_aberturas > 0);
                      const primeiraAberturaStr = dest.primeira_abertura ? new Date(dest.primeira_abertura).toLocaleString('pt-BR') : '—';
                      const ultimaAberturaStr = dest.ultima_abertura ? new Date(dest.ultima_abertura).toLocaleString('pt-BR') : '—';

                      return (
                        <tr key={dest.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          {/* Nome */}
                          <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800">
                            <div className="font-extrabold text-slate-900 dark:text-slate-100 uppercase">{dest.destinatario_nome}</div>
                            {dest.destinatario_documento && <div className="text-[9.5px] font-mono text-slate-500">{dest.destinatario_documento}</div>}
                            {isErro && dest.erro && (
                              <div className="text-[9.5px] text-rose-600 dark:text-rose-400 mt-0.5 leading-tight font-sans">
                                Motivo: {dest.erro}
                              </div>
                            )}
                          </td>

                          {/* Email */}
                          <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 font-mono text-slate-700 dark:text-slate-300">
                            {dest.destinatario_email || dest.destinatario_telefone || '—'}
                          </td>

                          {/* Status Aberto / Erro */}
                          <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 text-center">
                            {isErro ? (
                              <span className="px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950 dark:text-rose-300 inline-flex items-center gap-1" title={dest.erro || 'Falha no disparo'}>
                                ❌ Falha no Envio
                              </span>
                            ) : foiAberto ? (
                              <span className="px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 inline-flex items-center gap-1">
                                <CheckCircle2 size={10} /> Aberto ({dest.total_aberturas || 1}x)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 inline-flex items-center gap-1">
                                ⏳ Não Aberto
                              </span>
                            )}
                          </td>

                          {/* Primeira Abertura */}
                          <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {primeiraAberturaStr}
                          </td>

                          {/* Última Abertura */}
                          <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {ultimaAberturaStr}
                          </td>

                          {/* Cliques */}
                          <td className="py-2 px-3 text-center">
                            {dest.total_cliques > 0 ? (
                              <span className="px-2 py-0.5 rounded-full text-[9.5px] font-black bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950 dark:text-amber-300">
                                🖱️ {dest.total_cliques} clique{dest.total_cliques > 1 ? 's' : ''}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-mono">0</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-divider pt-3 flex items-center justify-between shrink-0">
              <div className="text-[11px] text-text-secondary">
                Mostrando <strong className="text-text-primary">{filteredTrackingDestinatarios.length}</strong> de <strong className="text-text-primary">{trackingDestinatarios.length}</strong> destinatários
              </div>
              <button
                onClick={() => setSelectedStatsCampaign(null)}
                className="btn-secondary !py-1.5 !px-5 text-xs font-bold rounded-lg cursor-pointer"
              >
                Fechar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal de Gestão Rápida de Automações Módulo a Módulo */}
      {isQuickAutoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-bg-primary border border-divider rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-divider pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-brand-500/10 text-brand-600">
                  <Play size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-text-primary">Controle de Módulos de Envio Automático</h3>
                  <p className="text-[11px] text-text-secondary">Ative ou desative cada rotina de marketing de forma 100% individual</p>
                </div>
              </div>
              <button 
                onClick={() => setIsQuickAutoModalOpen(false)}
                className="p-1 rounded-lg hover:bg-bg-secondary text-text-secondary hover:text-text-primary cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Master Action Banner para Desativação/Ativação Global Imediata */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-bg-secondary/70 border border-divider">
              <div>
                <span className="text-xs font-black text-text-primary block">Ação em Massa:</span>
                <span className="text-[10px] text-text-secondary">Desligue ou ligue todas as automações com 1 clique</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleAllMarketing(false)}
                  disabled={isTogglingAll}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                  title="Desativar todos os módulos de marketing automático"
                >
                  {isTogglingAll ? <Loader2 size={13} className="animate-spin" /> : <Pause size={13} />}
                  <span>🔴 Desativar Todas</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleAllMarketing(true)}
                  disabled={isTogglingAll}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                  title="Ativar todos os módulos de marketing automático"
                >
                  {isTogglingAll ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                  <span>🟢 Ativar Todas</span>
                </button>
              </div>
            </div>

            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
              {[
                { 
                  id: 'aniversario', 
                  nome: 'Aniversariantes do Dia', 
                  desc: 'Felicitações automáticas na data de aniversário', 
                  icon: '🎂'
                },
                { 
                  id: 'pos_compra', 
                  nome: 'Pós-Venda Automático', 
                  desc: 'Acompanhamento após compras faturadas', 
                  icon: '🛍️'
                },
                { 
                  id: 'compra_marca', 
                  nome: 'Compra de Marca X', 
                  desc: 'Ofertas direcionadas para quem comprou marca específica', 
                  icon: '🏷️'
                },
                { 
                  id: 'tempo_em_tempo', 
                  nome: 'Envio Periódico (Tempo em tempo)', 
                  desc: 'Mensagens periódicas em intervalo de dias', 
                  icon: '📅'
                },
              ].map((mod) => {
                const rule = automacoes.find(a => a.gatilho === mod.id)
                const isAtivo = rule ? !!rule.ativo : false
                const isToggling = togglingGatilho === mod.id
                const canalLabel = rule?.canal === 'ambos' ? '🔄 Ambos (WhatsApp + E-mail)' : (rule?.canal === 'email' ? '✉️ E-mail' : '🟢 WhatsApp')

                return (
                  <div 
                    key={mod.id} 
                    className={clsx(
                      "p-3 rounded-xl border transition-all flex items-center justify-between gap-3",
                      isAtivo 
                        ? "bg-emerald-500/5 border-emerald-500/30" 
                        : "bg-bg-secondary/20 border-divider opacity-75 hover:opacity-100"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl select-none">{mod.icon}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-text-primary">{mod.nome}</span>
                          <span className={clsx(
                            "px-1.5 py-0.5 rounded text-[9.5px] font-black uppercase border",
                            isAtivo ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400"
                          )}>
                            {isAtivo ? "ATIVO" : "DESATIVADO"}
                          </span>
                        </div>
                        <p className="text-[10px] text-text-secondary mt-0.5 leading-tight">{mod.desc}</p>
                        <div className="flex items-center gap-2 mt-1 text-[9.5px] text-text-secondary">
                          <span className="font-semibold">Canal: <strong className="text-text-primary font-bold">{canalLabel}</strong></span>
                          {rule?.template_nome && (
                            <span>• Modelo: <strong className="text-text-primary font-bold">{rule.template_nome}</strong></span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleToggleSingleTrigger(mod.id)}
                      disabled={isToggling}
                      className={clsx(
                        "px-3 py-1.5 rounded-xl font-black text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-xs border shrink-0",
                        isAtivo
                          ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-300"
                          : "bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700 shadow-sm"
                      )}
                    >
                      {isToggling ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : isAtivo ? (
                        "Desativar"
                      ) : (
                        "Ativar"
                      )}
                    </button>
                  </div>
                )
              })}
            </div>

            <div className="border-t border-divider pt-3 flex items-center justify-between">
              <button
                onClick={() => {
                  setIsQuickAutoModalOpen(false)
                  navigate('/config-integracoes?tab=automacoes')
                }}
                className="text-[11px] text-brand-600 hover:underline flex items-center gap-1 font-bold cursor-pointer"
              >
                <Settings size={13} />
                Configurar Modelos, Canais e Intervalos
              </button>

              <button
                onClick={() => setIsQuickAutoModalOpen(false)}
                className="btn-secondary !py-1 !px-4 text-xs font-bold rounded-lg cursor-pointer"
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
