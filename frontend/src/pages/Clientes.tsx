import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import { formatBRL, formatDate, formatDateTime, formatNum } from '../utils/format'
import {
  Users,
  Search,
  Plus,
  X,
  Truck,
  MapPin,
  Building2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Pencil,
  Phone,
  Mail,
  FileText,
  Package,
  Route,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Copy,
  Check,
  ArrowUpRight,
  ShieldCheck,
  Loader2,
  Filter,
} from 'lucide-react'

interface ClienteTransporteRow {
  id: number
  id_firebird?: number | null
  nome: string
  razao_social: string
  nome_fantasia: string
  classe?: string
  documento?: string
  documento_limpo?: string
  inscricao_estadual?: string | null
  inscricao_estadual_efetiva?: string | null
  indicador_ie?: string | null
  indicador_ie_efetivo?: string
  email?: string | null
  email_financeiro?: string | null
  telefone?: string | null
  celular_secundario?: string | null
  cidade?: string | null
  estado?: string | null
  uf_normalizada?: string
  cep?: string | null
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  codigo_municipio?: string | null
  codigo_municipio_resolvido?: string | null
  ibge_exato?: boolean
  endereco_completo?: string | null
  classificacao?: string | null
  tipo_cliente?: string | null
  tipo_entidade?: 'CLIENTE' | 'FORNECEDOR'
  regime_tributario?: string | null
  responsavel_nome?: string | null
  observacoes?: string | null
  data_cadastro?: string | null
  parte_id?: number | null
  vinculado_parte?: boolean
  pronto_cte?: boolean
}

interface ClientesListResponse {
  data: ClienteTransporteRow[]
  total: number
  limit: number
  offset: number
}

interface ClientesKpisResponse {
  kpis: {
    total_clientes: number
    total_fornecedores: number
    prontos_cte: number
    vinculados_partes: number
    cargas_pendentes: number
    regioes_ativas: number
  }
}

interface OpcoesTransporteResponse {
  data: {
    ufs: string[]
    regioes: { nome: string; origem: string; cidades: string[] }[]
  }
}

interface FichaTransporteData {
  cliente: ClienteTransporteRow
  parte_vinculada: Record<string, any> | null
  resumo_logistico: {
    total_cargas: number
    cargas_pendentes: number
    valor_movimentado_cargas: number
    peso_total_kg: number
    total_ctes: number
    ctes_autorizados: number
    frete_total_ctes: number
    total_entregas: number
    entregas_concluidas: number
    canhotos_assinados: number
  }
  cargas: any[]
  ctes: any[]
  entregas: any[]
}

const UFS_BRASIL = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
  'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
]

const PAGE_SIZE = 50

function formatCpfCnpjMask(val?: string | null): string {
  const digits = String(val || '').replace(/\D/g, '').slice(0, 14)
  if (!digits) return ''
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

function formatPhoneMask(val?: string | null): string {
  const digits = String(val || '').replace(/\D/g, '').slice(0, 11)
  if (!digits) return ''
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '')
  }
  return digits.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '')
}

function formatCepMask(val?: string | null): string {
  const digits = String(val || '').replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 5) return digits
  return digits.replace(/(\d{5})(\d{1,3})/, '$1-$2')
}

function getWhatsAppLink(phoneStr?: string | null, cellStr?: string | null): { formatted: string; url: string | null } {
  const raw = (cellStr || phoneStr || '').trim()
  const digits = raw.replace(/\D/g, '')
  if (!digits) return { formatted: '—', url: null }
  const formatted = formatPhoneMask(digits) || raw
  const isMobile = (digits.length === 11 && digits[2] === '9') || (digits.length === 13 && digits.startsWith('55') && digits[4] === '9')
  if (!isMobile) return { formatted, url: null }
  const full = digits.startsWith('55') ? digits : `55${digits}`
  return { formatted, url: `https://wa.me/${full}` }
}

function getIndicadorIeLabel(ind?: string | null): string {
  if (ind === '1') return '1 — Contribuinte ICMS'
  if (ind === '2') return '2 — Contribuinte Isento'
  return '9 — Não Contribuinte'
}

const EMPTY_FORM = {
  documento: '',
  razao_social: '',
  nome_fantasia: '',
  inscricao_estadual: '',
  indicador_ie: '9',
  regime_tributario: 'SIMPLES NACIONAL',
  tipo_cliente: 'CLIENTE',
  classificacao: '',
  email: '',
  telefone: '',
  celular_secundario: '',
  cep: '',
  codigo_municipio: '',
  cidade: '',
  estado: 'MS',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  endereco_completo: '',
  observacoes: '',
  sincronizar_parte: true,
}

export default function Clientes() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)

  const canSeeFicha =
    user?.role === 'master' ||
    user?.role === 'admin' ||
    user?.grupo_nome?.toLowerCase() === 'master' ||
    user?.permissoes_acoes?.permitir_ver_ficha_cliente !== false

  // Filtros operacionais
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [tipoEntidade, setTipoEntidade] = useState<'CLIENTE' | 'FORNECEDOR' | 'TODOS'>('CLIENTE')
  const [ufFilter, setUfFilter] = useState('')
  const [regiaoFilter, setRegiaoFilter] = useState('')
  const [statusFiscalFilter, setStatusFiscalFilter] = useState<
    'TODOS' | 'PRONTO_CTE' | 'PENDENTE_FISCAL' | 'VINCULADO_PARTE' | 'NAO_VINCULADO'
  >('TODOS')
  const [currentPage, setCurrentPage] = useState(1)

  // Seleção em lote para sincronizar em Partes do Transporte
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [syncingId, setSyncingId] = useState<number | null>(null)
  const [syncingBatch, setSyncingBatch] = useState(false)
  const [feedbackBanner, setFeedbackBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Drawer da Ficha Logística do Transporte
  const [fichaClientId, setFichaClientId] = useState<number | null>(null)
  const [fichaTab, setFichaTab] = useState<'fiscal' | 'cargas' | 'ctes' | 'entregas'>('fiscal')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // Modal de Cadastro / Edição Fiscal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [savingForm, setSavingForm] = useState(false)
  const [consultingCnpj, setConsultingCnpj] = useState(false)
  const [consultingCep, setConsultingCep] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim())
      setCurrentPage(1)
    }, 280)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    setCurrentPage(1)
    setSelectedIds([])
  }, [tipoEntidade, ufFilter, regiaoFilter, statusFiscalFilter])

  useEffect(() => {
    if (!feedbackBanner) return
    const t = setTimeout(() => setFeedbackBanner(null), 5000)
    return () => clearTimeout(t)
  }, [feedbackBanner])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isModalOpen) setIsModalOpen(false)
        else if (fichaClientId) setFichaClientId(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isModalOpen, fichaClientId])

  // Queries
  const kpisQuery = useQuery<ClientesKpisResponse>({
    queryKey: ['clientes-transporte-kpis'],
    queryFn: async () => (await api.get('/clientes/kpis')).data,
  })

  const opcoesQuery = useQuery<OpcoesTransporteResponse>({
    queryKey: ['clientes-opcoes-transporte'],
    queryFn: async () => (await api.get('/clientes/opcoes-transporte')).data,
  })

  const listaQuery = useQuery<ClientesListResponse>({
    queryKey: [
      'clientes-transporte-lista',
      debouncedSearch,
      tipoEntidade,
      ufFilter,
      regiaoFilter,
      statusFiscalFilter,
      currentPage,
    ],
    queryFn: async () =>
      (
        await api.get('/clientes/lista', {
          params: {
            search: debouncedSearch,
            tipo_entidade: tipoEntidade,
            uf: ufFilter || undefined,
            regiao: regiaoFilter || undefined,
            status_fiscal: statusFiscalFilter,
            limit: PAGE_SIZE,
            offset: (currentPage - 1) * PAGE_SIZE,
          },
        })
      ).data,
    placeholderData: (prev) => prev,
  })

  const fichaQuery = useQuery<{ success: boolean; data: FichaTransporteData }>({
    queryKey: ['cliente-ficha-transporte', fichaClientId],
    queryFn: async () => (await api.get(`/clientes/${fichaClientId}/ficha-transporte`)).data,
    enabled: Boolean(fichaClientId && canSeeFicha),
  })

  const rows = listaQuery.data?.data || []
  const total = listaQuery.data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const kpis = kpisQuery.data?.kpis
  const ufsDisponiveis = useMemo(() => {
    const list = opcoesQuery.data?.data?.ufs || []
    return list.length > 0 ? list : UFS_BRASIL
  }, [opcoesQuery.data])
  const regioesDisponiveis = opcoesQuery.data?.data?.regioes || []

  const allCurrentSelected = rows.length > 0 && rows.every((r) => selectedIds.includes(r.id))

  const toggleSelectAllPage = () => {
    if (allCurrentSelected) {
      setSelectedIds((prev) => prev.filter((id) => !rows.some((r) => r.id === id)))
    } else {
      const pageIds = rows.map((r) => r.id)
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])))
    }
  }

  const toggleSelectRow = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['clientes-transporte-lista'] })
    queryClient.invalidateQueries({ queryKey: ['clientes-transporte-kpis'] })
    queryClient.invalidateQueries({ queryKey: ['clientes-opcoes-transporte'] })
    if (fichaClientId) {
      queryClient.invalidateQueries({ queryKey: ['cliente-ficha-transporte', fichaClientId] })
    }
  }

  const handleSincronizarParte = async (cliente: ClienteTransporteRow) => {
    setSyncingId(cliente.id)
    try {
      await api.post(`/clientes/${cliente.id}/sincronizar-parte`)
      setFeedbackBanner({
        type: 'success',
        text: `"${cliente.razao_social || cliente.nome}" habilitado em Partes do Transporte com código IBGE validado para CT-e.`,
      })
      refreshAll()
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        text: err.response?.data?.error || 'Não foi possível habilitar o cliente em Partes. Verifique CPF/CNPJ e Cidade/UF.',
      })
    } finally {
      setSyncingId(null)
    }
  }

  const handleSincronizarLote = async () => {
    if (selectedIds.length === 0) return
    setSyncingBatch(true)
    try {
      const { data } = await api.post('/clientes/sincronizar-partes-lote', { ids: selectedIds })
      const res = data?.data
      const msgIgnorados =
        res?.ignorados?.length > 0 ? ` (${res.ignorados.length} ignorado(s) sem CPF/CNPJ válido)` : ''
      setFeedbackBanner({
        type: 'success',
        text: `${res?.sincronizados || 0} cliente(s) sincronizado(s) em Partes do Transporte${msgIgnorados}.`,
      })
      setSelectedIds([])
      refreshAll()
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        text: err.response?.data?.error || 'Falha ao sincronizar lote com Partes do Transporte.',
      })
    } finally {
      setSyncingBatch(false)
    }
  }

  const openCreateModal = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setIsModalOpen(true)
  }

  const openEditModal = (c: ClienteTransporteRow) => {
    setEditingId(c.id)
    const ieEfetiva = c.inscricao_estadual || c.inscricao_estadual_efetiva || ''
    setForm({
      documento: formatCpfCnpjMask(c.documento || ''),
      razao_social: c.razao_social || c.nome || '',
      nome_fantasia: c.nome_fantasia || '',
      inscricao_estadual: ieEfetiva,
      indicador_ie: c.indicador_ie_efetivo || c.indicador_ie || (ieEfetiva && ieEfetiva !== 'ISENTO' ? '1' : '9'),
      regime_tributario: c.regime_tributario || 'SIMPLES NACIONAL',
      tipo_cliente: c.tipo_entidade === 'FORNECEDOR' ? 'FORNECEDOR' : 'CLIENTE',
      classificacao: c.classificacao && c.classificacao !== 'ATIVO' ? c.classificacao : '',
      email: c.email || c.email_financeiro || '',
      telefone: formatPhoneMask(c.telefone || ''),
      celular_secundario: formatPhoneMask(c.celular_secundario || ''),
      cep: formatCepMask(c.cep || ''),
      codigo_municipio: c.codigo_municipio || c.codigo_municipio_resolvido || '',
      cidade: c.cidade && c.cidade !== '—' ? c.cidade : '',
      estado: c.uf_normalizada || (c.estado && c.estado !== '—' ? c.estado : 'MS'),
      logradouro: c.logradouro || '',
      numero: c.numero || '',
      complemento: c.complemento || '',
      bairro: c.bairro || '',
      endereco_completo: c.endereco_completo || '',
      observacoes: c.observacoes || '',
      sincronizar_parte: true,
    })
    setIsModalOpen(true)
  }

  const handleConsultarCnpj = async () => {
    const doc = form.documento.replace(/\D/g, '')
    if (doc.length !== 14) {
      setFeedbackBanner({ type: 'error', text: 'Informe um CNPJ válido com 14 dígitos para consulta automática.' })
      return
    }
    setConsultingCnpj(true)
    try {
      let cnpjData: any = null
      try {
        const r1 = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${doc}`)
        if (r1.ok) cnpjData = await r1.json()
      } catch {
        // fallback abaixo
      }
      if (!cnpjData) {
        const r2 = await fetch(`https://minhareceita.org/${doc}`)
        if (r2.ok) cnpjData = await r2.json()
      }

      if (cnpjData) {
        const razao = (cnpjData.razao_social || cnpjData.nome || form.razao_social || '').toUpperCase()
        const fantasia = (cnpjData.nome_fantasia || cnpjData.fantasia || razao).toUpperCase()
        const cepLimpo = String(cnpjData.cep || '').replace(/\D/g, '')
        setForm((prev) => ({
          ...prev,
          documento: formatCpfCnpjMask(doc),
          razao_social: razao,
          nome_fantasia: fantasia,
          email: (cnpjData.email || prev.email || '').toLowerCase(),
          telefone: formatPhoneMask(cnpjData.ddd_telefone_1 || cnpjData.telefone || prev.telefone),
          cep: formatCepMask(cepLimpo || prev.cep),
          codigo_municipio: String(cnpjData.codigo_municipio_ibge || prev.codigo_municipio || '').replace(/\D/g, ''),
          cidade: (cnpjData.municipio || prev.cidade || '').toUpperCase(),
          estado: (cnpjData.uf || prev.estado || 'MS').toUpperCase(),
          logradouro: (cnpjData.logradouro || prev.logradouro || '').toUpperCase(),
          numero: String(cnpjData.numero || prev.numero || '').toUpperCase(),
          complemento: String(cnpjData.complemento || prev.complemento || '').toUpperCase(),
          bairro: String(cnpjData.bairro || prev.bairro || '').toUpperCase(),
        }))
      } else {
        setFeedbackBanner({ type: 'error', text: 'CNPJ não localizado nas bases públicas. Preencha manualmente.' })
      }
    } catch {
      setFeedbackBanner({ type: 'error', text: 'Falha ao consultar CNPJ. Preencha os campos manualmente.' })
    } finally {
      setConsultingCnpj(false)
    }
  }

  const handleConsultarCep = async (cepValue?: string) => {
    const cepDigits = String(cepValue ?? form.cep).replace(/\D/g, '')
    if (cepDigits.length !== 8) return
    setConsultingCep(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`)
      if (res.ok) {
        const data = await res.json()
        if (!data.erro) {
          setForm((prev) => ({
            ...prev,
            cep: formatCepMask(cepDigits),
            logradouro: (data.logradouro || prev.logradouro || '').toUpperCase(),
            bairro: (data.bairro || prev.bairro || '').toUpperCase(),
            cidade: (data.localidade || prev.cidade || '').toUpperCase(),
            estado: (data.uf || prev.estado || 'MS').toUpperCase(),
            codigo_municipio: String(data.ibge || prev.codigo_municipio || '').replace(/\D/g, ''),
          }))
        }
      }
    } catch {
      // silencioso no auto-complete de CEP
    } finally {
      setConsultingCep(false)
    }
  }

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.razao_social.trim()) {
      setFeedbackBanner({ type: 'error', text: 'Informe a Razão Social / Nome do cliente.' })
      return
    }
    setSavingForm(true)
    try {
      const payload = {
        ...form,
        nome: form.razao_social.trim(),
        razao_social: form.razao_social.trim(),
        nome_fantasia: form.nome_fantasia.trim() || form.razao_social.trim(),
        classificacao: form.classificacao.trim() || 'ATIVO',
      }
      if (editingId) {
        await api.put(`/clientes/${editingId}`, payload)
        setFeedbackBanner({
          type: 'success',
          text: 'Cadastro atualizado, enfileirado para o ERP Coliseu e sincronizado com o Transporte.',
        })
      } else {
        await api.post('/clientes', payload)
        setFeedbackBanner({
          type: 'success',
          text: 'Novo cliente cadastrado, enfileirado para o ERP Coliseu e habilitado no Transporte.',
        })
      }
      setIsModalOpen(false)
      setEditingId(null)
      refreshAll()
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        text: err.response?.data?.error || 'Erro ao salvar cadastro do cliente.',
      })
    } finally {
      setSavingForm(false)
    }
  }

  const handleCopyChave = (chave: string) => {
    if (!chave) return
    navigator.clipboard.writeText(chave)
    setCopiedKey(chave)
    setTimeout(() => setCopiedKey(null), 1800)
  }

  const openFichaLogistica = (cliente: ClienteTransporteRow) => {
    if (!canSeeFicha) {
      setFeedbackBanner({
        type: 'error',
        text: 'Seu perfil de acesso não possui permissão para abrir a ficha detalhada de clientes.',
      })
      return
    }
    setFichaClientId(cliente.id)
    setFichaTab('fiscal')
  }

  const ficha = fichaQuery.data?.data

  return (
    <div className="space-y-4">
      {/* BARRA DE COMANDO OPERACIONAL — IDENTIDADE COLISEU TRANSPORTE */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700/80 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-100 dark:border-slate-700/70">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#0B63A5]/10 dark:bg-sky-500/15 border border-[#0B63A5]/20 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-[#0B63A5] dark:text-sky-400" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                  Clientes & Embarcadores (ERP Coliseu)
                </h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-sky-50 text-[#0B63A5] border border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800">
                  Sync Bidirecional ERP
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Base cadastral integrada às NF-es/Cargas, Regiões de Entrega e habilitação em 1 clique para emissão de CT-e e MDF-e.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/regioes')}
              className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900/60 dark:hover:bg-slate-700/60 transition flex items-center gap-1.5 cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              Regiões & Cidades
            </button>
            <button
              type="button"
              onClick={() => navigate('/transporte/partes')}
              className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900/60 dark:hover:bg-slate-700/60 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Building2 className="w-3.5 h-3.5 text-[#0B63A5] dark:text-sky-400" />
              Partes do Transporte
              <ArrowUpRight className="w-3.5 h-3.5 opacity-60" />
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-[#0B63A5] hover:bg-sky-800 text-white shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Novo Cliente
            </button>
          </div>
        </div>

        {/* TELEMETRIA OPERACIONAL COMPACTA (CLICÁVEL PARA FILTRAGEM RÁPIDA) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 dark:divide-slate-700/70 bg-slate-50/60 dark:bg-slate-900/30">
          <button
            type="button"
            onClick={() => {
              setTipoEntidade('CLIENTE')
              setStatusFiscalFilter('TODOS')
            }}
            className="px-4 py-3 text-left hover:bg-white dark:hover:bg-slate-800/80 transition cursor-pointer"
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Clientes ERP Ativos
            </span>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-lg font-extrabold font-mono text-slate-900 dark:text-white">
                {formatNum(kpis?.total_clientes ?? 0)}
              </span>
              <span className="text-[11px] text-slate-500">
                +{formatNum(kpis?.total_fornecedores ?? 0)} fornec.
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              setStatusFiscalFilter((prev) => (prev === 'PRONTO_CTE' ? 'TODOS' : 'PRONTO_CTE'))
            }
            className={clsx(
              'px-4 py-3 text-left transition cursor-pointer',
              statusFiscalFilter === 'PRONTO_CTE'
                ? 'bg-sky-50/90 dark:bg-sky-950/40'
                : 'hover:bg-white dark:hover:bg-slate-800/80'
            )}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#0B63A5] dark:text-sky-400 block">
              Prontos p/ CT-e (IBGE)
            </span>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-lg font-extrabold font-mono text-[#0B63A5] dark:text-sky-300">
                {formatNum(kpis?.prontos_cte ?? 0)}
              </span>
              <span className="text-[11px] text-slate-500">CPF/CNPJ + UF</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              setStatusFiscalFilter((prev) => (prev === 'VINCULADO_PARTE' ? 'TODOS' : 'VINCULADO_PARTE'))
            }
            className={clsx(
              'px-4 py-3 text-left transition cursor-pointer',
              statusFiscalFilter === 'VINCULADO_PARTE'
                ? 'bg-emerald-50/90 dark:bg-emerald-950/40'
                : 'hover:bg-white dark:hover:bg-slate-800/80'
            )}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">
              Habilitados em Partes
            </span>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-lg font-extrabold font-mono text-emerald-700 dark:text-emerald-300">
                {formatNum(kpis?.vinculados_partes ?? 0)}
              </span>
              <span className="text-[11px] text-slate-500">no Wizard CT-e</span>
            </div>
          </button>

          <div className="px-4 py-3 text-left">
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400 block">
              Regiões / Rotas Ativas
            </span>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-lg font-extrabold font-mono text-teal-700 dark:text-teal-300">
                {formatNum(kpis?.regioes_ativas ?? 0)}
              </span>
              <span className="text-[11px] text-slate-500">rotas ERP/TMS</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/transporte/cargas')}
            className="px-4 py-3 text-left hover:bg-white dark:hover:bg-slate-800/80 transition cursor-pointer col-span-2 sm:col-span-1"
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 block">
              NF-es / Cargas Pendentes
            </span>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-lg font-extrabold font-mono text-amber-700 dark:text-amber-300">
                {formatNum(kpis?.cargas_pendentes ?? 0)}
              </span>
              <span className="text-[11px] text-slate-500 flex items-center gap-0.5">
                ver cargas <ArrowUpRight className="w-3 h-3" />
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* FEEDBACK OPERACIONAL */}
      {feedbackBanner && (
        <div
          className={clsx(
            'px-4 py-3 rounded-xl border text-xs font-medium flex items-center justify-between gap-3',
            feedbackBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-200'
          )}
        >
          <div className="flex items-center gap-2">
            {feedbackBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedbackBanner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* BARRA DE FILTROS & SELEÇÃO EM LOTE */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700/80 rounded-2xl p-3.5 shadow-xs space-y-3">
        <div className="flex flex-col xl:flex-row items-stretch xl:items-center gap-2.5">
          {/* Segmento Entidade */}
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-900 p-1 shrink-0">
            {(
              [
                { id: 'CLIENTE', label: 'Clientes' },
                { id: 'FORNECEDOR', label: 'Fornecedores' },
                { id: 'TODOS', label: 'Todos' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTipoEntidade(tab.id)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer',
                  tipoEntidade === tab.id
                    ? 'bg-white dark:bg-slate-800 text-[#0B63A5] dark:text-sky-300 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Super Busca */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por Razão Social, Fantasia, CNPJ/CPF, IE, #Código ERP, Cidade ou Telefone..."
              className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0B63A5]/40 focus:border-[#0B63A5]"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filtro UF */}
          <select
            value={ufFilter}
            onChange={(e) => setUfFilter(e.target.value)}
            aria-label="Filtrar por UF"
            className="px-3 py-2 text-xs font-semibold bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0B63A5]/40"
          >
            <option value="">Todas as UFs</option>
            {ufsDisponiveis.map((uf) => (
              <option key={uf} value={uf}>
                UF: {uf}
              </option>
            ))}
          </select>

          {/* Filtro Região / Rota */}
          <select
            value={regiaoFilter}
            onChange={(e) => setRegiaoFilter(e.target.value)}
            aria-label="Filtrar por Região ou Rota"
            className="px-3 py-2 text-xs font-semibold bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0B63A5]/40 max-w-[220px]"
          >
            <option value="">Todas as Regiões / Rotas</option>
            {regioesDisponiveis.map((r) => (
              <option key={r.nome} value={r.nome}>
                {r.nome}
              </option>
            ))}
          </select>

          {/* Filtro Prontidão CT-e */}
          <div className="relative flex items-center">
            <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
            <select
              value={statusFiscalFilter}
              onChange={(e) => setStatusFiscalFilter(e.target.value as any)}
              aria-label="Filtrar por status fiscal no Transporte"
              className="pl-8 pr-3 py-2 text-xs font-semibold bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0B63A5]/40"
            >
              <option value="TODOS">Status Fiscal: Todos</option>
              <option value="PRONTO_CTE">Prontos p/ CT-e (Doc + IBGE)</option>
              <option value="PENDENTE_FISCAL">Pendente CPF/CNPJ ou Cidade</option>
              <option value="VINCULADO_PARTE">Já em Partes do Transporte</option>
              <option value="NAO_VINCULADO">Ainda não enviado p/ Partes</option>
            </select>
          </div>

          <button
            type="button"
            onClick={refreshAll}
            title="Atualizar listagem"
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer shrink-0 self-end xl:self-auto"
          >
            <RefreshCw className={clsx('w-4 h-4', listaQuery.isFetching && 'animate-spin')} />
          </button>
        </div>

        {/* Barra de ação em lote quando há clientes marcados */}
        {selectedIds.length > 0 && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-700/70 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              <strong className="text-[#0B63A5] dark:text-sky-400">{selectedIds.length}</strong> registro(s) selecionado(s)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 cursor-pointer"
              >
                Limpar seleção
              </button>
              <button
                type="button"
                disabled={syncingBatch}
                onClick={handleSincronizarLote}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
              >
                {syncingBatch ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5" />
                )}
                Habilitar selecionados em Partes do Transporte
              </button>
            </div>
          </div>
        )}
      </div>

      {/* TABELA LOGÍSTICA DE ALTA DENSIDADE */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700/80 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/90 dark:bg-slate-900/60 border-b border-slate-200/80 dark:border-slate-700/70 text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <tr>
                <th className="w-10 px-3.5 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={allCurrentSelected}
                    onChange={toggleSelectAllPage}
                    aria-label="Selecionar página atual"
                    className="rounded border-slate-300 text-[#0B63A5] focus:ring-[#0B63A5] cursor-pointer"
                  />
                </th>
                <th className="px-3 py-3">ERP</th>
                <th className="px-3.5 py-3">Razão Social / Nome Fantasia</th>
                <th className="px-3.5 py-3">CNPJ / CPF & IE</th>
                <th className="px-3.5 py-3">Município / UF & IBGE</th>
                <th className="px-3.5 py-3">Região / Rota</th>
                <th className="px-3.5 py-3">Contato & XML</th>
                <th className="px-3.5 py-3">Partes CT-e</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {listaQuery.isLoading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-14 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#0B63A5]" />
                    Carregando base de clientes sincronizados do ERP...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-14 text-center">
                    <Users className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Nenhum cliente encontrado para os filtros aplicados
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Ajuste os filtros de busca/região ou cadastre um novo embarcador/destinatário.
                    </p>
                  </td>
                </tr>
              ) : (
                rows.map((c) => {
                  const phoneInfo = getWhatsAppLink(c.telefone, c.celular_secundario)
                  const emailFiscal = c.email || c.email_financeiro || ''
                  const regiaoLabel =
                    c.classificacao && !['ATIVO', '—'].includes(c.classificacao.toUpperCase())
                      ? c.classificacao
                      : c.classe || 'GERAL'
                  const isSelected = selectedIds.includes(c.id)

                  return (
                    <tr
                      key={c.id}
                      className={clsx(
                        'transition-colors hover:bg-sky-50/40 dark:hover:bg-slate-700/40',
                        isSelected && 'bg-sky-50/70 dark:bg-sky-950/30'
                      )}
                    >
                      <td className="px-3.5 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRow(c.id)}
                          aria-label={`Selecionar ${c.razao_social || c.nome}`}
                          className="rounded border-slate-300 text-[#0B63A5] focus:ring-[#0B63A5] cursor-pointer"
                        />
                      </td>

                      {/* Código ERP Firebird */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {c.id_firebird ? (
                          <span className="font-mono text-[11px] font-bold text-[#0B63A5] dark:text-sky-400 bg-sky-50 dark:bg-sky-950/60 px-2 py-0.5 rounded-md border border-sky-200/70 dark:border-sky-800/70">
                            #{c.id_firebird}
                          </span>
                        ) : (
                          <span className="font-mono text-[10px] font-semibold text-slate-400 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-900">
                            WEB
                          </span>
                        )}
                      </td>

                      {/* Razão Social + Fantasia */}
                      <td className="px-3.5 py-2.5 max-w-[290px]">
                        <button
                          type="button"
                          onClick={() => openFichaLogistica(c)}
                          className="text-left group cursor-pointer block w-full"
                        >
                          <div className="font-bold text-slate-900 dark:text-white group-hover:text-[#0B63A5] dark:group-hover:text-sky-400 truncate transition-colors">
                            {c.nome_fantasia || c.razao_social || c.nome}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {c.razao_social && c.razao_social !== c.nome_fantasia
                              ? c.razao_social
                              : c.endereco_completo || 'Endereço não informado'}
                          </div>
                        </button>
                      </td>

                      {/* Documento + IE */}
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <div className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                          {c.documento ? formatCpfCnpjMask(c.documento) : '—'}
                        </div>
                        <div className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {c.inscricao_estadual_efetiva ? (
                            <span className="font-mono text-teal-700 dark:text-teal-400 font-semibold">
                              IE: {c.inscricao_estadual_efetiva}
                            </span>
                          ) : (
                            <span>Não contribuinte / S/ IE</span>
                          )}
                        </div>
                      </td>

                      {/* Cidade / UF + Código IBGE */}
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {c.cidade && c.cidade !== '—' ? c.cidade : 'Sem cidade'}
                          {c.uf_normalizada ? (
                            <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                              {c.uf_normalizada}
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[10.5px] font-mono text-slate-400 mt-0.5">
                          {c.codigo_municipio_resolvido ? `IBGE ${c.codigo_municipio_resolvido}` : 'IBGE pendente'}
                        </div>
                      </td>

                      {/* Região / Rota */}
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-700/70 dark:text-slate-200 max-w-[150px] truncate">
                          {regiaoLabel}
                        </span>
                      </td>

                      {/* Contato & E-mail XML */}
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-slate-700 dark:text-slate-300">
                            {phoneInfo.formatted}
                          </span>
                          {phoneInfo.url && (
                            <a
                              href={phoneInfo.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 text-[10px] font-bold"
                              title="Conversar no WhatsApp"
                            >
                              <MessageCircle className="w-2.5 h-2.5" />
                              Whats
                            </a>
                          )}
                        </div>
                        {emailFiscal ? (
                          <div
                            className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate max-w-[170px] mt-0.5"
                            title={`XML/DACTE: ${emailFiscal}`}
                          >
                            {emailFiscal}
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400 mt-0.5">Sem e-mail p/ XML</div>
                        )}
                      </td>

                      {/* Vínculo 1-Clique com Partes do Transporte */}
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        {c.vinculado_parte ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Em Partes CT-e
                          </span>
                        ) : c.pronto_cte ? (
                          <button
                            type="button"
                            disabled={syncingId === c.id}
                            onClick={() => handleSincronizarParte(c)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-sky-50 hover:bg-[#0B63A5] text-[#0B63A5] hover:text-white border border-sky-200 hover:border-[#0B63A5] dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800 transition cursor-pointer disabled:opacity-50"
                            title="Sincronizar este cliente em Partes do Transporte para emissão rápida de CT-e"
                          >
                            {syncingId === c.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Truck className="w-3.5 h-3.5" />
                            )}
                            Usar no Transporte
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openEditModal(c)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800 transition cursor-pointer"
                            title="Complete CPF/CNPJ ou Cidade/UF para habilitar no CT-e"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Completar Fiscal
                          </button>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="px-4 py-2.5 whitespace-nowrap text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openFichaLogistica(c)}
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-[#0B63A5] text-slate-700 hover:text-white dark:bg-slate-700/70 dark:text-slate-200 dark:hover:bg-sky-600 transition inline-flex items-center gap-1 cursor-pointer"
                            title="Abrir Ficha Logística (Dados Fiscais, NF-es/Cargas, CT-es e Entregas)"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            Ficha Logística
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(c)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                            title="Editar dados cadastrais, IE e região"
                          >
                            <Pencil className="w-3.5 h-3.5" />
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

        {/* PAGINAÇÃO */}
        <div className="px-4 py-3 bg-slate-50/70 dark:bg-slate-900/40 border-t border-slate-200/80 dark:border-slate-700/70 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-slate-500 dark:text-slate-400">
            Exibindo{' '}
            <strong className="text-slate-800 dark:text-slate-200">
              {total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}
            </strong>{' '}
            a{' '}
            <strong className="text-slate-800 dark:text-slate-200">
              {Math.min(currentPage * PAGE_SIZE, total)}
            </strong>{' '}
            de <strong className="text-slate-800 dark:text-slate-200">{formatNum(total)}</strong> registros
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 hover:bg-slate-50 transition inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Anterior
            </button>
            <span className="px-3 py-1.5 font-mono font-semibold text-slate-700 dark:text-slate-300">
              Página {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 hover:bg-slate-50 transition inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
            >
              Próxima
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* DRAWER LATERAL — FICHA LOGÍSTICA DO TRANSPORTE */}
      {fichaClientId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-[1px]">
          <div className="w-full max-w-4xl bg-white dark:bg-slate-900 h-full shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
            {/* Cabeçalho da Ficha Logística */}
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {ficha?.cliente?.id_firebird && (
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-sky-100 text-[#0B63A5] dark:bg-sky-950 dark:text-sky-300">
                      ERP #{ficha.cliente.id_firebird}
                    </span>
                  )}
                  <span
                    className={clsx(
                      'text-[11px] font-semibold px-2 py-0.5 rounded-md border',
                      ficha?.cliente?.vinculado_parte
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                        : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                    )}
                  >
                    {ficha?.cliente?.vinculado_parte
                      ? 'Sincronizado em Partes do Transporte'
                      : 'Ainda não sincronizado em Partes'}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-1 truncate">
                  {ficha?.cliente?.razao_social || ficha?.cliente?.nome || 'Carregando ficha logística...'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                  {ficha?.cliente?.documento ? formatCpfCnpjMask(ficha.cliente.documento) : 'Documento não informado'}
                  {ficha?.cliente?.inscricao_estadual_efetiva
                    ? ` · IE ${ficha.cliente.inscricao_estadual_efetiva}`
                    : ' · Sem IE'}
                  {ficha?.cliente?.cidade
                    ? ` · ${ficha.cliente.cidade}/${ficha.cliente.uf_normalizada || ficha.cliente.estado || ''}`
                    : ''}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {ficha?.cliente && (
                  <>
                    <button
                      type="button"
                      disabled={syncingId === ficha.cliente.id}
                      onClick={() => handleSincronizarParte(ficha.cliente)}
                      className="px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {syncingId === ficha.cliente.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ShieldCheck className="w-3.5 h-3.5" />
                      )}
                      {ficha.cliente.vinculado_parte ? 'Atualizar em Partes' : 'Enviar p/ Partes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/transporte/cte/novo')}
                      className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#0B63A5] hover:bg-sky-800 text-white transition inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Truck className="w-3.5 h-3.5" />
                      Emitir CT-e
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(ficha.cliente)}
                      className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                      title="Editar cadastro"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setFichaClientId(null)}
                  className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {fichaQuery.isLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-12">
                <Loader2 className="w-7 h-7 animate-spin text-[#0B63A5] mb-2" />
                Consultando movimentações fiscais, cargas e entregas do cliente...
              </div>
            ) : !ficha ? (
              <div className="flex-1 flex items-center justify-center text-slate-500 p-12 text-sm">
                Não foi possível carregar os dados logísticos deste cliente.
              </div>
            ) : (
              <>
                {/* Resumo Logístico */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-3.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      NF-es / Cargas ERP
                    </span>
                    <span className="text-base font-extrabold font-mono text-slate-900 dark:text-white">
                      {ficha.resumo_logistico.total_cargas}
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      {formatBRL(ficha.resumo_logistico.valor_movimentado_cargas)}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      Peso Total Carga
                    </span>
                    <span className="text-base font-extrabold font-mono text-slate-900 dark:text-white">
                      {formatNum(ficha.resumo_logistico.peso_total_kg)} kg
                    </span>
                    <span className="text-[11px] text-amber-600 dark:text-amber-400 block">
                      {ficha.resumo_logistico.cargas_pendentes} pendente(s)
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70">
                    <span className="text-[10px] font-bold uppercase text-[#0B63A5] dark:text-sky-400 block">
                      CT-es Vinculados
                    </span>
                    <span className="text-base font-extrabold font-mono text-[#0B63A5] dark:text-sky-300">
                      {ficha.resumo_logistico.total_ctes}
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      Frete: {formatBRL(ficha.resumo_logistico.frete_total_ctes)}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70">
                    <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400 block">
                      Entregas & POD
                    </span>
                    <span className="text-base font-extrabold font-mono text-emerald-700 dark:text-emerald-300">
                      {ficha.resumo_logistico.entregas_concluidas}/{ficha.resumo_logistico.total_entregas}
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      {ficha.resumo_logistico.canhotos_assinados} canhoto(s) digital
                    </span>
                  </div>
                </div>

                {/* Abas Nativas do Transporte */}
                <div className="px-6 pt-2 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1 overflow-x-auto bg-slate-50/50 dark:bg-slate-900">
                  {(
                    [
                      { id: 'fiscal', label: 'Dados Fiscais & Endereço', icon: Building2 },
                      {
                        id: 'cargas',
                        label: `NF-es / Cargas (${ficha.cargas.length})`,
                        icon: Package,
                      },
                      {
                        id: 'ctes',
                        label: `CT-es Emitidos (${ficha.ctes.length})`,
                        icon: FileText,
                      },
                      {
                        id: 'entregas',
                        label: `Entregas & POD (${ficha.entregas.length})`,
                        icon: Route,
                      },
                    ] as const
                  ).map((t) => {
                    const Icon = t.icon
                    const active = fichaTab === t.id
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setFichaTab(t.id)}
                        className={clsx(
                          'px-3.5 py-2.5 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer',
                          active
                            ? 'border-[#0B63A5] text-[#0B63A5] dark:text-sky-400 dark:border-sky-400'
                            : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {t.label}
                      </button>
                    )
                  })}
                </div>

                {/* Conteúdo da Aba */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {fichaTab === 'fiscal' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-2.5">
                        <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#0B63A5] dark:text-sky-400">
                          Identificação Tributária (SEFAZ CT-e / MDF-e)
                        </h3>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-slate-400 block">CNPJ / CPF</span>
                            <strong className="font-mono text-slate-900 dark:text-white">
                              {formatCpfCnpjMask(ficha.cliente.documento) || '—'}
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Inscrição Estadual</span>
                            <strong className="font-mono text-slate-900 dark:text-white">
                              {ficha.cliente.inscricao_estadual_efetiva || 'NÃO INFORMADA'}
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Indicador IE</span>
                            <strong className="text-slate-800 dark:text-slate-200">
                              {getIndicadorIeLabel(ficha.cliente.indicador_ie_efetivo)}
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Regime Tributário</span>
                            <strong className="text-slate-800 dark:text-slate-200">
                              {ficha.cliente.regime_tributario || 'SIMPLES NACIONAL'}
                            </strong>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-2.5">
                        <h3 className="text-[11px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                          Localização Logística & IBGE
                        </h3>
                        <div className="space-y-1.5">
                          <div>
                            <span className="text-slate-400 block">Endereço</span>
                            <strong className="text-slate-900 dark:text-white">
                              {ficha.cliente.logradouro
                                ? `${ficha.cliente.logradouro}, ${ficha.cliente.numero || 'S/N'} — ${ficha.cliente.bairro || ''}`
                                : ficha.cliente.endereco_completo || 'Não cadastrado'}
                            </strong>
                          </div>
                          <div className="grid grid-cols-3 gap-2 pt-1">
                            <div>
                              <span className="text-slate-400 block">Município / UF</span>
                              <strong className="text-slate-900 dark:text-white">
                                {ficha.cliente.cidade || '—'} / {ficha.cliente.uf_normalizada || '—'}
                              </strong>
                            </div>
                            <div>
                              <span className="text-slate-400 block">Código IBGE</span>
                              <strong className="font-mono text-[#0B63A5] dark:text-sky-300">
                                {ficha.cliente.codigo_municipio_resolvido || 'Pendente'}
                              </strong>
                            </div>
                            <div>
                              <span className="text-slate-400 block">Região / Rota</span>
                              <strong className="text-slate-900 dark:text-white">
                                {ficha.cliente.classificacao || 'GERAL'}
                              </strong>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-2 md:col-span-2">
                        <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Comunicação Fiscal (Envio Automático XML + DACTE)
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-[#0B63A5]" />
                            <div>
                              <span className="text-slate-400 block">E-mail Fiscal / XML</span>
                              <strong className="text-slate-900 dark:text-white break-all">
                                {ficha.cliente.email || ficha.cliente.email_financeiro || 'Não cadastrado'}
                              </strong>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4 text-emerald-600" />
                            <div>
                              <span className="text-slate-400 block">Telefone / Celular</span>
                              <strong className="font-mono text-slate-900 dark:text-white">
                                {formatPhoneMask(ficha.cliente.telefone || ficha.cliente.celular_secundario) || '—'}
                              </strong>
                            </div>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Cadastrado / Sincronizado</span>
                            <strong className="text-slate-900 dark:text-white">
                              {formatDate(ficha.cliente.data_cadastro)}
                            </strong>
                          </div>
                        </div>
                        {ficha.cliente.observacoes && (
                          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                            <span className="text-slate-400 block">Observações Operacionais:</span>
                            {ficha.cliente.observacoes}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {fichaTab === 'cargas' && (
                    <div className="space-y-2.5">
                      {ficha.cargas.length === 0 ? (
                        <div className="p-10 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-slate-500 text-xs">
                          Nenhuma NF-e ou Carga do ERP encontrada para o CPF/CNPJ deste cliente.
                        </div>
                      ) : (
                        ficha.cargas.map((cg) => (
                          <div
                            key={cg.id}
                            className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                          >
                            <div className="space-y-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="px-2 py-0.5 rounded font-mono font-bold bg-sky-50 text-[#0B63A5] dark:bg-sky-950 dark:text-sky-300">
                                  Mod. {cg.modelo_documento} · Nº {cg.numero}/{cg.serie || '1'}
                                </span>
                                <span
                                  className={clsx(
                                    'px-2 py-0.5 rounded font-semibold text-[10.5px]',
                                    cg.status === 'PENDENTE'
                                      ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                      : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  )}
                                >
                                  {cg.status}
                                </span>
                                <span className="text-slate-400">{formatDate(cg.data_emissao)}</span>
                              </div>
                              <div className="text-slate-700 dark:text-slate-300 truncate">
                                {cg.produto_predominante || 'Mercadorias diversas'} · Destino:{' '}
                                <strong>
                                  {cg.destinatario_municipio || '—'}/{cg.destinatario_uf || '—'}
                                </strong>
                              </div>
                              {cg.chave_acesso && (
                                <button
                                  type="button"
                                  onClick={() => handleCopyChave(cg.chave_acesso)}
                                  className="inline-flex items-center gap-1 font-mono text-[10.5px] text-slate-400 hover:text-[#0B63A5] cursor-pointer"
                                >
                                  {copiedKey === cg.chave_acesso ? (
                                    <Check className="w-3 h-3 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                  {cg.chave_acesso}
                                </button>
                              )}
                            </div>

                            <div className="text-right shrink-0">
                              <div className="font-mono font-bold text-slate-900 dark:text-white">
                                {formatBRL(cg.valor_total)}
                              </div>
                              <div className="text-[11px] font-mono text-slate-500">
                                {formatNum(cg.peso_bruto)} kg · {cg.volumes || 1} vol.
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {fichaTab === 'ctes' && (
                    <div className="space-y-2.5">
                      {ficha.ctes.length === 0 ? (
                        <div className="p-10 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-slate-500 text-xs">
                          Nenhum CT-e emitido figurando este cliente como Remetente, Destinatário ou Tomador.
                        </div>
                      ) : (
                        ficha.ctes.map((ct) => (
                          <div
                            key={ct.id}
                            className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                          >
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono font-bold text-slate-900 dark:text-white">
                                  CT-e #{ct.numero || ct.id} (Série {ct.serie || '1'})
                                </span>
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                  {ct.papel_cliente}
                                </span>
                                <span
                                  className={clsx(
                                    'px-2 py-0.5 rounded text-[10px] font-bold',
                                    ct.status === 'AUTORIZADO'
                                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                      : ct.status === 'REJEITADO' || ct.status === 'CANCELADO'
                                      ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                                      : 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                  )}
                                >
                                  {ct.status}
                                </span>
                              </div>
                              <div className="text-slate-600 dark:text-slate-300">
                                Percurso: <strong>{ct.municipio_inicio || ct.uf_inicio}</strong> →{' '}
                                <strong>{ct.municipio_fim || ct.uf_fim}</strong> · Emissão:{' '}
                                {formatDateTime(ct.created_at)}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-mono font-bold text-[#0B63A5] dark:text-sky-300">
                                {formatBRL(ct.valor_total)}
                              </div>
                              <button
                                type="button"
                                onClick={() => navigate('/transporte/documentos')}
                                className="text-[11px] text-slate-500 hover:text-[#0B63A5] inline-flex items-center gap-0.5 cursor-pointer"
                              >
                                Abrir em Documentos <ArrowUpRight className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {fichaTab === 'entregas' && (
                    <div className="space-y-2.5">
                      {ficha.entregas.length === 0 ? (
                        <div className="p-10 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-slate-500 text-xs">
                          Nenhuma parada de roteiro de entrega registrada para este cliente até o momento.
                        </div>
                      ) : (
                        ficha.entregas.map((ent) => (
                          <div
                            key={ent.id}
                            className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                          >
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono font-bold text-slate-900 dark:text-white">
                                  Roteiro #{ent.roteiro_id} · Parada {ent.ordem_entrega}
                                </span>
                                <span
                                  className={clsx(
                                    'px-2 py-0.5 rounded text-[10px] font-bold',
                                    ent.status_entrega === 'ENTREGUE'
                                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                      : 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                  )}
                                >
                                  {ent.status_entrega}
                                </span>
                                {ent.possui_canhoto && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
                                    Canhoto Digital Assinado
                                  </span>
                                )}
                              </div>
                              <div className="text-slate-600 dark:text-slate-300">
                                {ent.municipio || '—'}/{ent.uf || '—'}
                                {ent.recebedor_nome ? ` · Recebido por: ${ent.recebedor_nome}` : ''}
                                {ent.entregue_em ? ` em ${formatDateTime(ent.entregue_em)}` : ''}
                              </div>
                            </div>
                            <div className="text-right font-mono text-slate-700 dark:text-slate-300">
                              {formatBRL(ent.valor_produtos)}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE CADASTRO / EDIÇÃO FISCAL & TRANSPORTE */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[1px]">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200 dark:border-slate-700">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-800 z-10">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {editingId ? 'Editar Cadastro Fiscal & Logístico' : 'Novo Cliente / Embarcador'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Sincroniza com o ERP Coliseu e atualiza dados fiscais para emissão de CT-e e roteiros.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveClient} className="p-6 space-y-5 text-xs">
              {/* Bloco 1: Documento + Consulta CNPJ */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-5">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    CNPJ ou CPF *
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={form.documento}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, documento: formatCpfCnpjMask(e.target.value) }))
                      }
                      placeholder="00.000.000/0000-00"
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                    />
                    <button
                      type="button"
                      disabled={consultingCnpj}
                      onClick={handleConsultarCnpj}
                      className="px-3 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 text-[#0B63A5] border border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800 font-semibold whitespace-nowrap cursor-pointer disabled:opacity-50"
                    >
                      {consultingCnpj ? 'Buscando...' : 'Consultar CNPJ'}
                    </button>
                  </div>
                </div>

                <div className="sm:col-span-4">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Inscrição Estadual (IE)
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={form.inscricao_estadual}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase()
                        setForm((prev) => ({
                          ...prev,
                          inscricao_estadual: val,
                          indicador_ie:
                            val === 'ISENTO' ? '2' : val.replace(/\D/g, '').length >= 4 ? '1' : prev.indicador_ie,
                        }))
                      }}
                      placeholder="Ex: 281234567 ou ISENTO"
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({ ...prev, inscricao_estadual: 'ISENTO', indicador_ie: '2' }))
                      }
                      className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 text-[11px] font-semibold cursor-pointer"
                    >
                      ISENTO
                    </button>
                  </div>
                </div>

                <div className="sm:col-span-3">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Indicador IE (SEFAZ)
                  </label>
                  <select
                    value={form.indicador_ie}
                    onChange={(e) => setForm((prev) => ({ ...prev, indicador_ie: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                  >
                    <option value="1">1 — Contribuinte ICMS</option>
                    <option value="2">2 — Isento</option>
                    <option value="9">9 — Não Contribuinte</option>
                  </select>
                </div>
              </div>

              {/* Bloco 2: Razão Social, Fantasia e Região */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-6">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Razão Social / Nome Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.razao_social}
                    onChange={(e) => setForm((prev) => ({ ...prev, razao_social: e.target.value.toUpperCase() }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-6">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nome Fantasia
                  </label>
                  <input
                    type="text"
                    value={form.nome_fantasia}
                    onChange={(e) => setForm((prev) => ({ ...prev, nome_fantasia: e.target.value.toUpperCase() }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-5">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Região / Rota de Entrega
                  </label>
                  <input
                    type="text"
                    list="regioes-transporte-list"
                    value={form.classificacao}
                    onChange={(e) => setForm((prev) => ({ ...prev, classificacao: e.target.value.toUpperCase() }))}
                    placeholder="Ex: GRANDE DOURADOS, CONE SUL, ROTA 01..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                  <datalist id="regioes-transporte-list">
                    {regioesDisponiveis.map((r) => (
                      <option key={r.nome} value={r.nome} />
                    ))}
                  </datalist>
                </div>

                <div className="sm:col-span-4">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    E-mail Fiscal (Envio XML / DACTE)
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="fiscal@empresa.com.br"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Telefone / WhatsApp
                  </label>
                  <input
                    type="text"
                    value={form.telefone}
                    onChange={(e) => setForm((prev) => ({ ...prev, telefone: formatPhoneMask(e.target.value) }))}
                    placeholder="(67) 99999-9999"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              {/* Bloco 3: Endereço Fiscal Estruturado + CEP + IBGE */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-700/70 space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                  Endereço Fiscal & Município IBGE (Obrigatório SEFAZ CT-e)
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-3">
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      CEP {consultingCep && <span className="text-[#0B63A5]">(buscando...)</span>}
                    </label>
                    <input
                      type="text"
                      value={form.cep}
                      onChange={(e) => setForm((prev) => ({ ...prev, cep: formatCepMask(e.target.value) }))}
                      onBlur={(e) => handleConsultarCep(e.target.value)}
                      placeholder="00000-000"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                    />
                  </div>

                  <div className="sm:col-span-5">
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Município
                    </label>
                    <input
                      type="text"
                      value={form.cidade}
                      onChange={(e) => setForm((prev) => ({ ...prev, cidade: e.target.value.toUpperCase() }))}
                      placeholder="Ex: DOURADOS"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      UF
                    </label>
                    <select
                      value={form.estado}
                      onChange={(e) => setForm((prev) => ({ ...prev, estado: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-semibold"
                    >
                      {UFS_BRASIL.map((uf) => (
                        <option key={uf} value={uf}>
                          {uf}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Cód. IBGE
                    </label>
                    <input
                      type="text"
                      value={form.codigo_municipio}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          codigo_municipio: e.target.value.replace(/\D/g, '').slice(0, 7),
                        }))
                      }
                      placeholder="Auto"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                    />
                  </div>

                  <div className="sm:col-span-6">
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Logradouro
                    </label>
                    <input
                      type="text"
                      value={form.logradouro}
                      onChange={(e) => setForm((prev) => ({ ...prev, logradouro: e.target.value.toUpperCase() }))}
                      placeholder="Rua / Avenida / Rodovia"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Número
                    </label>
                    <input
                      type="text"
                      value={form.numero}
                      onChange={(e) => setForm((prev) => ({ ...prev, numero: e.target.value.toUpperCase() }))}
                      placeholder="S/N"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="sm:col-span-4">
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Bairro
                    </label>
                    <input
                      type="text"
                      value={form.bairro}
                      onChange={(e) => setForm((prev) => ({ ...prev, bairro: e.target.value.toUpperCase() }))}
                      placeholder="CENTRO"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Opção de sincronização automática com Partes do Transporte */}
              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200/70 dark:border-sky-800/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.sincronizar_parte}
                  onChange={(e) => setForm((prev) => ({ ...prev, sincronizar_parte: e.target.checked }))}
                  className="rounded border-slate-300 text-[#0B63A5] focus:ring-[#0B63A5]"
                />
                <span className="text-slate-800 dark:text-slate-200 font-medium">
                  Habilitar/atualizar automaticamente este cliente em <strong>Partes do Transporte</strong> (pronto para Remetente, Destinatário e Tomador no CT-e)
                </span>
              </label>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingForm}
                  className="px-5 py-2 rounded-xl bg-[#0B63A5] hover:bg-sky-800 text-white font-semibold shadow-xs disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {savingForm && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {editingId ? 'Salvar Alterações' : 'Cadastrar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
