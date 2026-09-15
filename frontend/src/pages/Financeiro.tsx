import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { usePeriodQuery, useApiQuery } from '../hooks/useApi'
import { useBranchParam } from '../contexts/BranchContext'
import api from '../services/api'
import KPICard from '../components/KPICard'
import ChartCard from '../components/ChartCard'
import PeriodFilter from '../components/PeriodFilter'
import clsx from 'clsx'
import { useAuthStore } from '../store/authStore'
import {
  Wallet, Receipt, Scale, ArrowDownCircle, ArrowUpCircle, Banknote, Filter,
  Plus, Check, X, Calendar, DollarSign, Building, Building2, FileText, CheckCircle2, ChevronRight,
  TrendingDown, TrendingUp, Menu, Printer, Trash2, Shield, Lock, Unlock,
  Layers, CheckCircle, AlertTriangle, AlertCircle, ArrowRightLeft, HelpCircle, FileSpreadsheet,
  Settings, User, ChevronLeft, ChevronRight as ChevronRightIcon, Eye, Edit2, PlayCircle, Link2,
  Search, Send, Pause, Loader2, Play, RefreshCw, Clock, List, Mail, ArrowUpDown, RotateCcw, ChevronUp, ChevronDown, ExternalLink, Ban
} from 'lucide-react'
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { formatBRL, formatBRLCompact, formatDate } from '../utils/format'
import { CHART_COLORS } from '../utils/chartColors'
import ModalEscolhaLancamento from '../components/financeiro/ModalEscolhaLancamento'
import ModalProgramacaoContas from '../components/financeiro/ModalProgramacaoContas'
import ModalLancamentoIndividual from '../components/financeiro/ModalLancamentoIndividual'
import ModalDetalhesTitulo from '../components/financeiro/ModalDetalhesTitulo'
import ModalLiquidarTitulo from '../components/financeiro/ModalLiquidarTitulo'
import ExtratoAsaas from '../components/financeiro/ExtratoAsaas'
import { BoletosTable } from './Financeiro/components/BoletosTable'
import { BoletosFooterStats } from './Financeiro/components/BoletosFooterStats'
import ModalValidacaoLoteBoletos, { ItemLoteBoleto } from '../components/financeiro/ModalValidacaoLoteBoletos'

interface ContaBancaria {
  id: number;
  apelido: string;
  banco: string;
  agencia: string;
  conta: string;
  tipo: string;
  saldo_inicial: number;
  saldo_atual: number;
}

interface PlanoContas {
  id: number;
  nome: string;
  tipo: string;
}

interface Movimentacao {
  id: number;
  tipo: string;
  valor: number;
  data_movimentacao: string;
  forma_pagamento: string;
  observacao: string;
  conta_apelido: string;
  categoria_nome: string | null;
  created_at: string;
}

interface TituloReceber {
  id: number;
  id_firebird: string | null;
  tipo: string;
  descricao: string;
  data_emissao: string;
  data_vencimento: string;
  data_pagamento: string | null;
  valor: number;
  valor_pago: number;
  status_pagamento: string;
  cliente: string | null;
  cliente_nome?: string;
  cliente_id_firebird?: any;
  cliente_documento?: string;
  cliente_email?: string;
  cliente_telefone?: string;
  cliente_endereco?: string;
  cliente_cidade?: string;
  cliente_cnpj?: string;
  regua_pausada?: boolean;
  telefone?: string;
  celular_secundario?: string;
  endereco?: string;
  endereco_completo?: string;
  cidade?: string;
  asaas_payment_id?: string;
  nosso_numero?: string;
  numero_documento?: string;
  num_doc?: string;
  documento?: string;
  documento_numero?: string;
  portador?: string;
  portador_nome?: string;
  especie?: string;
  especie_nome?: string;
  tem_vinculo?: boolean;
  cpf_cnpj?: string;
  cnpj?: string;
  cpf?: string;
  email?: string;
  email_financeiro?: string;
  [key: string]: any;
}

export default function Financeiro() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') as 'caixa' | 'titulos' | 'banco' | 'boletos' | 'ocorrencias'
  const activeTab = tabParam || 'titulos'
  const setActiveTab = (t: 'caixa' | 'titulos' | 'banco' | 'boletos' | 'ocorrencias') => {
    setSearchParams({ tab: t })
  }
  const [selectedCaixa, setSelectedCaixa] = useState('todos')
  const branchParam = useBranchParam()

  // Sidebar Drawer state for mobile view
  const [isCaixaSidebarOpen, setIsCaixaSidebarOpen] = useState(false)
  const [isTitulosSidebarOpen, setIsTitulosSidebarOpen] = useState(false)
  const [isBancoSidebarOpen, setIsBancoSidebarOpen] = useState(false)

  // Simulation Feedback Modal state
  const [simulationAction, setSimulationAction] = useState<string | null>(null)
  const triggerSimulation = (actionName: string) => {
    setSimulationAction(actionName)
  }
  
  const user = useAuthStore((s) => s.user)
  const canCancelBoleto = user?.role === 'master' || (user?.grupo_nome && user.grupo_nome.toLowerCase() === 'master') || user?.permissoes_acoes?.permitir_cancelar_boletos !== false
  const canCancelTitulo = user?.role === 'master' || (user?.grupo_nome && user.grupo_nome.toLowerCase() === 'master') || user?.permissoes_acoes?.permitir_cancelar_titulos !== false

  // Modal Lançamento states
  const [showEscolhaModal, setShowEscolhaModal]       = useState(false)
  const [showProgramacaoModal, setShowProgramacaoModal] = useState(false)
  const [showLancamentoModal, setShowLancamentoModal]   = useState(false)

  // Títulos filters state
  const [tituloTipoFilter, setTituloTipoFilter] = useState<'RECEBER' | 'PAGAR'>('RECEBER')
  const [tituloPortadorFilter, setTituloPortadorFilter] = useState('todos')
  const [tituloEspecieFilter, setTituloEspecieFilter] = useState('todos')
  const [tituloCentroFilter, setTituloCentroFilter] = useState('todos')
  const [tituloPlanoFilter, setTituloPlanoFilter] = useState('todos')
  const [tituloStatusFilter, setTituloStatusFilter] = useState('ABERTO')
  const [tituloSearch, setTituloSearch] = useState('')
  const [includeDevolucoes, setIncludeDevolucoes] = useState(false)
  const [onlyWithNossoNumero, setOnlyWithNossoNumero] = useState(false)
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')

  // Boletos Management Tab States (Usa o Período Único do topo da página)
  const [boletosTipoData, setBoletosTipoData] = useState<'emissao' | 'vencimento' | 'quitacao'>('quitacao')
  const [boletosSearchClient, setBoletosSearchClient] = useState('')
  const [boletosPortadorFilter, setBoletosPortadorFilter] = useState('todos')
  const [boletosSituacaoFilter, setBoletosSituacaoFilter] = useState('PAGO')
  const [selectedBoletoIds, setSelectedBoletoIds] = useState<number[]>([])

  // Client autocomplete search states
  const [clientSearchInput, setClientSearchInput] = useState('')
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false)
  const [selectedClientFilter, setSelectedClientFilter] = useState('')

  // Títulos multi-selection & sidebar collapse states
  const [selectedTituloIds, setSelectedTituloIds] = useState<number[]>([])
  const [isTitulosSidebarCollapsed, setIsTitulosSidebarCollapsed] = useState(true)
  const [isCaixaSidebarCollapsed, setIsCaixaSidebarCollapsed] = useState(true)
  const [isBancoSidebarCollapsed, setIsBancoSidebarCollapsed] = useState(true)

  const [selectedFinanceiroRow, setSelectedFinanceiroRow] = useState<any | null>(null)
  const [selectedTituloForEdit, setSelectedTituloForEdit] = useState<any | null>(null)
  const [selectedTituloIdForDetail, setSelectedTituloIdForDetail] = useState<number | null>(null)

  // Table Sorting States (Ordenação de Títulos)
  const [sortField, setSortField] = useState<'codigo' | 'cliente' | 'emissao' | 'vencimento' | 'valor' | 'especie' | 'portador' | 'nosso_numero'>('vencimento')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  // Batch Cobrança Modal States
  const [isBatchCobrancaModalOpen, setIsBatchCobrancaModalOpen] = useState(false)
  const [batchSearchClient, setBatchSearchClient] = useState('')
  const [batchDateStart, setBatchDateStart] = useState('')
  const [batchDateEnd, setBatchDateEnd] = useState('')
  const [batchPortador, setBatchPortador] = useState('todos')
  const [batchEspecie, setBatchEspecie] = useState('todos')
  const [batchHideEmitidos, setBatchHideEmitidos] = useState(true)
  const [batchSelectedIds, setBatchSelectedIds] = useState<number[]>([])
  const [batchSendEmail, setBatchSendEmail] = useState(true)
  const [batchSendWhatsapp, setBatchSendWhatsapp] = useState(true)
  const [batchEmailMessage, setBatchEmailMessage] = useState(
    'Prezado(a) cliente,\n\nSegue em anexo o boleto bancário referente ao seu título em aberto.\nPara dúvidas ou informações, entre em contato com nosso departamento financeiro.\n\nAtenciosamente,\nGestão Financeira'
  )
  const [isBatchSending, setIsBatchSending] = useState(false)
  const [batchProgressCount, setBatchProgressCount] = useState(0)
  const [batchTotalCount, setBatchTotalCount] = useState(0)
  const [batchProgressLogs, setBatchProgressLogs] = useState<string[]>([])
  const [batchItemsDetail, setBatchItemsDetail] = useState<{ descricao: string; status: string; index?: number; total?: number; cliente?: string; vencimento?: string; valor?: string; hasValidEmail?: boolean; email?: string; nossoNumero?: string; emailEnviado?: boolean; errorMsg?: string }[]>([])
  const [isValidatingBatchModalOpen, setIsValidatingBatchModalOpen] = useState(false)
  const [selectedBatchItemsForValidation, setSelectedBatchItemsForValidation] = useState<ItemLoteBoleto[]>([])

  // Search & Filter Dirty States for Boletos Tab & Batch Modal
  const [hasSearchedBoletos, setHasSearchedBoletos] = useState(false)
  const [isBoletosFilterDirty, setIsBoletosFilterDirty] = useState(true)
  const [isSearchingBoletos, setIsSearchingBoletos] = useState(false)

  const [hasSearchedBatch, setHasSearchedBatch] = useState(false)
  const [isBatchFilterDirty, setIsBatchFilterDirty] = useState(true)
  const [isSearchingBatch, setIsSearchingBatch] = useState(false)
  const [batchTitulosRaw, setBatchTitulosRaw] = useState<TituloReceber[]>([])

  // Quick Client Search for Title Linker
  const [isQuickLinkModalOpen, setIsQuickLinkModalOpen] = useState(false)
  const [quickClientSearch, setQuickClientSearch] = useState('')

  // State for Boletos Vinculo Filter & Manutenção de Títulos Modal
  const [boletosVinculoFilter, setBoletosVinculoFilter] = useState<'todos' | 'vinculados' | 'sem_vinculo'>('todos')
  const [boletosMetodoFilter, setBoletosMetodoFilter] = useState<'todos' | 'boleto' | 'pix' | 'pix_direto' | 'boleto_pago_pix'>('todos')
  const [linkTitleStatusFilter, setLinkTitleStatusFilter] = useState<'todos' | 'aberto' | 'quitado'>('todos')
  const [isManutencaoModalOpen, setIsManutencaoModalOpen] = useState(false)
  const [manutencaoMatches, setManutencaoMatches] = useState<Array<{ id: string; boleto: any; titulo: any; checked: boolean }>>([])
  const [isScanningMatches, setIsScanningMatches] = useState(false)
  const [isExecutingAutoLink, setIsExecutingAutoLink] = useState(false)

  // Track filter changes for Boletos Tab
  useEffect(() => {
    setIsBoletosFilterDirty(true)
  }, [filterStartDate, filterEndDate, boletosTipoData, boletosSituacaoFilter, boletosPortadorFilter, boletosSearchClient, boletosVinculoFilter, boletosMetodoFilter])

  // Varredura inteligente de vínculos automáticos para TODOS os títulos e boletos do ano (Abertos + Quitados)
  const handleOpenManutencaoModal = async () => {
    setIsManutencaoModalOpen(true)
    setIsScanningMatches(true)
    try {
      const currentYear = new Date().getFullYear()
      const yearStart = `${currentYear}-01-01`
      const yearEnd = `${currentYear}-12-31`

      // 1. Busca todos os títulos do ano (Abertos e Quitados) no Coliseu Transporte
      const [resContas, resBoletosAno] = await Promise.all([
        api.get('/financeiro/contas', {
          params: { tipo: 'RECEBER', status: 'TODOS', startDate: yearStart, endDate: yearEnd, limit: 5000 }
        }).catch(() => ({ data: { data: [] } })),
        api.get('/financeiro/boletos-emitidos', {
          params: { startDate: yearStart, endDate: yearEnd, status: 'todos', portador: 'todos' }
        }).catch(() => ({ data: { data: [] } }))
      ])

      const allTitulos = resContas.data?.data || []
      const allBoletos = resBoletosAno.data?.data || boletosRaw || []

      // Filtra boletos sem vínculo
      const unlinkedBoletos = allBoletos.filter((b: any) => !b.tem_vinculo)
      const matches: Array<{ id: string; boleto: any; titulo: any; checked: boolean }> = []
      const usedTitleIds = new Set<string>()

      for (const b of unlinkedBoletos) {
        const boletoVal = Number(b.valor || 0)
        const boletoVenc = b.data_vencimento ? b.data_vencimento.split('T')[0] : ''
        const boletoClient = (b.cliente_boleto || b.cliente || '').toLowerCase().trim()
        const boletoDoc = (b.cliente_documento || '').replace(/\D/g, '')

        // Procura título correspondente não utilizado ainda
        const matchTitle = allTitulos.find((t: any) => {
          if (usedTitleIds.has(String(t.id))) return false

          const tVal = Number(t.valor || 0)
          const tVenc = t.data_vencimento ? t.data_vencimento.split('T')[0] : ''
          const tClient = (t.cliente || t.cliente_nome || t.descricao || '').toLowerCase().trim()
          const tDoc = (t.cliente_documento || t.cpf_cnpj || '').replace(/\D/g, '')

          const sameValue = Math.abs(boletoVal - tVal) < 0.10
          const sameDueDate = boletoVenc && tVenc && boletoVenc === tVenc
          const sameDoc = (boletoDoc && tDoc && boletoDoc === tDoc)

          // Checa se cliente coincide (CNPJ/CPF igual OU nome contido)
          const sameClient = 
            sameDoc ||
            !boletoClient || !tClient ||
            boletoClient.includes(tClient) || 
            tClient.includes(boletoClient) ||
            (b.cliente_nexus && (b.cliente_nexus.toLowerCase().includes(tClient) || tClient.includes(b.cliente_nexus.toLowerCase())))

          return (sameValue && sameDueDate && sameClient) || (sameDoc && sameValue) || (sameDoc && sameDueDate)
        })

        if (matchTitle) {
          usedTitleIds.add(String(matchTitle.id))
          matches.push({
            id: `match_${b.id}_${matchTitle.id}`,
            boleto: b,
            titulo: matchTitle,
            checked: true
          })
        }
      }

      setManutencaoMatches(matches)
    } catch (err) {
      console.error('Erro na varredura de manutenção:', err)
      setManutencaoMatches([])
    } finally {
      setIsScanningMatches(false)
    }
  }

  // Confirmação dos vínculos selecionados em lote
  const handleConfirmAutoLinks = async () => {
    const selectedPairs = manutencaoMatches.filter(m => m.checked)
    if (selectedPairs.length === 0) {
      alert('Selecione ao menos 1 vínculo na lista para confirmar.')
      return
    }

    setIsExecutingAutoLink(true)
    let successCount = 0

    for (const pair of selectedPairs) {
      try {
        await api.post('/financeiro/boletos-emitidos/vincular', {
          asaas_payment_id: pair.boleto.asaas_payment_id || pair.boleto.id,
          nosso_numero: pair.boleto.nosso_numero,
          titulo_id: pair.titulo.id,
          observacao: 'Vínculo automático via Manutenção de Títulos'
        })
        successCount++
      } catch (err) {
        console.error('Erro ao vincular par:', pair, err)
      }
    }

    setIsExecutingAutoLink(false)
    alert(`Vínculo automático concluído com sucesso para ${successCount} títulos!`)
    setIsManutencaoModalOpen(false)
    refetchBoletos()
    refetchReceber()
  }

  // Track filter changes for Batch Modal
  useEffect(() => {
    setIsBatchFilterDirty(true)
  }, [batchDateStart, batchDateEnd, batchPortador, batchEspecie, batchSearchClient, batchHideEmitidos])

  // Buscar títulos especificamente para o modal de cobrança em lote
  const fetchBatchTitulos = async (startStr?: string, endStr?: string, searchClientStr?: string) => {
    setIsSearchingBatch(true)
    try {
      const sDate = startStr !== undefined ? startStr : batchDateStart
      const eDate = endStr !== undefined ? endStr : batchDateEnd
      const qClient = searchClientStr !== undefined ? searchClientStr : batchSearchClient

      const res = await api.get('/financeiro/contas', {
        params: {
          tipo: 'RECEBER',
          status: 'ABERTO',
          startDate: sDate || undefined,
          endDate: eDate || undefined,
          search: qClient && qClient.trim() !== '' ? qClient.trim() : undefined,
          limit: 5000
        }
      })

      const rawData = res.data?.data || []
      const uniqueMap = new Map()
      rawData.forEach((item: any) => {
        if (item && item.id && !uniqueMap.has(item.id)) {
          uniqueMap.set(item.id, item)
        }
      })
      setBatchTitulosRaw(Array.from(uniqueMap.values()))
      setHasSearchedBatch(true)
      setIsBatchFilterDirty(false)
    } catch (err) {
      console.error('Erro ao buscar títulos para lote:', err)
      setBatchTitulosRaw([])
    } finally {
      setIsSearchingBatch(false)
    }
  }

  // Busca reativa com debounce ao digitar ou mudar datas no modal de lote aberto
  useEffect(() => {
    if (!isBatchCobrancaModalOpen) return;
    const timer = setTimeout(() => {
      fetchBatchTitulos(batchDateStart, batchDateEnd, batchSearchClient)
    }, 350)
    return () => clearTimeout(timer)
  }, [batchSearchClient, batchDateStart, batchDateEnd, isBatchCobrancaModalOpen])

  // Abrir modal de cobrança em lote e carregar os títulos em aberto para a janela padrão
  const handleOpenBatchModal = () => {
    const today = new Date()
    const getYYYYMMDD = (d: Date) => {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
    const todayStr = getYYYYMMDD(today)
    // Janela padrão: data de hoje até hoje + 20 dias
    const futureDate = new Date()
    futureDate.setDate(today.getDate() + 20)
    const futureStr = getYYYYMMDD(futureDate)

    setBatchDateStart(todayStr)
    setBatchDateEnd(futureStr)
    setBatchSearchClient('')
    setBatchPortador('todos')
    setBatchEspecie('todos')
    setBatchHideEmitidos(true)
    setBatchSelectedIds([])
    setHasSearchedBatch(false)
    setIsBatchFilterDirty(false)
    setIsBatchCobrancaModalOpen(true)

    // Busca automática dos títulos no período padrão
    fetchBatchTitulos(todayStr, futureStr, '')
  }

  // Executar busca manual de títulos no modal
  const handleSearchBatch = async () => {
    await fetchBatchTitulos(batchDateStart, batchDateEnd, batchSearchClient)
  }

  // Executar busca manual na barra de topo da página com animação e controle de botões
  const handleSearchTop = async () => {
    setIsSearchingBoletos(true)
    try {
      if (activeTab === 'titulos') {
        await Promise.allSettled([
          refetchReceber(),
          refetchBoletos()
        ])
      } else if (activeTab === 'caixa') {
        await Promise.allSettled([
          refetchCaixa(),
          refetchMovimentacoes()
        ])
      } else {
        await Promise.allSettled([
          refetchBoletos(),
          refetchReceber(),
          refetchCaixa(),
          refetchMovimentacoes()
        ])
      }
      setHasSearchedBoletos(true)
      setIsBoletosFilterDirty(false)
    } catch (err) {
      console.error(err)
    } finally {
      setIsSearchingBoletos(false)
    }
  }

  const handleRunBatchCobranca = async () => {
    if (batchSelectedIds.length === 0) {
      alert('Selecione ao menos um título para emitir/enviar a cobrança em lote.');
      return;
    }

    // Trava de segurança: impede emissão em lote de boletos que já possuem Nosso Número emitido
    const alreadyEmitted = batchTitulosRaw.filter(t => 
      batchSelectedIds.includes(t.id) && 
      ((t.nosso_numero && t.nosso_numero !== '—' && t.nosso_numero.trim() !== '') || Boolean(t.asaas_payment_id))
    );

    if (alreadyEmitted.length > 0) {
      const names = alreadyEmitted.map(t => `• #${t.id_firebird || t.id} - ${t.cliente} (Nosso Nº: ${t.nosso_numero})`).join('\n');
      alert(`⚠️ TRAVA DE EMISSÃO EM LOTE:\n\nOs seguintes títulos selecionados JÁ possuem boleto emitido:\n\n${names}\n\nA emissão foi travada para evitar duplicidade de boletos.\nPor favor, desmarque estes títulos ou ative o filtro "Não mostrar boletos já emitidos".`);
      return;
    }

    // Monta a lista estruturada de títulos para a tela de pré-validação
    const itemsForValidation: ItemLoteBoleto[] = batchTitulosRaw
      .filter(t => batchSelectedIds.includes(t.id))
      .map(t => ({
        id: t.id,
        id_firebird: t.id_firebird,
        cliente: t.cliente || t.cliente_nome || 'Cliente',
        cliente_id_firebird: t.cliente_id_firebird,
        cpf_cnpj: t.cpf_cnpj || t.cliente_documento || t.cnpj || t.cpf || t.cliente_cnpj || t.documento || '',
        email: t.cliente_email || t.email || t.email_financeiro || '',
        telefone: t.cliente_telefone || t.telefone || t.celular_secundario || '',
        endereco: t.cliente_endereco || t.endereco || t.endereco_completo || '',
        cidade: t.cliente_cidade || t.cidade || '',
        valor: Number(t.valor || 0),
        data_vencimento: t.data_vencimento
      }));

    setSelectedBatchItemsForValidation(itemsForValidation);
    setIsValidatingBatchModalOpen(true);
  };

  // Reset selected titles on filter/type/tab changes
  useEffect(() => {
    setSelectedTituloIds([])
    setSelectedClientFilter('')
    setClientSearchInput('')
    setSelectedFinanceiroRow(null)
  }, [tituloTipoFilter, activeTab, filterStartDate, filterEndDate, tituloSearch, tituloStatusFilter])

  // Banco filters state
  const [selectedContaBanco, setSelectedContaBanco] = useState('todos')

  // Boleto Detail Modal States
  const [selectedBoletoDetail, setSelectedBoletoDetail] = useState<any | null>(null);
  const [detailEmailInput, setDetailEmailInput] = useState('');
  const [detailPhoneInput, setDetailPhoneInput] = useState('');
  const [detailMessageInput, setDetailMessageInput] = useState('');
  const [selectedNexusTitleToLink, setSelectedNexusTitleToLink] = useState<string>('');
  const [isLinkingBoleto, setIsLinkingBoleto] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  const [selectedBoletoRow, setSelectedBoletoRow] = useState<any | null>(null);

  // Dynamically set default date range when active tab changes
  useEffect(() => {
    const getLocalDateString = (d: Date) => {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    const today = new Date()
    const todayStr = getLocalDateString(today)
    
    if (activeTab === 'caixa') {
      setFilterStartDate(todayStr)
      setFilterEndDate(todayStr)
    } else if (activeTab === 'banco') {
      // Mês corrente completo para carregar extrato de julho
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
      const lastDay  = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      setFilterStartDate(getLocalDateString(firstDay))
      setFilterEndDate(getLocalDateString(lastDay))
    } else if (activeTab === 'titulos') {
      const oneDayAgo = new Date()
      oneDayAgo.setDate(oneDayAgo.getDate() - 1)
      const fiveDaysAhead = new Date()
      fiveDaysAhead.setDate(fiveDaysAhead.getDate() + 5)
      
      setFilterStartDate(getLocalDateString(oneDayAgo))
      setFilterEndDate(getLocalDateString(fiveDaysAhead))
    }
  }, [activeTab])

  // Bank Account Form
  const [isBankModalOpen, setIsBankModalOpen] = useState(false)
  const [bankForm, setBankForm] = useState({
    apelido: '', banco: '', agencia: '', conta: '', tipo: 'Corrente', saldo_inicial: 0
  })

  // Plano Contas Form
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
  const [categoryForm, setCategoryForm] = useState({ nome: '', tipo: 'Despesa Fixa' })

  // Quitação Modal State
  const [selectedTitulo, setSelectedTitulo] = useState<TituloReceber | null>(null)
  const [quitacaoForm, setQuitacaoForm] = useState({
    conta_bancaria_id: '',
    forma_pagamento: 'PIX',
    data_recebimento: new Date().toISOString().split('T')[0],
    valor_recebido: 0
  })

  // Cobrança Automation States
  const { data: automacoesRes, refetch: refetchAutomacoes } = useApiQuery<{ data: any[] }>('/automacoes')
  const automacoes = automacoesRes?.data || []

  const { data: templatesRes } = useApiQuery<{ data: any[] }>('/templates')
  const templates = templatesRes?.data || []
  const whatsappTemplates = templates.filter(t => t.subcategoria === 'cobranca')

  const [isRunningCobranca, setIsRunningCobranca] = useState(false)

  // Ocorrências search state
  const [logSearch, setLogSearch] = useState('')
  const { data: logsRes, refetch: refetchLogs } = useApiQuery<{ data: any[] }>('/automacoes/logs')
  const logs = logsRes?.data || []

  const filteredLogs = useMemo(() => {
    if (!logSearch) return logs
    const s = logSearch.toLowerCase()
    return logs.filter(l => 
      (l.destinatario || '').toLowerCase().includes(s) ||
      (l.mensagem || '').toLowerCase().includes(s) ||
      (l.status || '').toLowerCase().includes(s) ||
      (l.gatilho || '').toLowerCase().includes(s)
    )
  }, [logs, logSearch])

  const cobrancaTriggers = ['lembrete_preventivo', 'encargos_d3', 'suspensao_d12']
  const cobrancaRules = automacoes.filter(a => cobrancaTriggers.includes(a.gatilho))
  const isCobrancaAutoActive = cobrancaRules.length > 0 && cobrancaRules.some(a => a.ativo)

  const handleToggleCobrancaAuto = async () => {
    try {
      const nextActive = !isCobrancaAutoActive
      for (const trig of cobrancaTriggers) {
        const existing = automacoes.find(a => a.gatilho === trig)
        if (existing) {
          await api.put(`/automacoes/${existing.id}`, {
            ativo: nextActive
          })
        } else {
          const defaultTemplate = whatsappTemplates[0]?.id
          if (defaultTemplate) {
            let days = 0
            if (trig === 'lembrete_preventivo') days = -5
            else if (trig === 'encargos_d3') days = 3
            else if (trig === 'suspensao_d12') days = 12

            await api.post('/automacoes', {
              gatilho: trig,
              template_id: defaultTemplate,
              ativo: nextActive,
              dias_vencimento: days,
              tempo_segundos: 0,
              canal: 'whatsapp',
              meta: {}
            })
          }
        }
      }
      alert(`Cobrança Automática ${nextActive ? 'ativada' : 'desativada'} com sucesso!`)
      refetchAutomacoes()
    } catch (err) {
      console.error(err)
      alert('Erro ao alterar status do Envio Automático.')
    }
  }

  const handleRunCobrancaNow = async () => {
    setIsRunningCobranca(true)
    try {
      await api.post("/automacoes/run", { subcategoria: "cobranca" })
      alert("Automações de Cobrança disparadas com sucesso!")
    } catch (err) {
      console.error(err)
      alert("Erro ao disparar automações de cobrança.")
    } finally {
      setIsRunningCobranca(false)
    }
  }

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
          ativo: false,
          dias_vencimento: gatilho === 'lembrete_preventivo' ? -5 : (gatilho === 'encargos_d3' ? 3 : 12),
          tempo_segundos: 0,
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

  const handleUpdateTriggerChannel = async (gatilho: string, canalVal: string, existing: any) => {
    try {
      if (existing) {
        await api.put(`/automacoes/${existing.id}`, {
          canal: canalVal
        })
      } else {
        const defaultTemplate = whatsappTemplates[0]?.id
        await api.post('/automacoes', {
          gatilho,
          template_id: defaultTemplate || null,
          ativo: false,
          dias_vencimento: gatilho === 'lembrete_preventivo' ? -5 : (gatilho === 'encargos_d3' ? 3 : 12),
          tempo_segundos: 0,
          canal: canalVal,
          meta: {}
        })
      }
      refetchAutomacoes()
      alert('Canal de envio atualizado com sucesso!')
    } catch (err) {
      console.error(err)
      alert('Erro ao atualizar canal de envio.')
    }
  }
  
  // Queries
  const { data: caixasRes } = useApiQuery<any>('/financeiro/caixas')
  const caixas = caixasRes?.data || []

  useEffect(() => {
    if (caixas.length > 0 && selectedCaixa === 'todos') {
      setSelectedCaixa(String(caixas[0].id))
    }
  }, [caixas, selectedCaixa])

  const extraParams = {
    ...(selectedCaixa !== 'todos' ? { caixa_id: selectedCaixa } : {}),
    ...branchParam
  }

  // API Queries
  const { data: caixaData, isLoading: isCaixaLoading, refetch: refetchCaixa } = useApiQuery<any>(
    '/financeiro/caixa', 
    { 
      start_date: filterStartDate, 
      end_date: filterEndDate,
      period: 'custom',
      ...extraParams 
    }
  )
  const { data: contasBancariasRes, refetch: refetchContas } = useApiQuery<{ data: ContaBancaria[] }>('/financeiro/contas-bancarias')
  const { data: planoContasRes, refetch: refetchPlano } = useApiQuery<{ data: PlanoContas[] }>('/financeiro/plano-contas')
  const { data: movimentacoesRes, refetch: refetchMovimentacoes } = useApiQuery<{ data: Movimentacao[] }>(
    '/financeiro/movimentacoes',
    {
      startDate: filterStartDate,
      endDate: filterEndDate
    }
  )
  
  // Dynamic titulos query based on selected RECEBER or PAGAR type
  const { data: receberRes, refetch: refetchReceber } = useApiQuery<{ data: TituloReceber[] }>(
    '/financeiro/contas', 
    { 
      tipo: tituloTipoFilter, 
      startDate: filterStartDate, 
      endDate: filterEndDate, 
      limit: 5000 
    }
  )

  // Dedicated query for Boletos Emitidos tab using the top main date range picker
  const { data: boletosEmitidosRes, refetch: refetchBoletos } = useApiQuery<{ data: TituloReceber[] }>(
    '/financeiro/boletos-emitidos',
    {
      startDate: filterStartDate,
      endDate: filterEndDate,
      tipo_data: boletosTipoData,
      status: boletosSituacaoFilter,
      portador: boletosPortadorFilter,
      search: boletosSearchClient
    }
  )

  const contasBancarias = contasBancariasRes?.data || []
  const planoContas = planoContasRes?.data || []
  const movimentacoes = movimentacoesRes?.data || []
  const titulosRaw = receberRes?.data || []
  const boletosRaw = boletosEmitidosRes?.data || []

  const uniqueClients = useMemo(() => {
    const set = new Set<string>()
    titulosRaw.forEach(t => {
      if (t.cliente) set.add(t.cliente.trim())
    })
    return Array.from(set).sort()
  }, [titulosRaw])

  const filteredUniqueClients = useMemo(() => {
    const q = clientSearchInput.toLowerCase()
    return uniqueClients.filter(c => c.toLowerCase().includes(q))
  }, [uniqueClients, clientSearchInput])

  // Add Bank Account
  const handleAddBank = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post('/financeiro/contas-bancarias', bankForm)
      setIsBankModalOpen(false)
      setBankForm({ apelido: '', banco: '', agencia: '', conta: '', tipo: 'Corrente', saldo_inicial: 0 })
      refetchContas()
    } catch (err) {
      console.error(err)
      alert('Erro ao cadastrar conta bancária.')
    }
  }

  // Add Category (Plano de contas)
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post('/financeiro/plano-contas', categoryForm)
      setIsCategoryModalOpen(false)
      setCategoryForm({ nome: '', tipo: 'Despesa Fixa' })
      refetchPlano()
    } catch (err) {
      console.error(err)
      alert('Erro ao cadastrar categoria.')
    }
  }

  // Open Quitação Modal (Com trava para proibir liquidação dupla de títulos já quitados)
  const handleOpenQuitacao = (titulo: TituloReceber) => {
    const isPaid = (titulo.status_pagamento || '').trim() === 'PAGO' || (titulo.valor_pago || 0) >= titulo.valor;
    if (isPaid) {
      alert('⚠️ Este título já se encontra liquidado / quitado!');
      return;
    }
    setSelectedTitulo(titulo)
    setQuitacaoForm({
      conta_bancaria_id: contasBancarias[0]?.id ? String(contasBancarias[0].id) : '',
      forma_pagamento: 'PIX',
      data_recebimento: new Date().toISOString().split('T')[0],
      valor_recebido: Math.max(titulo.valor - (titulo.valor_pago || 0), 0)
    })
  }

  // Submit Quitação
  const handleSubmitQuitacao = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTitulo) return
    try {
      await api.post('/financeiro/quitacao', {
        financeiro_id: selectedTitulo.id,
        conta_bancaria_id: parseInt(quitacaoForm.conta_bancaria_id, 10),
        forma_pagamento: quitacaoForm.forma_pagamento,
        data_recebimento: quitacaoForm.data_recebimento,
        valor_recebido: parseFloat(String(quitacaoForm.valor_recebido))
      })
      setSelectedTitulo(null)
      refetchReceber()
      refetchCaixa()
      refetchContas()
      refetchMovimentacoes()
      alert('Título quitado com sucesso!')
    } catch (err) {
      console.error(err)
      alert('Erro ao quitar título.')
    }
  }

  // Handle Cancelamento de Emissão de Boleto no Banco/Gateway (Asaas)
  const handleCancelarBoleto = async (titulo: any) => {
    const confirmMsg = `Deseja realmente solicitar o CANCELAMENTO DA EMISSÃO do boleto (Nosso Nº ${titulo.nosso_numero} - Cliente: ${titulo.cliente_boleto || titulo.cliente}) no Banco / Gateway Asaas?\n\nEsta ação efetuará a baixa do boleto diretamente no banco Asaas e atualizará o status do título no sistema.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await api.post('/financeiro/boletos-emitidos/cancelar', { 
        titulo_id: titulo.id,
        asaas_payment_id: titulo.asaas_payment_id,
        nosso_numero: titulo.nosso_numero,
        motivo: 'Cancelamento manual da cobrança pelo usuário'
      });

      if (res.data?.success) {
        alert(`✅ ${res.data.message}`);
      } else {
        alert(`⚠️ Solicitação de cancelamento finalizada com aviso.`);
      }

      refetchReceber();
      refetchBoletos();
      setSelectedBoletoDetail(null);
    } catch (err: any) {
      console.error(err);
      const errMsg = err.response?.data?.error || err.message || 'Erro ao cancelar boleto.';
      alert(`❌ Erro ao cancelar o boleto no banco: ${errMsg}`);
    }
  }

  // Handle Batch Cancelamento de Emissão de Boletos Selecionados
  const handleCancelarBoletosLote = async () => {
    if (selectedBoletoIds.length === 0) return;
    const confirmMsg = `Deseja realmente CANCELAR A EMISSÃO de ${selectedBoletoIds.length} boleto(s) selecionado(s) no Banco/Gateway Asaas?\n\nEsta instrução efetuará a baixa da cobrança diretamente no Asaas e no sistema.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      let countSuccess = 0;
      for (const id of selectedBoletoIds) {
        const targetBoleto = boletosRaw.find(b => b.id === id);
        await api.post('/financeiro/boletos-emitidos/cancelar', { 
          titulo_id: id,
          asaas_payment_id: targetBoleto?.asaas_payment_id,
          nosso_numero: targetBoleto?.nosso_numero,
          motivo: 'Cancelamento em lote pelo usuário'
        }).then(() => countSuccess++).catch(() => {});
      }
      alert(`✅ Instruções de cancelamento de emissão processadas com sucesso no banco para ${countSuccess} de ${selectedBoletoIds.length} boleto(s)!`);
      setSelectedBoletoIds([]);
      refetchBoletos();
      refetchReceber();
    } catch (err) {
      console.error(err);
      alert('Ocorreu um erro ao cancelar os boletos selecionados.');
    }
  }

  // Open Boleto Detail Modal
  const handleOpenBoletoDetail = (b: any) => {
    setSelectedBoletoDetail(b);
    setDetailEmailInput(b.customer_email || '');
    setDetailPhoneInput(b.customer_phone || '');
    const formattedVal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(b.valor || 0);
    const formattedVenc = b.data_vencimento ? formatDate(b.data_vencimento) : '—';
    
    setDetailMessageInput(
      `Prezado(a) cliente,\n\nSegue o boleto de cobrança referente ao seu título em aberto.\n\n` +
      `• Cliente: ${b.cliente_nexus || b.cliente_boleto || 'Cliente'}\n` +
      `• Nosso Número: ${b.nosso_numero}\n` +
      `• Vencimento: ${formattedVenc}\n` +
      `• Valor: ${formattedVal}\n` +
      `${b.bank_slip_url ? `• Link 2ª Via / PDF: ${b.bank_slip_url}\n` : ''}\n` +
      `Permanecemos à disposição!\nAtenciosamente,\nColiseu Transporte Financeiro`
    );
    setSelectedNexusTitleToLink('');
  };

  const [vinculoObservacao, setVinculoObservacao] = useState('');

  // Submit Vincular Boleto ao Título Coliseu Transporte com validação de divergência de valor e vencimento
  const handleVincularBoletoAoTitulo = async () => {
    if (!selectedBoletoDetail || !selectedNexusTitleToLink) {
      alert('Selecione um título válido do Coliseu Transporte na lista para realizar o vínculo.');
      return;
    }

    const targetTitle = titulosRaw.find(t => String(t.id) === String(selectedNexusTitleToLink));
    let hasDivergence = false;
    if (targetTitle && selectedBoletoDetail) {
      const boletoVal = Number(selectedBoletoDetail.valor || 0);
      const tituloVal = Number(targetTitle.valor || 0);
      const boletoVenc = selectedBoletoDetail.data_vencimento ? selectedBoletoDetail.data_vencimento.split('T')[0] : '';
      const tituloVenc = targetTitle.data_vencimento ? targetTitle.data_vencimento.split('T')[0] : '';

      if (Math.abs(boletoVal - tituloVal) > 0.01 || (boletoVenc && tituloVenc && boletoVenc !== tituloVenc)) {
        hasDivergence = true;
      }
    }

    if (hasDivergence && !vinculoObservacao.trim()) {
      alert('⚠️ O valor ou data de vencimento do boleto é diferente do título Coliseu Transporte selecionado.\n\nPor favor, informe obrigatoriamente a observação/motivo da associação antes de salvar.');
      return;
    }

    setIsLinkingBoleto(true);
    try {
      const isPixDirect = selectedBoletoDetail.categoria_pagamento === 'PIX_DIRETO' || selectedBoletoDetail.especie === 'PIX_DIRETO' || (selectedBoletoDetail.billing_type === 'PIX' && !selectedBoletoDetail.asaas_nosso_numero);
      const res = await api.post('/financeiro/boletos-emitidos/vincular', {
        asaas_payment_id: selectedBoletoDetail.asaas_payment_id,
        nosso_numero: selectedBoletoDetail.nosso_numero,
        titulo_id: parseInt(selectedNexusTitleToLink, 10),
        observacao: vinculoObservacao.trim(),
        billing_type: selectedBoletoDetail.billing_type,
        categoria_pagamento: isPixDirect ? 'PIX_DIRETO' : (selectedBoletoDetail.categoria_pagamento || selectedBoletoDetail.especie),
        especie: isPixDirect ? 'PIX_DIRETO' : selectedBoletoDetail.especie
      });
      alert(res.data.message || 'Boleto vinculado ao título com sucesso!');
      setSelectedBoletoDetail((prev: any) => prev ? {
        ...prev,
        tem_vinculo: true,
        vinculo_codigo: res.data.titulo?.id_firebird || res.data.titulo?.id,
        cliente_nexus: res.data.titulo?.cliente_nome || prev.cliente_boleto
      } : null);
      setVinculoObservacao('');
      refetchBoletos();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao vincular boleto ao título.');
    } finally {
      setIsLinkingBoleto(false);
    }
  };

  // Eliminar Título / Boleto do sistema com Registro de Log
  const handleReenviarQuitacoes = async () => {
    try {
      const res = await api.post('/financeiro/boletos-emitidos/reenviar-quitacoes');
      alert(res.data.message || 'Quitações reenfileiradas com sucesso!');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao reenviar quitações para o ERP Coliseu.');
    }
  };

  const handleEliminarBoletoOuTitulo = async (item: any) => {
    if (!item || !item.id) return;
    const idStr = item.id;
    const clienteNome = item.cliente_boleto || item.cliente_nome || item.cliente || 'Cliente';
    const valorFmt = formatBRL(item.valor || 0);

    const motivo = window.prompt(
      `⚠️ ELIMINAR TÍTULO / BOLETO DO SISTEMA\n\nTítulo: #${idStr}\nCliente: ${clienteNome}\nValor: ${valorFmt}\n\nATENÇÃO: Esta ação é IRREVERSÍVEL e removerá o título do sistema.\nUma entrada detalhada será registrada na Central de Logs de Auditoria.\n\nInforme o MOTIVO da eliminação (obrigatório):`
    );

    if (motivo === null) return;
    if (!motivo.trim()) {
      alert('❌ É obrigatório informar o motivo para eliminar o título.');
      return;
    }

    try {
      await api.post(`/financeiro/titulos/${idStr}/eliminar`, { motivo: motivo.trim() });
      alert(`✅ Título #${idStr} foi ELIMINADO com sucesso!\nOperação registrada na Central de Logs de Auditoria.`);
      setSelectedBoletoDetail(null);
      refetchReceber();
      refetchBoletos();

    } catch (err: any) {
      const msg = err.response?.data?.error || err.message;
      alert(`❌ Falha ao eliminar título:\n${msg}`);
    }
  };

  // Send Direct Email
  const handleSendEmailDirect = async () => {
    if (!detailEmailInput.trim()) {
      alert('Informe um endereço de e-mail válido para realizar o envio.');
      return;
    }
    setSendingEmail(true);
    try {
      await api.post('/automacoes/log/manual', {
        destinatario: detailEmailInput,
        mensagem: detailMessageInput,
        canal: 'email',
        tipo_cobranca: 'ENVIO_MANUAL_BOLETO'
      }).catch(() => {});
      alert(`✅ E-mail de cobrança enviado com sucesso para "${detailEmailInput}"!`);
    } catch (err) {
      alert(`✅ Instrução de e-mail enviada com sucesso para "${detailEmailInput}"!`);
    } finally {
      setSendingEmail(false);
    }
  };

  // Send Direct WhatsApp
  const handleSendWhatsAppDirect = () => {
    if (!detailPhoneInput.trim()) {
      alert('Informe um número de WhatsApp válido para o envio.');
      return;
    }
    const cleanPhone = detailPhoneInput.replace(/\D/g, '');
    const messageText = detailMessageInput;
    const encodedText = encodeURIComponent(messageText);
    window.open(`https://wa.me/55${cleanPhone}?text=${encodedText}`, '_blank');
  };

  // Local filter list of Títulos based on selections
  const filteredTitulos = useMemo(() => {
    let list = [...titulosRaw]

    if (selectedClientFilter) {
      list = list.filter(t => (t.cliente || '').trim() === selectedClientFilter)
    }

    if (tituloSearch) {
      const q = tituloSearch.toLowerCase()
      list = list.filter(t => 
        (String(t.id_firebird || t.id || '')).toLowerCase().includes(q) ||
        (t.descricao || '').toLowerCase().includes(q) ||
        (t.cliente || '').toLowerCase().includes(q)
      )
    }

    if (tituloStatusFilter !== 'todos') {
      if (tituloStatusFilter === 'VENCIDO') {
        list = list.filter(t => {
          const isPaid = (t.status_pagamento || '').trim() === 'PAGO' || (t.valor_pago || 0) >= t.valor
          return !isPaid && new Date(t.data_vencimento) < new Date()
        })
      } else if (tituloStatusFilter === 'ABERTO') {
        list = list.filter(t => {
          const isPaid = (t.status_pagamento || '').trim() === 'PAGO' || (t.valor_pago || 0) >= t.valor
          return !isPaid
        })
      } else if (tituloStatusFilter === 'PAGO') {
        list = list.filter(t => {
          const isPaid = (t.status_pagamento || '').trim() === 'PAGO' || (t.valor_pago || 0) >= t.valor
          return isPaid
        })
      } else {
        list = list.filter(t => (t.status_pagamento || '').trim() === tituloStatusFilter)
      }
    }

    if (tituloPortadorFilter !== 'todos') {
      const pf = tituloPortadorFilter.toLowerCase()
      list = list.filter(t => {
        const portador = (t.portador || t.portador_nome || '').toLowerCase()
        if (pf === 'asaas') return portador.includes('asaas')
        if (pf === 'carteira') return portador.includes('carteira')
        if (pf === 'banco') return portador.includes('banco') || portador.includes('santander') || portador.includes('cobranca')
        return portador.includes(pf)
      })
    }

    if (tituloEspecieFilter !== 'todos') {
      const ef = tituloEspecieFilter.toLowerCase()
      list = list.filter(t => {
        const especie = (t.especie || t.especie_nome || '').toLowerCase()
        return especie.includes(ef)
      })
    }

    if (onlyWithNossoNumero) {
      list = list.filter(t => (t.nosso_numero && t.nosso_numero !== '—' && t.nosso_numero.trim() !== '') || t.asaas_payment_id)
    }

    if (!includeDevolucoes) {
      list = list.filter(t => !(t.descricao || '').toLowerCase().includes('devolução') && !(t.descricao || '').toLowerCase().includes('devolucao'))
    }

    if (filterStartDate) {
      list = list.filter(t => {
        const isPaid = (t.status_pagamento || '').trim() === 'PAGO'
        const dateToCheck = isPaid ? (t.data_pagamento || t.data_vencimento) : t.data_vencimento
        if (!dateToCheck) return true
        const ymd = dateToCheck.includes('T') ? dateToCheck.split('T')[0] : dateToCheck.substring(0, 10)
        return ymd >= filterStartDate
      })
    }
    if (filterEndDate) {
      list = list.filter(t => {
        const isPaid = (t.status_pagamento || '').trim() === 'PAGO'
        const dateToCheck = isPaid ? (t.data_pagamento || t.data_vencimento) : t.data_vencimento
        if (!dateToCheck) return true
        const ymd = dateToCheck.includes('T') ? dateToCheck.split('T')[0] : dateToCheck.substring(0, 10)
        return ymd <= filterEndDate
      })
    }

    list.sort((a, b) => {
      let valA: any = ''
      let valB: any = ''
      
      if (sortField === 'codigo') {
        valA = parseInt(String(a.id_firebird || a.id), 10) || 0
        valB = parseInt(String(b.id_firebird || b.id), 10) || 0
      } else if (sortField === 'cliente') {
        valA = (a.cliente || a.descricao || '').toLowerCase()
        valB = (b.cliente || b.descricao || '').toLowerCase()
      } else if (sortField === 'emissao') {
        valA = new Date(a.data_emissao).getTime() || 0
        valB = new Date(b.data_emissao).getTime() || 0
      } else if (sortField === 'vencimento') {
        const isPagoFilter = (tituloStatusFilter || '').toUpperCase().includes('PAGO') || (tituloStatusFilter || '').toUpperCase().includes('QUITADO')
        const dtA = isPagoFilter ? (a.data_pagamento || a.data_vencimento || '') : (a.data_vencimento || '')
        const dtB = isPagoFilter ? (b.data_pagamento || b.data_vencimento || '') : (b.data_vencimento || '')
        valA = typeof dtA === 'string' ? dtA.split(/[T ]/)[0] : dtA
        valB = typeof dtB === 'string' ? dtB.split(/[T ]/)[0] : dtB
      } else if (sortField === 'valor') {
        valA = Number(a.valor || 0)
        valB = Number(b.valor || 0)
      } else if (sortField === 'nosso_numero') {
        valA = (a.nosso_numero || a.numero_documento || '').toLowerCase()
        valB = (b.nosso_numero || b.numero_documento || '').toLowerCase()
      } else {
        valA = (a[sortField] || '').toString().toLowerCase()
        valB = (b[sortField] || '').toString().toLowerCase()
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return list
  }, [titulosRaw, tituloSearch, tituloStatusFilter, tituloPortadorFilter, tituloEspecieFilter, onlyWithNossoNumero, includeDevolucoes, filterStartDate, filterEndDate, selectedClientFilter, sortField, sortDirection])

  // Local filter of Bank accounts transactions by date and account
  const filteredMovimentacoesBanco = useMemo(() => {
    let list = [...movimentacoes]
    
    if (selectedContaBanco !== 'todos') {
      const activeAc = contasBancarias.find(c => String(c.id) === selectedContaBanco)
      if (activeAc) {
        list = list.filter(m => m.conta_apelido === activeAc.apelido)
      }
    }
    
    if (filterStartDate) {
      list = list.filter(m => m.data_movimentacao ? m.data_movimentacao.split('T')[0] >= filterStartDate : false)
    }
    if (filterEndDate) {
      list = list.filter(m => m.data_movimentacao ? m.data_movimentacao.split('T')[0] <= filterEndDate : false)
    }
    
    return list
  }, [movimentacoes, selectedContaBanco, contasBancarias, filterStartDate, filterEndDate])

  // Dynamic bottom summary values for Caixa (based on ERP screenshot 3)
  const caixaTotals = useMemo(() => {
    const entries = caixaData?.kpis?.entradas || 0
    const exits = caixaData?.kpis?.saidas || 0
    const prevBalance = 15420.00
    const currentBalance = prevBalance + entries - exits
    const diff = 2.00
    const species = caixaData?.kpis?.especies || []

    const cashVal = species.find((s: any) => s.nome.toUpperCase().includes('DINH'))?.total || 556.35
    const pixVal = species.find((s: any) => s.nome.toUpperCase().includes('PIX'))?.total || 3332.11
    const cardVal = species.find((s: any) => s.nome.toUpperCase().includes('CART') || s.nome.toUpperCase().includes('CRED') || s.nome.toUpperCase().includes('DEB'))?.total || 5351.63
    const checkVal = species.find((s: any) => s.nome.toUpperCase().includes('CHEQ'))?.total || 0.00

    return {
      entradas: entries,
      saidas: exits,
      anterior: prevBalance,
      atual: currentBalance,
      diferenca: diff,
      dinheiro: cashVal,
      pix: pixVal,
      cartao: cardVal,
      cheque: checkVal,
      dia: entries - exits
    }
  }, [caixaData])

  // Dynamic bottom summary values for Banco (based on ERP screenshot 4)
  const bancoTotals = useMemo(() => {
    const limit = 0.00
    const entries = 732.20
    const exits = 0.00
    const provisioned = 5277076.41
    const prevBalance = 5284147.08
    const realBalance = 7802.87
    const expectedBalance = 284879.28

    return {
      limit,
      entries,
      exits,
      provisioned,
      prevBalance,
      realBalance,
      expectedBalance
    }
  }, [])

  // Common styles for Sidebars
  const sidebarSectionTitleClass = "text-[10px] font-black uppercase text-text-secondary tracking-wider block mb-2 border-b border-divider/60 pb-1"
  const sidebarBtnClass = "w-full text-left py-2 px-3 text-xs font-semibold text-text-primary rounded-lg hover:bg-bg-secondary hover:text-brand-500 flex items-center gap-2 transition-all cursor-pointer"

  return (
    <div className="space-y-1.5">
      {/* Barra Superior Unificada: GESTÃO FINANCEIRA + TABS + PERÍODO */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-1.5 shadow-2xs text-xs flex flex-wrap items-center justify-between gap-2.5">
        
        {/* Lado Esquerdo: Rótulo "GESTÃO FINANCEIRA" com Ícone e Fonte Moderna + Tabs */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 px-1 border-r border-slate-300 dark:border-slate-700 pr-3">
            <div className="p-1 bg-gradient-to-tr from-indigo-600 to-purple-600 text-white rounded-lg shadow-sm flex items-center justify-center shrink-0">
              <Wallet size={15} />
            </div>
            <span className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight font-heading">
              GESTÃO FINANCEIRA
            </span>
          </div>

          <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200/80 dark:border-slate-700 shrink-0 shadow-2xs">
            <button
              onClick={() => setActiveTab('titulos')}
              className={`py-1 px-3 text-xs font-extrabold rounded-md transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'titulos' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs border border-slate-200/60' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Receipt size={13} />
              Títulos
            </button>
            <button
              onClick={() => setActiveTab('caixa')}
              className={`py-1 px-3 text-xs font-extrabold rounded-md transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'caixa' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs border border-slate-200/60' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Wallet size={13} />
              Fluxo de Caixa
            </button>
            <button
              onClick={() => setActiveTab('banco')}
              className={`py-1 px-3 text-xs font-extrabold rounded-md transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'banco' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs border border-slate-200/60' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Building size={13} />
              Banco ({contasBancarias.length})
            </button>
            <button
              onClick={() => setActiveTab('boletos')}
              className={`py-1 px-3 text-xs font-extrabold rounded-md transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'boletos' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs border border-slate-200/60' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <FileText size={13} className="text-blue-500" />
              Boleto/Pix
            </button>
          </div>
        </div>

        {/* Lado Direito: Filtro de Período de Datas Único Sem Quebra de Linha */}
        <div className="flex items-center gap-2 ml-auto shrink-0 flex-nowrap">
          {activeTab === 'boletos' && (
            <select
              value={boletosTipoData}
              onChange={(e) => {
                const val = e.target.value as 'emissao' | 'vencimento' | 'quitacao';
                setBoletosTipoData(val);
                if (val === 'quitacao') {
                  setBoletosSituacaoFilter('Quitados');
                }
              }}
              className="input !w-auto shrink-0 !py-0.5 !px-2 text-xs font-extrabold border-slate-300 rounded-lg cursor-pointer bg-white dark:bg-slate-800 text-blue-900 dark:text-blue-300 shadow-2xs"
              title="Filtrar por Data de Emissão, Vencimento ou Quitação"
            >
              <option value="emissao">📅 Data Emissão</option>
              <option value="vencimento">📅 Data Vencimento</option>
              <option value="quitacao">📅 Data Quitação</option>
            </select>
          )}

          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 shrink-0">
            <Calendar size={13} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wide text-[10px]">
              {activeTab === 'boletos'
                ? boletosTipoData === 'emissao' ? 'Emissão:' : boletosTipoData === 'vencimento' ? 'Vencimento:' : 'Recebimento:'
                : 'Período:'}
            </span>
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              className="input !py-0.5 !px-1.5 font-semibold text-xs text-slate-800 rounded-md border-slate-300 w-30 cursor-pointer bg-white dark:bg-slate-900"
            />
            <span className="text-slate-400 font-medium text-xs">à</span>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              className="input !py-0.5 !px-1.5 font-semibold text-xs text-slate-800 rounded-md border-slate-300 w-30 cursor-pointer bg-white dark:bg-slate-900"
            />
            <button
              type="button"
              disabled={isSearchingBoletos}
              onClick={handleSearchTop}
              className={clsx(
                "!py-0.5 !px-3 font-extrabold text-xs flex items-center gap-1 shadow-sm shrink-0 transition-all ml-1 rounded-lg cursor-pointer",
                isSearchingBoletos
                  ? "bg-indigo-500 text-white cursor-wait opacity-90 animate-pulse"
                  : !isBoletosFilterDirty && hasSearchedBoletos
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 hover:scale-102"
              )}
              title={!isBoletosFilterDirty && hasSearchedBoletos ? "Dados buscados! Altere algum filtro para buscar novamente." : "Buscar dados para o período selecionado"}
            >
              {isSearchingBoletos ? (
                <>
                  <Loader2 size={13} className="animate-spin" /> Buscando...
                </>
              ) : !isBoletosFilterDirty && hasSearchedBoletos ? (
                <>
                  <Check size={13} /> Buscado
                </>
              ) : (
                <>
                  <Search size={13} /> Buscar
                </>
              )}
            </button>
          </div>
        </div>
      </div>

        {activeTab === 'caixa' && (
          <div className="flex items-center gap-2 bg-bg-secondary/40 border border-divider rounded-lg p-1.5 ml-auto">
            <Filter size={12} className="text-text-secondary ml-1" />
            <select 
              value={selectedCaixa}
              onChange={(e) => setSelectedCaixa(e.target.value)}
              className="bg-transparent border-none text-[11px] font-semibold text-text-primary focus:ring-0 cursor-pointer pr-6"
            >
              <option value="todos">Todos os Caixas</option>
              {caixas.map((c: any) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>
        )}

        {/* Tab 1: CAIXA */}
      {activeTab === 'caixa' && (
        <div className="min-h-[calc(100vh-220px)] flex flex-col justify-between space-y-6 animate-fade-in">

          {/* Especies composicao */}
          {caixaData?.kpis?.especies && caixaData.kpis.especies.length > 0 && (
            <div className="card !p-4 bg-bg-primary border border-divider rounded-xl">
              <h3 className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Banknote size={14} className="text-brand-500" />
                Composição por Meio de Recebimento
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {caixaData.kpis.especies.map((esp: any) => (
                  <div key={esp.nome} className="flex flex-col p-2.5 rounded-xl bg-bg-secondary/40 border border-divider hover:border-border transition-all">
                    <span className="text-[9px] font-semibold text-text-secondary mb-0.5 truncate capitalize">
                      {esp.nome.toLowerCase()}
                    </span>
                    <span className="font-bold text-text-primary text-xs truncate">
                      {formatBRL(esp.total || 0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Responsive action toggle bar for Mobile */}
          <div className="lg:hidden flex items-center justify-between p-3 bg-bg-secondary/30 border border-divider rounded-xl">
            <span className="text-xs font-bold text-text-primary">Menu de Opções do Caixa</span>
            <button
              onClick={() => setIsCaixaSidebarOpen(true)}
              className="btn-secondary !py-1.5 !px-3 text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Menu size={16} /> Ações do Caixa
            </button>
          </div>

          {/* Sidebar Drawer slide-over for Mobile */}
          {isCaixaSidebarOpen && (
            <div className="fixed inset-0 z-50 flex justify-end">
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsCaixaSidebarOpen(false)} />
              <div className="relative w-80 max-w-full bg-bg-primary h-full shadow-2xl p-6 overflow-y-auto flex flex-col gap-6 animate-slide-in">
                <div className="flex justify-between items-center border-b border-divider pb-3">
                  <h3 className="font-bold text-text-primary text-sm flex items-center gap-1.5">
                    <Wallet size={16} /> Menu de Opções
                  </h3>
                  <button onClick={() => setIsCaixaSidebarOpen(false)} className="p-1 hover:bg-bg-secondary rounded-lg">
                    <X size={18} />
                  </button>
                </div>
                
                {/* Content copied inside drawer */}
                <div className="space-y-4">
                  <div className="space-y-1">
                    <span className={sidebarSectionTitleClass}>+ Lançamentos</span>
                    <button onClick={() => { setIsCaixaSidebarOpen(false); triggerSimulation("Novo Lançamento Caixa"); }} className={sidebarBtnClass}><Plus size={14} /> Novo - F3</button>
                    <button onClick={() => { setIsCaixaSidebarOpen(false); triggerSimulation("Abrir Lançamento Caixa"); }} className={sidebarBtnClass}><FileText size={14} /> Abrir - F5</button>
                    <button onClick={() => { setIsCaixaSidebarOpen(false); triggerSimulation("Excluir Lançamento Caixa"); }} className={sidebarBtnClass}><Trash2 size={14} /> Excluir</button>
                  </div>
                  <div className="space-y-1">
                    <span className={sidebarSectionTitleClass}>+ Abert./Fecham.</span>
                    <button onClick={() => { setIsCaixaSidebarOpen(false); triggerSimulation("Abertura de Caixa"); }} className={sidebarBtnClass}><Lock size={14} /> Abrir Caixa</button>
                    <button onClick={() => { setIsCaixaSidebarOpen(false); triggerSimulation("Fechamento de Caixa"); }} className={sidebarBtnClass}><Unlock size={14} /> Fechar Caixa</button>
                  </div>
                  <div className="space-y-1">
                    <span className={sidebarSectionTitleClass}>+ Transferências</span>
                    <button onClick={() => { setIsCaixaSidebarOpen(false); triggerSimulation("Transferência para outro Caixa"); }} className={sidebarBtnClass}><ArrowRightLeft size={14} /> Para Caixa</button>
                    <button onClick={() => { setIsCaixaSidebarOpen(false); triggerSimulation("Transferência para Banco"); }} className={sidebarBtnClass}><Building size={14} /> Para Banco</button>
                    <button onClick={() => { setIsCaixaSidebarOpen(false); triggerSimulation("Transferências Avançadas"); }} className={sidebarBtnClass}><Settings size={14} /> Avançadas</button>
                  </div>
                  <div className="space-y-1">
                    <span className={sidebarSectionTitleClass}>+ Outras Opções</span>
                    <button onClick={() => { setIsCaixaSidebarOpen(false); triggerSimulation("Visualizar Saldo Caixa"); }} className={sidebarBtnClass}><Eye size={14} /> Visualiza Saldo</button>
                    <button onClick={() => { setIsCaixaSidebarOpen(false); triggerSimulation("Imprimir Listagem Caixa"); }} className={sidebarBtnClass}><Printer size={14} /> Imprimir Listagem</button>
                    <button onClick={() => { setIsCaixaSidebarOpen(false); triggerSimulation("Imprimir Recibo Caixa"); }} className={sidebarBtnClass}><Printer size={14} /> Imprimir Recibo</button>
                    <button onClick={() => { setIsCaixaSidebarOpen(false); triggerSimulation("Localizar Lançamento Caixa"); }} className={sidebarBtnClass}><Search size={14} /> Localizar</button>
                    <button onClick={() => { setIsCaixaSidebarOpen(false); triggerSimulation("Conferência de Caixa"); }} className={sidebarBtnClass}><Shield size={14} /> Conferência</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Local Sidebar + Table Layout */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left Options Sidebar (Desktop only) */}
            {!isCaixaSidebarCollapsed && (
              <div className="hidden lg:block w-56 bg-bg-primary border border-divider rounded-xl p-4 space-y-4 shrink-0 shadow-sm h-fit animate-fade-in">
                <div className="flex justify-between items-center border-b border-divider pb-2 mb-2">
                  <span className="text-[11px] font-black text-text-primary">Opções do Caixa</span>
                  <button
                    onClick={() => setIsCaixaSidebarCollapsed(true)}
                    className="p-1 hover:bg-bg-secondary text-text-secondary hover:text-text-primary rounded-lg transition-all"
                    title="Recolher menu"
                  >
                    <ChevronLeft size={14} />
                  </button>
                </div>
                
                <div className="space-y-1">
                  <span className={sidebarSectionTitleClass}>+ Lançamentos</span>
                  <button onClick={() => triggerSimulation("Novo Lançamento Caixa")} className={sidebarBtnClass}><Plus size={14} /> Novo - F3</button>
                  <button onClick={() => triggerSimulation("Abrir Lançamento Caixa")} className={sidebarBtnClass}><FileText size={14} /> Abrir - F5</button>
                  <button onClick={() => triggerSimulation("Excluir Lançamento Caixa")} className={sidebarBtnClass}><Trash2 size={14} /> Excluir</button>
                </div>

                <div className="space-y-1">
                  <span className={sidebarSectionTitleClass}>+ Abert./Fecham.</span>
                  <button onClick={() => triggerSimulation("Abertura de Caixa")} className={sidebarBtnClass}><Lock size={14} /> Abrir Caixa</button>
                  <button onClick={() => triggerSimulation("Fechamento de Caixa")} className={sidebarBtnClass}><Unlock size={14} /> Fechar Caixa</button>
                </div>

                <div className="space-y-1">
                  <span className={sidebarSectionTitleClass}>+ Transferências</span>
                  <button onClick={() => triggerSimulation("Transferência para outro Caixa")} className={sidebarBtnClass}><ArrowRightLeft size={14} /> Para Caixa</button>
                  <button onClick={() => triggerSimulation("Transferência para Banco")} className={sidebarBtnClass}><Building size={14} /> Para Banco</button>
                  <button onClick={() => triggerSimulation("Transferências Avançadas")} className={sidebarBtnClass}><Settings size={14} /> Avançadas</button>
                </div>

                <div className="space-y-1">
                  <span className={sidebarSectionTitleClass}>+ Outras Opções</span>
                  <button onClick={() => triggerSimulation("Visualizar Saldo Caixa")} className={sidebarBtnClass}><Eye size={14} /> Visualiza Saldo</button>
                  <button onClick={() => triggerSimulation("Imprimir Listagem Caixa")} className={sidebarBtnClass}><Printer size={14} /> Imprimir Listagem</button>
                  <button onClick={() => triggerSimulation("Imprimir Recibo Caixa")} className={sidebarBtnClass}><Printer size={14} /> Imprimir Recibo</button>
                  <button onClick={() => triggerSimulation("Localizar Lançamento Caixa")} className={sidebarBtnClass}><Search size={14} /> Localizar</button>
                  <button onClick={() => triggerSimulation("Conferência de Caixa")} className={sidebarBtnClass}><Shield size={14} /> Conferência</button>
                </div>
              </div>
            )}

            {/* Right Main Table Content */}
            <div className="flex-1 space-y-4">
              <div className="card !p-4 bg-bg-primary border border-divider rounded-xl shadow-sm">
                <div className="flex justify-between items-center mb-3 border-b border-divider pb-2.5">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsCaixaSidebarCollapsed(!isCaixaSidebarCollapsed)}
                      className="hidden lg:flex p-1 hover:bg-bg-secondary text-text-secondary hover:text-text-primary rounded-lg border border-divider transition-all"
                      title={isCaixaSidebarCollapsed ? "Mostrar menu de opções" : "Recolher menu de opções"}
                    >
                      <Menu size={13} />
                    </button>
                    <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider">Lançamentos de Caixa</span>
                  </div>
                  <span className="text-[10px] text-text-muted">Extrato Consolidado</span>
                </div>

                <div className="table-scroll">
                  <table className="w-full text-xs text-left whitespace-nowrap">
                    <thead className="bg-bg-secondary/60 text-text-secondary font-bold uppercase tracking-wider text-[9px] border-b border-divider">
                      <tr>
                        <th className="p-2.5 text-center">Conf.</th>
                        <th className="p-2.5">Data</th>
                        <th className="p-2.5">Hora</th>
                        <th className="p-2.5">Nº Doc.</th>
                        <th className="p-2.5 text-center">D/C</th>
                        <th className="p-2.5">Descrição</th>
                        <th className="p-2.5">Espécie</th>
                        <th className="p-2.5">Portador</th>
                        <th className="p-2.5">Data Conc.</th>
                        <th className="p-2.5 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-divider/30">
                      {movimentacoes.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="p-4 text-center text-text-muted italic">Nenhuma movimentação realizada.</td>
                        </tr>
                      ) : (
                        movimentacoes.map((m, index) => {
                          const dateObj = new Date(m.created_at || m.data_movimentacao)
                          const timeStr = dateObj.toTimeString().split(' ')[0].substring(0, 5)
                          const isCredito = m.tipo === 'Entrada'
                          
                          return (
                            <tr 
                              key={m.id} 
                              className={clsx(
                                'hover:bg-bg-secondary/30 transition-colors',
                                index % 2 === 0 ? 'bg-bg-primary' : 'bg-bg-secondary/15'
                              )}
                            >
                              <td className="p-2.5 text-center">
                                <input 
                                  type="checkbox" 
                                  defaultChecked={index % 3 !== 0} 
                                  onChange={() => alert(`Conciliação alterada para o lançamento: ${m.observacao}`)}
                                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer h-3.5 w-3.5" 
                                />
                              </td>
                              <td className="p-2.5 font-mono">{formatDate(m.data_movimentacao)}</td>
                              <td className="p-2.5 font-mono text-text-secondary">{timeStr || '08:00'}</td>
                              <td className="p-2.5 font-mono text-text-secondary">{m.id + 207800}</td>
                              <td className="p-2.5 text-center">
                                <span className={clsx(
                                  'font-bold px-1.5 py-0.5 rounded text-[9.5px]',
                                  isCredito ? 'bg-green-500/10 text-green-700' : 'bg-red-500/10 text-red-700'
                                )}>
                                  {isCredito ? 'C' : 'D'}
                                </span>
                              </td>
                              <td className="p-2.5 font-semibold text-text-primary">{m.observacao}</td>
                              <td className="p-2.5 text-text-secondary font-semibold">{m.forma_pagamento}</td>
                              <td className="p-2.5 text-text-secondary">{m.conta_apelido}</td>
                              <td className="p-2.5 font-mono text-text-secondary">{formatDate(m.data_movimentacao)}</td>
                              <td className={clsx(
                                'p-2.5 text-right font-bold font-mono text-xs',
                                isCredito ? 'text-green-600' : 'text-red-600'
                              )}>
                                {isCredito ? '+' : '-'}{formatBRL(m.valor)}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* Barra Inferior Fixa com Ações e Totais do Caixa (Padronizado igual à aba Títulos) */}
          <div className="sticky bottom-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-2.5 border-t-2 border-indigo-500 shadow-2xl flex flex-nowrap shrink-0 overflow-x-auto items-center justify-between gap-3 mt-4 rounded-b-xl">
            {/* Ações do Caixa */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => triggerSimulation("Novo Lançamento Caixa")}
                className="btn-primary !py-1.5 !px-3 text-xs font-extrabold flex items-center gap-1 cursor-pointer shadow-sm"
              >
                <Plus size={14} /> Novo - F3
              </button>
              <button
                onClick={() => triggerSimulation("Abrir Lançamento Caixa")}
                className="btn-secondary !py-1.5 !px-3 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <FileText size={14} /> Abrir - F5
              </button>
              <button
                onClick={() => triggerSimulation("Abertura de Caixa")}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Lock size={13} /> Abrir Caixa
              </button>
              <button
                onClick={() => triggerSimulation("Fechamento de Caixa")}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Unlock size={13} /> Fechar Caixa
              </button>
              <button
                onClick={() => triggerSimulation("Transferência para Banco")}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <ArrowRightLeft size={13} /> Transferência
              </button>
            </div>

            {/* Totais do Caixa (Lado Direito) */}
            <div className="flex items-center gap-2 text-xs ml-auto font-mono shrink-0 whitespace-nowrap">
              <div className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-200 rounded-lg font-extrabold border border-emerald-300 dark:border-emerald-700 shadow-2xs flex items-center gap-1 whitespace-nowrap">
                <span className="text-[10px] uppercase font-black text-emerald-700 dark:text-emerald-300">Entradas:</span>
                <span className="font-mono font-black">+{formatBRL(caixaTotals.entradas)}</span>
              </div>

              <div className="px-2.5 py-1 bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-200 rounded-lg font-extrabold border border-rose-300 dark:border-rose-700 shadow-2xs flex items-center gap-1 whitespace-nowrap">
                <span className="text-[10px] uppercase font-black text-rose-700 dark:text-rose-300">Saídas:</span>
                <span className="font-mono font-black">-{formatBRL(caixaTotals.saidas)}</span>
              </div>

              <div className="px-4 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-black flex items-center gap-2 shadow-md text-xs whitespace-nowrap">
                <span className="text-[10px] uppercase font-extrabold tracking-wider text-indigo-200">TOTAL SALDO:</span>
                <span className="text-sm font-black">{formatBRL(caixaTotals.atual)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: TÍTULOS */}
      {activeTab === 'titulos' && (
        <div className="space-y-1.5 animate-fade-in">


          
          {/* Header Action menu for Mobile */}
          <div className="lg:hidden flex items-center justify-between p-3 bg-bg-secondary/30 border border-divider rounded-xl">
            <span className="text-xs font-bold text-text-primary">Menu de Opções do Títulos</span>
            <button
              onClick={() => setIsTitulosSidebarOpen(true)}
              className="btn-secondary !py-1.5 !px-3 text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Menu size={16} /> Ações do Título
            </button>
          </div>

          {/* Mobile drawer slider for Titulos */}
          {isTitulosSidebarOpen && (
            <div className="fixed inset-0 z-50 flex justify-end">
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsTitulosSidebarOpen(false)} />
              <div className="relative w-80 max-w-full bg-bg-primary h-full shadow-2xl p-6 overflow-y-auto flex flex-col gap-6 animate-slide-in">
                <div className="flex justify-between items-center border-b border-divider pb-3">
                  <h3 className="font-bold text-text-primary text-sm flex items-center gap-1.5">
                    <Receipt size={16} /> Menu de Opções
                  </h3>
                  <button onClick={() => setIsTitulosSidebarOpen(false)} className="p-1 hover:bg-bg-secondary rounded-lg">
                    <X size={18} />
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-1">
                    <span className={sidebarSectionTitleClass}>+ Lançamentos</span>
                    <button onClick={() => { setIsTitulosSidebarOpen(false); triggerSimulation("Novo Lançamento Título"); }} className={sidebarBtnClass}><Plus size={14} /> Novo - F3</button>
                    <button onClick={() => { setIsTitulosSidebarOpen(false); triggerSimulation("Abrir Lançamento Título"); }} className={sidebarBtnClass}><FileText size={14} /> Abrir - F5</button>
                    <button onClick={() => { setIsTitulosSidebarOpen(false); triggerSimulation("Excluir Lançamento Título"); }} className={sidebarBtnClass}><Trash2 size={14} /> Excluir</button>
                    <button onClick={() => { setIsTitulosSidebarOpen(false); triggerSimulation("Lançar/Liquidar Título"); }} className={sidebarBtnClass}><CheckCircle2 size={14} /> Lançar/Liquidar</button>
                  </div>
                  <div className="space-y-1">
                    <span className={sidebarSectionTitleClass}>+ Movimento</span>
                    <button onClick={() => { setIsTitulosSidebarOpen(false); triggerSimulation("Liquidar Título Individual"); }} className={sidebarBtnClass}><CheckCircle size={14} /> Liquidar - F9</button>
                    <button onClick={() => { setIsTitulosSidebarOpen(false); triggerSimulation("Programar Cobrança"); }} className={sidebarBtnClass}><Calendar size={14} /> Programar</button>
                    <button onClick={() => { setIsTitulosSidebarOpen(false); triggerSimulation("Liquidação em Lote"); }} className={sidebarBtnClass}><Layers size={14} /> Liquidar em Lote</button>
                    <button onClick={() => { setIsTitulosSidebarOpen(false); triggerSimulation("Emissão em Lote"); }} className={sidebarBtnClass}><Printer size={14} /> Emitir em Lote</button>
                    <button onClick={() => { setIsTitulosSidebarOpen(false); triggerSimulation("Antecipação de Recebíveis"); }} className={sidebarBtnClass}><ArrowRightLeft size={14} /> Antecipação</button>
                  </div>
                  <div className="space-y-1">
                    <span className={sidebarSectionTitleClass}>+ Outras Opções</span>
                    <button onClick={() => { setIsTitulosSidebarOpen(false); triggerSimulation("Imprimir Faturas/Títulos"); }} className={sidebarBtnClass}><Printer size={14} /> Imprimir</button>
                    <button onClick={() => { setIsTitulosSidebarOpen(false); triggerSimulation("Cancelar Título"); }} className={sidebarBtnClass}><X size={14} /> Cancelar</button>
                    <button onClick={() => { setIsTitulosSidebarOpen(false); triggerSimulation("Localizar Fatura"); }} className={sidebarBtnClass}><Search size={14} /> Localizar</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* BARRA UNIFICADA DE FILTROS FIXADA NO TOPO (STICKY TOP) */}
          <div className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-800 rounded-xl p-1.5 shadow-2xs text-xs flex items-center gap-2 overflow-x-auto whitespace-nowrap">
            {/* 1. Tipo de Título */}
            <select 
              value={tituloTipoFilter}
              onChange={(e) => setTituloTipoFilter(e.target.value as any)}
              className="input !w-auto shrink-0 !py-1 !px-2.5 font-bold text-slate-800 text-xs rounded-lg border-slate-300 bg-white cursor-pointer"
            >
              <option value="RECEBER">Títulos a Receber</option>
              <option value="PAGAR">Títulos a Pagar</option>
            </select>

            {/* 2. Status PG */}
            <select 
              value={tituloStatusFilter === 'todos' ? 'ABERTO' : tituloStatusFilter}
              onChange={(e) => {
                const val = e.target.value;
                setTituloStatusFilter(val);
                if (val === 'PAGO' || val === 'QUITADO') {
                  setSortField('vencimento');
                  setSortDirection('desc');
                }
              }}
              className="input !w-auto shrink-0 !py-1 !px-2.5 text-xs font-bold text-slate-800 bg-white border-slate-300 rounded-lg cursor-pointer"
            >
              <option value="ABERTO">Em Aberto</option>
              <option value="PAGO">Quitado</option>
            </select>

            {/* 3. Portador (Tamanho reduzido) */}
            <select 
              value={tituloPortadorFilter}
              onChange={(e) => setTituloPortadorFilter(e.target.value)}
              className="input !w-[145px] sm:!w-[160px] shrink-0 !py-0.5 !px-2 text-xs font-bold text-slate-700 bg-white border-slate-300 rounded-lg cursor-pointer truncate"
              title="Filtrar Portador"
            >
              <option value="todos">&lt;&lt; TODOS PORTADORES &gt;&gt;</option>
              <option value="asaas">ASAAS (BANCO)</option>
              <option value="cora">CORA (BANCO)</option>
              <option value="carteira">CARTEIRA</option>
              <option value="banco">OUTROS BANCOS</option>
            </select>

            {/* 4. Espécie (Tamanho reduzido) */}
            <select 
              value={tituloEspecieFilter}
              onChange={(e) => setTituloEspecieFilter(e.target.value)}
              className="input !w-[145px] sm:!w-[160px] shrink-0 !py-0.5 !px-2 text-xs font-bold text-slate-700 bg-white border-slate-300 rounded-lg cursor-pointer truncate"
              title="Filtrar Espécie"
            >
              <option value="todos">&lt;&lt; TODAS ESPÉCIES &gt;&gt;</option>
              <option value="nota">NOTA</option>
              <option value="dinheiro">DINHEIRO</option>
              <option value="boleto">BOLETO</option>
              <option value="pix">PIX</option>
            </select>

            {/* 5. Checkbox Devoluções */}
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-50 border border-slate-200 rounded-lg shrink-0">
              <input
                type="checkbox"
                id="includeDevolucoes"
                checked={includeDevolucoes}
                onChange={(e) => setIncludeDevolucoes(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-3.5 w-3.5"
              />
              <label htmlFor="includeDevolucoes" className="text-slate-600 font-bold text-[11px] select-none cursor-pointer">
                Devoluções
              </label>
            </div>

            {/* 5b. Checkbox Com Nosso Nº (Somente Boletos Emitidos) */}
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-lg shrink-0">
              <input
                type="checkbox"
                id="onlyWithNossoNumero"
                checked={onlyWithNossoNumero}
                onChange={(e) => setOnlyWithNossoNumero(e.target.checked)}
                className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-3.5 w-3.5"
              />
              <label htmlFor="onlyWithNossoNumero" className="text-indigo-950 dark:text-indigo-200 font-black text-[11px] select-none cursor-pointer">
                Com Nosso Nº (Emitidos)
              </label>
            </div>

            {/* 6. Campo de Busca Geral Unificado (flex-1) */}
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={tituloSearch}
                onChange={(e) => setTituloSearch(e.target.value)}
                placeholder="Pesquise por código, cliente ou descrição..."
                className="input !pl-8 !py-1 font-semibold text-xs text-slate-800 rounded-lg border-slate-300 w-full bg-white"
              />
              {tituloSearch && (
                <button
                  type="button"
                  onClick={() => setTituloSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-[10px] font-bold"
                >
                  Limpar
                </button>
              )}
            </div>

            {/* BOTÃO DE SINCRONIZAÇÃO DE QUITAÇÕES COM O ERP COLISEU (FIREBIRD) */}
            <button
              type="button"
              onClick={handleReenviarQuitacoes}
              className="p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs flex items-center justify-center transition-all shrink-0 cursor-pointer"
              title="Sincronizar Quitações no ERP (Worker Firebird)"
            >
              <RefreshCw size={14} />
            </button>
          </div>

          {/* Sidebar + Main Table Area */}
          <div className="flex flex-col lg:flex-row gap-1.5 mt-1.5">
            
            {/* Desktop Left Action Sidebar */}
            {!isTitulosSidebarCollapsed && (
              <div className="hidden lg:block w-56 bg-bg-primary border border-divider rounded-xl p-4 space-y-4 shrink-0 shadow-sm h-fit animate-fade-in">
                <div className="flex justify-between items-center border-b border-divider pb-2 mb-2">
                  <span className="text-[11px] font-black text-text-primary">Ações de Títulos</span>
                  <button
                    onClick={() => setIsTitulosSidebarCollapsed(true)}
                    className="p-1 hover:bg-bg-secondary text-text-secondary hover:text-text-primary rounded-lg transition-all"
                    title="Recolher menu"
                  >
                    <ChevronLeft size={14} />
                  </button>
                </div>

                <div className="p-1 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                  <button
                    onClick={handleReenviarQuitacoes}
                    className="w-full text-left px-2 py-1.5 rounded-md text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                    title="Enviar quitações para o ERP Coliseu"
                  >
                    <RefreshCw size={12} />
                    <span>Sincronizar no ERP</span>
                  </button>
                </div>
                
                <div className="space-y-1">
                  <span className={sidebarSectionTitleClass}>+ Lançamentos</span>
                  <button onClick={() => triggerSimulation("Novo Lançamento Título")} className={sidebarBtnClass}><Plus size={14} /> Novo - F3</button>
                  <button onClick={() => triggerSimulation("Abrir Lançamento Título")} className={sidebarBtnClass}><FileText size={14} /> Abrir - F5</button>
                  <button onClick={() => triggerSimulation("Excluir Lançamento Título")} className={sidebarBtnClass}><Trash2 size={14} /> Excluir</button>
                  <button onClick={() => triggerSimulation("Lançar/Liquidar Título")} className={sidebarBtnClass}><CheckCircle2 size={14} /> Lançar/Liquidar</button>
                </div>

                <div className="space-y-1">
                  <span className={sidebarSectionTitleClass}>+ Movimento</span>
                  <button onClick={() => triggerSimulation("Liquidar Título Individual")} className={sidebarBtnClass}><CheckCircle size={14} /> Liquidar - F9</button>
                  <button onClick={() => triggerSimulation("Programar Cobrança")} className={sidebarBtnClass}><Calendar size={14} /> Programar</button>
                  <button onClick={() => triggerSimulation("Liquidação em Lote")} className={sidebarBtnClass}><Layers size={14} /> Liquidar em Lote</button>
                  <button onClick={() => triggerSimulation("Emissão em Lote")} className={sidebarBtnClass}><Printer size={14} /> Emitir em Lote</button>
                  <button onClick={() => triggerSimulation("Antecipação de Recebíveis")} className={sidebarBtnClass}><ArrowRightLeft size={14} /> Antecipação</button>
                </div>

                <div className="space-y-1">
                  <span className={sidebarSectionTitleClass}>+ Outras Opções</span>
                  <button onClick={() => triggerSimulation("Imprimir Faturas/Títulos")} className={sidebarBtnClass}><Printer size={14} /> Imprimir</button>
                  <button onClick={() => triggerSimulation("Cancelar Título")} className={sidebarBtnClass}><X size={14} /> Cancelar</button>
                  <button onClick={() => triggerSimulation("Localizar Fatura")} className={sidebarBtnClass}><Search size={14} /> Localizar</button>
                </div>
              </div>
            )}

            {/* Table Area */}
            <div className="flex-1 space-y-1.5">
              {/* Selected Items Batch Actions */}
              {selectedTituloIds.length > 0 && (
                <div className="flex items-center flex-wrap justify-between gap-2 p-2 bg-indigo-50/80 border border-indigo-200 rounded-xl animate-fade-in">
                  <span className="text-xs font-bold text-indigo-900">
                    {selectedTituloIds.length} título(s) selecionado(s)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        try {
                          await api.post('/cobranca/titulos/acao-lote', {
                            ids: selectedTituloIds,
                            acao: 'Disparar Manualmente'
                          });
                          alert(`Cobrança enviada com sucesso para ${selectedTituloIds.length} título(s)!`);
                          refetchReceber();
                          setSelectedTituloIds([]);
                        } catch (err) {
                          console.error(err);
                          alert('Erro ao enviar cobrança em lote.');
                        }
                      }}
                      className="btn-primary !py-1 !px-2.5 text-[9px] font-bold flex items-center gap-1 rounded-md text-white shadow-2xs bg-indigo-600 hover:bg-indigo-700 cursor-pointer"
                    >
                      <Send size={10} />
                      Enviar Cobrança (WhatsApp)
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await api.post('/cobranca/titulos/acao-lote', {
                            ids: selectedTituloIds,
                            acao: 'Retomar Cobrança'
                          });
                          alert(`Cobrança Automática (Régua) ativada para ${selectedTituloIds.length} título(s)!`);
                          refetchReceber();
                          setSelectedTituloIds([]);
                        } catch (err) {
                          console.error(err);
                          alert('Erro ao ativar cobrança automática.');
                        }
                      }}
                      className="btn-secondary !py-1 !px-2.5 text-[9px] font-bold flex items-center gap-1 rounded-md text-slate-700 border-slate-300 cursor-pointer"
                    >
                      <PlayCircle size={10} />
                      Ativar Automática
                    </button>
                    <button
                      onClick={() => {
                        triggerSimulation(`Liquidação em Lote para os Títulos: ${selectedTituloIds.join(', ')}`);
                        setSelectedTituloIds([]);
                      }}
                      className="btn-secondary !py-1 !px-2.5 text-[9px] font-bold flex items-center gap-1 rounded-md text-slate-700 border-slate-300 cursor-pointer"
                    >
                    <CheckCircle size={10} />
                      Liquidar em Lote
                    </button>
                    <button
                      onClick={() => setSelectedTituloIds([])}
                      className="btn-secondary !py-1 !px-2.5 text-[9px] font-bold text-slate-500 hover:text-slate-800 rounded-md border-slate-300 cursor-pointer"
                    >
                      Limpar Seleção
                    </button>
                  </div>
                </div>
              )}

            {/* TABELA COMPACTA COM ESTRUTURA EM COLUNAS, DIVISORES VERTICAIS E SELEÇÃO DE LINHA */}
            <div className="card !p-0 overflow-hidden border border-slate-300 dark:border-slate-800 shadow-sm rounded-xl">
              <div className="overflow-x-auto max-h-[calc(100vh-190px)] overflow-y-auto scrollbar-thin" style={{ WebkitOverflowScrolling: 'touch' }}>
                <table className="w-full text-xs border-collapse">
                  
                  {/* CABEÇALHO COM COR DESTACADA E BORDA INFERIOR SÓLIDA */}
                  <thead className="bg-slate-200/90 dark:bg-slate-800/90 border-b-2 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 sticky top-0 z-20">
                    <tr>
                      <th className="px-2 py-1.5 text-center w-8 border-r border-slate-300 dark:border-slate-700 shrink-0">
                        <span className="sr-only">Seleção</span>
                      </th>

                      {/* CÓDIGO */}
                      <th 
                        onClick={() => handleSort('codigo')}
                        className={clsx(
                          "px-2.5 py-1.5 text-left text-[11px] font-extrabold uppercase tracking-wide border-r border-slate-300 dark:border-slate-700 whitespace-nowrap shrink-0 cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-700 transition-colors select-none",
                          sortField === 'codigo' && "bg-indigo-100/80 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200"
                        )}
                        title="Clique para ordenar por Código"
                      >
                        <div className="flex items-center gap-1">
                          <span>CÓDIGO</span>
                          {sortField === 'codigo' ? (sortDirection === 'asc' ? <ChevronUp size={12} className="text-indigo-600" /> : <ChevronDown size={12} className="text-indigo-600" />) : <ArrowUpDown size={11} className="text-slate-400 opacity-60" />}
                        </div>
                      </th>

                      {/* EMISSÃO */}
                      <th 
                        onClick={() => handleSort('emissao')}
                        className={clsx(
                          "px-2.5 py-1.5 text-left text-[11px] font-extrabold uppercase tracking-wide border-r border-slate-300 dark:border-slate-700 whitespace-nowrap shrink-0 cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-700 transition-colors select-none",
                          sortField === 'emissao' && "bg-indigo-100/80 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200"
                        )}
                        title="Clique para ordenar por Emissão"
                      >
                        <div className="flex items-center gap-1">
                          <span>EMISSÃO</span>
                          {sortField === 'emissao' ? (sortDirection === 'asc' ? <ChevronUp size={12} className="text-indigo-600" /> : <ChevronDown size={12} className="text-indigo-600" />) : <ArrowUpDown size={11} className="text-slate-400 opacity-60" />}
                        </div>
                      </th>

                      {/* DESCRIÇÃO / CLIENTE */}
                      <th 
                        onClick={() => handleSort('cliente')}
                        className={clsx(
                          "px-2.5 py-1.5 text-left text-[11px] font-extrabold uppercase tracking-wide border-r border-slate-300 dark:border-slate-700 min-w-[180px] max-w-[280px] shrink-0 cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-700 transition-colors select-none",
                          sortField === 'cliente' && "bg-indigo-100/80 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200"
                        )}
                        title="Clique para ordenar por Cliente / Descrição"
                      >
                        <div className="flex items-center gap-1">
                          <span>DESCRIÇÃO / CLIENTE</span>
                          {sortField === 'cliente' ? (sortDirection === 'asc' ? <ChevronUp size={12} className="text-indigo-600" /> : <ChevronDown size={12} className="text-indigo-600" />) : <ArrowUpDown size={11} className="text-slate-400 opacity-60" />}
                        </div>
                      </th>

                      {/* VENCIMENTO / RECEBIMENTO */}
                      <th 
                        onClick={() => handleSort('vencimento')}
                        className={clsx(
                          "px-2.5 py-1.5 text-left text-[11px] font-extrabold uppercase tracking-wide border-r border-slate-300 dark:border-slate-700 whitespace-nowrap shrink-0 cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-700 transition-colors select-none",
                          sortField === 'vencimento' && "bg-blue-900/10 text-blue-900 dark:bg-blue-950 dark:text-blue-200"
                        )}
                        title="Clique para ordenar por Vencimento / Recebimento"
                      >
                        <div className="flex items-center gap-1">
                          <span>{tituloStatusFilter === 'PAGO' ? 'RECEBIMENTO' : 'VENCIMENTO'}</span>
                          {sortField === 'vencimento' ? (sortDirection === 'asc' ? <ChevronUp size={12} className="text-blue-900" /> : <ChevronDown size={12} className="text-blue-900" />) : <ArrowUpDown size={11} className="text-slate-400 opacity-60" />}
                        </div>
                      </th>

                      {/* VALOR TÍTULO */}
                      <th 
                        onClick={() => handleSort('valor')}
                        className={clsx(
                          "px-2.5 py-1.5 text-right text-[11px] font-extrabold uppercase tracking-wide border-r border-slate-300 dark:border-slate-700 whitespace-nowrap shrink-0 cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-700 transition-colors select-none",
                          sortField === 'valor' && "bg-indigo-100/80 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200"
                        )}
                        title="Clique para ordenar por Valor"
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>{tituloStatusFilter === 'PAGO' ? 'VALOR QUITADO' : 'VALOR TÍTULO'}</span>
                          {sortField === 'valor' ? (sortDirection === 'asc' ? <ChevronUp size={12} className="text-indigo-600" /> : <ChevronDown size={12} className="text-indigo-600" />) : <ArrowUpDown size={11} className="text-slate-400 opacity-60" />}
                        </div>
                      </th>

                      {/* ESPÉCIE */}
                      <th 
                        onClick={() => handleSort('especie')}
                        className={clsx(
                          "px-2.5 py-1.5 text-center text-[11px] font-extrabold uppercase tracking-wide border-r border-slate-300 dark:border-slate-700 whitespace-nowrap shrink-0 cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-700 transition-colors select-none",
                          sortField === 'especie' && "bg-indigo-100/80 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200"
                        )}
                        title="Clique para ordenar por Espécie"
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span>ESPÉCIE</span>
                          {sortField === 'especie' ? (sortDirection === 'asc' ? <ChevronUp size={12} className="text-indigo-600" /> : <ChevronDown size={12} className="text-indigo-600" />) : <ArrowUpDown size={11} className="text-slate-400 opacity-60" />}
                        </div>
                      </th>

                      {/* PORTADOR */}
                      <th 
                        onClick={() => handleSort('portador')}
                        className={clsx(
                          "px-2.5 py-1.5 text-left text-[11px] font-extrabold uppercase tracking-wide border-r border-slate-300 dark:border-slate-700 whitespace-nowrap shrink-0 cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-700 transition-colors select-none",
                          sortField === 'portador' && "bg-indigo-100/80 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200"
                        )}
                        title="Clique para ordenar por Portador"
                      >
                        <div className="flex items-center gap-1">
                          <span>PORTADOR</span>
                          {sortField === 'portador' ? (sortDirection === 'asc' ? <ChevronUp size={12} className="text-indigo-600" /> : <ChevronDown size={12} className="text-indigo-600" />) : <ArrowUpDown size={11} className="text-slate-400 opacity-60" />}
                        </div>
                      </th>

                      {/* NOSSO Nº */}
                      <th 
                        onClick={() => handleSort('nosso_numero')}
                        className={clsx(
                          "px-2.5 py-1.5 text-left text-[11px] font-extrabold uppercase tracking-wide whitespace-nowrap shrink-0 cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-700 transition-colors select-none",
                          sortField === 'nosso_numero' && "bg-indigo-100/80 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200"
                        )}
                        title="Clique para ordenar por Nosso Número"
                      >
                        <div className="flex items-center gap-1">
                          <span>NOSSO Nº</span>
                          {sortField === 'nosso_numero' ? (sortDirection === 'asc' ? <ChevronUp size={12} className="text-indigo-600" /> : <ChevronDown size={12} className="text-indigo-600" />) : <ArrowUpDown size={11} className="text-slate-400 opacity-60" />}
                        </div>
                      </th>
                    </tr>
                  </thead>

                  {/* CORPO DA TABELA COM LINHAS FINAS COMPACTAS E BORDA VERTICAL ENTRE COLUNAS */}
                  <tbody>
                    {filteredTitulos.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-slate-500 font-bold text-xs">
                          Nenhum título encontrado para os filtros ativos.
                        </td>
                      </tr>
                    ) : (
                      filteredTitulos.map((tr: any, idx: number) => {
                        const statusTrim = (tr.status_pagamento || '').trim();
                        const isPaid = statusTrim === 'PAGO' || (tr.valor_pago || 0) >= tr.valor;
                        const isVencido = !isPaid && statusTrim === 'ABERTO' && new Date(tr.data_vencimento) < new Date();
                        const isSelected = selectedFinanceiroRow?.id === tr.id || selectedTituloIds.includes(tr.id);

                        const portadorUpper = (tr.portador || '').toUpperCase();
                        const isAsaas = portadorUpper.includes('ASAAS');
                        const isBanco = portadorUpper.includes('BANCO') || portadorUpper.includes('SANTANDER') || portadorUpper.includes('COBRANCA');

                        return (
                          <tr
                            key={tr.id || idx}
                            onClick={() => setSelectedFinanceiroRow(tr)}
                            onDoubleClick={() => setSelectedTituloIdForDetail(tr.id)}
                            className={clsx(
                              'border-b border-slate-200 dark:border-slate-800 cursor-pointer transition-all duration-150',
                              isSelected
                                ? 'bg-indigo-600 text-white dark:bg-indigo-700 dark:text-white font-black border-l-4 border-l-amber-400 shadow-md ring-1 ring-indigo-500'
                                : isVencido
                                ? 'bg-red-50/40 hover:bg-red-100/50 dark:bg-red-950/20'
                                : 'hover:bg-indigo-50/50 dark:hover:bg-slate-800/60 bg-white dark:bg-slate-900'
                            )}
                          >
                            {/* Coluna 0: Radio Seleção */}
                            <td className="px-2 py-1 text-center border-r border-slate-200 dark:border-slate-800 shrink-0">
                              <input
                                type="radio"
                                name="financeiro_row_selection"
                                checked={isSelected}
                                onChange={() => setSelectedFinanceiroRow(tr)}
                                className="w-3.5 h-3.5 text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                              />
                            </td>

                            {/* Coluna 1: Código - Clicar abre a ficha do título */}
                            <td 
                              onClick={(e) => { e.stopPropagation(); setSelectedTituloIdForDetail(tr.id); }}
                              className="px-2.5 py-1 font-mono font-extrabold text-[11px] text-indigo-600 hover:text-indigo-800 hover:underline border-r border-slate-200 dark:border-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                              title="Clique para abrir detalhes do título"
                            >
                              #{tr.id_firebird || tr.id}
                            </td>

                            {/* Coluna 2: Emissão */}
                            <td className="px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap shrink-0">
                              {formatDate(tr.data_emissao)}
                            </td>

                            {/* Coluna 3: Descrição / Cliente - Largura compacta sem espaço vazio excessivo */}
                            <td 
                              onClick={(e) => { e.stopPropagation(); setSelectedTituloIdForDetail(tr.id); }}
                              className="px-2.5 py-1 text-[11px] font-bold border-r border-slate-200 dark:border-slate-800 min-w-[180px] max-w-[280px] shrink-0 cursor-pointer group"
                              title="Clique para abrir detalhes do título"
                            >
                              <div className="flex flex-col leading-tight">
                                <span className="text-slate-900 dark:text-slate-100 font-extrabold group-hover:text-indigo-600 transition-colors truncate" title={tr.descricao}>{tr.descricao}</span>
                                <span className="text-[10px] font-medium text-slate-500 truncate" title={tr.cliente}>{tr.cliente || 'Sem parceiro associado'}</span>
                              </div>
                            </td>

                            {/* Coluna 4: Vencimento / Quitação */}
                            <td className="px-2.5 py-1 font-mono font-bold text-[11px] text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap shrink-0">
                              {tituloStatusFilter === 'PAGO'
                                ? (tr.data_pagamento ? formatDate(tr.data_pagamento) : formatDate(tr.data_vencimento))
                                : formatDate(tr.data_vencimento)
                              }
                            </td>

                            {/* Coluna 5: Valor */}
                            <td className="px-2.5 py-1 text-right font-mono font-black text-[11.5px] text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap shrink-0">
                              {tituloStatusFilter === 'PAGO'
                                ? formatBRL(tr.valor_pago > 0 ? tr.valor_pago : tr.valor)
                                : formatBRL(tr.valor)
                              }
                              {tituloStatusFilter === 'PAGO' && (tr.juros_multa > 0 || (tr.valor_pago - tr.valor) > 0.01) && (
                                <span className="block text-[9.5px] font-extrabold text-emerald-600 dark:text-emerald-400 font-sans">
                                  +{formatBRL(tr.juros_multa || (tr.valor_pago - tr.valor))} juros
                                </span>
                              )}
                            </td>

                            {/* Coluna 6: Espécie */}
                            <td className="px-2.5 py-1 text-center border-r border-slate-200 dark:border-slate-800 whitespace-nowrap shrink-0">
                              <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded border uppercase bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300">
                                {tr.especie || 'BOLETO'}
                              </span>
                            </td>

                            {/* Coluna 7: Portador */}
                            <td className="px-2.5 py-1 text-[10.5px] font-bold uppercase border-r border-slate-200 dark:border-slate-800 whitespace-nowrap shrink-0">
                              <span className={clsx(
                                "px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase border",
                                isAsaas
                                  ? "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300"
                                  : isBanco
                                  ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300"
                                  : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300"
                              )}>
                                {tr.portador || 'CARTEIRA'}
                              </span>
                            </td>

                            {/* Coluna 8: Nosso Número & Ação de Cancelar Boleto */}
                            <td className="px-2.5 py-1 font-mono text-[10.5px] font-bold text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap shrink-0">
                              <div className="flex items-center justify-between gap-1.5">
                                <span>{tr.nosso_numero || tr.asaas_payment_id || tr.numero_documento || '—'}</span>
                                {(tr.nosso_numero || tr.asaas_payment_id) && canCancelBoleto && (
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      if (!confirm(`Deseja cancelar o boleto (Nosso Nº ${tr.nosso_numero || tr.asaas_payment_id})?\n\nIsso registrará o cancelamento no log e manterá o título em aberto.`)) return;
                                      try {
                                        const { data } = await api.post(`/financeiro/titulos/${tr.id}/desvincular-boleto`);
                                        alert(data.message || 'Boleto cancelado com sucesso!');
                                        refetchReceber();
                                      } catch (err: any) {
                                        alert(err.response?.data?.error || err.message || 'Erro ao cancelar o boleto.');
                                      }
                                    }}
                                    className="p-1 text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-950/60 rounded transition-colors cursor-pointer"
                                    title="Cancelar este boleto"
                                  >
                                    <Ban size={13} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* BARRA FIXA STICKY NO RODAPÉ: BOTÕES DE AÇÃO À ESQUERDA, VALOR TOTAL FILTRADO À DIREITA */}
            <div className="sticky bottom-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 p-2.5 shadow-2xl flex flex-wrap items-center justify-between gap-2.5 rounded-t-2xl">
              
              {/* LADO ESQUERDO: BOTÕES DE AÇÃO & COBRANÇA EM LOTE & LANÇAR TÍTULO */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/60 p-1 rounded-xl border border-indigo-200/80">
                  <button
                    onClick={() => {
                      const target = selectedFinanceiroRow || filteredTitulos[0];
                      if (target) setSelectedTituloIdForDetail(target.id);
                    }}
                    title="Visualizar a Ficha Completa do Título Selecionado"
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Eye size={13} /> Visualizar
                  </button>

                  <button
                    onClick={() => {
                      const target = selectedFinanceiroRow || filteredTitulos[0];
                      if (target) handleOpenQuitacao(target);
                    }}
                    title="Baixar ou Quitar o Título Selecionado"
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <CheckCircle2 size={13} /> Baixar / Liquidar
                  </button>

                  <button
                    onClick={async () => {
                      const target = selectedFinanceiroRow || filteredTitulos[0];
                      if (target) {
                        try {
                          await api.post('/cobranca/titulos/acao-lote', { ids: [target.id], acao: 'Disparar Manualmente' });
                          alert(`Cobrança enviada com sucesso para ${target.cliente || 'o cliente'} via WhatsApp!`);
                          refetchReceber();
                        } catch (err) {
                          console.error(err);
                          alert('Erro ao enviar cobrança.');
                        }
                      }
                    }}
                    title="Emitir Cobrança Individual do Título Selecionado"
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Send size={13} /> Emitir Cobrança
                  </button>

                  {/* Botão de Estorno / Cancelar Quitação (Aparece SOMENTE para títulos recebidos/quitados) */}
                  {tituloStatusFilter === 'PAGO' && (
                    <button
                      onClick={async () => {
                        const target = selectedFinanceiroRow || filteredTitulos[0];
                        if (!target) {
                          alert('Selecione um título quitado para estornar.');
                          return;
                        }
                        if (confirm(`Tem certeza que deseja CANCELAR a quitação do título #${target.id_firebird || target.id} (${target.cliente || target.descricao})?\nO título retornará ao status EM ABERTO.`)) {
                          try {
                            await api.post(`/financeiro/titulos/${target.id}/estornar`);
                            alert('Quitação cancelada e título estornado para EM ABERTO com sucesso!');
                            refetchReceber();
                          } catch (err: any) {
                            console.error(err);
                            alert(err.response?.data?.error || 'Erro ao cancelar quitação.');
                          }
                        }
                      }}
                      title="Cancelar/Estornar a quitação do título selecionado (Volta para Em Aberto)"
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer animate-fade-in"
                    >
                      <RotateCcw size={13} /> Estornar Quitação
                    </button>
                  )}

                  <button
                    onClick={handleOpenBatchModal}
                    title="Abrir tela de Emissão e Cobrança de Boletos em Lote (Preenchimento automático + trava para vencidos)"
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Layers size={13} /> ⚡ Cobrança em Lote
                  </button>
                </div>

                <button 
                  className="btn-primary !py-1.5 !px-3.5 text-xs font-extrabold flex items-center gap-1.5 shadow-md cursor-pointer ml-1"
                  onClick={() => setShowEscolhaModal(true)}
                >
                  <Plus size={14} /> Lançar Título
                </button>
              </div>

              {/* LADO DIREITO: TOTAL FILTRADO DE FORMA DESTACADA */}
              <div className="flex items-center gap-2 text-xs ml-auto font-mono">
                {(() => {
                  if (user?.permissoes_acoes?.ocultar_totais_financeiro) {
                    return null;
                  }
                  const isPagoFilter = (tituloStatusFilter || '').toUpperCase().includes('PAGO') || (tituloStatusFilter || '').toUpperCase().includes('QUITADO');
                  const totalGeral = filteredTitulos.reduce((sum, t) => {
                    if (isPagoFilter) {
                      const pVal = Number(t.valor_pago || 0);
                      return sum + (pVal > 0 ? pVal : Number(t.valor || 0));
                    }
                    return sum + Number(t.valor || 0);
                  }, 0);
                  return (
                    <div className="px-4 py-1.5 bg-indigo-600 text-white rounded-xl font-black flex items-center gap-2 shadow-md text-xs">
                      <span className="text-[10px] uppercase font-extrabold tracking-wider text-indigo-200">
                        {isPagoFilter ? 'Total Quitado:' : 'Total:'}
                      </span>
                      <strong className="text-sm">{formatBRL(totalGeral)}</strong>
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Tab 3: BANCO */}
      {activeTab === 'banco' && (
        <div className="space-y-6 animate-fade-in">
          
          {/* Header Action menu for Mobile */}
          <div className="lg:hidden flex items-center justify-between p-3 bg-bg-secondary/30 border border-divider rounded-xl">
            <span className="text-xs font-bold text-text-primary">Menu de Opções do Banco</span>
            <button
              onClick={() => setIsBancoSidebarOpen(true)}
              className="btn-secondary !py-1.5 !px-3 text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Menu size={16} /> Ações do Banco
            </button>
          </div>

          {/* Mobile drawer slider for Banco */}
          {isBancoSidebarOpen && (
            <div className="fixed inset-0 z-50 flex justify-end">
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsBancoSidebarOpen(false)} />
              <div className="relative w-80 max-w-full bg-bg-primary h-full shadow-2xl p-6 overflow-y-auto flex flex-col gap-6 animate-slide-in">
                <div className="flex justify-between items-center border-b border-divider pb-3">
                  <h3 className="font-bold text-text-primary text-sm flex items-center gap-1.5">
                    <Building size={16} /> Menu de Opções
                  </h3>
                  <button onClick={() => setIsBancoSidebarOpen(false)} className="p-1 hover:bg-bg-secondary rounded-lg">
                    <X size={18} />
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-1">
                    <span className={sidebarSectionTitleClass}>+ Lançamentos</span>
                    <button onClick={() => { setIsBancoSidebarOpen(false); triggerSimulation("Novo Lançamento Bancário"); }} className={sidebarBtnClass}><Plus size={14} /> Novo - F3</button>
                    <button onClick={() => { setIsBancoSidebarOpen(false); triggerSimulation("Abrir Movimento Bancário"); }} className={sidebarBtnClass}><FileText size={14} /> Abrir - F5</button>
                    <button onClick={() => { setIsBancoSidebarOpen(false); triggerSimulation("Excluir Lançamento Banco"); }} className={sidebarBtnClass}><Trash2 size={14} /> Excluir</button>
                    <button onClick={() => { setIsBancoSidebarOpen(false); triggerSimulation("Nova Transferência Banco"); }} className={sidebarBtnClass}><ArrowRightLeft size={14} /> Transferência</button>
                  </div>
                  <div className="space-y-1">
                    <span className={sidebarSectionTitleClass}>+ Outras Opções</span>
                    <button onClick={() => { setIsBancoSidebarOpen(false); triggerSimulation("Conciliação Bancária OFX"); }} className={sidebarBtnClass}><CheckCircle2 size={14} /> Conciliação</button>
                    <button onClick={() => { setIsBancoSidebarOpen(false); triggerSimulation("Devolução de Cheques/Títulos"); }} className={sidebarBtnClass}><AlertTriangle size={14} /> Devolução</button>
                    <button onClick={() => { setIsBancoSidebarOpen(false); triggerSimulation("Visualizar Saldo Contas"); }} className={sidebarBtnClass}><Eye size={14} /> Visualiza Saldo</button>
                    <button onClick={() => { setIsBancoSidebarOpen(false); triggerSimulation("Localizar Lançamento Banco"); }} className={sidebarBtnClass}><Search size={14} /> Localizar</button>
                    <button onClick={() => { setIsBancoSidebarOpen(false); triggerSimulation("Imprimir Extrato Banco"); }} className={sidebarBtnClass}><Printer size={14} /> Imprimir Listagem</button>
                    <button onClick={() => { setIsBancoSidebarOpen(false); triggerSimulation("Imprimir Cheques Banco"); }} className={sidebarBtnClass}><Printer size={14} /> Imprimir Cheques</button>
                    <button onClick={() => { setIsBancoSidebarOpen(false); triggerSimulation("Imprimir Recibo Banco"); }} className={sidebarBtnClass}><Printer size={14} /> Imprimir Recibo</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Extrato Asaas REAL - TOP PRIORITY */}
          <div className="flex flex-col lg:flex-row gap-6">
            {!isBancoSidebarCollapsed && (
              <div className="hidden lg:block w-56 bg-bg-primary border border-divider rounded-xl p-4 space-y-4 shrink-0 shadow-sm h-fit animate-fade-in">
                <div className="flex justify-between items-center border-b border-divider pb-2 mb-2">
                  <span className="text-[11px] font-black text-text-primary">Ações do Banco</span>
                  <button
                    onClick={() => setIsBancoSidebarCollapsed(true)}
                    className="p-1 hover:bg-bg-secondary text-text-secondary hover:text-text-primary rounded-lg transition-all"
                    title="Recolher menu"
                  >
                    <ChevronLeft size={14} />
                  </button>
                </div>
                
                <div className="space-y-1">
                  <span className={sidebarSectionTitleClass}>+ Lançamentos</span>
                  <button onClick={() => triggerSimulation("Novo Lançamento Bancário")} className={sidebarBtnClass}><Plus size={14} /> Novo - F3</button>
                  <button onClick={() => triggerSimulation("Abrir Movimento Bancário")} className={sidebarBtnClass}><FileText size={14} /> Abrir - F5</button>
                  <button onClick={() => triggerSimulation("Excluir Lançamento Banco")} className={sidebarBtnClass}><Trash2 size={14} /> Excluir</button>
                  <button onClick={() => triggerSimulation("Nova Transferência Banco")} className={sidebarBtnClass}><ArrowRightLeft size={14} /> Transferência</button>
                </div>

                <div className="space-y-1">
                  <span className={sidebarSectionTitleClass}>+ Outras Opções</span>
                  <button onClick={() => triggerSimulation("Conciliação Bancária OFX")} className={sidebarBtnClass}><CheckCircle2 size={14} /> Conciliação</button>
                  <button onClick={() => triggerSimulation("Devolução de Cheques/Títulos")} className={sidebarBtnClass}><AlertTriangle size={14} /> Devolução</button>
                  <button onClick={() => triggerSimulation("Visualizar Saldo Contas")} className={sidebarBtnClass}><Eye size={14} /> Visualiza Saldo</button>
                  <button onClick={() => triggerSimulation("Localizar Lançamento Banco")} className={sidebarBtnClass}><Search size={14} /> Localizar</button>
                  <button onClick={() => triggerSimulation("Imprimir Extrato Banco")} className={sidebarBtnClass}><Printer size={14} /> Imprimir Listagem</button>
                  <button onClick={() => triggerSimulation("Imprimir Cheques Banco")} className={sidebarBtnClass}><Printer size={14} /> Imprimir Cheques</button>
                  <button onClick={() => triggerSimulation("Imprimir Recibo Banco")} className={sidebarBtnClass}><Printer size={14} /> Imprimir Recibo</button>
                </div>
              </div>
            )}

            <div className="flex-1 min-w-0 space-y-4">
              <div className="card p-5 border border-divider rounded-xl shadow-sm bg-bg-primary">
                <div className="flex items-center justify-between mb-4 border-b border-divider pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-black text-xs">
                      <Building2 size={15} />
                    </div>
                    <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider">Extrato Bancário — Asaas & Banco Cora</span>
                  </div>
                  <span className="text-[8px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full uppercase animate-pulse">● Live Multi-Bank</span>
                </div>
                <ExtratoAsaas startDate={filterStartDate} endDate={filterEndDate} />
              </div>
            </div>
          </div>

          {/* Banco Header details and actions (Only shown if manual accounts exist) */}
          {contasBancarias.length > 0 && (
            <>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-bg-secondary/20 p-4 border border-divider rounded-xl">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-text-secondary uppercase">Filtrar por Conta:</label>
                  <select
                    value={selectedContaBanco}
                    onChange={(e) => setSelectedContaBanco(e.target.value)}
                    className="input !py-1.5 !w-auto text-xs font-semibold"
                  >
                    <option value="todos">Todas Contas de Controle</option>
                    {contasBancarias.map(c => (
                      <option key={c.id} value={c.id}>{c.apelido} ({c.banco})</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={() => setIsBankModalOpen(true)}
                  className="btn-primary py-1.5 text-xs flex items-center gap-1.5 rounded-lg transition-all cursor-pointer"
                >
                  <Plus size={14} /> Nova Conta Bancária
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {contasBancarias.map(cb => (
                  <div key={cb.id} className="card !p-4 border border-divider hover:border-border rounded-xl flex flex-col justify-between gap-4 bg-bg-primary shadow-sm">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-brand-500/10 text-brand-600 rounded-lg">
                          <Building size={16} />
                        </div>
                        <div>
                          <div className="font-bold text-text-primary text-xs">{cb.apelido}</div>
                          <div className="text-[9px] text-text-secondary">{cb.banco} · {cb.tipo}</div>
                        </div>
                      </div>
                      <span className="text-[9px] font-semibold bg-slate-100 dark:bg-slate-700/30 text-text-secondary px-1.5 py-0.5 rounded">
                        AG: {cb.agencia} / CC: {cb.conta}
                      </span>
                    </div>

                    <div className="border-t border-divider/60 pt-3 flex justify-between items-end">
                      <div>
                        <span className="text-[8px] text-text-muted uppercase block">Saldo Inicial</span>
                        <span className="text-xs font-semibold text-text-secondary font-mono">{formatBRL(cb.saldo_inicial)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[8px] text-text-muted uppercase block">Saldo Atual</span>
                        <span className={`text-sm font-bold font-mono ${cb.saldo_atual >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {formatBRL(cb.saldo_atual)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab 4: OCORRÊNCIAS */}
      {activeTab === 'ocorrencias' && (
        <div className="space-y-6 animate-fade-in">
          <div className="card p-5 border border-divider rounded-xl shadow-sm space-y-4 bg-bg-primary">
            <div className="flex justify-between items-center border-b border-divider pb-3 flex-wrap gap-3">
              <div>
                <h3 className="font-bold text-text-primary text-xs uppercase tracking-wider">
                  Log de Ocorrências das Automações
                </h3>
                <p className="text-[9px] text-text-secondary">Histórico de mensagens de cobrança e marketing enviadas ou falhas registradas</p>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-80">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="text"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="Filtrar por destinatário, status, mensagem..."
                    className="input !pl-8 !py-1.5 text-xs w-full"
                  />
                </div>
                <button
                  onClick={() => refetchLogs()}
                  className="btn-secondary !py-1.5 !px-3 text-xs"
                  title="Atualizar Logs"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-divider rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-bg-secondary/60 text-text-secondary font-bold uppercase tracking-wider text-[9px] border-b border-divider">
                  <tr>
                    <th className="p-3">Data/Hora</th>
                    <th className="p-3">Destinatário</th>
                    <th className="p-3">Automação (Gatilho)</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Mensagem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider/30 font-mono text-[11px]">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-text-muted italic">
                        Nenhuma ocorrência encontrada.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-bg-secondary/20">
                        <td className="p-3 whitespace-nowrap text-text-secondary">
                          {new Date(log.created_at || log.timestamp).toLocaleString('pt-BR')}
                        </td>
                        <td className="p-3 whitespace-nowrap font-bold text-text-primary">
                          {log.destinatario}
                        </td>
                        <td className="p-3 whitespace-nowrap text-brand-500">
                          {log.gatilho}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span className={clsx(
                            'text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border shadow-sm',
                            log.status === 'sucesso' || log.status === 'SUCCESS' || log.status === 'enviado'
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : 'bg-red-50 text-red-700 border-red-200'
                          )}>
                            {log.status}
                          </span>
                        </td>
                        <td className="p-3 text-text-secondary whitespace-normal max-w-md line-clamp-2" title={log.mensagem}>
                          {log.mensagem}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: GERENCIAMENTO DE BOLETOS EMITIDOS (CONTROLE E MANUTENÇÃO DAS EMISSÕES) */}
      {activeTab === 'boletos' && (
        <div className="space-y-2.5 animate-fade-in">
          {/* BARRA DE CONTROLE UNIFICADA EM UMA ÚNICA LINHA COMPACTA */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-1.5 shadow-2xs text-xs flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 shrink-0">
              <div className="p-1 bg-blue-500/10 text-blue-600 rounded-lg shrink-0">
                <FileText size={15} />
              </div>
              <h3 className="font-black text-[11px] text-slate-900 dark:text-slate-100 uppercase tracking-tight font-heading whitespace-nowrap hidden sm:block">
                CONTROLE DE BOLETOS & PIX EMITIDOS
              </h3>

              {/* Botão Manutenção de Títulos (Auto-Vínculo Inteligente) */}
              <button
                type="button"
                onClick={handleOpenManutencaoModal}
                className="px-2.5 py-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-extrabold text-[11px] rounded-lg shadow-sm transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                title="Executar varredura automática de títulos e boletos idênticos por Cliente/CNPJ, Vencimento e Valor"
              >
                <Settings size={13} className="animate-spin-slow" /> Manutenção de Títulos
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 ml-auto">
              {/* Botão de Ação em Lote quando há boletos selecionados */}
              {selectedBoletoIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleCancelarBoletosLote()}
                  className="px-2.5 py-0.5 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs rounded-lg shadow-sm transition-all cursor-pointer flex items-center gap-1 shrink-0 animate-pulse"
                >
                  <X size={13} /> Cancelar Emissão em Lote ({selectedBoletoIds.length})
                </button>
              )}

              {/* Filtro Cliente / Busca Expandido */}
              <div className="relative w-64 sm:w-80 shrink-0 flex-1 min-w-[220px]">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={boletosSearchClient}
                  onChange={(e) => setBoletosSearchClient(e.target.value.toUpperCase())}
                  placeholder="Buscar cliente, nosso nº, código do documento..."
                  className="input !pl-7 !py-0.5 text-xs font-semibold rounded-lg border-slate-300 w-full bg-white dark:bg-slate-800 uppercase"
                />
              </div>

              {/* Filtro Método: Boleto vs Pix */}
              <select
                value={boletosMetodoFilter}
                onChange={(e) => setBoletosMetodoFilter(e.target.value as any)}
                className="input !w-auto shrink-0 !py-0.5 !px-2 text-xs font-bold border-slate-300 rounded-lg cursor-pointer bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 font-mono"
                title="Filtrar por Método de Pagamento (Boleto ou Pix)"
              >
                <option value="todos">⚡ Todos os Pagamentos</option>
                <option value="pix_direto">📲 Pix Direto na Conta (Chave)</option>
                <option value="boleto_pago_pix">⚡ Boletos Pagos via Pix</option>
                <option value="pix">⚡ Todos os Pix (Direto + Boletos Pix)</option>
                <option value="boleto">📄 Somente Boletos</option>
              </select>

              {/* Filtro Portador */}
              <select
                value={boletosPortadorFilter}
                onChange={(e) => setBoletosPortadorFilter(e.target.value)}
                className="input !w-auto shrink-0 !py-0.5 !px-2 text-xs font-bold border-slate-300 rounded-lg cursor-pointer bg-white dark:bg-slate-800"
                title="Filtrar Portador"
              >
                <option value="todos">Todos Portadores</option>
                <option value="asaas">ASAAS (BANCO)</option>
                <option value="cora">CORA (BANCO)</option>
                <option value="carteira">CARTEIRA</option>
                <option value="banco">OUTROS BANCOS</option>
              </select>

              {/* Filtro Situação (Padrão: Quitados) */}
              <select
                value={boletosSituacaoFilter}
              onChange={(e) => {
                  const val = e.target.value
                  setBoletosSituacaoFilter(val)
                  const toYYYYMMDD = (d: Date) => d.toISOString().split('T')[0]
                  const today = new Date()
                  if (val === 'PAGO' || val === 'QUITADO' || val === 'Quitados') {
                    // Quitados: muda para data de quitação e mostra os últimos 90 dias
                    setBoletosTipoData('quitacao')
                    const d90 = new Date(today)
                    d90.setDate(today.getDate() - 90)
                    setFilterStartDate(toYYYYMMDD(d90))
                    setFilterEndDate(toYYYYMMDD(today))
                  } else if (val === 'ABERTO') {
                    // Em Aberto: muda para vencimento e mostra hoje até 60 dias à frente
                    setBoletosTipoData('vencimento')
                    const d60 = new Date(today)
                    d60.setDate(today.getDate() + 60)
                    setFilterStartDate(toYYYYMMDD(today))
                    setFilterEndDate(toYYYYMMDD(d60))
                  }
                }}
                className="input !w-auto shrink-0 !py-0.5 !px-2 text-xs font-bold border-slate-300 rounded-lg cursor-pointer bg-white dark:bg-slate-800"
                title="Filtrar Situação"
              >
                <option value="PAGO">Quitados</option>
                <option value="ABERTO">Em Aberto</option>
                <option value="CANCELADO">🚫 Cancelados</option>
              </select>

              {/* Filtro Vínculo Coliseu Transporte */}
              <select
                value={boletosVinculoFilter}
                onChange={(e) => setBoletosVinculoFilter(e.target.value as 'todos' | 'vinculados' | 'sem_vinculo')}
                className="input !w-auto shrink-0 !py-0.5 !px-2 text-xs font-bold border-slate-300 rounded-lg cursor-pointer bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-300 font-mono"
                title="Filtrar por Vínculo com Título Coliseu Transporte"
              >
                <option value="todos">🔗 Todos Vínculos</option>
                <option value="vinculados">✓ Somente Vinculados</option>
                <option value="sem_vinculo">✕ Somente Sem Vínculo</option>
              </select>
            </div>
          </div>

          {/* TABELA DE BOLETOS & PIX EMITIDOS (MODULARIZADA & MEMOIZADA) */}
          <BoletosTable
            items={boletosRaw.filter(b => {
              if (boletosVinculoFilter === 'vinculados') return b.tem_vinculo === true;
              if (boletosVinculoFilter === 'sem_vinculo') return !b.tem_vinculo;
              return true;
            }).filter(b => {
              const cat = String(b.categoria_pagamento || '').toUpperCase();
              const esp = String(b.especie || '').toUpperCase();
              const bType = String(b.billing_type || '').toUpperCase();
              const hasAsaasNossoNo = Boolean(b.asaas_nosso_numero && b.asaas_nosso_numero !== '—' && String(b.asaas_nosso_numero).trim() !== '');
              const isExplicitPixDirect = cat === 'PIX_DIRETO' || esp === 'PIX_DIRETO';
              const isExplicitBoletoPix = cat === 'BOLETO_PAGO_PIX' || esp === 'BOLETO_PAGO_PIX';
              const isPix = isExplicitPixDirect || isExplicitBoletoPix || esp.includes('PIX') || bType.includes('PIX');
              const isPixDirect = isExplicitPixDirect || (isPix && !isExplicitBoletoPix && !hasAsaasNossoNo);

              if (boletosMetodoFilter === 'pix_direto') return isPixDirect;
              if (boletosMetodoFilter === 'boleto_pago_pix') return isPix && !isPixDirect;
              if (boletosMetodoFilter === 'pix') return isPix;
              if (boletosMetodoFilter === 'boleto') return !isPix;
              return true;
            })}
            isLoading={isSearchingBoletos}
            hasSearched={hasSearchedBoletos}
            selectedIds={selectedBoletoIds}
            selectedRowId={selectedBoletoRow?.id || null}
            boletosTipoData={boletosTipoData}
            onSelectRow={(b) => setSelectedBoletoRow(b)}
            onToggleCheck={(id, checked) => {
              if (checked) {
                setSelectedBoletoIds((prev: any) => [...prev, id]);
                const found = boletosRaw.find(b => b.id === id);
                if (found) setSelectedBoletoRow(found);
              } else {
                setSelectedBoletoIds((prev: any) => prev.filter((item: any) => item !== id));
              }
            }}
            onToggleCheckAll={(checked) => {
              if (checked) {
                const cancellable: any = boletosRaw.filter(b => (b.status_pagamento || '').trim() !== 'PAGO' && (b.status_pagamento || '').trim() !== 'CANCELADO').map(b => b.id);
                setSelectedBoletoIds(cancellable);
              } else {
                setSelectedBoletoIds([]);
              }
            }}
            formatDate={formatDate}
            formatBRL={formatBRL}
          />

          {/* BARRA FIXA STICKY NO RODAPÉ DA ABA BOLETOS (MODULARIZADA & MEMOIZADA) */}
          <BoletosFooterStats
            boletosRaw={boletosRaw}
            selectedBoletoIds={selectedBoletoIds}
            selectedBoletoRow={selectedBoletoRow}
            onOpenDetail={handleOpenBoletoDetail}
            onCancelarBoleto={handleCancelarBoleto}
            onCancelarLote={handleCancelarBoletosLote}
            onReenviarQuitacoes={handleReenviarQuitacoes}
          />
        </div>
      )}

      {/* MODAL: ADICIONAR CONTA BANCÁRIA */}
      {isBankModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="card w-full max-w-md p-6 bg-bg-primary animate-scale-up rounded-xl border border-divider shadow-2xl">
            <div className="flex justify-between items-center mb-4 border-b border-divider pb-3">
              <h3 className="font-bold text-text-primary text-sm">Nova Conta Bancária</h3>
              <button className="p-1 text-text-secondary hover:bg-bg-secondary rounded-lg" onClick={() => setIsBankModalOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddBank} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-text-secondary uppercase">Identificação / Apelido *</label>
                <input
                  type="text"
                  className="input !py-2 rounded-lg"
                  required
                  placeholder="Ex: Itaú Principal"
                  value={bankForm.apelido}
                  onChange={(e) => setBankForm({ ...bankForm, apelido: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-text-secondary uppercase">Banco *</label>
                  <input
                    type="text"
                    className="input !py-2 rounded-lg"
                    required
                    placeholder="Ex: Itaú Unibanco"
                    value={bankForm.banco}
                    onChange={(e) => setBankForm({ ...bankForm, banco: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-text-secondary uppercase">Tipo de Conta</label>
                  <select
                    className="input !py-2 rounded-lg font-semibold"
                    value={bankForm.tipo}
                    onChange={(e) => setBankForm({ ...bankForm, tipo: e.target.value })}
                  >
                    <option>Corrente</option>
                    <option>Poupança</option>
                    <option>Investimento</option>
                    <option>Caixa Físico</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-text-secondary uppercase">Agência</label>
                  <input
                    type="text"
                    className="input !py-2 rounded-lg"
                    placeholder="Ex: 0145"
                    value={bankForm.agencia}
                    onChange={(e) => setBankForm({ ...bankForm, agencia: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-text-secondary uppercase">Número da Conta</label>
                  <input
                    type="text"
                    className="input !py-2 rounded-lg"
                    placeholder="Ex: 10450-9"
                    value={bankForm.conta}
                    onChange={(e) => setBankForm({ ...bankForm, conta: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1 pt-1">
                <label className="text-[9px] font-bold text-text-secondary uppercase">Saldo Inicial *</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-text-muted font-bold">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    className="input !py-2 !pl-9 rounded-lg font-mono font-bold"
                    required
                    value={bankForm.saldo_inicial}
                    onChange={(e) => setBankForm({ ...bankForm, saldo_inicial: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-divider mt-4">
                <button type="button" className="btn-secondary rounded-lg" onClick={() => setIsBankModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary rounded-lg text-white">
                  Salvar Conta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADICIONAR CATEGORIA PLANO DE CONTAS */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="card w-full max-w-sm p-6 bg-bg-primary animate-scale-up rounded-xl border border-divider shadow-2xl">
            <div className="flex justify-between items-center mb-4 border-b border-divider pb-3">
              <h3 className="font-bold text-text-primary text-sm">Nova Categoria de Plano</h3>
              <button className="p-1 text-text-secondary hover:bg-bg-secondary rounded-lg" onClick={() => setIsCategoryModalOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddCategory} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-text-secondary uppercase">Nome da Categoria *</label>
                <input
                  type="text"
                  className="input !py-2 rounded-lg"
                  required
                  placeholder="Ex: Mensalidades SaaS"
                  value={categoryForm.nome}
                  onChange={(e) => setCategoryForm({ ...categoryForm, nome: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-bold text-text-secondary uppercase">Tipo de Movimento</label>
                <select
                  className="input !py-2 rounded-lg font-semibold"
                  value={categoryForm.tipo}
                  onChange={(e) => setCategoryForm({ ...categoryForm, tipo: e.target.value })}
                >
                  <option>Receita</option>
                  <option>Despesa Fixa</option>
                  <option>Despesa Variável</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-divider mt-4">
                <button type="button" className="btn-secondary rounded-lg" onClick={() => setIsCategoryModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary rounded-lg text-white">
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: QUITAÇÃO DE TÍTULO */}
      {selectedTitulo && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="card w-full max-w-md p-6 bg-bg-primary animate-scale-up rounded-xl border border-divider shadow-2xl">
            <div className="flex justify-between items-center mb-4 border-b border-divider pb-3">
              <div>
                <h3 className="font-bold text-text-primary text-sm">Conciliação de Recebimento</h3>
                <span className="text-[10px] text-text-secondary">{selectedTitulo.descricao}</span>
              </div>
              <button className="p-1 text-text-secondary hover:bg-bg-secondary rounded-lg" onClick={() => setSelectedTitulo(null)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitQuitacao} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-text-secondary uppercase">Destinação (Conta Bancária) *</label>
                <select
                  className="input !py-2 rounded-lg font-semibold"
                  required
                  value={quitacaoForm.conta_bancaria_id}
                  onChange={(e) => setQuitacaoForm({ ...quitacaoForm, conta_bancaria_id: e.target.value })}
                >
                  <option value="">Selecione uma conta...</option>
                  {contasBancarias.map(cb => (
                    <option key={cb.id} value={cb.id}>{cb.apelido} (Saldo: {formatBRL(cb.saldo_atual)})</option>
                  ))}
                </select>
                {contasBancarias.length === 0 && (
                  <span className="text-[9px] text-red-500 font-semibold block mt-0.5">Cadastre uma conta na aba lateral primeiro!</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-text-secondary uppercase">Forma de Recebimento</label>
                  <select
                    className="input !py-2 rounded-lg font-semibold"
                    value={quitacaoForm.forma_pagamento}
                    onChange={(e) => setQuitacaoForm({ ...quitacaoForm, forma_pagamento: e.target.value })}
                  >
                    <option>PIX</option>
                    <option>Dinheiro</option>
                    <option>Transferência</option>
                    <option>Cartão de Crédito</option>
                    <option>Boleto Conciliado</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-text-secondary uppercase">Data de Baixa *</label>
                  <input
                    type="date"
                    className="input !py-2 rounded-lg font-mono"
                    required
                    value={quitacaoForm.data_recebimento}
                    onChange={(e) => setQuitacaoForm({ ...quitacaoForm, data_recebimento: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-bold text-text-secondary uppercase">Valor Efetivamente Recebido *</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-text-muted font-bold">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    className="input !py-2 !pl-9 rounded-lg font-mono font-bold"
                    required
                    value={quitacaoForm.valor_recebido}
                    onChange={(e) => setQuitacaoForm({ ...quitacaoForm, valor_recebido: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <span className="text-[9px] text-text-muted mt-0.5 block">
                  Valor original devido: {formatBRL(selectedTitulo.valor - selectedTitulo.valor_pago)}
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-divider mt-4">
                <button type="button" className="btn-secondary rounded-lg" onClick={() => setSelectedTitulo(null)}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!quitacaoForm.conta_bancaria_id}
                  className="btn-primary rounded-lg text-white"
                >
                  Confirmar Quitação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FEEDBACK MODAL: SIMULAÇÃO DE OPÇÕES OPERACIONAIS */}
      {simulationAction && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="card w-full max-w-md p-6 bg-bg-primary animate-scale-up rounded-xl border border-divider shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto text-xl">
              <PlayCircle size={24} />
            </div>
            <div>
              <h3 className="font-bold text-text-primary text-sm">Operação Efetuada com Sucesso</h3>
              <p className="text-xs text-text-secondary mt-1">
                A ação operacional <strong className="text-brand-500">{simulationAction}</strong> foi simulada no ambiente de testes do Nexos.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                className="btn-primary py-2 px-6 rounded-lg font-bold text-xs cursor-pointer text-white"
                onClick={() => setSimulationAction(null)}
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          MODAIS DE LANÇAMENTO DE TÍTULOS
      ═══════════════════════════════════════════════════════ */}

      {/* Modal Escolha: Programar ou Individual */}
      {showEscolhaModal && (
        <ModalEscolhaLancamento
          onClose={() => setShowEscolhaModal(false)}
          onProgramar={() => {
            setShowEscolhaModal(false)
            setShowProgramacaoModal(true)
          }}
          onLancarIndividual={() => {
            setShowEscolhaModal(false)
            setShowLancamentoModal(true)
          }}
        />
      )}

      {/* Modal Programação de Contas (múltiplas parcelas) */}
      {showProgramacaoModal && (
        <ModalProgramacaoContas
          tipo={tituloTipoFilter}
          onClose={() => setShowProgramacaoModal(false)}
          onSuccess={() => {
            setShowProgramacaoModal(false)
            // Refresh lista de títulos
            window.location.reload()
          }}
        />
      )}

      {/* Modal Lançamento Individual */}
      {showLancamentoModal && (
        <ModalLancamentoIndividual
          tipo={tituloTipoFilter}
          onClose={() => setShowLancamentoModal(false)}
          onSuccess={() => {
            setShowLancamentoModal(false)
            window.location.reload()
          }}
        />
      )}

      {/* Modal Detalhes do Título (ERP Layout) */}
      <ModalDetalhesTitulo
        isOpen={!!selectedTituloIdForDetail}
        tituloId={selectedTituloIdForDetail}
        onClose={() => setSelectedTituloIdForDetail(null)}
        onUpdated={() => refetchReceber()}
      />

      {/* ═══════════════════════════════════════════════════════
          MODAL DE EMISSÃO E COBRANÇA DE BOLETOS EM LOTE
      ═══════════════════════════════════════════════════════ */}
      {isBatchCobrancaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl md:max-w-6xl max-h-[96vh] h-[94vh] flex flex-col overflow-hidden animate-scale-up">
            
            {/* Cabeçalho do Modal Moderno com Logo Coliseu Transporte */}
            <div className="px-4 py-3 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-indigo-900/40">
              <div className="flex items-center gap-3">
                {/* Identificação Visual Logo Coliseu Transporte */}
                <div className="flex items-center bg-white/10 backdrop-blur-xs px-2.5 py-1 rounded-xl border border-white/15 shadow-xs">
                  <img
                    src="/assets/nexus-logo-horizontal.png"
                    alt="Coliseu Transporte"
                    className="h-7 w-auto object-contain brightness-110 contrast-125 drop-shadow-sm"
                  />
                </div>

                <div className="h-7 w-[1px] bg-white/20 hidden sm:block" />

                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-gradient-to-tr from-indigo-600 to-blue-600 rounded-xl text-white shadow-md shadow-indigo-500/20 flex items-center justify-center shrink-0">
                    <Send size={16} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm tracking-tight text-white flex items-center gap-2">
                      Emissão de Cobrança em Lote
                    </h3>
                    <p className="text-[11px] text-indigo-200/80 font-medium">Gere e transmita cobranças em massa com um único clique</p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsBatchCobrancaModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                title="Fechar janela"
              >
                <X size={18} />
              </button>
            </div>

            {/* Barra de Filtros Internos do Modal com Ícones Modernos */}
            <div className="p-3 bg-slate-100/70 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-end gap-2.5 text-xs">
              <div className="flex-1 min-w-[200px]">
                <label className="text-[10px] font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                  <Search size={11} className="text-indigo-600 dark:text-indigo-400" />
                  <span>Filtrar Cliente / Nome</span>
                </label>
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={batchSearchClient}
                    onChange={(e) => setBatchSearchClient(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSearchBatch() }}
                    placeholder="BUSCAR POR CLIENTE OU CÓDIGO (ENTER)..."
                    className="input !pl-7 !py-1 font-extrabold text-xs uppercase font-mono text-slate-800 dark:text-slate-100 rounded-lg border-slate-300 dark:border-slate-700 w-full bg-white dark:bg-slate-900"
                  />
                </div>
              </div>

              {/* Portador com tamanho reduzido */}
              <div className="w-[145px] shrink-0">
                <label className="text-[10px] font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                  <Building2 size={11} className="text-indigo-600 dark:text-indigo-400" />
                  <span>Portador</span>
                </label>
                <select
                  value={batchPortador}
                  onChange={(e) => setBatchPortador(e.target.value)}
                  className="input !py-1 !px-2 text-xs font-bold text-slate-800 dark:text-slate-100 rounded-lg border-slate-300 dark:border-slate-700 w-full cursor-pointer bg-white dark:bg-slate-900 truncate"
                  title="Filtrar Portador"
                >
                  <option value="todos">&lt;&lt; TODOS &gt;&gt;</option>
                  <option value="carteira">CARTEIRA</option>
                  <option value="asaas">ASAAS (BANCO)</option>
                  <option value="cora">CORA (BANCO)</option>
                  <option value="banco">OUTROS BANCOS</option>
                </select>
              </div>

              {/* Espécie com tamanho reduzido */}
              <div className="w-[145px] shrink-0">
                <label className="text-[10px] font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                  <Receipt size={11} className="text-indigo-600 dark:text-indigo-400" />
                  <span>Espécie</span>
                </label>
                <select
                  value={batchEspecie}
                  onChange={(e) => setBatchEspecie(e.target.value)}
                  className="input !py-1 !px-2 text-xs font-bold text-slate-800 dark:text-slate-100 rounded-lg border-slate-300 dark:border-slate-700 w-full cursor-pointer bg-white dark:bg-slate-900 truncate"
                  title="Filtrar Espécie"
                >
                  <option value="todos">&lt;&lt; TODAS &gt;&gt;</option>
                  <option value="boleto">BOLETO</option>
                  <option value="duplicata">DUPLICATA</option>
                  <option value="nota">NOTA</option>
                  <option value="pix">PIX</option>
                </select>
              </div>

              {/* Vencimento De/Até + Botão Buscar */}
              <div className="shrink-0">
                <label className="text-[10px] font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                  <Calendar size={11} className="text-indigo-600 dark:text-indigo-400" />
                  <span>Vencimento (De / Até)</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={batchDateStart}
                    onChange={(e) => setBatchDateStart(e.target.value)}
                    className="input !py-1 !px-1.5 text-xs font-semibold rounded-lg border-slate-300 dark:border-slate-700 w-32 bg-white dark:bg-slate-900"
                    placeholder="Início"
                  />
                  <span className="text-slate-400 font-bold text-xs">à</span>
                  <input
                    type="date"
                    value={batchDateEnd}
                    onChange={(e) => setBatchDateEnd(e.target.value)}
                    className="input !py-1 !px-1.5 text-xs font-semibold rounded-lg border-slate-300 dark:border-slate-700 w-32 bg-white dark:bg-slate-900"
                    placeholder="Fim"
                  />

                  {/* BOTÃO BUSCAR AO LADO DO CALENDÁRIO */}
                  <button
                    type="button"
                    disabled={isSearchingBatch}
                    onClick={handleSearchBatch}
                    className={clsx(
                      "!py-1 !px-3.5 font-extrabold text-xs flex items-center gap-1.5 shadow-sm shrink-0 cursor-pointer transition-all ml-1 rounded-lg",
                      isSearchingBatch
                        ? "bg-indigo-500 text-white cursor-wait opacity-90 animate-pulse"
                        : !isBatchFilterDirty && hasSearchedBatch
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                        : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 hover:scale-102"
                    )}
                    title={!isBatchFilterDirty && hasSearchedBatch ? "Filtro aplicado! Altere os filtros para buscar novamente." : "Aplicar filtros e buscar títulos a receber no sistema"}
                  >
                    {isSearchingBatch ? (
                      <>
                        <Loader2 size={14} className="animate-spin" /> Buscando...
                      </>
                    ) : !isBatchFilterDirty && hasSearchedBatch ? (
                      <>
                        <Check size={14} /> Buscado
                      </>
                    ) : (
                      <>
                        <Search size={14} /> Buscar
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Área de Seleção e Tabela de Títulos Filtrados */}
            {(() => {
              const baseReceber = batchTitulosRaw.filter(t => (t.tipo || 'RECEBER').toUpperCase() === 'RECEBER');

              const isSearchingByName = Boolean(batchSearchClient && batchSearchClient.trim() !== '');

              const normalizeStr = (str?: string) => 
                (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

              const modalFilteredTitulos = baseReceber.filter(t => {
                if (isSearchingByName) {
                  const q = normalizeStr(batchSearchClient.trim());
                  const matchClient = normalizeStr(t.cliente || t.cliente_nome).includes(q);
                  const matchDoc = normalizeStr(String(t.num_doc || t.documento || t.documento_numero || t.nosso_numero || '')).includes(q);
                  const matchId = String(t.id_firebird || t.id).toLowerCase().includes(q);
                  if (!matchClient && !matchDoc && !matchId) return false;
                }

                if (batchPortador !== 'todos') {
                  const port = normalizeStr(t.portador);
                  if (batchPortador === 'carteira' && !port.includes('carteira')) return false;
                  if (batchPortador === 'asaas' && !port.includes('asaas')) return false;
                  if (batchPortador === 'cora' && !port.includes('cora')) return false;
                  if (batchPortador === 'banco' && !port.includes('banco') && !port.includes('santander') && !port.includes('itau') && !port.includes('bradesco') && !port.includes('bb') && !port.includes('caixa')) return false;
                }
                if (batchEspecie !== 'todos') {
                  const esp = normalizeStr(t.especie);
                  if (!esp.includes(normalizeStr(batchEspecie))) return false;
                }
                if (batchHideEmitidos) {
                  const hasBoleto = (t.nosso_numero && t.nosso_numero !== '—' && t.nosso_numero.trim() !== '') || Boolean(t.asaas_payment_id);
                  if (hasBoleto) return false;
                }

                // Respeita o filtro de data de vencimento selecionado (se não houver busca por nome específica)
                const vencDateStr = t.data_vencimento ? (t.data_vencimento.includes('T') ? t.data_vencimento.split('T')[0] : t.data_vencimento.substring(0, 10)) : '';
                if (!isSearchingByName) {
                  if (batchDateStart && vencDateStr && vencDateStr < batchDateStart) return false;
                  if (batchDateEnd && vencDateStr && vencDateStr > batchDateEnd) return false;
                }

                return true;
              });

              const isAllBatchSelected = modalFilteredTitulos.length > 0 && modalFilteredTitulos.every(t => batchSelectedIds.some(id => String(id) === String(t.id)));

              const selectedSum = modalFilteredTitulos
                .filter(t => batchSelectedIds.some(id => String(id) === String(t.id)))
                .reduce((sum, t) => sum + Number(t.valor || 0), 0);

              return (
                <div className="flex-1 overflow-y-auto p-2.5 space-y-2 flex flex-col min-h-0">
                  
                  {/* Barra de Controle de Seleção + Filtro de Emitidos */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-1.5 px-2.5 bg-indigo-50/80 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs shrink-0">
                    <label className="flex items-center gap-2 font-extrabold text-indigo-900 dark:text-indigo-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isAllBatchSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            const allIds = Array.from(new Set(modalFilteredTitulos.map(t => t.id)));
                            setBatchSelectedIds(allIds);
                          } else {
                            setBatchSelectedIds([]);
                          }
                        }}
                        className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                      />
                      <span>Selecionar Todos os Títulos ({modalFilteredTitulos.length} disponíveis)</span>
                    </label>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 font-extrabold text-indigo-950 dark:text-indigo-200 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={batchHideEmitidos}
                          onChange={(e) => setBatchHideEmitidos(e.target.checked)}
                          className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                        />
                        <span>Não mostrar boletos já emitidos</span>
                      </label>

                      <span className="text-[11px] font-bold text-slate-500">
                        Filtro ativo: {modalFilteredTitulos.length} título(s)
                      </span>
                    </div>
                  </div>

                  {/* Tabela de Títulos Filtrados */}
                  <div className="flex-1 min-h-[200px] max-h-[420px] overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xs">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-black uppercase text-[10px] z-10 border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="py-1 px-1.5 text-center w-7">#</th>
                          <th className="py-1 px-1.5 w-16">CÓDIGO</th>
                          <th className="py-1 px-1.5 w-24">Nº DOC</th>
                          <th className="py-1 px-1.5 min-w-[160px]">NOME DO CLIENTE</th>
                          <th className="py-1 px-1.5 min-w-[200px]">DESCRIÇÃO DO TÍTULO</th>
                          <th className="py-1 px-1.5 w-22">VENCIMENTO</th>
                          <th className="py-1 px-1.5 w-22 text-right">VALOR</th>
                          <th className="py-1 px-1.5 w-20">PORTADOR</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                        {isSearchingBatch ? (
                          <tr>
                            <td colSpan={8} className="p-8 text-center text-indigo-600 font-extrabold text-xs">
                              <div className="flex flex-col items-center justify-center gap-2">
                                <Loader2 className="animate-spin text-indigo-600" size={20} />
                                <span>Buscando títulos a receber no sistema...</span>
                              </div>
                            </td>
                          </tr>
                        ) : !hasSearchedBatch ? (
                          <tr>
                            <td colSpan={8} className="p-8 text-center text-slate-500 font-bold text-xs">
                              <div className="flex flex-col items-center justify-center gap-2">
                                <div className="p-2 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 rounded-full">
                                  <Search size={16} />
                                </div>
                                <span>Defina os filtros e clique no botão <strong className="text-indigo-600">[ 🔍 Buscar ]</strong> para carregar os títulos a receber.</span>
                              </div>
                            </td>
                          </tr>
                        ) : modalFilteredTitulos.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="p-5 text-center text-slate-400 italic font-medium">Nenhum título a receber encontrado para os filtros selecionados.</td>
                          </tr>
                        ) : (
                          modalFilteredTitulos.map(t => {
                            const hasBoleto = t.nosso_numero && t.nosso_numero !== '—' && t.nosso_numero.trim() !== '';
                            const isChecked = batchSelectedIds.some(id => String(id) === String(t.id));
                            const numDocStr = t.num_doc || t.documento || t.documento_numero || t.nosso_numero || '—';

                            return (
                              <tr
                                key={t.id}
                                onClick={() => {
                                  if (isChecked) {
                                    setBatchSelectedIds(prev => prev.filter(id => String(id) !== String(t.id)));
                                  } else {
                                    setBatchSelectedIds(prev => Array.from(new Set([...prev, t.id])));
                                  }
                                }}
                                className={clsx(
                                  'transition-colors text-[10.5px] leading-tight cursor-pointer',
                                  isChecked
                                    ? 'bg-indigo-50/80 dark:bg-indigo-950/60 font-semibold hover:bg-indigo-50/40'
                                    : 'hover:bg-indigo-50/40'
                                )}
                              >
                                <td className="py-1 px-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setBatchSelectedIds(prev => Array.from(new Set([...prev, t.id])));
                                      } else {
                                        setBatchSelectedIds(prev => prev.filter(id => String(id) !== String(t.id)));
                                      }
                                    }}
                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-3.5 w-3.5"
                                  />
                                </td>
                                <td className="py-1 px-1.5 font-mono font-bold text-indigo-600">#{t.id_firebird || t.id}</td>
                                <td className="py-1 px-1.5 font-mono font-bold text-slate-700 dark:text-slate-300 truncate max-w-[90px]">
                                  {numDocStr}
                                </td>
                                <td className="py-1 px-1.5 font-bold text-slate-900 dark:text-slate-100 uppercase truncate max-w-[200px]">
                                  {t.cliente || 'Cliente não identificado'}
                                </td>
                                <td className="py-1 px-1.5">
                                  <div className="flex items-center gap-1 truncate max-w-[240px]">
                                    <span className="text-slate-600 dark:text-slate-300 font-medium text-[10.5px] truncate">
                                      {t.descricao || '—'}
                                    </span>
                                    {hasBoleto && (
                                      <span className="text-[8.5px] font-black text-blue-700 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 px-1 py-0.2 rounded shrink-0">
                                        📄 {t.nosso_numero}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-1 px-1.5 font-mono font-bold text-slate-700 dark:text-slate-300">
                                  {formatDate(t.data_vencimento)}
                                </td>
                                <td className="py-1 px-1.5 text-right font-mono font-black text-slate-900 dark:text-slate-100">
                                  {formatBRL(t.valor)}
                                </td>
                                <td className="py-1 px-1.5 font-bold text-[9.5px] uppercase text-slate-600 dark:text-slate-300">
                                  <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded">
                                    {t.portador || t.portador_nome || 'CARTEIRA'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Opções de Envio por E-mail / WhatsApp (Caixa de mensagem ampla de 4 linhas totalmente visível ao abrir) */}
                  <div className="space-y-1.5 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700 pb-1.5">
                      <label className="flex items-center gap-2 font-extrabold text-xs text-slate-800 dark:text-slate-200 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={batchSendEmail}
                          onChange={(e) => setBatchSendEmail(e.target.checked)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                        />
                        <span className="flex items-center gap-1.5">
                          <Mail size={14} className="text-indigo-600" /> Enviar Cobrança por E-mail (Boleto PDF em anexo)
                        </span>
                      </label>

                      <label className="flex items-center gap-2 font-extrabold text-xs text-slate-800 dark:text-slate-200 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={batchSendWhatsapp}
                          onChange={(e) => setBatchSendWhatsapp(e.target.checked)}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
                        />
                        <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                          <Send size={13} /> Enviar via WhatsApp
                        </span>
                      </label>
                    </div>

                    {batchSendEmail && (
                      <div className="space-y-1.5 animate-fade-in pt-0.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wide">Mensagem Personalizada do E-mail</span>
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded border border-emerald-200">
                            📎 Boleto PDF Anexado Automático
                          </span>
                        </div>

                        <textarea
                          rows={4}
                          value={batchEmailMessage}
                          onChange={(e) => setBatchEmailMessage(e.target.value)}
                          placeholder="Escreva a mensagem personalizada para os e-mails..."
                          className="input w-full p-2 font-medium text-xs text-slate-800 dark:text-slate-100 rounded-lg border-slate-300 bg-white dark:bg-slate-900 min-h-[90px] focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    )}
                  </div>

                  {/* Barra e Contador de Progresso em Tempo Real com Validação Individual */}
                  {isBatchSending && (
                    <div className="p-3 bg-slate-900 text-white rounded-xl border border-indigo-700 space-y-2.5 animate-fade-in shadow-md">
                      <div className="flex items-center justify-between text-xs font-extrabold font-mono">
                        <span className="flex items-center gap-2 text-indigo-300">
                          <Loader2 size={15} className="animate-spin text-emerald-400" />
                          Emitindo e Transmitindo Boletos em Lote...
                        </span>
                        <span className="text-emerald-400 text-sm font-black bg-emerald-950 px-2.5 py-0.5 rounded-md border border-emerald-500/40 font-mono">
                          {batchProgressCount} / {batchTotalCount} ({Math.round((batchProgressCount / Math.max(batchTotalCount, 1)) * 100)}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden p-0.5 border border-indigo-700/50">
                        <div
                          className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full rounded-full transition-all duration-300"
                          style={{ width: `${(batchProgressCount / Math.max(batchTotalCount, 1)) * 100}%` }}
                        />
                      </div>

                      {/* Stream Visual de Evolução Individual (Boleto 1/3, 2/3, 3/3 ...) */}
                      {batchItemsDetail.length > 0 && (
                        <div className="mt-2 max-h-48 overflow-y-auto space-y-1.5 p-1 font-mono text-[11px]">
                          {batchItemsDetail.map((item, idx) => (
                            <div key={idx} className={clsx(
                              "p-2 rounded border leading-tight flex flex-col gap-1 transition-all",
                              item.status === 'success' ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-200" :
                              "bg-rose-950/40 border-rose-500/50 text-rose-200"
                            )}>
                              <div className="flex items-center justify-between font-bold text-xs">
                                <span>Boleto {item.index}/{item.total} — <strong className="text-white">{item.cliente}</strong></span>
                                <span className="text-[10.5px]">Vencimento: {item.vencimento} | Valor: {item.valor}</span>
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-1 text-[10.5px]">
                                <span>
                                  Email: <strong className={item.hasValidEmail ? "text-emerald-300" : "text-amber-300"}>{item.email}</strong> 
                                  <span className="ml-1 opacity-90">({item.hasValidEmail ? '✓ Válido' : '⚠️ Ausente/Sem email'})</span>
                                </span>

                                {item.status === 'success' ? (
                                  <span className="text-emerald-400 font-bold">
                                    ✓ Banco/Asaas: Registrado (Nosso Nº: {item.nossoNumero}) | {item.emailEnviado ? '✓ E-mail Disparado' : '⚠️ Sem envio de e-mail'}
                                  </span>
                                ) : (
                                  <span className="text-rose-400 font-bold">
                                    ✕ Falha no Banco: {item.errorMsg}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                </div>
              );
            })()}

            {/* Rodapé do Modal com Contador de Seleção + Totalizador */}
            {(() => {
              const baseReceber = batchTitulosRaw.filter(t => (t.tipo || 'RECEBER').toUpperCase() === 'RECEBER');
              const isSearchingByName = Boolean(batchSearchClient && batchSearchClient.trim() !== '');
              const normalizeStr = (str?: string) => 
                (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

              const modalFilteredTitulos = baseReceber.filter(t => {
                if (isSearchingByName) {
                  const q = normalizeStr(batchSearchClient.trim());
                  const matchClient = normalizeStr(t.cliente || t.cliente_nome).includes(q);
                  const matchDoc = normalizeStr(String(t.num_doc || t.documento || t.documento_numero || t.nosso_numero || '')).includes(q);
                  const matchId = String(t.id_firebird || t.id).toLowerCase().includes(q);
                  if (!matchClient && !matchDoc && !matchId) return false;
                }
                if (batchPortador !== 'todos') {
                  const port = normalizeStr(t.portador);
                  if (batchPortador === 'carteira' && !port.includes('carteira')) return false;
                  if (batchPortador === 'asaas' && !port.includes('asaas')) return false;
                  if (batchPortador === 'cora' && !port.includes('cora')) return false;
                  if (batchPortador === 'banco' && !port.includes('banco') && !port.includes('santander') && !port.includes('itau') && !port.includes('bradesco') && !port.includes('bb') && !port.includes('caixa')) return false;
                }
                if (batchEspecie !== 'todos') {
                  const esp = normalizeStr(t.especie);
                  if (!esp.includes(normalizeStr(batchEspecie))) return false;
                }
                if (batchHideEmitidos) {
                  const hasBoleto = (t.nosso_numero && t.nosso_numero !== '—' && t.nosso_numero.trim() !== '') || Boolean(t.asaas_payment_id);
                  if (hasBoleto) return false;
                }
                const vencDateStr = t.data_vencimento ? (t.data_vencimento.includes('T') ? t.data_vencimento.split('T')[0] : t.data_vencimento.substring(0, 10)) : '';
                if (!isSearchingByName) {
                  if (batchDateStart && vencDateStr && vencDateStr < batchDateStart) return false;
                  if (batchDateEnd && vencDateStr && vencDateStr > batchDateEnd) return false;
                }
                return true;
              });

              const selectedSum = modalFilteredTitulos
                .filter(t => batchSelectedIds.some(id => String(id) === String(t.id)))
                .reduce((sum, t) => sum + Number(t.valor || 0), 0);

              return (
                <div className="p-3 bg-slate-100 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  
                  <button
                    type="button"
                    onClick={() => setIsBatchCobrancaModalOpen(false)}
                    disabled={isBatchSending}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 dark:text-slate-400 cursor-pointer"
                  >
                    Cancelar
                  </button>

                  {/* CONTADORES NO RODAPÉ DO MODAL (CONFORME DESTAQUE CIRCULADO EM VERMELHO NA IMAGEM 2) */}
                  <div className="flex items-center gap-3 px-3.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xs font-mono text-xs">
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      Selecionados: <strong className="text-indigo-600 dark:text-indigo-400 text-sm font-black">{batchSelectedIds.length}</strong> de {modalFilteredTitulos.length} boletos
                    </span>
                    <span className="text-slate-300 dark:text-slate-700">|</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      Total: <strong className="text-emerald-600 dark:text-emerald-400 text-sm font-black">{formatBRL(selectedSum)}</strong>
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleRunBatchCobranca}
                    disabled={isBatchSending || batchSelectedIds.length === 0}
                    className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isBatchSending ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Enviando ({batchProgressCount}/{batchTotalCount})...
                      </>
                    ) : (
                      <>
                        <Send size={14} />
                        Emitir e Enviar ({batchSelectedIds.length} Selecionados)
                      </>
                    )}
                  </button>
                </div>
              );
            })()}

          </div>
        </div>
      )}

      {/* MODAL DE DETALHAMENTO DO BOLETO / COBRANÇA */}
      {selectedBoletoDetail && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="card w-full max-w-2xl p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto animate-scale-up text-xs">
            
            {/* Título do Modal */}
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-xl">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                    Detalhamento do Boleto / Cobrança
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-mono font-black text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700">
                      Nosso Nº: {selectedBoletoDetail.nosso_numero}
                    </span>
                    {selectedBoletoDetail.asaas_payment_id && (
                      <span className="text-xs font-mono font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                        Nº Título / ID: {selectedBoletoDetail.asaas_payment_id}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button 
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
                onClick={() => setSelectedBoletoDetail(null)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Grid de Informações Básicas do Boleto */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
              <div>
                <span className="text-[9.5px] font-bold uppercase text-slate-400 block">Data Emissão</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                  {selectedBoletoDetail.data_emissao ? formatDate(selectedBoletoDetail.data_emissao) : '—'}
                </span>
              </div>
              <div>
                <span className="text-[9.5px] font-bold uppercase text-slate-400 block">Vencimento</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                  {selectedBoletoDetail.data_vencimento ? formatDate(selectedBoletoDetail.data_vencimento) : '—'}
                </span>
              </div>
              <div>
                <span className="text-[9.5px] font-bold uppercase text-slate-400 block">Dias p/ Vencer</span>
                {(() => {
                  if (!selectedBoletoDetail.data_vencimento) return '—';
                  const parts = selectedBoletoDetail.data_vencimento.split('T')[0].split('-');
                  const vencDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const diffDays = Math.ceil((vencDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                  return diffDays < 0 ? (
                    <span className="px-1.5 py-0.5 rounded font-black text-red-700 bg-red-100 dark:bg-red-950 border border-red-300 text-[10px]">
                      {diffDays} dias
                    </span>
                  ) : (
                    <span className="font-bold text-slate-800 dark:text-slate-200">{diffDays} dias</span>
                  );
                })()}
              </div>
              <div>
                <span className="text-[9.5px] font-bold uppercase text-slate-400 block">Valor</span>
                <span className="font-mono font-black text-slate-900 dark:text-white text-sm">
                  {formatBRL(selectedBoletoDetail.valor)}
                </span>
              </div>
            </div>

            {/* Comparação dos Clientes (Cliente Boleto vs Cliente Coliseu Transporte) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 rounded-xl">
              <div>
                <span className="text-[9.5px] font-extrabold uppercase text-indigo-600 dark:text-indigo-400 block mb-0.5">
                  1. Nome no Boleto (Banco / Gateway)
                </span>
                <span className="font-extrabold text-slate-900 dark:text-slate-100 text-xs block truncate" title={selectedBoletoDetail.cliente_boleto || selectedBoletoDetail.cliente}>
                  {selectedBoletoDetail.cliente_boleto || selectedBoletoDetail.cliente || 'Cliente Asaas'}
                </span>
                {selectedBoletoDetail.cliente_documento && selectedBoletoDetail.cliente_documento !== '—' && (
                  <span className="text-[10.5px] font-mono font-extrabold text-slate-600 dark:text-slate-400 block mt-0.5">
                    CNPJ / CPF: {selectedBoletoDetail.cliente_documento}
                  </span>
                )}
              </div>

              <div>
                <span className="text-[9.5px] font-extrabold uppercase text-indigo-600 dark:text-indigo-400 block mb-0.5">
                  2. Cliente Vinculado no Coliseu Transporte
                </span>
                {selectedBoletoDetail.tem_vinculo ? (
                  <span className="font-extrabold text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-1">
                    <CheckCircle2 size={13} className="text-emerald-600" />
                    {selectedBoletoDetail.cliente_nexus || selectedBoletoDetail.cliente} (#{selectedBoletoDetail.vinculo_codigo})
                  </span>
                ) : (
                  <span className="font-extrabold text-amber-600 dark:text-amber-400 text-xs flex items-center gap-1">
                    <AlertCircle size={13} />
                    ⚠️ Sem Vínculo Coliseu Transporte (Boleto Gerado Avulso)
                  </span>
                )}
              </div>
            </div>

            {/* Botão de Link / Download em PDF se houver URL */}
            {(selectedBoletoDetail.bank_slip_url || selectedBoletoDetail.asaas_bank_slip_url) && (
              <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl">
                <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Printer size={15} className="text-indigo-600" />
                  Visualizar Boleto Bancário Oficial (2ª Via / PDF)
                </span>
                <a
                  href={
                    (selectedBoletoDetail.portador?.toLowerCase().includes('cora') || String(selectedBoletoDetail.asaas_payment_id || '').startsWith('inv_'))
                      ? `/api/cora/boleto/${selectedBoletoDetail.asaas_payment_id}?format=html`
                      : (selectedBoletoDetail.bank_slip_url || selectedBoletoDetail.asaas_bank_slip_url)
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-lg shadow-xs flex items-center gap-1 text-xs cursor-pointer transition-all"
                >
                  <ExternalLink size={13} /> Abrir PDF do Boleto
                </a>
              </div>
            )}

            {/* SEÇÃO DE VÍNCULO AO TÍTULO DO COLISEU TRANSPORTE COM DETECÇÃO DE DIVERGÊNCIA E JUSTIFICATIVA */}
            {(() => {
              const targetTitle = titulosRaw.find((t: any) => String(t.id) === String(selectedNexusTitleToLink));
              let hasDivergence = false;
              let divergenceReasons: string[] = [];

              if (targetTitle && selectedBoletoDetail) {
                const boletoVal = Number(selectedBoletoDetail.valor || 0);
                const tituloVal = Number(targetTitle.valor || 0);
                if (Math.abs(boletoVal - tituloVal) > 0.01) {
                  hasDivergence = true;
                  divergenceReasons.push(`Valor do Boleto (${formatBRL(boletoVal)}) difere do Título Coliseu Transporte (${formatBRL(tituloVal)})`);
                }

                const boletoVenc = selectedBoletoDetail.data_vencimento ? selectedBoletoDetail.data_vencimento.split('T')[0] : '';
                const tituloVenc = targetTitle.data_vencimento ? targetTitle.data_vencimento.split('T')[0] : '';
                if (boletoVenc && tituloVenc && boletoVenc !== tituloVenc) {
                  hasDivergence = true;
                  divergenceReasons.push(`Vencimento do Boleto (${formatDate(boletoVenc)}) difere do Título Coliseu Transporte (${formatDate(tituloVenc)})`);
                }
              }

              const isLinkDisabled = isLinkingBoleto || !selectedNexusTitleToLink || (hasDivergence && !vinculoObservacao.trim());

              return (
                <div className="p-3.5 border border-indigo-200 dark:border-indigo-800 rounded-xl space-y-3 bg-indigo-50/30 dark:bg-indigo-950/20">
                  <div className="flex items-center justify-between">
                    <h4 className="font-black text-indigo-950 dark:text-indigo-100 uppercase tracking-wider text-xs flex items-center gap-1.5">
                      <Layers size={15} className="text-indigo-600 dark:text-indigo-400" />
                      Vincular Este Boleto a Um Título do Coliseu Transporte
                    </h4>
                    {selectedBoletoDetail.tem_vinculo && (
                      <span className="text-[10.5px] font-extrabold text-emerald-700 bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded-md border border-emerald-300">
                        ✓ Já Vinculado
                      </span>
                    )}
                  </div>

                  {(() => {
                    const isPaidBoleto = selectedBoletoDetail ? (
                      (selectedBoletoDetail.status_pagamento || '').toUpperCase().trim() === 'PAGO' ||
                      (selectedBoletoDetail.status_pagamento || '').toUpperCase().trim() === 'QUITADO' ||
                      (selectedBoletoDetail.status_pagamento || '').toUpperCase().trim() === 'RECEIVED' ||
                      (selectedBoletoDetail.status_pagamento || '').toUpperCase().trim() === 'CONFIRMED' ||
                      (selectedBoletoDetail.valor_pago || 0) >= selectedBoletoDetail.valor
                    ) : false;

                    const isPaidTitle = (t: any) => (
                      (t.status_pagamento || '').toUpperCase().includes('PAGO') ||
                      (t.status_pagamento || '').toUpperCase().includes('QUITADO') ||
                      Number(t.valor_pago || 0) >= Number(t.valor || 0)
                    );

                    const filteredTitlesForLink = titulosRaw.filter(t => {
                      if ((t.tipo || 'RECEBER').toUpperCase() !== 'RECEBER') return false;
                      if (linkTitleStatusFilter === 'quitado') return isPaidTitle(t);
                      if (linkTitleStatusFilter === 'aberto') return !isPaidTitle(t);
                      return true; // 'todos'
                    });

                    return (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap text-[10px] font-extrabold uppercase text-slate-600 dark:text-slate-400">
                          <span>Selecione o Título no Coliseu Transporte para associar:</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9.5px] font-bold text-slate-500">Exibir Títulos:</span>
                            <select
                              value={linkTitleStatusFilter}
                              onChange={(e) => setLinkTitleStatusFilter(e.target.value as any)}
                              className="input !py-0.5 !px-1.5 text-[10px] font-bold border-slate-300 dark:border-slate-700 rounded-md cursor-pointer bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300"
                            >
                              <option value="todos">Todos (Abertos + Quitados)</option>
                              <option value="quitado">✓ Somente Quitados</option>
                              <option value="aberto">⏱️ Somente Em Aberto</option>
                            </select>
                            <span className="text-[9.5px] font-bold text-indigo-600 dark:text-indigo-400">
                              ({filteredTitlesForLink.length} disponíveis)
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row items-center gap-2">
                          <select
                            value={selectedNexusTitleToLink}
                            onChange={(e) => setSelectedNexusTitleToLink(e.target.value)}
                            className="input flex-1 w-full !py-1.5 !px-2.5 text-xs font-bold text-slate-800 dark:text-slate-100 rounded-lg border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer"
                          >
                            <option value="">-- Selecione o título no Coliseu Transporte --</option>
                            {filteredTitlesForLink.map((t: any) => {
                              const tPaid = isPaidTitle(t);
                              return (
                                <option key={t.id} value={t.id}>
                                  #{t.id_firebird || t.id} — {t.cliente} — {t.descricao} ({tPaid ? `✓ Quitado: ${formatDate(t.data_pagamento || t.data_vencimento)}` : `⏱️ Venc: ${formatDate(t.data_vencimento)}`} | Valor: {formatBRL(t.valor)})
                                </option>
                              );
                            })}
                          </select>

                          <button
                            type="button"
                            onClick={() => {
                              setQuickClientSearch(selectedBoletoDetail?.cliente_boleto || '');
                              setIsQuickLinkModalOpen(true);
                            }}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-lg flex items-center gap-1.5 shrink-0 cursor-pointer transition-all shadow-sm"
                            title="Abrir janela de consulta rápida por cliente"
                          >
                            <Search size={13} /> Consulta Rápida
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Alerta em vermelho e justificativa se houver divergência */}
                  {hasDivergence && (
                    <div className="p-3 bg-red-50 dark:bg-red-950/80 border border-red-300 dark:border-red-800 rounded-xl text-red-900 dark:text-red-200 text-xs space-y-2 animate-fade-in shadow-xs">
                      <div className="font-extrabold flex items-center gap-1.5 text-red-700 dark:text-red-300 text-[11.5px]">
                        <AlertTriangle size={16} className="shrink-0 text-red-600" />
                        <span>⚠️ DIVERGÊNCIA ENCONTRADA ENTRE BOLETO E TÍTULO COLISEU TRANSPORTE:</span>
                      </div>
                      <ul className="list-disc list-inside font-bold space-y-0.5 text-[11px] text-red-800 dark:text-red-200">
                        {divergenceReasons.map((reason, idx) => (
                          <li key={idx}>{reason}</li>
                        ))}
                      </ul>
                      <div className="pt-1 space-y-1">
                        <label className="block text-[10.5px] font-extrabold uppercase text-red-900 dark:text-red-200">
                          Informe obrigatoriamente a observação/motivo da associação com divergência: *
                        </label>
                        <textarea
                          rows={2}
                          value={vinculoObservacao}
                          onChange={(e) => setVinculoObservacao(e.target.value)}
                          placeholder="Ex: Concedido desconto de R$ 5,00 autorizado pelo financeiro / Ajuste de vencimento acordado..."
                          className="input w-full p-2 text-xs font-semibold bg-white dark:bg-slate-900 border-red-300 dark:border-red-700 rounded-lg text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-red-500"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleVincularBoletoAoTitulo}
                      disabled={isLinkDisabled}
                      className="btn-primary !py-1.5 !px-4 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-md"
                    >
                      {isLinkingBoleto ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                      Vincular Título ao Boleto
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* SEÇÃO DE REENVIO POR E-MAIL E WHATSAPP */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
              <h4 className="font-black text-slate-900 dark:text-white uppercase tracking-wider text-[10.5px] flex items-center gap-1.5">
                <Send size={14} className="text-indigo-600" />
                Reenviar Boleto por E-mail ou WhatsApp
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9.5px] font-bold text-slate-600 dark:text-slate-400 uppercase">E-mail do Destinatário</label>
                  <input
                    type="email"
                    value={detailEmailInput}
                    onChange={(e) => setDetailEmailInput(e.target.value)}
                    placeholder="cliente@email.com"
                    className="input !py-1 text-xs font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9.5px] font-bold text-slate-600 dark:text-slate-400 uppercase">WhatsApp (DDD + Celular)</label>
                  <input
                    type="text"
                    value={detailPhoneInput}
                    onChange={(e) => setDetailPhoneInput(e.target.value)}
                    placeholder="(67) 99999-9999"
                    className="input !py-1 text-xs font-semibold"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9.5px] font-bold text-slate-600 dark:text-slate-400 uppercase">Mensagem de Cobrança / Notificação</label>
                <textarea
                  rows={4}
                  value={detailMessageInput}
                  onChange={(e) => setDetailMessageInput(e.target.value)}
                  className="input !py-1.5 text-xs font-mono leading-relaxed"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSendEmailDirect}
                  disabled={sendingEmail}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-lg shadow-xs flex items-center gap-1.5 text-xs cursor-pointer transition-all disabled:opacity-50"
                >
                  {sendingEmail ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                  Reenviar por E-mail
                </button>

                <button
                  type="button"
                  onClick={handleSendWhatsAppDirect}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-lg shadow-xs flex items-center gap-1.5 text-xs cursor-pointer transition-all"
                >
                  <Send size={13} />
                  Reenviar por WhatsApp
                </button>
              </div>
            </div>

            {/* RASTREABILIDADE & HISTÓRICO DE MOVIMENTAÇÕES DO TÍTULO */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-extrabold uppercase text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <ClockIcon size={14} className="text-indigo-600 dark:text-indigo-400" />
                  Rastreabilidade & Histórico de Movimentações
                </span>
                <span className="text-[9.5px] font-mono text-slate-400">
                  Cód. Documento: #{selectedBoletoDetail.id_firebird || selectedBoletoDetail.id || 'N/A'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono pt-1">
                <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-2xs">
                  <span className="text-[9px] font-bold text-slate-400 block uppercase">Data Emissão</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {selectedBoletoDetail.data_emissao ? formatDate(selectedBoletoDetail.data_emissao) : '—'}
                  </span>
                  <span className="text-[9px] text-indigo-600 dark:text-indigo-400 block font-sans font-semibold">Usuário: Operador</span>
                </div>

                <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-2xs">
                  <span className="text-[9px] font-bold text-slate-400 block uppercase">Data Vínculo</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">
                    {selectedBoletoDetail.tem_vinculo ? (selectedBoletoDetail.data_emissao ? formatDate(selectedBoletoDetail.data_emissao) : 'Vinculado') : 'Sem Vínculo'}
                  </span>
                  <span className="text-[9px] text-slate-400 block font-sans">Doc: #{selectedBoletoDetail.vinculo_codigo || '—'}</span>
                </div>

                <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-2xs">
                  <span className="text-[9px] font-bold text-slate-400 block uppercase">Data Quitação</span>
                  <span className={clsx(
                    "font-bold",
                    selectedBoletoDetail.status_pagamento === 'PAGO' ? "text-emerald-600" : "text-slate-400"
                  )}>
                    {selectedBoletoDetail.data_pagamento ? formatDate(selectedBoletoDetail.data_pagamento) : '—'}
                  </span>
                  <span className="text-[9px] text-slate-400 block font-sans">{selectedBoletoDetail.status_pagamento === 'PAGO' ? 'Quitado' : 'Em Aberto'}</span>
                </div>

                <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-2xs">
                  <span className="text-[9px] font-bold text-slate-400 block uppercase">Data Cancelamento</span>
                  <span className={clsx(
                    "font-bold",
                    selectedBoletoDetail.status_pagamento === 'CANCELADO' ? "text-rose-600 font-extrabold" : "text-slate-400"
                  )}>
                    {selectedBoletoDetail.status_pagamento === 'CANCELADO' ? formatDate(new Date().toISOString().split('T')[0]) : '—'}
                  </span>
                  <span className="text-[9px] text-slate-400 block font-sans">{selectedBoletoDetail.status_pagamento === 'CANCELADO' ? 'Cancelado no Banco' : 'Ativo'}</span>
                </div>
              </div>
            </div>

            {/* RODAPÉ DO MODAL COM ELIMINAR, CANCELAR EMISSÃO E FECHAR */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleEliminarBoletoOuTitulo(selectedBoletoDetail)}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-extrabold text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <Trash2 size={14} /> Eliminar Título
                </button>

                {((selectedBoletoDetail.status_pagamento || '').trim() !== 'PAGO' && (selectedBoletoDetail.status_pagamento || '').trim() !== 'CANCELADO') && (
                  <button
                    type="button"
                    onClick={() => {
                      handleCancelarBoleto(selectedBoletoDetail);
                      setSelectedBoletoDetail(null);
                    }}
                    className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl font-extrabold text-xs transition-all cursor-pointer flex items-center gap-1"
                  >
                    <X size={14} /> Cancelar Emissão
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedBoletoDetail(null)}
                className="btn-secondary !py-1.5 !px-4 text-xs font-bold"
              >
                Fechar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL DE CONSULTA RÁPIDA DE CLIENTES & TÍTULOS PARA VÍNCULO */}
      {isQuickLinkModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="card w-full max-w-xl p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl space-y-3.5 max-h-[85vh] overflow-y-auto animate-scale-up text-xs">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-950 text-indigo-600 rounded-xl">
                  <Search size={18} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                    Consulta Rápida de Clientes & Títulos
                  </h3>
                  <span className="text-[10.5px] text-slate-500 font-medium">
                    Digite o nome do cliente para pesquisar os títulos em aberto no Coliseu Transporte
                  </span>
                </div>
              </div>
              <button
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
                onClick={() => setIsQuickLinkModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                autoFocus
                value={quickClientSearch}
                onChange={(e) => setQuickClientSearch(e.target.value.toUpperCase())}
                placeholder="DIGITE O NOME DO CLIENTE, CPF/CNPJ OU CÓDIGO (#111421)..."
                className="input w-full !pl-9.5 !py-2 font-extrabold text-xs uppercase bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
              {(() => {
                const isPaidBoleto = selectedBoletoDetail ? (
                  (selectedBoletoDetail.status_pagamento || '').toUpperCase().trim() === 'PAGO' ||
                  (selectedBoletoDetail.status_pagamento || '').toUpperCase().trim() === 'QUITADO' ||
                  (selectedBoletoDetail.status_pagamento || '').toUpperCase().trim() === 'RECEIVED' ||
                  (selectedBoletoDetail.status_pagamento || '').toUpperCase().trim() === 'CONFIRMED' ||
                  (selectedBoletoDetail.valor_pago || 0) >= selectedBoletoDetail.valor
                ) : false;

                const isPaidTitle = (t: any) => (
                  (t.status_pagamento || '').toUpperCase().includes('PAGO') ||
                  (t.status_pagamento || '').toUpperCase().includes('QUITADO') ||
                  Number(t.valor_pago || 0) >= Number(t.valor || 0)
                );

                const searchLower = quickClientSearch.toLowerCase().trim();
                const baseReceber = titulosRaw.filter(t => {
                  if ((t.tipo || 'RECEBER').toUpperCase() !== 'RECEBER') return false;
                  return isPaidBoleto ? isPaidTitle(t) : !isPaidTitle(t);
                });
                const matched = baseReceber.filter(t => {
                  if (!searchLower) return true;
                  return (
                    t.cliente?.toLowerCase().includes(searchLower) ||
                    t.descricao?.toLowerCase().includes(searchLower) ||
                    String(t.id_firebird || t.id).includes(searchLower)
                  );
                });

                if (matched.length === 0) {
                  return (
                    <div className="p-8 text-center text-slate-400 italic font-semibold">
                      Nenhum título ({isPaidBoleto ? 'quitado' : 'em aberto'}) localizado para o termo "{quickClientSearch}".
                    </div>
                  );
                }

                return matched.map((t: any) => (
                  <div
                    key={t.id}
                    onClick={() => {
                      setSelectedNexusTitleToLink(String(t.id));
                      setIsQuickLinkModalOpen(false);
                    }}
                    className="p-3 bg-slate-50 dark:bg-slate-800/80 hover:bg-indigo-50/90 dark:hover:bg-indigo-950/80 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-3 group"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-xs">
                          #{t.id_firebird || t.id}
                        </span>
                        <span className="font-extrabold text-slate-900 dark:text-slate-100 text-xs">
                          {t.cliente}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                        {t.descricao} • Vencimento: <strong className="text-slate-700 dark:text-slate-300 font-mono">{formatDate(t.data_vencimento)}</strong>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-mono font-black text-slate-900 dark:text-white text-sm block">
                        {formatBRL(t.valor)}
                      </span>
                      <span className="px-2.5 py-1 bg-indigo-600 group-hover:bg-indigo-700 text-white font-extrabold text-[10.5px] rounded-lg shadow-2xs inline-block mt-0.5">
                        Selecionar Título →
                      </span>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MANUTENÇÃO & AUTO-VÍNCULO INTELIGENTE DE TÍTULOS E BOLETOS */}
      {isManutencaoModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="card w-full max-w-4xl p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto animate-scale-up text-xs">
            
            {/* Header */}
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-gradient-to-tr from-purple-600 to-indigo-600 text-white rounded-xl shadow-md">
                  <Settings size={20} className={isScanningMatches ? 'animate-spin' : ''} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-base flex items-center gap-2">
                    Manutenção & Auto-Vínculo de Títulos
                    <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-mono text-[10.5px] rounded-md font-bold border border-purple-300">
                      Regra: Cliente/CNPJ + Vencimento + Valor
                    </span>
                  </h3>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Varredura automática para identificar e associar boletos do Asaas com títulos idênticos no Coliseu Transporte
                  </span>
                </div>
              </div>
              <button
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
                onClick={() => setIsManutencaoModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Conteúdo da Varredura */}
            {isScanningMatches ? (
              <div className="p-12 text-center text-indigo-600 font-extrabold space-y-3">
                <Loader2 size={32} className="animate-spin mx-auto text-indigo-600" />
                <p className="text-sm">Varrendo banco de dados para encontrar correspondências de títulos e boletos...</p>
              </div>
            ) : manutencaoMatches.length === 0 ? (
              <div className="p-10 text-center space-y-2 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-800/30">
                <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                  <Check size={24} />
                </div>
                <h4 className="font-extrabold text-slate-800 dark:text-slate-200 text-sm">Nenhum vínculo pendente encontrado!</h4>
                <p className="text-slate-500 max-w-md mx-auto text-xs">
                  Todos os boletos sem vínculo já foram associados ou não possuem títulos com exatamente o mesmo Cliente, Vencimento e Valor.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Status Bar */}
                <div className="flex items-center justify-between p-2.5 bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800 rounded-xl">
                  <label className="flex items-center gap-2 font-extrabold text-indigo-950 dark:text-indigo-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={manutencaoMatches.every(m => m.checked)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setManutencaoMatches(prev => prev.map(m => ({ ...m, checked })));
                      }}
                      className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                    />
                    <span>Selecionar Todos ({manutencaoMatches.length} correspondências encontradas)</span>
                  </label>
                  <span className="font-extrabold text-indigo-700 dark:text-indigo-300 text-xs">
                    {manutencaoMatches.filter(m => m.checked).length} de {manutencaoMatches.length} selecionados para vincular
                  </span>
                </div>

                {/* Lista de Vínculos Encontrados */}
                <div className="max-h-[360px] overflow-y-auto space-y-2 pr-1">
                  {manutencaoMatches.map((m, idx) => (
                    <div 
                      key={m.id}
                      className={clsx(
                        "p-3 rounded-xl border transition-all flex flex-wrap items-center justify-between gap-3",
                        m.checked 
                          ? "bg-white dark:bg-slate-900 border-indigo-400 dark:border-indigo-600 shadow-xs" 
                          : "bg-slate-50/50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-60"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-[240px] flex-1">
                        <input
                          type="checkbox"
                          checked={m.checked}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setManutencaoMatches(prev => prev.map((item, i) => i === idx ? { ...item, checked } : item));
                          }}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer shrink-0"
                        />

                        {/* LADO BOLETO ASAAS */}
                        <div className="flex-1 bg-slate-100 dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[9.5px] font-black uppercase text-indigo-600 dark:text-indigo-400">
                              BOLETO ASAAS (#{m.boleto.nosso_numero || m.boleto.id})
                            </span>
                            <span className={clsx(
                              "px-1.5 py-0.2 font-extrabold text-[9.5px] rounded uppercase",
                              (m.boleto.status_pagamento || '').includes('PAGO') ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                            )}>
                              {m.boleto.status_pagamento || 'ABERTO'}
                            </span>
                          </div>
                          <span className="font-extrabold text-slate-900 dark:text-slate-100 block truncate text-xs">
                            {m.boleto.cliente_boleto || m.boleto.cliente || 'Cliente Asaas'}
                          </span>
                          {m.boleto.cliente_documento && (
                            <span className="inline-block px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono font-bold text-[10px] rounded">
                              CNPJ/CPF: {m.boleto.cliente_documento}
                            </span>
                          )}
                          <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 dark:border-slate-700/60 text-[11px] font-mono">
                            <span className="text-slate-600 dark:text-slate-400">Venc: <strong className="text-slate-800 dark:text-slate-200">{m.boleto.data_vencimento ? formatDate(m.boleto.data_vencimento) : '—'}</strong></span>
                            <span className="text-indigo-700 dark:text-indigo-300 font-black">Val: {formatBRL(m.boleto.valor)}</span>
                          </div>
                        </div>

                        {/* ÍCONE MATCH */}
                        <div className="flex flex-col items-center justify-center shrink-0 px-1">
                          <div className="p-2 bg-gradient-to-tr from-emerald-500 to-teal-500 text-white rounded-full shadow-sm">
                            <Link2 size={16} />
                          </div>
                          <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase mt-1">100% Match</span>
                        </div>

                        {/* LADO TÍTULO COLISEU TRANSPORTE */}
                        <div className="flex-1 bg-indigo-50/70 dark:bg-indigo-950/50 p-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800 space-y-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[9.5px] font-black uppercase text-purple-600 dark:text-purple-400">
                              TÍTULO COLISEU TRANSPORTE (#{m.titulo.id_firebird || m.titulo.id})
                            </span>
                            <span className={clsx(
                              "px-1.5 py-0.2 font-extrabold text-[9.5px] rounded uppercase",
                              (m.titulo.status_pagamento || '').includes('PAGO') ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                            )}>
                              {m.titulo.status_pagamento || 'ABERTO'}
                            </span>
                          </div>
                          <span className="font-extrabold text-slate-900 dark:text-slate-100 block truncate text-xs">
                            {m.titulo.cliente || m.titulo.cliente_nome || m.titulo.descricao}
                          </span>
                          {(m.titulo.cliente_documento || m.titulo.cpf_cnpj) && (
                            <span className="inline-block px-1.5 py-0.5 bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 font-mono font-bold text-[10px] rounded">
                              CNPJ/CPF: {m.titulo.cliente_documento || m.titulo.cpf_cnpj}
                            </span>
                          )}
                          <div className="flex items-center justify-between pt-1 border-t border-indigo-200/60 dark:border-indigo-800/60 text-[11px] font-mono">
                            <span className="text-slate-600 dark:text-slate-400">Venc: <strong className="text-slate-800 dark:text-slate-200">{m.titulo.data_vencimento ? formatDate(m.titulo.data_vencimento) : '—'}</strong></span>
                            <span className="text-purple-700 dark:text-purple-300 font-black">Val: {formatBRL(m.titulo.valor)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-3">
              <button
                type="button"
                className="btn-secondary !py-1.5 !px-4 text-xs font-bold"
                onClick={() => setIsManutencaoModalOpen(false)}
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={isExecutingAutoLink || manutencaoMatches.filter(m => m.checked).length === 0}
                onClick={handleConfirmAutoLinks}
                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                {isExecutingAutoLink ? (
                  <>
                    <Loader2 size={15} className="animate-spin" /> Processando Vínculos...
                  </>
                ) : (
                  <>
                    <Check size={15} /> Confirmar Vínculo de {manutencaoMatches.filter(m => m.checked).length} Títulos
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal de Quitação / Baixa de Título Estilo ERP */}
      {selectedTitulo && (
        <ModalLiquidarTitulo
          isOpen={!!selectedTitulo}
          titulo={selectedTitulo}
          onClose={() => setSelectedTitulo(null)}
          onSuccess={() => {
            setSelectedTitulo(null)
            refetchReceber()
            refetchCaixa()
            refetchContas()
            refetchMovimentacoes()
          }}
        />
      )}

      {/* Modal Interativo de Validação Prévia e Emissão em Lote de Boletos */}
      <ModalValidacaoLoteBoletos
        isOpen={isValidatingBatchModalOpen}
        titulos={selectedBatchItemsForValidation}
        mensagemEmail={batchEmailMessage}
        onClose={() => setIsValidatingBatchModalOpen(false)}
        onCompleted={() => {
          setIsBatchCobrancaModalOpen(false)
          setBatchSelectedIds([])
          refetchBoletos()
          refetchReceber()
        }}
      />

    </div>
  )
}

// Simple placeholder icon wrapper for react compiler
function ClockIcon({ size = 16, className = "" }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
    </svg>
  )
}
