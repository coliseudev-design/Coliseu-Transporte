import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApiQuery, useBranchPeriodQuery } from '../hooks/useApi'
import api from '../services/api'
import clsx from 'clsx'
import { useAuthStore } from '../store/authStore'
import KPICard from '../components/KPICard'
import DataTable from '../components/DataTable'
import {
  Users, UserCheck, Award, Receipt, Search, Plus, X,
  Building, Building2, ShieldCheck, RefreshCw, Phone, Mail, FileText, AlertTriangle, Shield, CheckCircle, Info, Calendar, DollarSign,
  CreditCard, ClipboardList, BookOpen, Clock, PlayCircle, MoreVertical, Eye, Edit2, Headphones,
  ChevronLeft, ChevronRight, MessageCircle, Cpu, Server, CheckCircle2, XCircle, FileCode, PlusCircle, Printer, Truck, Factory, Ban, Loader2, MapPin, Tag, Check,
  Paperclip, Trash2, ExternalLink, Download, Settings
} from 'lucide-react'
import { formatBRL, formatDate, formatNum } from '../utils/format'
import ModalEscolhaLancamento from '../components/financeiro/ModalEscolhaLancamento'
import ModalProgramacaoContas from '../components/financeiro/ModalProgramacaoContas'
import ModalLancamentoIndividual from '../components/financeiro/ModalLancamentoIndividual'
import ModalBoletoPreview from '../components/financeiro/ModalBoletoPreview'
import ModalDetalhesTitulo from '../components/financeiro/ModalDetalhesTitulo'
import ModalLiquidarTitulo from '../components/financeiro/ModalLiquidarTitulo'
import ModalConfirmacaoEmissaoBoleto from '../components/financeiro/ModalConfirmacaoEmissaoBoleto'
import ModalAnexarContrato from '../components/clientes/ModalAnexarContrato'

function getPhoneInfo(phoneStr?: string, cellStr?: string) {
  const primary = (phoneStr || cellStr || '').trim()
  const digits = primary.replace(/\D/g, '')
  if (!digits) return { formatted: '—', hasWhatsApp: false, rawDigits: '' }

  const isMobile = (digits.length === 11 && digits[2] === '9') || (digits.length === 10 && ['8','9'].includes(digits[2]))
  const isWhatsApp = digits.length >= 10 && isMobile
  const rawDigits = digits.length >= 10 && !digits.startsWith('55') ? `55${digits}` : digits

  return {
    formatted: primary,
    hasWhatsApp: isWhatsApp,
    rawDigits
  }
}

interface ClienteKPIs {
  kpis: {
    total_clientes: number;
    total_fornecedores?: number;
    total_geral?: number;
    clientes_ativos: number;
    top_cliente: string;
    top_cliente_valor: number;
    ticket_medio_por_cliente: number;
  };
  regioes?: string[];
}

interface ClienteItem {
  id: number;
  id_firebird: number | null;
  nome: string;
  razao_social?: string;
  nome_fantasia?: string;
  documento: string;
  cidade: string;
  estado: string;
  qtd_pedidos: number;
  total_gasto: number;
  ultimo_pedido: string;
  data_cadastro?: string;
  classificacao?: string;
  classe?: string;
  tipo_cliente?: string;
  responsavel_nome?: string;
  celular_secundario?: string;
  endereco_completo?: string;
  telefone?: string;
}

interface ClientesList {
  total: number;
  data: ClienteItem[];
}

const PAGE_SIZE = 200;

const formatPhoneMask = (val: string) => {
  const digits = val.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) {
    return `(${digits}`;
  }
  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)})-${digits.slice(2)}`;
  }
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)})-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)})-${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const formatCpfCnpjMask = (val: string) => {
  const digits = val.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
};

const checkIsWhatsApp = (phone?: string | null) => {
  if (!phone) return false;
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 11) {
    return clean[2] === '9';
  }
  if (clean.length === 13) {
    return clean[4] === '9';
  }
  if (clean.length === 10) {
    return ['9', '8', '7'].includes(clean[2]);
  }
  if (clean.length === 9) {
    return clean[0] === '9';
  }
  return clean.length >= 9;
};

const get150DaysAgo = () => {
  const d = new Date()
  d.setDate(d.getDate() - 150)
  return d.toISOString().split('T')[0]
}

const get60DaysAhead = () => {
  const d = new Date()
  d.setDate(d.getDate() + 60)
  return d.toISOString().split('T')[0]
}

export default function Clientes() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const canSeeFicha = user?.role === 'master' || (user?.grupo_nome && user.grupo_nome.toLowerCase() === 'master') || user?.permissoes_acoes?.permitir_ver_ficha_cliente !== false
  const canSeeTitulos = user?.role === 'master' || (user?.grupo_nome && user.grupo_nome.toLowerCase() === 'master') || user?.permissoes_acoes?.permitir_ver_titulos_cliente !== false
  const canCancelBoleto = user?.role === 'master' || (user?.grupo_nome && user.grupo_nome.toLowerCase() === 'master') || user?.permissoes_acoes?.permitir_cancelar_boletos !== false

  const [search, setSearch] = useState('')
  const [tipoEntidade, setTipoEntidade] = useState<'TODOS' | 'CLIENTE' | 'FORNECEDOR'>('CLIENTE')
  const [regiaoFilter, setRegiaoFilter] = useState('')
  const [sortField, setSortField] = useState<string>('nome')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [selectedClientRow, setSelectedClientRow] = useState<any | null>(null)
  const [selectedTituloForLog, setSelectedTituloForLog] = useState<number | null>(null)
  const [currentPage, setCurrentPage] = useState(1)

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  // Reset to first page when search or filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [search, regiaoFilter, tipoEntidade])

  // KPIs
  const kpis = useBranchPeriodQuery<ClienteKPIs>('/clientes/kpis')
  
  // Server-side search: pass search term, tipo_entidade and pagination to the backend
  const serverSearch = search
  const lista = useApiQuery<ClientesList>(
    '/clientes/lista',
    { search: serverSearch, limit: PAGE_SIZE, offset: (currentPage - 1) * PAGE_SIZE, tipo_entidade: tipoEntidade },
    { placeholderData: (prev) => prev },
  )

  const k = kpis.data?.kpis

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingClientId, setEditingClientId] = useState<number | null>(null)
  const [openActionMenuId, setOpenActionMenuId] = useState<number | null>(null)

  // Lançamento de título para cliente específico
  const [modalChoiceOpen, setModalChoiceOpen] = useState(false)
  const [modalProgramacaoOpen, setModalProgramacaoOpen] = useState(false)
  const [modalIndividualOpen, setModalIndividualOpen] = useState(false)
  const [selectedClienteForLancamento, setSelectedClienteForLancamento] = useState<{ id: string; nome: string } | undefined>()

  const [newClient, setNewClient] = useState({
    nome: '',
    nome_fantasia: '',
    documento: '',
    email: '',
    telefone: '',
    responsavel_nome: '',
    responsavel_rg: '',
    responsavel_cpf: '',
    email_financeiro: '',
    celular_secundario: '',
    regime_tributario: 'Simples Nacional',
    cidade: '',
    estado: '',
    endereco_completo: '',
    tipo_cliente: 'B2C',
    classificacao: 'Ativo',
    classe: 'VAREJO',
    observacoes: ''
  })
  const [consultingCnpj, setConsultingCnpj] = useState(false)
  const [activeClientModalTab, setActiveClientModalTab] = useState<'dados_gerais' | 'localizacao_outros'>('dados_gerais')
  const [classesClienteOptions, setClassesClienteOptions] = useState<string[]>([
    'VAREJO ROUPAS', 'VAREJO', 'ATACADO', 'DISTRIBUIDORA', 'REVENDA', 'GERAL'
  ])

  useEffect(() => {
    if (isCreateOpen) {
      api.get('/financeiro/opcoes-erp')
        .then(({ data }) => {
          if (data.classesCliente?.length) {
            setClassesClienteOptions(data.classesCliente)
          }
        })
        .catch(console.error)
    }
  }, [isCreateOpen])

  // Profile 360 state
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null)
  const [profileTab, setProfileTab] = useState<'titulos' | 'pedidos' | 'produtos' | 'relacionamento' | 'ocorrencias' | 'modulos'>('titulos')
  const [profileData, setProfileData] = useState<any>(null)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [filterStartDate, setFilterStartDate] = useState<string>(() => get150DaysAgo())
  const [filterEndDate, setFilterEndDate] = useState<string>(() => get60DaysAhead())
  const [profileStatusFilter, setProfileStatusFilter] = useState<string>('ABERTO')
  const [profileEspecieFilter, setProfileEspecieFilter] = useState<string>('TODAS')
  const [relacionamentoTipoFilter, setRelacionamentoTipoFilter] = useState<string>('TODOS')

  // ESC Key listener: Pressionar ESC fecha a Ficha 360 do Cliente / Central de Relacionamento e volta para a lista de clientes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isCreateOpen) {
          setIsCreateOpen(false)
        } else if (selectedClientId) {
          setSelectedClientId(null)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isCreateOpen, selectedClientId])

  // Occurrence addition form state (inside ocorrencias tab)
  const [newOccurrence, setNewOccurrence] = useState({
    tipo_contato: 'WhatsApp',
    observacao: '',
    operador: 'SILENUS'
  })
  const [submittingOccurrence, setSubmittingOccurrence] = useState(false)

  // Payment quitação modal (inside profile 360 financeiro tab)
  const [quitarInstallment, setQuitarInstallment] = useState<any | null>(null)
  const [quitarData, setQuitarData] = useState({
    conta_bancaria_id: '',
    forma_pagamento: 'PIX',
    data_recebimento: new Date().toISOString().split('T')[0],
    valor_recebido: 0
  })

  // Fetch accounts list for quitação dropdown
  const { data: accountsRes } = useApiQuery<{ data: any[] }>('/financeiro/contas-bancarias')
  const accounts = accountsRes?.data || [];

  // Multi-seleção de títulos no perfil 360 do cliente
  const [selectedProfileTituloIds, setSelectedProfileTituloIds] = useState<number[]>([])
  const [issuingBoleto, setIssuingBoleto] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [previewBoletoData, setPreviewBoletoData] = useState<any | null>(null)
  const [titleToEmitConfirm, setTitleToEmitConfirm] = useState<any | null>(null)

  // Batch Emission Progress States for Client Profile 360
  const [isBatchProgressModalOpen, setIsBatchProgressModalOpen] = useState(false)
  const [batchProgressCount, setBatchProgressCount] = useState(0)
  const [batchTotalCount, setBatchTotalCount] = useState(0)
  const [batchItemsDetail, setBatchItemsDetail] = useState<any[]>([])

  // Estado para Modal de Anexar Contrato Externo
  const [isAnexarContratoOpen, setIsAnexarContratoOpen] = useState(false)

  // Estados e Handlers para Gerenciamento de Módulos & Softwares
  const [isManageModulesOpen, setIsManageModulesOpen] = useState(false)
  const [savingModules, setSavingModules] = useState(false)
  const [modulesEditForm, setModulesEditForm] = useState<any>({})

  const handleToggleSingleModule = async (moduleKey: string, currentVal: boolean) => {
    if (!selectedClientId || !profileData) return
    const currentSoft = profileData.estatisticas_software || {}
    const newVal = currentVal ? 'NÃO' : 'SIM'
    const updatedSoft = {
      ...currentSoft,
      [moduleKey]: newVal
    }
    
    // Atualização otimista
    setProfileData((prev: any) => ({
      ...prev,
      estatisticas_software: updatedSoft
    }))

    try {
      await api.put(`/clientes/${selectedClientId}/modulos`, updatedSoft)
    } catch (err: any) {
      console.error('Erro ao alternar módulo:', err)
    }
  }

  const handleOpenManageModules = () => {
    const soft = profileData?.estatisticas_software || {}
    setModulesEditForm({
      ...soft,
      softwares: Array.isArray(soft.softwares) ? soft.softwares : ["COLISEU GESTAO", "APP"],
      versao_atualizacao: soft.versao_atualizacao || '2026.07.15',
      certificado_vencimento: soft.certificado_vencimento ? (soft.certificado_vencimento.includes('T') ? soft.certificado_vencimento.split('T')[0] : soft.certificado_vencimento) : ''
    })
    setIsManageModulesOpen(true)
  }

  const handleSaveModulesForm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedClientId) return
    setSavingModules(true)
    try {
      const res = await api.put(`/clientes/${selectedClientId}/modulos`, modulesEditForm)
      if (res.data?.data) {
        setProfileData((prev: any) => ({
          ...prev,
          estatisticas_software: res.data.data
        }))
      }
      setIsManageModulesOpen(false)
    } catch (err: any) {
      alert('Erro ao salvar módulos do cliente: ' + (err.response?.data?.error || err.message))
    } finally {
      setSavingModules(false)
    }
  }

  const handleViewOrDownloadContrato = async (anexoId: number) => {
    if (!profileData?.cliente?.id) return
    try {
      const res = await api.get(`/clientes/${profileData.cliente.id}/contratos-anexos/${anexoId}/download`)
      const anexo = res.data?.data
      if (!anexo || !anexo.arquivo_data) {
        alert('Não foi possível obter o arquivo do contrato.')
        return
      }

      if (anexo.arquivo_data.startsWith('data:')) {
        const win = window.open()
        if (win) {
          if (anexo.tipo_arquivo?.includes('pdf')) {
            win.document.write(`
              <html>
                <head><title>${anexo.titulo || 'Contrato Anexo'}</title></head>
                <body style="margin:0;height:100vh;background:#1e293b;">
                  <iframe src="${anexo.arquivo_data}" frameborder="0" style="border:none; width:100%; height:100%;"></iframe>
                </body>
              </html>
            `)
          } else {
            win.document.write(`
              <html>
                <head><title>${anexo.titulo || 'Contrato Anexo'}</title></head>
                <body style="margin:20px; font-family:sans-serif; text-align:center; background:#f8fafc;">
                  <h2>${anexo.titulo}</h2>
                  <img src="${anexo.arquivo_data}" style="max-width:100%; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.15);" />
                  <div style="margin-top:20px;">
                    <a href="${anexo.arquivo_data}" download="${anexo.nome_arquivo}" style="padding:10px 20px; background:#4f46e5; color:white; text-decoration:none; border-radius:6px; font-weight:bold;">Baixar Arquivo</a>
                  </div>
                </body>
              </html>
            `)
          }
        } else {
          const link = document.createElement('a')
          link.href = anexo.arquivo_data
          link.download = anexo.nome_arquivo || 'contrato.pdf'
          link.click()
        }
      } else {
        window.open(anexo.arquivo_data, '_blank')
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao carregar anexo do contrato.')
    }
  }

  const handleDeleteContratoAnexo = async (anexoId: number, titulo: string) => {
    if (!profileData?.cliente?.id) return
    if (!confirm(`Deseja realmente excluir o contrato anexado "${titulo}"?`)) return

    try {
      await api.delete(`/clientes/${profileData.cliente.id}/contratos-anexos/${anexoId}`)
      alert('Contrato anexo removido com sucesso!')
      handleRefreshProfile(profileData.cliente.id)
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao remover anexo do contrato.')
    }
  }

  const handleEmitirBoletoSingle = (item: any) => {
    setTitleToEmitConfirm({
      id: item.id,
      descricao: item.descricao || 'Mensalidade / Título Financeiro',
      valor: parseFloat(item.valor),
      data_vencimento: item.data_vencimento,
      cliente_id: profileData?.cliente?.id,
      cliente_nome: profileData?.cliente?.nome || item.cliente_nome || 'Cliente Coliseu Transporte',
      cliente_documento: profileData?.cliente?.documento || profileData?.cliente?.cpf_cnpj || item.cliente_documento || '',
      cliente_email: profileData?.cliente?.email || profileData?.cliente?.email_financeiro || item.cliente_email || '',
      cliente_telefone: profileData?.cliente?.telefone || profileData?.cliente?.celular_secundario || item.cliente_telefone || ''
    })
  }

  const handleEnviarEmailSingle = async (item: any) => {
    const targetEmail = profileData?.cliente?.email_financeiro || profileData?.cliente?.email || item.cliente_email
    if (!targetEmail) {
      alert('❌ O cliente não possui e-mail cadastrado (comercial ou financeiro).')
      return
    }
    try {
      await api.post('/email/enviar-lote-cobranca', {
        clientes: [{
          cliente_id: profileData?.cliente?.id,
          nome: profileData?.cliente?.nome || item.cliente_nome || 'Cliente',
          email: targetEmail,
          titulo_id: item.id,
          descricao: item.descricao,
          valor: item.valor,
          vencimento: item.data_vencimento,
          linkPagamento: item.asaas_bank_slip_url || item.bank_slip_url || item.pdf_url || null,
          linhaDigitavel: item.asaas_linha_digitavel || null,
          nossoNumero: item.nosso_numero || item.asaas_payment_id || null
        }]
      })
      alert(`✅ E-mail de cobrança enviado com sucesso para: ${targetEmail}`)
    } catch (err: any) {
      alert(`❌ Falha ao enviar e-mail: ${err.response?.data?.error || err.message}`)
    }
  }

  const handleEnviarWhatsAppSingle = (item: any) => {
    const phone = profileData?.cliente?.telefone || profileData?.cliente?.celular_secundario || ''
    const cleanPhone = phone.replace(/\D/g, '')
    const msg = `Olá ${profileData?.cliente?.nome || ''}! Lembramos do vencimento do título "${item.descricao || 'Título'}" no valor de ${formatBRL(item.valor)} com vencimento em ${formatDate(item.data_vencimento)}.`
    const waUrl = cleanPhone 
      ? `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`
    window.open(waUrl, '_blank')
  }

  // Handlers para ações em lote com mesma dinâmica do Gestão Financeira
  const handleEmitirBoletoLote = async () => {
    if (selectedProfileTituloIds.length === 0) return

    const selectedTitles = filteredFinanceiro.filter((t: any) => selectedProfileTituloIds.includes(t.id))
    
    const alreadyEmitted = selectedTitles.filter((t: any) =>
      (t.nosso_numero && t.nosso_numero !== '—' && t.nosso_numero.trim() !== '') || Boolean(t.asaas_payment_id)
    )

    const titlesToEmit = selectedTitles.filter((t: any) =>
      !(t.nosso_numero && t.nosso_numero !== '—' && t.nosso_numero.trim() !== '') && !Boolean(t.asaas_payment_id)
    )

    if (titlesToEmit.length === 0) {
      const names = alreadyEmitted.map((t: any) => `• #${t.id_firebird || t.id} - ${t.descricao}`).join('\n')
      alert(`⚠️ TRAVA DE SEGURANÇA:\n\nTodos os ${alreadyEmitted.length} títulos selecionados JÁ possuem boleto emitido:\n\n${names}\n\nNenhum novo boleto será gerado.`)
      return
    }

    // Se for exatamente 1 título a emitir, abre diretamente o modal com seleção de banco (Asaas / Cora)
    if (titlesToEmit.length === 1) {
      handleEmitirBoletoSingle(titlesToEmit[0])
      return
    }

    if (alreadyEmitted.length > 0) {
      const names = alreadyEmitted.map((t: any) => `• #${t.id_firebird || t.id} - ${t.descricao}`).join('\n')
      alert(`⚠️ AVISO DE EMISSÃO:\n\nOs seguintes ${alreadyEmitted.length} títulos selecionados JÁ possuem boleto emitido e serão DESCONSIDERADOS:\n\n${names}\n\nO sistema irá gerar boletos apenas para os ${titlesToEmit.length} títulos restantes sem boleto.`)
    }

    // Pergunta qual banco utilizar para o lote
    const escolheuCora = window.confirm(
      `🏦 SELEÇÃO DO BANCO EMISSOR\n\nExistem 2 bancos ativos no sistema para emissão de boletos:\n\nClique em "OK" para emitir via BANCO CORA (Conta Digital)\nou "Cancelar" para emitir via BANCO ASAAS (Principal).`
    )
    const bancoEscolhido = escolheuCora ? 'cora' : 'asaas'

    setIssuingBoleto(true)
    setIsBatchProgressModalOpen(true)
    setBatchTotalCount(titlesToEmit.length)
    setBatchProgressCount(0)
    setBatchItemsDetail([])

    let successCount = 0
    let emailCount = 0

    for (let i = 0; i < titlesToEmit.length; i++) {
      const targetTitle = titlesToEmit[i]
      const titleId = targetTitle.id
      const destEmail = profileData?.cliente?.email_financeiro || profileData?.cliente?.email || ''
      const hasValidEmail = Boolean(destEmail && destEmail.includes('@'))
      const vencStr = targetTitle?.data_vencimento ? new Date(targetTitle.data_vencimento).toLocaleDateString('pt-BR') : '—'
      const valorStr = formatBRL(targetTitle?.valor || 0)

      setBatchProgressCount(i + 1)

      try {
        const res = await api.post('/financeiro/boletos-emitidos/gerar-lote-item', {
          titulo_id: titleId,
          banco: bancoEscolhido,
          mensagem: 'Prezado cliente,\n\nSegue em anexo o seu boleto de cobrança.'
        })

        if (res.data?.success) {
          successCount++
          if (res.data.emailEnviado) emailCount++

          setBatchItemsDetail(prev => [...prev, {
            index: i + 1,
            total: selectedTitles.length,
            cliente: profileData?.cliente?.nome || targetTitle.cliente || 'Cliente',
            vencimento: vencStr,
            valor: valorStr,
            email: res.data.destEmail || destEmail || 'Não cadastrado',
            hasValidEmail,
            status: 'success',
            nossoNumero: res.data.nosso_numero,
            emailEnviado: res.data.emailEnviado
          }])
        } else {
          setBatchItemsDetail(prev => [...prev, {
            index: i + 1,
            total: selectedTitles.length,
            cliente: profileData?.cliente?.nome || targetTitle.cliente || 'Cliente',
            vencimento: vencStr,
            valor: valorStr,
            email: destEmail || 'Não cadastrado',
            hasValidEmail,
            status: 'error',
            error: res.data?.error || 'Erro desconhecido na emissão'
          }])
        }
      } catch (err: any) {
        setBatchItemsDetail(prev => [...prev, {
          index: i + 1,
          total: selectedTitles.length,
          cliente: profileData?.cliente?.nome || targetTitle.cliente || 'Cliente',
          vencimento: vencStr,
          valor: valorStr,
          email: destEmail || 'Não cadastrado',
          hasValidEmail,
          status: 'error',
          error: err.response?.data?.error || err.message || 'Falha na requisição'
        }])
      }
    }

    setIssuingBoleto(false)
    setSelectedProfileTituloIds([])
    if (selectedClientId) handleRefreshProfile(selectedClientId)
  }

  const handleEnviarEmailLote = async () => {
    if (selectedProfileTituloIds.length === 0) return
    const targetEmail = profileData?.cliente?.email_financeiro || profileData?.cliente?.email
    if (!targetEmail) {
      alert('❌ O cliente não possui e-mail cadastrado (comercial ou financeiro).')
      return
    }
    setSendingEmail(true)
    try {
      const selectedTitles = filteredFinanceiro.filter((t: any) => selectedProfileTituloIds.includes(t.id))
      await api.post('/email/enviar-lote-cobranca', {
        clientes: selectedTitles.map((t: any) => ({
          cliente_id: profileData.cliente.id,
          nome: profileData.cliente.nome,
          email: targetEmail,
          titulo_id: t.id,
          descricao: t.descricao,
          valor: t.valor,
          vencimento: t.data_vencimento,
          linkPagamento: t.asaas_bank_slip_url || t.bank_slip_url || t.pdf_url || null,
          linhaDigitavel: t.asaas_linha_digitavel || null,
          nossoNumero: t.nosso_numero || t.asaas_payment_id || null
        }))
      })
      alert(`✅ E-mail de cobrança enviado para ${targetEmail} com ${selectedTitles.length} título(s)!`)
      setSelectedProfileTituloIds([])
    } catch (err: any) {
      alert(`❌ Falha ao enviar e-mails: ${err.response?.data?.error || err.message}`)
    } finally {
      setSendingEmail(false)
    }
  }

  const handleEnviarWhatsAppLote = () => {
    if (selectedProfileTituloIds.length === 0) return
    const phone = profileData?.cliente?.telefone || profileData?.cliente?.celular_secundario || ''
    const cleanPhone = phone.replace(/\D/g, '')
    const selectedTitles = filteredFinanceiro.filter((t: any) => selectedProfileTituloIds.includes(t.id))
    const totalVal = selectedTitles.reduce((s: number, t: any) => s + parseFloat(t.valor || 0), 0)
    
    const titulosListStr = selectedTitles.map((t: any) => `• ${t.descricao || 'Título'} (Venc: ${formatDate(t.data_vencimento)}): ${formatBRL(t.valor)}`).join('\n')
    const msg = `Olá ${profileData?.cliente?.nome || ''}!\n\nSegue a relação de títulos pendentes (${selectedTitles.length} item(ns) - Total: ${formatBRL(totalVal)}):\n\n${titulosListStr}\n\nPor favor, entre em contato para maiores informações.`
    
    const waUrl = cleanPhone 
      ? `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`
    window.open(waUrl, '_blank')
  }

  // For non-nome search types, filter locally from current page data
  // For nome, search is done server-side via the query params
  // Filtered and Sorted list with column sorting
  const filteredList = useMemo(() => {
    let base = lista.data?.data || [];

    if (regiaoFilter) {
      const q = regiaoFilter.toLowerCase();
      base = base.filter(c => (c.cidade || '').toLowerCase().includes(q));
    }

    return [...base].sort((a: any, b: any) => {
      let valA = a[sortField] ?? '';
      let valB = b[sortField] ?? '';
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [lista.data, regiaoFilter, sortField, sortDir]);

  // Server provides pagination; for nome search the server already filtered.
  // For other filter types we paginate locally from the current page data.
  const paginatedList = filteredList;

  // Total items and pages come from server response
  const serverTotal = lista.data?.total ?? 0;
  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(serverTotal / PAGE_SIZE));
  }, [serverTotal]);

  // CNPJ Consult prefill trigger com API pública real
  const handleCnpjLookup = async () => {
    const doc = newClient.documento.replace(/\D/g, '');
    if (doc.length !== 14) {
      if (doc.length === 11) {
        alert('A consulta automática da Receita Federal é exclusiva para pessoas jurídicas (CNPJ com 14 dígitos). Para CPF, preencha os dados manualmente.');
      } else {
        alert('Insira um CNPJ válido com 14 dígitos para consultar.');
      }
      return;
    }

    setConsultingCnpj(true);
    try {
      let cnpjData: any = null
      try {
        const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${doc}`)
        if (res.ok) {
          cnpjData = await res.json()
        }
      } catch (err) {}

      if (!cnpjData) {
        try {
          const res = await fetch(`https://minhareceita.org/${doc}`)
          if (res.ok) {
            cnpjData = await res.json()
          }
        } catch (err) {}
      }

      if (cnpjData) {
        const razoesSocial = cnpjData.razao_social || cnpjData.nome || newClient.nome
        const fantasia = cnpjData.nome_fantasia || cnpjData.fantasia || razoesSocial
        const emailConsultado = cnpjData.email || newClient.email
        const telConsultado = cnpjData.ddd_telefone_1 || cnpjData.telefone || newClient.telefone
        const logradouro = [cnpjData.logradouro, cnpjData.numero, cnpjData.bairro].filter(Boolean).join(', ')

        setNewClient(prev => ({
          ...prev,
          documento: formatCpfCnpjMask(doc),
          nome: (razoesSocial || '').toUpperCase(),
          nome_fantasia: (fantasia || razoesSocial || '').toUpperCase(),
          email: emailConsultado || prev.email,
          email_financeiro: emailConsultado || prev.email_financeiro,
          telefone: formatPhoneMask(telConsultado || prev.telefone),
          cidade: (cnpjData.municipio || cnpjData.cidade || prev.cidade || '').toUpperCase(),
          estado: (cnpjData.uf || prev.estado || '').toUpperCase(),
          endereco_completo: (logradouro || prev.endereco_completo || '').toUpperCase()
        }))
        alert('✅ Dados do CNPJ consultados e preenchidos com sucesso!')
      } else {
        alert('Não foi possível localizar os dados deste CNPJ automaticamente. Preencha os campos manualmente.')
      }
    } catch {
      alert('Falha ao consultar CNPJ. Preencha os campos manualmente.');
    } finally {
      setConsultingCnpj(false);
    }
  };

  // Open client profile 360
  const handleOpenProfile360 = async (id: number, initialClient?: any) => {
    if (!canSeeFicha) {
      alert('⚠️ Acesso Bloqueado: O seu perfil de acesso não possui permissão para visualizar a ficha do cliente.')
      return
    }
    if (!id && !initialClient?.id && !initialClient?.id_firebird) {
      return;
    }
    const targetId = id || initialClient?.id || initialClient?.id_firebird;
    setSelectedClientId(targetId);
    setProfileTab('titulos');
    
    // Default filters: Ano vigente por padrão com títulos EM ABERTO
    const currentYear = new Date().getFullYear();
    setFilterStartDate(`${currentYear}-01-01`);
    setFilterEndDate(`${currentYear}-12-31`);
    setProfileStatusFilter('ABERTO');
    setProfileEspecieFilter('TODAS');

    if (initialClient) {
      setProfileData({
        cliente: initialClient,
        contratos: [],
        contratos_anexos: [],
        produtos: [],
        financeiro: [],
        historico: [],
        metrics: {
          ltv: 0,
          ticket_medio: 0,
          tempo_relacionamento: 1,
          contratos_ativos: 0,
          debitos_pendentes: 0
        }
      });
    }

    setLoadingProfile(true);
    try {
      const res = await api.get(`/clientes/${targetId}/detalhes-360`);
      if (res.data) {
        setProfileData(res.data);
      }
    } catch (err: any) {
      console.error('Erro ao carregar detalhes completos da ficha:', err);
      // Se não tínhamos dados iniciais do cliente, notifica o usuário
      if (!initialClient) {
        alert(err.response?.data?.error || err.message || 'Erro ao carregar os dados da ficha do cliente.');
        setSelectedClientId(null);
      }
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleRefreshProfile = async (id: number) => {
    try {
      const res = await api.get(`/clientes/${id}/detalhes-360`);
      setProfileData(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  // Trigger editing state and populate form values
  const handleEditClient = (c: any) => {
    setIsEditing(true);
    setEditingClientId(c.id);
    setNewClient({
      nome: c.nome || c.razao_social || '',
      nome_fantasia: (c.nome_fantasia && c.nome_fantasia !== c.nome && c.nome_fantasia !== c.razao_social) ? c.nome_fantasia : (c.fantasia || ''),
      documento: formatCpfCnpjMask(c.documento || ''),
      email: c.email || c.email_principal || c.email_comercial || '',
      telefone: formatPhoneMask(c.telefone || c.fone || ''),
      responsavel_nome: c.responsavel_nome || c.responsavel || c.contato || '',
      responsavel_rg: c.responsavel_rg || c.rg || '',
      responsavel_cpf: c.responsavel_cpf || '',
      email_financeiro: c.email_financeiro || c.email_fatura || c.email_financ || c.email_cobranca || '',
      celular_secundario: formatPhoneMask(c.celular_secundario || ''),
      regime_tributario: c.regime_tributario || 'Simples Nacional',
      cidade: c.cidade || '',
      estado: c.estado || '',
      endereco_completo: c.endereco_completo || '',
      tipo_cliente: (() => {
        const rawTipo = (c.tipo_cliente || c.tipo_entidade || '').toUpperCase();
        if (rawTipo.includes('FORNECEDOR') || c.tipo_entidade === 'FORNECEDOR') return 'FORNECEDOR';
        if (rawTipo.includes('FUNCIONARIO') || rawTipo.includes('COLABORADOR') || rawTipo.includes('EMPREGADO')) return 'FUNCIONARIO';
        if (rawTipo.includes('PARCEIRO')) return 'PARCEIRO';
        return 'CLIENTE';
      })(),
      classificacao: c.classificacao || 'Ativo',
      classe: c.classe || c.CLASSE || c.ramo || c.ramo_atividade || c.classe_cliente || 'VAREJO',
      observacoes: c.observacoes || ''
    });
    setIsCreateOpen(true);
  };

  // Submit client (handles both create and edit)
  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...newClient,
        documento: formatCpfCnpjMask(newClient.documento || ''),
        telefone: formatPhoneMask(newClient.telefone || ''),
        celular_secundario: formatPhoneMask(newClient.celular_secundario || '')
      };
      if (isEditing && editingClientId) {
        await api.put(`/clientes/${editingClientId}`, payload);
      } else {
        await api.post('/clientes', payload);
      }
      setIsCreateOpen(false);
      setIsEditing(false);
      setEditingClientId(null);
      setNewClient({
        nome: '',
        nome_fantasia: '',
        documento: '',
        email: '',
        telefone: '',
        responsavel_nome: '',
        responsavel_rg: '',
        responsavel_cpf: '',
        email_financeiro: '',
        celular_secundario: '',
        regime_tributario: 'Simples Nacional',
        cidade: '',
        estado: '',
        endereco_completo: '',
        tipo_cliente: 'B2C',
        classificacao: 'Ativo',
        classe: 'VAREJO',
        observacoes: ''
      });
      lista.refetch();
      kpis.refetch();
      if (selectedClientId) {
        handleRefreshProfile(selectedClientId);
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar cadastro do cliente.');
    }
  };

  // Submit Payment Quitação
  const handleQuitarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quitarInstallment || !selectedClientId) return;
    try {
      await api.post('/financeiro/quitacao', {
        financeiro_id: quitarInstallment.id,
        conta_bancaria_id: quitarData.conta_bancaria_id,
        forma_pagamento: quitarData.forma_pagamento,
        data_recebimento: quitarData.data_recebimento,
        valor_recebido: quitarData.valor_recebido
      });
      setQuitarInstallment(null);
      handleRefreshProfile(selectedClientId);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro na quitação.');
    }
  };

  // Submit Manual Occurrence Contact Log
  const handleOccurrenceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId || !newOccurrence.observacao.trim()) return;

    // Use client's first active title/receivable to anchor the occurrence logs
    const titleId = profileData?.financeiro?.[0]?.id;
    if (!titleId) {
      alert('É necessário ter ao menos um título cadastrado para registrar ocorrências.');
      return;
    }

    setSubmittingOccurrence(true);
    try {
      await api.post(`/cobranca/titulos/${titleId}/ocorrencias`, {
        tipo_contato: newOccurrence.tipo_contato,
        observacao: newOccurrence.observacao,
        operador: newOccurrence.operador
      });
      setNewOccurrence(prev => ({ ...prev, observacao: '' }));
      handleRefreshProfile(selectedClientId);
      alert('Histórico de relacionamento adicionado!');
    } catch (err) {
      console.error(err);
      alert('Erro ao registrar contato.');
    } finally {
      setSubmittingOccurrence(false);
    }
  };

  // Filtros de Data para Abas do Painel 360
  const especiesOptions = useMemo(() => {
    const list = profileData?.financeiro || []
    const set = new Set<string>(['BOLETO', 'DUPLICATA', 'NOTA', 'PIX'])
    list.forEach((item: any) => {
      const esp = item.especie || item.especie_nome
      if (esp && esp.trim()) set.add(esp.trim().toUpperCase())
    })
    return Array.from(set).sort()
  }, [profileData?.financeiro])

  const filteredFinanceiro = useMemo(() => {
    let list = profileData?.financeiro || []
    const todayStr = new Date().toISOString().split('T')[0]

    // Filter by Status (ABERTO vs PAGO)
    if (profileStatusFilter === 'ABERTO') {
      list = list.filter((item: any) => {
        const statusClean = (item.status_pagamento || '').trim().toUpperCase()
        const isPaid = statusClean === 'PAGO' || (parseFloat(item.valor_pago) || 0) >= parseFloat(item.valor)
        return !isPaid
      })
    } else if (profileStatusFilter === 'PAGO') {
      list = list.filter((item: any) => {
        const statusClean = (item.status_pagamento || '').trim().toUpperCase()
        const isPaid = statusClean === 'PAGO' || (parseFloat(item.valor_pago) || 0) >= parseFloat(item.valor)
        return isPaid
      })
    }

    // Filter by Date (títulos em atraso no filtro ABERTO permanecem visíveis para não ocultar inadimplência)
    if (filterStartDate) {
      list = list.filter((item: any) => {
        const itemDate = item.data_emissao ? item.data_emissao.split(/[T ]/)[0] : ''
        const vencDate = item.data_vencimento ? item.data_vencimento.split(/[T ]/)[0] : ''
        const isOverdue = profileStatusFilter === 'ABERTO' && vencDate && vencDate < todayStr
        return isOverdue || (itemDate && itemDate >= filterStartDate) || (vencDate && vencDate >= filterStartDate)
      })
    }
    if (filterEndDate) {
      list = list.filter((item: any) => {
        const itemDate = item.data_emissao ? item.data_emissao.split(/[T ]/)[0] : ''
        const vencDate = item.data_vencimento ? item.data_vencimento.split(/[T ]/)[0] : ''
        return (itemDate && itemDate <= filterEndDate) || (vencDate && vencDate <= filterEndDate)
      })
    }
    // Filter by Species
    if (profileEspecieFilter !== 'TODAS') {
      const selectedEsp = profileEspecieFilter.trim().toUpperCase()
      list = list.filter((item: any) => {
        const itemEsp = (item.especie || item.especie_nome || 'BOLETO').trim().toUpperCase()
        return itemEsp.includes(selectedEsp) || selectedEsp.includes(itemEsp)
      })
    }
    // Ordenação:
    // Se o filtro selecionado for 'PAGO', traz as quitações mais recentes primeiro (data_pagamento DESC)
    if (profileStatusFilter === 'PAGO') {
      return [...list].sort((a: any, b: any) => {
        const aPagDate = a.data_pagamento ? a.data_pagamento.split(/[T ]/)[0] : ''
        const bPagDate = b.data_pagamento ? b.data_pagamento.split(/[T ]/)[0] : ''
        if (aPagDate && bPagDate && aPagDate !== bPagDate) {
          return bPagDate.localeCompare(aPagDate) // Mais recente primeiro (DESC)
        }
        if (aPagDate && !bPagDate) return -1
        if (!aPagDate && bPagDate) return 1

        const aVencDate = a.data_vencimento ? a.data_vencimento.split(/[T ]/)[0] : ''
        const bVencDate = b.data_vencimento ? b.data_vencimento.split(/[T ]/)[0] : ''
        if (aVencDate !== bVencDate) {
          return (bVencDate || '').localeCompare(aVencDate || '') // Vencimento DESC
        }
        return (b.id || 0) - (a.id || 0)
      })
    }

    // Para outros filtros (ABERTO ou TODOS):
    // 1. Títulos VENCIDOS têm prioridade máxima no topo (mais antigos primeiro para cobrança)
    // 2. Títulos ABERTOS vêm a seguir (vencimento mais próximo primeiro)
    // 3. Títulos PAGOS vêm no final (mais recentes primeiro)
    return [...list].sort((a: any, b: any) => {
      const aStatus = (a.status_pagamento || '').trim().toUpperCase()
      const bStatus = (b.status_pagamento || '').trim().toUpperCase()

      const aPaid = aStatus === 'PAGO' || (a.valor_pago || 0) >= a.valor
      const bPaid = bStatus === 'PAGO' || (b.valor_pago || 0) >= b.valor

      const aVencDate = a.data_vencimento ? a.data_vencimento.split(/[T ]/)[0] : ''
      const bVencDate = b.data_vencimento ? b.data_vencimento.split(/[T ]/)[0] : ''

      const aOverdue = !aPaid && aVencDate && aVencDate < todayStr
      const bOverdue = !bPaid && bVencDate && bVencDate < todayStr

      // 1. Títulos VENCIDOS têm prioridade máxima no topo
      if (aOverdue && !bOverdue) return -1
      if (!aOverdue && bOverdue) return 1

      // 2. Títulos ABERTOS vêm antes dos PAGOS
      if (!aPaid && bPaid) return -1
      if (aPaid && !bPaid) return 1

      // Se ambos são pagos, traz a quitação mais recente primeiro
      if (aPaid && bPaid) {
        const aPagDate = a.data_pagamento ? a.data_pagamento.split(/[T ]/)[0] : ''
        const bPagDate = b.data_pagamento ? b.data_pagamento.split(/[T ]/)[0] : ''
        if (aPagDate && bPagDate && aPagDate !== bPagDate) {
          return bPagDate.localeCompare(aPagDate)
        }
        return (bVencDate || '').localeCompare(aVencDate || '')
      }

      // 3. Dentro do mesmo grupo aberto/vencido, ordena pelo vencimento mais próximo (ASC)
      return (aVencDate || '').localeCompare(bVencDate || '')
    })
  }, [profileData?.financeiro, filterStartDate, filterEndDate, profileStatusFilter, profileEspecieFilter])

  const debitosPendentesCalculados = useMemo(() => {
    const list = profileData?.financeiro || []
    const todayStr = new Date().toISOString().split('T')[0]
    return list
      .filter((f: any) => {
        const status = (f.status_pagamento || '').trim().toUpperCase()
        const isCanceled = status.includes('CANCEL') || status.includes('ESTORN') || Boolean(f.data_cancelamento)
        const isPaid = status === 'PAGO' || (parseFloat(f.valor_pago) || 0) >= parseFloat(f.valor)
        const isReceber = !f.tipo || String(f.tipo).toUpperCase() === 'RECEBER'
        const vencStr = f.data_vencimento ? f.data_vencimento.split(/[T ]/)[0] : ''
        return isReceber && !isCanceled && !isPaid && vencStr && vencStr < todayStr
      })
      .reduce((sum: number, f: any) => sum + (parseFloat(f.valor || 0) - (parseFloat(f.valor_pago || 0))), 0)
  }, [profileData?.financeiro])

  const filteredContratos = useMemo(() => {
    let list = profileData?.contratos || []
    if (filterStartDate) {
      list = list.filter((item: any) => {
        const itemDate = item.created_at ? item.created_at.split(/[T ]/)[0] : ''
        return itemDate && itemDate >= filterStartDate
      })
    }
    if (filterEndDate) {
      list = list.filter((item: any) => {
        const itemDate = item.created_at ? item.created_at.split(/[T ]/)[0] : ''
        return itemDate && itemDate <= filterEndDate
      })
    }
    return list
  }, [profileData?.contratos, filterStartDate, filterEndDate])

  const filteredHistorico = useMemo(() => {
    let list = profileData?.historico || []
    if (filterStartDate) {
      list = list.filter((log: any) => {
        const logDate = log.data_envio ? log.data_envio.split(/[T ]/)[0] : ''
        return logDate && logDate >= filterStartDate
      })
    }
    if (filterEndDate) {
      list = list.filter((log: any) => {
        const logDate = log.data_envio ? log.data_envio.split(/[T ]/)[0] : ''
        return logDate && logDate <= filterEndDate
      })
    }
    if (relacionamentoTipoFilter !== 'TODOS') {
      list = list.filter((log: any) => (log.tipo_contato || '').toUpperCase() === relacionamentoTipoFilter.toUpperCase())
    }
    return list
  }, [profileData?.historico, filterStartDate, filterEndDate, relacionamentoTipoFilter])

  return (
    <div className="space-y-4 sm:space-y-6">
      
      {selectedClientId && profileData ? (
        
        <div className="card w-full !p-2 bg-bg-primary flex flex-col animate-scale-up border border-divider h-[calc(100vh-80px)] max-h-[calc(100vh-80px)] overflow-hidden">
          
          {/* ═══════════════════════════════════════════════════════════════════════════════
              FICHA DO CLIENTE ULTRA-COMPACTA (CÓDIGO ANTES DO NOME, ABAS PILULARES E TABELA ROLÁVEL)
          ═══════════════════════════════════════════════════════════════════════════════ */}
          
          {/* TOPO DA FICHA: Voltar + Código + Ícone + Nome em Destaque à Esquerda + Emblem no Canto Direito */}
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-divider">
            {/* ESQUERDA: Voltar + Código + Ícone + Nome do Cliente + Fantasia + Editar + Metadados */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setSelectedClientId(null)}
                className="btn-secondary !py-1 !px-2.5 font-extrabold flex items-center gap-1 text-[11px] shadow-2xs hover:bg-slate-200 dark:hover:bg-slate-800 transition-all cursor-pointer rounded-lg"
              >
                <ChevronLeft size={14} /> Voltar
              </button>

              {/* CÓDIGO DO CLIENTE (#1362) */}
              <span className="px-2.5 py-1 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-lg text-xs font-mono font-black shadow-xs tracking-wide">
                #{profileData.cliente.id_firebird || profileData.cliente.id}
              </span>

              {/* ÍCONE AO LADO DO NOME + NOME DESTACADO DO CLIENTE */}
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-2xs">
                  <Building2 size={16} />
                </div>
                <h2 className="text-base font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                  <span className="bg-gradient-to-r from-slate-900 to-indigo-950 dark:from-white dark:to-indigo-200 bg-clip-text text-transparent">
                    {profileData.cliente.nome}
                  </span>
                  {profileData.cliente.nome_fantasia && profileData.cliente.nome_fantasia !== profileData.cliente.nome && (
                    <span className="text-indigo-700 dark:text-indigo-300 font-extrabold text-xs bg-indigo-50 dark:bg-indigo-950/80 px-2 py-0.5 rounded-md border border-indigo-200/80 dark:border-indigo-800/80 shadow-2xs">
                      ({profileData.cliente.nome_fantasia})
                    </span>
                  )}
                </h2>
              </div>

              {/* BOTÃO EDITAR CADASTRO */}
              <button 
                onClick={() => handleEditClient(profileData.cliente)}
                className="px-2 py-1 bg-slate-100 hover:bg-indigo-50 text-indigo-700 dark:bg-slate-800 dark:hover:bg-indigo-950 dark:text-indigo-300 border border-slate-300 dark:border-slate-700 hover:border-indigo-300 rounded-lg text-[10.5px] font-bold flex items-center gap-1 cursor-pointer transition-colors ml-1"
                title="Editar Cadastro do Cliente"
              >
                <Edit2 size={11} /> Editar Cadastro
              </button>

              {/* METADADOS (DESDE E CIDADE) */}
              <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400 pl-1.5 border-l border-slate-200 dark:border-slate-800">
                {profileData.cliente.data_cadastro && (
                  <span>Desde: <strong className="text-slate-700 dark:text-slate-300">{new Date(profileData.cliente.data_cadastro).toLocaleDateString('pt-BR')}</strong></span>
                )}
                {profileData.cliente.cidade && (
                  <span>• Cidade: <strong className="text-slate-700 dark:text-slate-300">{profileData.cliente.cidade}{profileData.cliente.uf ? ` - ${profileData.cliente.uf}` : profileData.cliente.cidade === 'PONTA PORÃ' ? ' - MS' : ''}</strong></span>
                )}
              </div>
            </div>

            {/* DIREITA: EMBLEM IMPACTANTE DA FICHA 360 DO CLIENTE */}
            <div className="flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white rounded-xl shadow-md border border-indigo-500/30">
              <div className="w-6.5 h-6.5 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shadow-inner">
                <ShieldCheck size={16} className="text-indigo-300" />
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] font-black uppercase tracking-wider text-indigo-100 flex items-center gap-1">
                  FICHA 360º DO CLIENTE
                </span>
                <span className="text-[9px] font-extrabold text-indigo-300/80 tracking-tight">
                  VISÃO INTEGRADA COMPLETA
                </span>
              </div>
            </div>
          </div>

          {/* Alerta de Inadimplência se houver parcelas atrasadas */}
          {debitosPendentesCalculados > 0 && (
            <div className="shrink-0 p-1.5 my-0.5 bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400 rounded-lg text-[11px] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="shrink-0 text-red-600 animate-pulse" />
                <span>
                  <strong>Alerta de Inadimplência:</strong> Parcelas em atraso totalizando <strong>{formatBRL(debitosPendentesCalculados)}</strong>.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFilterStartDate('');
                  setFilterEndDate('');
                  setProfileStatusFilter('ABERTO');
                }}
                className="px-2 py-0.5 text-[10px] font-extrabold bg-red-600 hover:bg-red-700 text-white rounded transition-colors cursor-pointer shrink-0"
                title="Limpar restrição de datas para exibir todos os títulos em aberto"
              >
                Ver no Histórico Completo
              </button>
            </div>
          )}

          {/* FILTROS COMPACTOS DE PERÍODO & BARRA DE ABAS MODERNAS */}
          <div className="shrink-0 py-0.5 space-y-1">
            
            {/* FILTROS DE PERÍODO E STATUS COMPACTOS */}
            <div className="flex flex-wrap items-center gap-2 p-1 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-lg text-xs">
              <span className="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[10px] flex items-center gap-1">
                <Calendar size={12} className="text-indigo-600" />
                Período:
              </span>
              <div className="flex items-center gap-1">
                <label className="text-slate-500 text-[10px] uppercase font-bold">De:</label>
                <input
                  type="date"
                  className="input !py-0.5 !px-1.5 w-30 font-semibold text-[11px] rounded-md"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-slate-500 text-[10px] uppercase font-bold">Até:</label>
                <input
                  type="date"
                  className="input !py-0.5 !px-1.5 w-30 font-semibold text-[11px] rounded-md"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                />
              </div>

              {/* ATALHOS RÁPIDOS DE DATA */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    setFilterStartDate(`${now.getFullYear()}-01-01`);
                    setFilterEndDate(`${now.getFullYear()}-12-31`);
                  }}
                  className="px-2 py-0.5 text-[10px] font-bold bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 rounded text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                  title="Filtrar ano corrente"
                >
                  Este Ano
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const past = new Date();
                    past.setFullYear(now.getFullYear() - 1);
                    setFilterStartDate(past.toISOString().split('T')[0]);
                    setFilterEndDate(now.toISOString().split('T')[0]);
                  }}
                  className="px-2 py-0.5 text-[10px] font-bold bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 rounded text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                  title="Últimos 12 meses"
                >
                  Últimos 12M
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilterStartDate('');
                    setFilterEndDate('');
                  }}
                  className="px-2 py-0.5 text-[10px] font-bold bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded transition-colors cursor-pointer"
                  title="Ver todo o histórico sem corte de data"
                >
                  Histórico Completo
                </button>
              </div>

              <div className="flex items-center gap-1">
                <label className="text-slate-500 text-[10px] uppercase font-bold">Status:</label>
                <select
                  className="input !py-0.5 !px-1.5 w-32 font-bold text-[11px] border border-slate-300 dark:border-slate-700 rounded-md"
                  value={profileStatusFilter}
                  onChange={(e) => setProfileStatusFilter(e.target.value)}
                >
                  <option value="TODOS">Todos os Status</option>
                  <option value="ABERTO">Em Aberto</option>
                  <option value="PAGO">Pago</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <label className="text-slate-500 text-[10px] uppercase font-bold">Espécie:</label>
                <select
                  className="input !py-0.5 !px-1.5 w-26 font-semibold text-[11px] border border-slate-300 dark:border-slate-700 rounded-md"
                  value={profileEspecieFilter}
                  onChange={(e) => setProfileEspecieFilter(e.target.value)}
                >
                  <option value="TODAS">Todas</option>
                  {especiesOptions.map(esp => (
                    <option key={esp} value={esp}>{esp}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* ABAS MODERNAS PÍLULAS FIXADAS NO TOPO (STICKY TOP) */}
            <div className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 -mx-2 px-2 py-0.5 flex items-center gap-1.5 overflow-x-auto scrollbar-none shadow-2xs">
              {[
                { id: 'titulos', label: 'Títulos e Faturas', icon: DollarSign, color: 'text-emerald-600 dark:text-emerald-400' },
                { id: 'pedidos', label: 'Pedidos / Propostas & Contratos', icon: ClipboardList, color: 'text-blue-600 dark:text-blue-400' },
                { id: 'produtos', label: 'Produtos & Serviços', icon: BookOpen, color: 'text-purple-600 dark:text-purple-400' },
                { id: 'modulos', label: 'Módulos & Software', icon: Cpu, color: 'text-amber-600 dark:text-amber-400' },
                { id: 'relacionamento', label: 'Relacionamento & Atendimentos', icon: Headphones, color: 'text-indigo-600 dark:text-indigo-400' },
              ].map(tab => {
                const Icon = tab.icon;
                const isActive = profileTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setProfileTab(tab.id as any)}
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-1 text-xs font-black transition-all rounded-xl whitespace-nowrap cursor-pointer border',
                      isActive 
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                    )}
                  >
                    <Icon size={14} className={isActive ? 'text-white' : tab.color} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CONTEÚDO DAS ABAS */}
          <div className="py-1 flex-1 min-h-0 flex flex-col overflow-hidden">
            {profileTab === 'titulos' && (
              <div className="flex-1 min-h-0 flex flex-col justify-between overflow-hidden gap-1.5 animate-fade-in">
                
                {/* TABELA DE TÍTULOS DO CLIENTE EM COLUNAS COM PORTADOR E NOSSO NÚMERO */}
                <div className="card !p-0 overflow-hidden border border-slate-300 dark:border-slate-800 shadow-xs rounded-xl flex-1 min-h-0 flex flex-col">
                  <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0 scrollbar-thin" style={{ WebkitOverflowScrolling: 'touch' }}>
                    <table className="w-full text-xs border-collapse text-left">
                      <thead className="bg-slate-200/90 dark:bg-slate-800/90 border-b-2 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-extrabold uppercase text-[11px] sticky top-0 z-20">
                        <tr>
                          <th className="px-2.5 py-1.5 text-center w-8 border-r border-slate-300 dark:border-slate-700 shrink-0">
                            <input
                              type="checkbox"
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              checked={filteredFinanceiro.length > 0 && filteredFinanceiro.every((item: any) => selectedProfileTituloIds.includes(item.id))}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedProfileTituloIds(filteredFinanceiro.map((item: any) => item.id))
                                } else {
                                  setSelectedProfileTituloIds([])
                                }
                              }}
                            />
                          </th>
                          <th className="px-2.5 py-1.5 border-r border-slate-300 dark:border-slate-700 whitespace-nowrap shrink-0">CÓDIGO</th>
                          <th className="px-2.5 py-1.5 border-r border-slate-300 dark:border-slate-700 min-w-[160px] shrink-0">DESCRIÇÃO / PARCELA</th>
                          <th className="px-2.5 py-1.5 border-r border-slate-300 dark:border-slate-700 whitespace-nowrap shrink-0">{profileStatusFilter === 'PAGO' ? 'VENCIMENTO' : 'EMISSÃO'}</th>
                          <th className="px-2.5 py-1.5 border-r border-slate-300 dark:border-slate-700 whitespace-nowrap shrink-0">
                            {profileStatusFilter === 'PAGO' ? 'DATA PAGAMENTO' : 'VENCIMENTO'}
                          </th>
                          <th className="px-2.5 py-1.5 text-right border-r border-slate-300 dark:border-slate-700 whitespace-nowrap shrink-0">VALOR TÍTULO</th>
                          <th className="px-2.5 py-1.5 text-right border-r border-slate-300 dark:border-slate-700 whitespace-nowrap shrink-0">VALOR PAGO</th>
                          <th className="px-2.5 py-1.5 text-center border-r border-slate-300 dark:border-slate-700 whitespace-nowrap shrink-0">ESPÉCIE</th>
                          <th className="px-2.5 py-1.5 border-r border-slate-300 dark:border-slate-700 whitespace-nowrap shrink-0">PORTADOR</th>
                          <th className="px-2.5 py-1.5 border-r border-slate-300 dark:border-slate-700 whitespace-nowrap shrink-0">NOSSO Nº</th>
                          <th className="px-2.5 py-1.5 text-center whitespace-nowrap shrink-0">SITUAÇÃO</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                        {filteredFinanceiro.length === 0 ? (
                          <tr>
                            <td colSpan={11} className="py-6 text-center text-slate-400 italic font-medium">Nenhum título encontrado para o período filtrado.</td>
                          </tr>
                        ) : (
                          filteredFinanceiro.map((item: any, i: number) => {
                            const isPaid = item.status_pagamento === 'PAGO' || (item.valor_pago || 0) >= item.valor
                            const itemVencStr = item.data_vencimento ? item.data_vencimento.split(/[T ]/)[0] : ''
                            const todayStr = new Date().toISOString().split('T')[0]
                            const isVencida = !isPaid && itemVencStr && itemVencStr < todayStr
                            const statusText = isPaid ? 'PAGO' : isVencida ? 'VENCIDA' : 'ABERTO'
                            const isSelected = selectedProfileTituloIds.includes(item.id)

                            return (
                              <tr 
                                key={i}
                                onDoubleClick={() => setSelectedTituloForLog(item.id)}
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedProfileTituloIds(prev => prev.filter(id => id !== item.id))
                                  } else {
                                    setSelectedProfileTituloIds(prev => [...prev, item.id])
                                  }
                                }}
                                className={clsx(
                                  'cursor-pointer transition-all duration-150 text-[11px]',
                                  isSelected 
                                    ? 'bg-indigo-600 text-white dark:bg-indigo-700 dark:text-white font-black border-l-4 border-l-amber-400 shadow-md' 
                                    : isVencida 
                                      ? 'bg-red-100/80 hover:bg-red-200/90 dark:bg-red-950/60 text-red-950 dark:text-red-100 font-bold border-l-4 border-l-red-600' 
                                      : isPaid
                                        ? 'bg-emerald-50/30 hover:bg-emerald-50/60 dark:bg-emerald-950/20'
                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                                )}
                              >
                                <td className="px-2.5 py-1.5 text-center border-r border-slate-200 dark:border-slate-800 shrink-0" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-3.5 w-3.5"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedProfileTituloIds(prev => [...prev, item.id])
                                      } else {
                                        setSelectedProfileTituloIds(prev => prev.filter(id => id !== item.id))
                                      }
                                    }}
                                  />
                                </td>
                                
                                {/* Código / Nº Título */}
                                <td className={clsx(
                                  "px-2.5 py-1.5 font-mono font-bold border-r border-slate-200 dark:border-slate-800 whitespace-nowrap shrink-0",
                                  isSelected ? "text-amber-300 font-black" : isVencida ? "text-red-700 dark:text-red-300 font-black" : "text-indigo-600 dark:text-indigo-400"
                                )}>
                                  #{item.id_firebird || item.id}
                                </td>

                                {/* Descrição / Parcela */}
                                <td className={clsx(
                                  "px-2.5 py-1.5 font-bold border-r border-slate-200 dark:border-slate-800 min-w-[160px] truncate shrink-0",
                                  isSelected ? "text-white" : "text-slate-900 dark:text-slate-100"
                                )} title={item.descricao}>
                                  {item.descricao || 'Duplicata / Título Financeiro'}
                                </td>

                                {/* Emissão (quando pago: mostra vencimento original) */}
                                <td className={clsx(
                                  "px-2.5 py-1.5 font-mono border-r border-slate-200 dark:border-slate-800 whitespace-nowrap shrink-0",
                                  isSelected ? "text-indigo-100 font-bold" : "text-slate-600 dark:text-slate-400"
                                )}>
                                  {isPaid ? formatDate(item.data_vencimento) : formatDate(item.data_emissao)}
                                </td>

                                {/* Vencimento / Data Pagamento */}
                                <td className={clsx(
                                  "px-2.5 py-1.5 font-mono font-bold border-r border-slate-200 dark:border-slate-800 whitespace-nowrap shrink-0",
                                  isSelected ? "text-amber-300 font-black" : isVencida ? "text-red-700 dark:text-red-300 font-black" : "text-slate-800 dark:text-slate-200"
                                )}>
                                  {isPaid 
                                    ? formatDate(item.data_pagamento || item.data_vencimento)
                                    : formatDate(item.data_vencimento)
                                  }
                                </td>

                                {/* Valor Título */}
                                <td className={clsx(
                                  "px-2.5 py-1.5 text-right font-mono font-black border-r border-slate-200 dark:border-slate-800 whitespace-nowrap shrink-0",
                                  isSelected ? "text-white" : "text-slate-900 dark:text-slate-100"
                                )}>
                                  {formatBRL(item.valor)}
                                </td>

                                {/* Valor Pago */}
                                <td className={clsx(
                                  "px-2.5 py-1.5 text-right font-mono font-semibold border-r border-slate-200 dark:border-slate-800 whitespace-nowrap shrink-0",
                                  isSelected ? "text-indigo-100 font-bold" : "text-slate-600 dark:text-slate-400"
                                )}>
                                  {formatBRL(item.valor_pago || 0)}
                                </td>

                                {/* Espécie */}
                                <td className="px-2.5 py-1.5 text-center border-r border-slate-200 dark:border-slate-800 whitespace-nowrap shrink-0">
                                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded border uppercase bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300">
                                    {item.especie || 'BOLETO'}
                                  </span>
                                </td>

                                {/* Portador */}
                                <td className="px-2.5 py-1.5 text-[10.5px] font-bold uppercase border-r border-slate-200 dark:border-slate-800 whitespace-nowrap shrink-0">
                                  <span className={clsx(
                                    "px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase border",
                                    (item.portador || item.portador_nome || '').toLowerCase().includes('cora')
                                      ? "bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950 dark:text-pink-300"
                                      : (item.portador || item.portador_nome || '').toLowerCase().includes('asaas')
                                      ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300"
                                      : (item.portador || item.portador_nome || '').toLowerCase().includes('banco')
                                      ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300"
                                      : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"
                                  )}>
                                    {item.portador || item.portador_nome || (item.asaas_payment_id ? 'Asaas' : 'Carteira')}
                                  </span>
                                </td>

                                {/* Nosso Número & Boleto Emitido com opção de Cancelar */}
                                <td className="px-2.5 py-1.5 font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap shrink-0">
                                  <div className="flex items-center justify-between gap-1.5">
                                    <span>{item.nosso_numero || item.asaas_payment_id || '—'}</span>
                                    {(item.nosso_numero || item.asaas_payment_id) && canCancelBoleto && (
                                      <button
                                        type="button"
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          if (!confirm(`Deseja cancelar o boleto (Nosso Nº ${item.nosso_numero || item.asaas_payment_id})?\n\nIsso registrará o cancelamento no log e manterá o título em aberto.`)) return;
                                          try {
                                            await api.post(`/financeiro/titulos/${item.id}/desvincular-boleto`);
                                            alert('Boleto cancelado com sucesso!');
                                            if (selectedClientId) handleRefreshProfile(selectedClientId);
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

                                {/* Situação / Status */}
                                <td className="px-2.5 py-1.5 text-center whitespace-nowrap shrink-0">
                                  <span className={clsx(
                                    'text-[9.5px] font-black uppercase px-2 py-0.5 rounded-full flex items-center justify-center gap-1 w-max mx-auto shadow-2xs border',
                                    isPaid 
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300' 
                                      : isVencida 
                                        ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 animate-pulse' 
                                        : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300'
                                  )}>
                                    {isPaid && <CheckCircle size={10} />}
                                    {isVencida && <AlertTriangle size={10} />}
                                    {!isPaid && !isVencida && <Clock size={10} />}
                                    {statusText}
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

                {/* BARRA FIXA NO RODAPÉ EM 1 ÚNICA LINHA REFINADA */}
                <div className="shrink-0 z-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 shadow-lg flex flex-nowrap items-center justify-between gap-2 rounded-xl overflow-x-auto">
                  
                  {/* ESQUERDA: BOTÕES ULTRA-COMPACTOS DE AÇÃO DO CLIENTE E OPERAÇÃO */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    
                    {/* BOTÕES DO CLIENTE */}
                    <button 
                      onClick={() => {
                        if (profileData?.cliente) {
                          setSelectedClienteForLancamento({
                            id: String(profileData.cliente.id_firebird || profileData.cliente.id),
                            nome: profileData.cliente.nome
                          });
                          setModalChoiceOpen(true);
                        }
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-[11px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-2xs shrink-0 cursor-pointer"
                    >
                      <PlusCircle size={13} /> + Título
                    </button>

                    <button 
                      onClick={() => {
                        const selectedItem = filteredFinanceiro.find((t: any) => selectedProfileTituloIds.includes(t.id)) || filteredFinanceiro[0];
                        if (selectedItem) setSelectedTituloForLog(selectedItem.id);
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-extrabold px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-2xs shrink-0 cursor-pointer"
                      title="Visualizar e Editar Detalhes do Título Selecionado"
                    >
                      <Eye size={13} /> Detalhar Título
                    </button>

                    <button 
                      onClick={() => alert(`Enviar comunicação para: ${profileData.cliente.nome}`)}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-extrabold px-2 py-1 rounded-lg flex items-center gap-1 shadow-2xs shrink-0 cursor-pointer"
                      title="Enviar Comunicação"
                    >
                      <Mail size={13} /> <span className="hidden sm:inline">Comunicação</span>
                    </button>

                    {/* BOTÕES OPERACIONAIS NOS TÍTULOS SELECIONADOS (COM ÍCONES ULTRA COMPACTOS) */}
                    {selectedProfileTituloIds.length > 0 && (
                      <>
                        <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-0.5 shrink-0" />

                        <button
                          onClick={() => {
                            const selectedItem = filteredFinanceiro.find((t: any) => selectedProfileTituloIds.includes(t.id));
                            if (selectedItem) {
                              setQuitarInstallment(selectedItem);
                              setQuitarData({
                                conta_bancaria_id: accounts[0]?.id || '',
                                forma_pagamento: 'PIX',
                                data_recebimento: new Date().toISOString().split('T')[0],
                                valor_recebido: parseFloat(selectedItem.valor)
                              });
                            }
                          }}
                          className="bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-extrabold px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-2xs shrink-0 cursor-pointer"
                        >
                          <CheckCircle2 size={13} /> Liquidar (F9)
                        </button>

                        {(() => {
                          const selectedItems = filteredFinanceiro.filter((t: any) => selectedProfileTituloIds.includes(t.id));
                          const allHaveBoleto = selectedItems.length > 0 && selectedItems.every((t: any) =>
                            (t.nosso_numero && t.nosso_numero !== '—' && t.nosso_numero.trim() !== '') || Boolean(t.asaas_payment_id)
                          );
                          if (allHaveBoleto) return null;

                          return (
                            <button
                              onClick={handleEmitirBoletoLote}
                              disabled={issuingBoleto}
                              className="bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-extrabold px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-2xs shrink-0 cursor-pointer"
                            >
                              <Printer size={13} /> {issuingBoleto ? '...' : 'Boleto'}
                            </button>
                          );
                        })()}

                        {/* ÍCONES REORGANIZADOS PARA EMAIL E WHATSAPP */}
                        <button
                          onClick={handleEnviarEmailLote}
                          disabled={sendingEmail}
                          className="bg-blue-600 hover:bg-blue-700 text-white p-1.5 rounded-lg flex items-center justify-center shadow-2xs shrink-0 cursor-pointer"
                          title="Enviar E-mail em Lote"
                        >
                          <Mail size={13} />
                        </button>

                        <button
                          onClick={handleEnviarWhatsAppLote}
                          className="bg-green-600 hover:bg-green-700 text-white p-1.5 rounded-lg flex items-center justify-center shadow-2xs shrink-0 cursor-pointer"
                          title="Enviar WhatsApp em Lote"
                        >
                          <MessageCircle size={13} />
                        </button>
                      </>
                    )}
                  </div>

                  {/* DIREITA: TOTAIS EM 1 ÚNICA LINHA SEM QUEBRA */}
                  {(() => {
                    const selectedTitulos = filteredFinanceiro.filter((t: any) => selectedProfileTituloIds.includes(t.id));
                    const selectedSum = selectedTitulos.reduce((s: number, t: any) => s + parseFloat(t.valor || 0), 0);
                    
                    const vencidosTitulos = filteredFinanceiro.filter((t: any) => {
                      const isPaid = t.status_pagamento === 'PAGO' || (t.valor_pago || 0) >= t.valor;
                      return !isPaid && new Date(t.data_vencimento) < new Date();
                    });
                    const vencidosSum = vencidosTitulos.reduce((s: number, t: any) => s + parseFloat(t.valor || 0), 0);

                    const totalGeral = filteredFinanceiro.reduce((s: number, t: any) => s + parseFloat(t.valor || 0), 0);

                    return (
                      <div className="flex items-center gap-1.5 text-[11px] font-mono shrink-0 ml-auto">
                        {vencidosSum > 0 && (
                          <div className="px-2 py-0.5 bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-800 rounded-md flex items-center gap-1">
                            <span className="text-[9px] uppercase font-bold text-rose-600 dark:text-rose-400">Vencidos:</span>
                            <strong className="font-extrabold text-xs">{formatBRL(vencidosSum)}</strong>
                          </div>
                        )}

                        <div className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-md flex items-center gap-1">
                          <span className="text-[9px] uppercase font-bold text-slate-500">SubTotal ({filteredFinanceiro.length}):</span>
                          <strong className="font-extrabold text-xs">{formatBRL(totalGeral)}</strong>
                        </div>

                        {selectedProfileTituloIds.length > 0 && (
                          <div className="flex items-center gap-1.5 animate-fade-in">
                            <div className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg flex items-center gap-1 shadow-sm">
                              <span className="text-[9px] uppercase font-extrabold tracking-wider text-indigo-200">Selecionado ({selectedProfileTituloIds.length}):</span>
                              <strong className="text-xs font-black">{formatBRL(selectedSum)}</strong>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {profileTab === 'pedidos' && (
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4 animate-fade-in scrollbar-thin">
                
                {/* CABEÇALHO DO PEDIDO / PROPOSTA COM BOTÃO EMITIR CONTRATO E ANEXAR CONTRATO */}
                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div>
                    <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                      <ClipboardList size={15} className="text-blue-600" /> Pedidos, Propostas & Contratos Vigentes
                    </h4>
                    <p className="text-[10.5px] text-slate-500 font-medium">Contratos ativos de mensalidade, contratos anexados e histórico de pedidos efetuados pelo cliente.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAnexarContratoOpen(true)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all"
                    >
                      <Paperclip size={14} /> Anexar Contrato
                    </button>
                    <button
                      onClick={() => navigate('/contratos')}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all"
                    >
                      <Plus size={14} /> Emitir Novo Contrato
                    </button>
                  </div>
                </div>

                {/* SEÇÃO 1: CONTRATOS ATIVOS DO CLIENTE */}
                <div className="space-y-2">
                  <h5 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText size={12} className="text-indigo-600" /> Contratos de Recorrência / Mensalidade
                  </h5>

                  {profileData?.contratos && profileData.contratos.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {profileData.contratos.map((ct: any, idx: number) => (
                        <div key={idx} className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2 shadow-2xs">
                          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                            <span className="font-mono font-bold text-xs text-indigo-600">Contrato #{ct.id_firebird || ct.id}</span>
                            <span className="px-2 py-0.5 rounded text-[9.5px] font-black uppercase bg-emerald-500 text-white">
                              {ct.status || 'ATIVO'}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-[9.5px] text-slate-400 font-bold uppercase block">Valor Mensal:</span>
                              <strong className="font-mono text-sm text-slate-800 dark:text-slate-100">{formatBRL(ct.valor_mensal || ct.valor || 0)}</strong>
                            </div>
                            <div>
                              <span className="text-[9.5px] text-slate-400 font-bold uppercase block">Dia Vencimento:</span>
                              <strong className="text-xs text-slate-700 dark:text-slate-200">Dia {ct.dia_vencimento || '10'}</strong>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-1.5">
                            <span>Espécie: <strong className="text-slate-600 dark:text-slate-300">{ct.especie || 'BOLETO'}</strong></span>
                            <button
                              onClick={() => navigate('/contratos')}
                              className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                            >
                              Ver Detalhes ➔
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 rounded-xl text-center text-xs text-slate-400 italic">
                      Nenhum contrato recorrente cadastrado para este cliente no momento.
                    </div>
                  )}
                </div>

                {/* SEÇÃO 2: CONTRATOS EXTERNOS ANEXADOS (PDF / DOCUMENTOS) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Paperclip size={12} className="text-emerald-600" /> Contratos Externos Anexados (DocuSign, ClickSign, PDF)
                    </h5>
                    <span className="text-[10px] font-bold text-slate-400">
                      Total: {profileData?.contratos_anexos?.length || 0}
                    </span>
                  </div>

                  {profileData?.contratos_anexos && profileData.contratos_anexos.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {profileData.contratos_anexos.map((anexo: any) => (
                        <div key={anexo.id} className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2.5 shadow-2xs hover:border-emerald-400/50 transition-colors">
                          <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                            <div>
                              <h6 className="font-bold text-xs text-slate-800 dark:text-slate-200 line-clamp-1" title={anexo.titulo}>
                                {anexo.titulo}
                              </h6>
                              <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                                <FileText size={10} className="text-emerald-500" /> {anexo.nome_arquivo}
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0">
                              {anexo.plataforma_origem || 'Externa'}
                            </span>
                          </div>

                          {anexo.observacoes && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 italic line-clamp-2">
                              "{anexo.observacoes}"
                            </p>
                          )}

                          <div className="flex items-center justify-between text-[10.5px] text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
                            <span>{new Date(anexo.created_at).toLocaleDateString('pt-BR')} • {anexo.tamanho_bytes ? `${(anexo.tamanho_bytes / 1024).toFixed(0)} KB` : ''}</span>
                            
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleViewOrDownloadContrato(anexo.id)}
                                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 rounded-md font-bold text-[10.5px] flex items-center gap-1 cursor-pointer transition-colors"
                                title="Visualizar / Baixar Contrato"
                              >
                                <Eye size={11} /> Visualizar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteContratoAnexo(anexo.id, anexo.titulo)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-md cursor-pointer transition-colors"
                                title="Excluir Anexo"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 rounded-xl text-center flex flex-col items-center justify-center gap-2 py-5">
                      <Paperclip size={20} className="text-slate-300 dark:text-slate-600" />
                      <span className="text-xs text-slate-400 italic">
                        Nenhum contrato externo (DocuSign, ClickSign, PDF escaneado) anexado para este cliente.
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsAnexarContratoOpen(true)}
                        className="mt-1 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 text-emerald-700 dark:text-emerald-400 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all"
                      >
                        <Plus size={13} /> Anexar Contrato
                      </button>
                    </div>
                  )}
                </div>

                {/* SEÇÃO 2: HISTÓRICO DE PEDIDOS & VENDAS */}
                <div className="space-y-2">
                  <h5 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <ClipboardList size={12} className="text-blue-600" /> Histórico de Pedidos & Propostas Comercial
                  </h5>
                  <div className="table-scroll">
                    <table className="w-full text-left text-xs whitespace-nowrap">
                      <thead>
                        <tr className="border-b border-divider text-[10px] text-text-secondary uppercase font-bold tracking-wider">
                          <th className="pb-3 px-2">Nº Pedido</th>
                          <th className="pb-3 px-2">Data Venda</th>
                          <th className="pb-3 px-2 text-right">Valor Total</th>
                          <th className="pb-3 px-2">Vendedor</th>
                          <th className="pb-3 px-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-divider/30">
                        {filteredContratos.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-4 text-center text-text-secondary italic">Nenhum pedido encontrado para o período filtrado.</td>
                          </tr>
                        ) : (
                          filteredContratos.map((item: any, i: number) => (
                            <tr key={i} className="hover:bg-bg-secondary/40 animate-scale-up">
                              <td className="py-3 px-2 font-mono font-bold text-brand-500">{item.id_firebird || item.id}</td>
                              <td className="py-3 px-2 text-text-secondary">{formatDate(item.created_at)}</td>
                              <td className="py-3 px-2 text-right font-mono font-bold text-text-primary">{formatBRL(item.valor_total)}</td>
                              <td className="py-3 px-2 text-text-secondary">Coliseu Transporte</td>
                              <td className="py-3 px-2">
                                <span className={clsx(
                                  'text-[9.5px] font-extrabold uppercase px-2 py-0.5 rounded-full',
                                  item.status === 'Finalizado' ? 'badge-success' : 'badge-info'
                                )}>
                                  {item.status || 'Ativo'}
                                </span>
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

            {profileTab === 'produtos' && (
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4 animate-fade-in scrollbar-thin">
                <h4 className="text-xs font-black text-text-secondary uppercase tracking-wider">Itens e Softwares Licenciados</h4>
                <div className="table-scroll">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-divider text-[10px] text-text-secondary uppercase font-bold tracking-wider">
                        <th className="pb-3 px-2">Produto</th>
                        <th className="pb-3 px-2">Plataforma</th>
                        <th className="pb-3 px-2">Tipo Contratação</th>
                        <th className="pb-3 px-2 text-right">Valor Padrão</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-divider/30">
                      {profileData?.produtos && profileData.produtos.length > 0 ? (
                        profileData.produtos.map((prod: any, idx: number) => (
                          <tr key={idx} className="hover:bg-bg-secondary/40">
                            <td className="py-3 px-2 font-bold text-text-primary">{prod.nome || prod.descricao}</td>
                            <td className="py-3 px-2 text-text-secondary">{prod.plataforma || 'Desktop/Web'}</td>
                            <td className="py-3 px-2 text-text-secondary">{prod.tipo || 'Recorrente'}</td>
                            <td className="py-3 px-2 text-right font-mono font-bold text-brand-600">{formatBRL(prod.valor || 0)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-slate-400 italic font-semibold">
                            Nenhum produto ou serviço cadastrado para este cliente.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {profileTab === 'modulos' && (() => {
              const soft = profileData.estatisticas_software || {}
              const allModules = [
                { key: 'usa_nfe', label: 'NFe (Nota Fiscal Eletrônica)', desc: 'Emissão de NFe modelo 55' },
                { key: 'usa_nfce', label: 'NFCe (Nota Fiscal Consumidor)', desc: 'Emissão de cupom NFCe modelo 65' },
                { key: 'usa_nfse', label: 'NFSe (Nota Fiscal de Serviço)', desc: 'Emissão de nota de serviços' },
                { key: 'usa_mdfe', label: 'MDFe (Manifesto Eletrônico)', desc: 'Manifesto de carga e documentos' },
                { key: 'usa_cte', label: 'CTe (Conhecimento de Transporte)', desc: 'Emissão de conhecimento CTe' },
                { key: 'usa_sped', label: 'SPED Fiscal / Contribuições', desc: 'Geração de arquivos SPED' },
                { key: 'usa_boleto', label: 'Boleto Bancário', desc: 'Emissão e registro de boletos' },
                { key: 'usa_folha', label: 'Folha de Pagamento', desc: 'Módulo de folha e RH' },
                { key: 'usa_whats', label: 'Envio Orçamento WhatsApp', desc: 'Envio automático via WhatsApp' },
                { key: 'usa_pix', label: 'PIX Integrado', desc: 'Cobrança via QR Code PIX' },
                { key: 'usa_cobranca', label: 'Régua de Cobrança', desc: 'Cobrança automatizada' },
                { key: 'usa_pontuacao', label: 'Pontuação / Fidelidade', desc: 'Programa de pontos e fidelidade' },
                { key: 'usa_os', label: 'Ordem de Serviço (OS)', desc: 'Gestão de ordens de serviço' },
                { key: 'usa_sales', label: 'Módulo Sales (Vendas)', desc: 'Força de vendas externa' },
                { key: 'usa_dash', label: 'Dashboard & BI Mobile', desc: 'Aplicativo de indicadores BI' },
                { key: 'usa_coletor', label: 'Coletor de Dados', desc: 'Módulo de inventário / coletor' },
              ]

              // Classificação dos módulos
              const moduleItems = allModules.map(m => {
                const val = String(soft[m.key] ?? 'NÃO').toUpperCase()
                const isActive = val === 'SIM' || val === 'TRUE' || val === '1'
                return { ...m, isActive }
              })

              const activeModules = moduleItems.filter(m => m.isActive)

              // Softwares ativos do cliente
              const rawSoftList: string[] = Array.isArray(soft.softwares) && soft.softwares.length > 0
                ? soft.softwares 
                : (typeof soft.softwares === 'string' && soft.softwares ? soft.softwares.split(',').map((s: string) => s.trim()) : ["COLISEU GESTAO", "APP"])
              
              const activeSoftwares = rawSoftList.filter(Boolean)

              // Formatação de data do certificado digital
              const certDate = soft.certificado_vencimento ? new Date(soft.certificado_vencimento) : null
              const isCertValid = certDate && !isNaN(certDate.getTime())
              const isCertExpired = isCertValid && certDate < new Date()

              return (
                <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4 animate-fade-in scrollbar-thin">
                  
                  {/* SOFTWARES LICENCIADOS ATIVOS + BUILD + CERTIFICADO DIGITAL AO LADO */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                      <h4 className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                        <Cpu size={16} className="text-indigo-600 dark:text-indigo-400" /> Softwares Licenciados Ativos
                      </h4>

                      {/* BUILD DE ATUALIZAÇÃO E CERTIFICADO DIGITAL */}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <div className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center gap-1.5 font-mono">
                          <RefreshCw size={13} className="text-indigo-500" />
                          <span className="text-[10px] text-slate-500 uppercase font-bold">Build:</span>
                          <strong className="font-extrabold">{soft.versao_atualizacao || soft.versao_software || '2026.07.15'}</strong>
                        </div>

                        <div className={clsx(
                          "px-3 py-1 rounded-xl flex items-center gap-1.5 font-mono border",
                          isCertExpired
                            ? "bg-rose-50 dark:bg-rose-950/80 text-rose-800 dark:text-rose-200 border-rose-300 dark:border-rose-800"
                            : isCertValid
                            ? "bg-emerald-50 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                        )}>
                          <ShieldCheck size={13} className={isCertExpired ? "text-rose-600" : isCertValid ? "text-emerald-600" : "text-slate-400"} />
                          <span className="text-[10px] uppercase font-bold">Certificado Digital:</span>
                          <strong className="font-extrabold">
                            {isCertValid 
                              ? `${certDate.toLocaleDateString('pt-BR')}${isCertExpired ? ' (VENCIDO)' : ''}`
                              : 'Não cadastrado'
                            }
                          </strong>
                        </div>

                        <button
                          type="button"
                          onClick={handleOpenManageModules}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-all ml-1"
                          title="Gerenciar Softwares e Módulos do Cliente"
                        >
                          <Settings size={13} /> Gerenciar
                        </button>
                      </div>
                    </div>

                    {/* LISTA DE SOFTWARES ATIVOS */}
                    {activeSoftwares.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-1">Nenhum software específico registrado para este cliente.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2.5 pt-1">
                        {activeSoftwares.map(sw => (
                          <div
                            key={sw}
                            className="px-4 py-2 rounded-xl text-xs font-black bg-emerald-50 text-emerald-950 border border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-200 dark:border-emerald-800 flex items-center gap-2 shadow-2xs"
                          >
                            <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                            <span>{sw}</span>
                            <span className="text-[9px] px-2 py-0.5 rounded-md font-black uppercase bg-emerald-600 text-white">
                              ATIVO
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* MÓDULOS HABILITADOS E DISPONÍVEIS */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                      <h4 className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                        <FileCode size={16} className="text-indigo-600 dark:text-indigo-400" /> Módulos & Recursos ({activeModules.length} de {allModules.length} Habilitados)
                      </h4>
                      <div className="flex items-center gap-2">
                        <span className="text-[10.5px] font-extrabold text-indigo-700 bg-indigo-50 dark:bg-indigo-950 dark:text-indigo-300 px-3 py-1 rounded-full border border-indigo-200 dark:border-indigo-800">
                          ✓ {activeModules.length} Módulos Ativos
                        </span>
                        <button
                          type="button"
                          onClick={handleOpenManageModules}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 dark:bg-slate-800 dark:text-slate-300 font-bold text-xs rounded-lg border border-slate-200 dark:border-slate-700 flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <Settings size={12} /> Editar
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {moduleItems.map(m => (
                        <div
                          key={m.key}
                          onClick={() => handleToggleSingleModule(m.key, m.isActive)}
                          title={`Clique para ${m.isActive ? 'desativar' : 'ativar'} o módulo ${m.label}`}
                          className={clsx(
                            "p-3 rounded-xl border transition-all flex flex-col justify-between shadow-2xs cursor-pointer group select-none",
                            m.isActive
                              ? "bg-slate-50/80 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-indigo-400"
                              : "bg-slate-100/40 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800/60 opacity-65 hover:opacity-100 hover:border-slate-300"
                          )}
                        >
                          <div className="flex items-start justify-between mb-1 gap-2">
                            <span className={clsx(
                              "font-extrabold text-xs tracking-tight transition-colors",
                              m.isActive ? "text-slate-900 dark:text-slate-100 group-hover:text-indigo-600" : "text-slate-500 dark:text-slate-400"
                            )}>
                              {m.label}
                            </span>
                            <span className={clsx(
                              "px-2 py-0.5 rounded text-[9px] font-black uppercase shrink-0 shadow-2xs transition-all",
                              m.isActive 
                                ? "bg-emerald-500 text-white" 
                                : "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                            )}>
                              {m.isActive ? 'ATIVO' : 'INATIVO'}
                            </span>
                          </div>
                          <p className="text-[10.5px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed">{m.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              )
            })()}

            {profileTab === 'relacionamento' && (
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4 animate-fade-in scrollbar-thin">
                
                {/* CABEÇALHO DO ATENDIMENTO & RELACIONAMENTO */}
                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Headphones size={16} className="text-indigo-600 dark:text-indigo-400" />
                    <div>
                      <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                        Histórico de Relacionamento, Atendimentos & Interações
                      </h4>
                      <p className="text-[10.5px] text-slate-500 font-medium">Linha do tempo completa de atendimentos, ligações, ocorrências e mensagens enviadas.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Filtrar Tipo:</span>
                    <select
                      value={relacionamentoTipoFilter}
                      onChange={(e) => setRelacionamentoTipoFilter(e.target.value)}
                      className="input !py-1 !px-2 text-xs font-bold rounded-lg border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer"
                    >
                      <option value="TODOS">Todos os Registros</option>
                      <option value="ATENDIMENTO">Atendimentos & Ocorrências</option>
                      <option value="WHATSAPP">WhatsApp / Mensagens</option>
                      <option value="EMAIL">E-mails / Notificações</option>
                      <option value="REGUA">Régua de Cobrança</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                  
                  {/* ESQUERDA: LINHA DO TEMPO UNIFICADA (2 COLUNAS) */}
                  <div className="lg:col-span-2 space-y-3">
                    <h5 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock size={12} className="text-indigo-600" /> Histórico Unificado de Interações ({filteredHistorico.length})
                    </h5>

                    <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                      {filteredHistorico.length === 0 ? (
                        <div className="p-8 bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 rounded-xl text-center text-xs text-slate-400 italic">
                          Nenhum atendimento ou ocorrência registrada para o filtro selecionado.
                        </div>
                      ) : (
                        filteredHistorico.map((log: any, i: number) => {
                          const channel = (log.tipo_cobranca || log.canal_contato || 'ATENDIMENTO').toUpperCase()
                          const isEmail = channel.includes('EMAIL') || channel.includes('E-MAIL')
                          const isWhats = channel.includes('WHATS')
                          const isOcorrencia = !isEmail && !isWhats

                          return (
                            <div key={i} className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2 relative shadow-2xs hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
                              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
                                <div className="flex items-center gap-1.5">
                                  <span className={clsx(
                                    'px-2 py-0.5 rounded text-[9px] font-black uppercase shadow-2xs',
                                    isWhats ? 'bg-emerald-600 text-white' : isEmail ? 'bg-blue-600 text-white' : 'bg-indigo-600 text-white'
                                  )}>
                                    {log.tipo_cobranca || log.canal_contato || 'ATENDIMENTO'}
                                  </span>
                                  <span className="text-[11px] font-extrabold text-slate-800 dark:text-slate-200">
                                    Operador: {log.operador || log.usuario || 'SISTEMA'}
                                  </span>
                                </div>
                                <span className="text-[10px] font-mono text-slate-400 font-bold">
                                  {formatDate(log.data_envio || log.created_at)}
                                </span>
                              </div>

                              <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                                {log.mensagem || log.descricao || log.titulo_descricao || 'Registro de atendimento ao cliente.'}
                              </p>

                              {log.status_envio && (
                                <div className="text-[9.5px] font-bold text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-1 flex items-center justify-between">
                                  <span>Fatura / Origem: <strong>{log.titulo_descricao || 'N/A'}</strong></span>
                                  <span className="text-emerald-600 uppercase font-black">✓ {log.status_envio}</span>
                                </div>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>

                  {/* DIREITA: FORMULÁRIO REGISTRAR NOVO ATENDIMENTO */}
                  <div className="card bg-slate-50 dark:bg-slate-800/40 p-4 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                    <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Plus size={14} className="text-indigo-600" /> Registrar Novo Atendimento
                    </h4>
                    
                    <form onSubmit={handleOccurrenceSubmit} className="space-y-3 text-xs">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Canal / Tipo de Interação</label>
                        <select
                          className="input !py-1.5 text-xs font-bold rounded-lg bg-white dark:bg-slate-900 border-slate-300"
                          value={newOccurrence.tipo_contato}
                          onChange={(e) => setNewOccurrence({ ...newOccurrence, tipo_contato: e.target.value })}
                        >
                          <option>WhatsApp</option>
                          <option>Telefonema</option>
                          <option>E-mail Direct</option>
                          <option>Reunião Presencial</option>
                          <option>Suporte Técnico / Dúvida</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Operador Responsável *</label>
                        <input
                          type="text"
                          className="input !py-1.5 text-xs font-bold rounded-lg bg-white dark:bg-slate-900 border-slate-300"
                          required
                          value={newOccurrence.operador}
                          onChange={(e) => setNewOccurrence({ ...newOccurrence, operador: e.target.value })}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Detalhes da Interação *</label>
                        <textarea
                          rows={4}
                          className="input !p-2 text-xs font-medium rounded-lg bg-white dark:bg-slate-900 border-slate-300 w-full"
                          required
                          placeholder="Descreva o que foi tratado com o cliente neste atendimento..."
                          value={newOccurrence.observacao}
                          onChange={(e) => setNewOccurrence({ ...newOccurrence, observacao: e.target.value })}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={submittingOccurrence}
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition-all disabled:opacity-50"
                      >
                        {submittingOccurrence ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        <span>{submittingOccurrence ? 'Salvando...' : 'Salvar Atendimento'}</span>
                      </button>
                    </form>
                  </div>

                </div>
              </div>
            )}
          </div>
        </div>

      ) : (
        /* Visão Principal da Lista de Clientes com Filtros Fixos no Topo e Tabela Modernizada */
        <div className="space-y-4">
          
          {/* BARRA FIXA STICKY NO TOPO (Abaixo do Header 80px): BUSCA E FILTROS */}
          <div className="sticky top-[80px] z-20 bg-bg-primary/95 backdrop-blur-md border border-divider rounded-2xl p-3 shadow-md">
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              
              {/* Filtro Principal de Entidade (Clientes vs Fornecedores) */}
              <select 
                className="input !py-1.5 !w-auto text-xs font-extrabold border-indigo-300 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 rounded-lg cursor-pointer"
                value={tipoEntidade}
                onChange={(e) => {
                  setTipoEntidade(e.target.value as any);
                  setCurrentPage(1);
                }}
              >
                <option value="CLIENTE">👤 Apenas Clientes</option>
                <option value="FORNECEDOR">🏭 Apenas Fornecedores</option>
                <option value="TODOS">👥 Clientes + Fornecedores</option>
              </select>

              {/* Campo de Busca Livre */}
              <div className="relative flex-1 min-w-[240px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  className="input !pl-8 !py-1.5 text-xs rounded-lg w-full uppercase"
                  placeholder="SUPER BUSCA: Nome Fantasia, Razão Social, CNPJ/CPF, Código, E-mail, Cidade, Fone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value.toUpperCase())}
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Filtro de Região / Cidade */}
              <div className="flex items-center gap-1.5">
                <select
                  className="input !w-auto !py-1.5 text-xs font-extrabold border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-lg cursor-pointer"
                  value={regiaoFilter}
                  onChange={(e) => setRegiaoFilter(e.target.value)}
                >
                  <option value="">📍 Todas as Regiões</option>
                  {(kpis.data?.regioes || ['CAMPO GRANDE', 'DOURADOS', 'PONTA PORÃ', 'MARACAJU', 'GLÓRIA DE DOURADOS', 'CAARAPÓ']).map((r: string) => (
                    <option key={r} value={r}>📍 {r}</option>
                  ))}
                </select>
              </div>

            </div>
          </div>

          {/* TABELA COMPACTA E ESTRUTURADA EM COLUNAS COM DIVISORES, ORDENAÇÃO E SELEÇÃO DE LINHA */}
          <div className="card !p-0 overflow-hidden border border-slate-300 dark:border-slate-800 shadow-sm rounded-xl">
            <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
              <table className="w-full text-xs border-collapse">
                
                {/* CABEÇALHO COM COR DESTACADA, BORDA INFERIOR E SUPORTE A ORDENAÇÃO DE COLUNAS */}
                <thead className="bg-slate-200/90 dark:bg-slate-800/90 border-b-2 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 select-none">
                  <tr>
                    <th className="px-2 py-1.5 text-center w-8 border-r border-slate-300 dark:border-slate-700">
                      <span className="sr-only">Seleção</span>
                    </th>

                    <th 
                      onClick={() => handleSort('id_firebird')}
                      className="px-2.5 py-1.5 text-left text-[11px] font-extrabold uppercase tracking-wide border-r border-slate-300 dark:border-slate-700 whitespace-nowrap cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-700/60 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        CÓDIGO
                        {sortField === 'id_firebird' && <span>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                      </div>
                    </th>

                    <th 
                      onClick={() => handleSort('nome_fantasia')}
                      className="px-2.5 py-1.5 text-left text-[11px] font-extrabold uppercase tracking-wide border-r border-slate-300 dark:border-slate-700 whitespace-nowrap cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-700/60 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        NOME FANTASIA
                        {sortField === 'nome_fantasia' && <span>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                      </div>
                    </th>

                    <th 
                      onClick={() => handleSort('razao_social')}
                      className="px-2.5 py-1.5 text-left text-[11px] font-extrabold uppercase tracking-wide border-r border-slate-300 dark:border-slate-700 whitespace-nowrap cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-700/60 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        RAZÃO SOCIAL
                        {sortField === 'razao_social' && <span>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                      </div>
                    </th>

                    <th 
                      onClick={() => handleSort('documento')}
                      className="px-2.5 py-1.5 text-left text-[11px] font-extrabold uppercase tracking-wide border-r border-slate-300 dark:border-slate-700 whitespace-nowrap cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-700/60 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        CPF / CNPJ
                        {sortField === 'documento' && <span>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                      </div>
                    </th>

                    <th 
                      onClick={() => handleSort('classe')}
                      className="px-2.5 py-1.5 text-left text-[11px] font-extrabold uppercase tracking-wide border-r border-slate-300 dark:border-slate-700 whitespace-nowrap cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-700/60 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        CLASSE
                        {sortField === 'classe' && <span>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                      </div>
                    </th>

                    <th 
                      onClick={() => handleSort('cidade')}
                      className="px-2.5 py-1.5 text-left text-[11px] font-extrabold uppercase tracking-wide border-r border-slate-300 dark:border-slate-700 whitespace-nowrap cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-700/60 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        CIDADE
                        {sortField === 'cidade' && <span>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                      </div>
                    </th>

                    <th 
                      onClick={() => handleSort('estado')}
                      className="px-2.5 py-1.5 text-center text-[11px] font-extrabold uppercase tracking-wide border-r border-slate-300 dark:border-slate-700 whitespace-nowrap cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-700/60 transition-colors"
                    >
                      <div className="flex items-center justify-center gap-1">
                        UF
                        {sortField === 'estado' && <span>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                      </div>
                    </th>

                    <th 
                      onClick={() => handleSort('telefone')}
                      className="px-2.5 py-1.5 text-left text-[11px] font-extrabold uppercase tracking-wide border-r border-slate-300 dark:border-slate-700 whitespace-nowrap cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-700/60 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        FONE / WHATSAPP
                        {sortField === 'telefone' && <span>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                      </div>
                    </th>

                    <th 
                      onClick={() => handleSort('data_cadastro')}
                      className="px-2.5 py-1.5 text-left text-[11px] font-extrabold uppercase tracking-wide whitespace-nowrap cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-700/60 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        CADASTRO
                        {sortField === 'data_cadastro' && <span>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                      </div>
                    </th>
                  </tr>
                </thead>

                {/* CORPO DA TABELA COM LINHAS MAIS FINAS E DIFERENCIAÇÃO DE CLIENTE / FORNECEDOR */}
                <tbody>
                  {lista.isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-slate-200 dark:border-slate-800">
                        <td colSpan={10} className="px-3 py-1.5">
                          <div className="h-4 bg-slate-100 dark:bg-slate-800 animate-pulse rounded" />
                        </td>
                      </tr>
                    ))
                  ) : paginatedList.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-slate-500 font-bold text-xs">
                        Nenhum cadastro encontrado
                      </td>
                    </tr>
                  ) : (
                    paginatedList.map((r: any, idx: number) => {
                      const isSelected = selectedClientRow?.id === r.id;
                      const isFornecedor = 
                        r.tipo_entidade === 'FORNECEDOR' || 
                        r.tipo_cliente === 'FORNECEDOR' || 
                        r.classificacao?.toUpperCase().includes('FORNECEDOR') ||
                        r.classe?.toUpperCase().includes('FORNECEDOR') ||
                        /BANCO\s|BRADESCO|BANCO DO BRASIL|SANTANDER|BANCO ITAU|BANCO GM|BANCO SAFRA|CAIXA ECONOMICA|CLARO\s|ENERGISA|ENERSUL|SANESUL|TELEFONICA|ACERTO DOS SOCIOS|CHAVE EMERGENCIAL/i.test(r.nome || '') ||
                        /BANCO\s|BRADESCO|BANCO DO BRASIL|SANTANDER|BANCO ITAU|BANCO GM|BANCO SAFRA|CAIXA ECONOMICA|CLARO\s|ENERGISA|ENERSUL|SANESUL|TELEFONICA|ACERTO DOS SOCIOS|CHAVE EMERGENCIAL/i.test(r.razao_social || '');
                      const nameToShow = r.nome_fantasia || r.responsavel_nome || r.nome;
                      const classeText = r.classe || 'Varejo Diversos';

                      return (
                        <tr
                          key={r.id || idx}
                          onClick={() => {
                            setSelectedClientRow(r);
                            handleOpenProfile360(r.id || r.id_firebird, r);
                          }}
                          title="Clique para abrir a Ficha 360 do Cliente"
                          className={clsx(
                            'border-b border-slate-200 dark:border-slate-800 cursor-pointer transition-all duration-150',
                            isSelected 
                              ? 'bg-indigo-600 text-white dark:bg-indigo-700 font-black border-l-4 border-l-amber-400 shadow-md ring-1 ring-indigo-500'
                              : isFornecedor
                              ? 'hover:bg-purple-50/70 dark:hover:bg-purple-950/30 bg-white dark:bg-slate-900'
                              : 'hover:bg-indigo-50/50 dark:hover:bg-slate-800/60 bg-white dark:bg-slate-900'
                          )}
                        >
                          {/* Coluna 0: Radio Seleção */}
                          <td className="px-2 py-1 text-center border-r border-slate-200 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="radio"
                              name="client_row_selection"
                              checked={isSelected}
                              onChange={() => setSelectedClientRow(r)}
                              className="w-3.5 h-3.5 text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                            />
                          </td>

                          {/* Coluna 1: Código */}
                          <td className="px-2.5 py-1 font-mono font-extrabold text-[11px] border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                            <span className={clsx(
                              'px-1.5 py-0.5 rounded text-[10.5px]',
                              isFornecedor ? 'text-purple-700 bg-purple-50 dark:bg-purple-950/60' : 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60'
                            )}>
                              #{r.id_firebird || r.id}
                            </span>
                          </td>

                          {/* Coluna 2: Nome Fantasia */}
                          <td className="px-2.5 py-1 text-[11.5px] font-extrabold border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <div className={clsx(
                                'w-5 h-5 rounded flex items-center justify-center shrink-0 text-[10px]',
                                isFornecedor ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/60' : 'bg-slate-100 text-slate-600 dark:bg-slate-800'
                              )}>
                                {isFornecedor ? <Truck size={12} /> : <Building size={12} />}
                              </div>
                              <span className="truncate max-w-[200px]" title={nameToShow}>{nameToShow}</span>
                            </div>
                          </td>

                          {/* Coluna 3: Razão Social */}
                          <td className="px-2.5 py-1 text-[11px] font-semibold border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                            <span className="truncate max-w-[200px] block text-slate-700 dark:text-slate-300" title={r.razao_social || r.nome}>
                              {r.razao_social || r.nome || '—'}
                            </span>
                          </td>

                          {/* Coluna 4: CPF / CNPJ */}
                          <td className="px-2.5 py-1 font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                            {r.documento ? formatCpfCnpjMask(r.documento) : '—'}
                          </td>

                          {/* Coluna 5: Classe */}
                          <td className="px-2.5 py-1 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                            <span className={clsx(
                              'text-[10px] font-extrabold px-1.5 py-0.5 rounded border uppercase',
                              isFornecedor
                                ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40'
                                : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300'
                            )}>
                              {classeText}
                            </span>
                          </td>

                          {/* Coluna 6: Cidade */}
                          <td className="px-2.5 py-1 text-[11px] font-bold uppercase text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                            {r.cidade || '—'}
                          </td>

                          {/* Coluna 7: UF */}
                          <td className="px-2.5 py-1 text-center border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                            <span className="text-[10px] font-extrabold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 px-1.5 py-0.5 rounded uppercase">
                              {r.estado || '—'}
                            </span>
                          </td>

                          {/* Coluna 8: Fone / Whatsapp */}
                          <td className="px-2.5 py-1 font-mono text-[11px] font-semibold border-r border-slate-200 dark:border-slate-800 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            {(() => {
                              const { formatted, hasWhatsApp, rawDigits } = getPhoneInfo(r.telefone, r.celular_secundario)
                              if (!formatted || formatted === '—') return <span className="text-slate-400">—</span>

                              return (
                                <div className="flex items-center gap-1.5">
                                  <span className={clsx("font-medium", hasWhatsApp ? "text-emerald-950 dark:text-emerald-100 font-bold" : "text-slate-700 dark:text-slate-300")}>
                                    {formatted}
                                  </span>
                                  {hasWhatsApp && (
                                    <a
                                      href={`https://wa.me/${rawDigits}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title="Telefone com WhatsApp ativo - Clique para abrir conversa"
                                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded-md font-bold text-[10px] hover:bg-emerald-200 transition-colors"
                                    >
                                      <MessageCircle size={11} className="text-emerald-600 dark:text-emerald-400" />
                                      <span>Whats</span>
                                    </a>
                                  )}
                                </div>
                              )
                            })()}
                          </td>

                          {/* Coluna 9: Data Cadastro */}
                          <td className="px-2.5 py-1 font-mono text-[11px] font-bold text-slate-500 whitespace-nowrap">
                            {r.data_cadastro ? formatDate(r.data_cadastro) : '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Controle de Paginação */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-2.5 bg-bg-primary border border-divider rounded-xl">
            <div className="text-xs text-text-secondary">
              Mostrando <span className="font-bold text-text-primary">{serverTotal === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}</span> a{' '}
              <span className="font-bold text-text-primary">{Math.min(serverTotal, currentPage * PAGE_SIZE)}</span> de{' '}
              <span className="font-bold text-text-primary">{serverTotal}</span> registros
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  className="btn-secondary !py-1 !px-2.5 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 text-xs font-bold transition-all cursor-pointer"
                >
                  <ChevronLeft size={14} />
                  Anterior
                </button>
                <span className="text-xs text-text-secondary px-2 font-semibold">
                  Página <span className="text-text-primary font-bold">{currentPage}</span> de <span className="text-text-primary font-bold">{totalPages}</span>
                </span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  className="btn-secondary !py-1 !px-2.5 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 text-xs font-bold transition-all cursor-pointer"
                >
                  Próxima
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>

          {/* BARRA FIXA STICKY NO RODAPÉ: BOTÕES DE AÇÃO À ESQUERDA, ESTATÍSTICAS À DIREITA */}
          <div className="sticky bottom-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-divider p-2.5 shadow-2xl flex flex-wrap items-center justify-between gap-2.5 rounded-t-2xl">
            
            {/* LADO ESQUERDO: BOTÕES DE AÇÃO E NOVO CADASTRO */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/60 p-1 rounded-xl border border-indigo-200/80">
                <button
                  onClick={() => {
                    const targetClient = selectedClientRow || paginatedList[0];
                    const targetId = targetClient?.id || targetClient?.id_firebird;
                    if (targetId) handleOpenProfile360(targetId, targetClient);
                  }}
                  title="Ver Ficha 360 do Cliente Selecionado"
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Eye size={13} /> Ficha 360
                </button>

                <button
                  onClick={() => {
                    const targetClient = selectedClientRow || paginatedList[0];
                    if (targetClient) {
                      setSelectedClienteForLancamento({ id: String(targetClient.id), nome: targetClient.nome });
                      setModalChoiceOpen(true);
                    }
                  }}
                  title="Lançar Título para o Selecionado"
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <CreditCard size={13} /> + Lançar
                </button>

                <button
                  onClick={() => {
                    const targetClient = selectedClientRow || paginatedList[0];
                    if (targetClient) handleEditClient(targetClient);
                  }}
                  title="Editar Cadastro do Selecionado"
                  className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-700 dark:text-slate-200 rounded-lg text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                >
                  <Edit2 size={13} /> Editar
                </button>
              </div>

              <button 
                className="btn-primary !py-1.5 !px-3.5 text-xs font-extrabold flex items-center gap-1.5 shadow-md cursor-pointer ml-1"
                onClick={() => {
                  setIsEditing(false);
                  setEditingClientId(null);
                  setNewClient({
                    nome: '',
                    nome_fantasia: '',
                    documento: '',
                    email: '',
                    telefone: '',
                    responsavel_nome: '',
                    responsavel_rg: '',
                    responsavel_cpf: '',
                    email_financeiro: '',
                    celular_secundario: '',
                    regime_tributario: 'Simples Nacional',
                    cidade: '',
                    estado: '',
                    endereco_completo: '',
                    tipo_cliente: 'B2C',
                    classificacao: 'Ativo',
                    classe: 'VAREJO',
                    observacoes: ''
                  });
                  setIsCreateOpen(true);
                }}
              >
                <Plus size={14} /> Cadastrar Cliente
              </button>
            </div>

            {/* LADO DIREITO: CHIPS DE ESTATÍSTICAS RE-ALOCADOS */}
            <div className="flex flex-wrap items-center gap-2 text-xs ml-auto">
              <div className="px-3 py-1.5 bg-brand-500/10 border border-brand-500/20 text-brand-600 rounded-xl font-extrabold flex items-center gap-1.5 shadow-2xs">
                <Users size={13} />
                <span>Clientes: <strong>{formatNum(k?.total_clientes)}</strong></span>
              </div>

              <div className="px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 text-purple-600 rounded-xl font-extrabold flex items-center gap-1.5 shadow-2xs">
                <Truck size={13} />
                <span>Fornecedores: <strong>{formatNum(k?.total_fornecedores)}</strong></span>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Cadastro/Edição de Cliente Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="card w-full max-w-4xl p-5 bg-bg-primary max-h-[92vh] flex flex-col animate-scale-up border border-divider shadow-2xl rounded-2xl">
            
            {/* CABEÇALHO DO MODAL COM ÍCONE E FECHAMENTO */}
            <div className="flex justify-between items-center mb-3 border-b border-divider pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-2xs">
                  <UserCheck size={20} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 dark:text-white text-base tracking-tight">
                    {isEditing ? 'Editar Cadastro de Entidade / Cliente' : 'Cadastrar Nova Entidade / Cliente'}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-semibold">Base Coliseu Transporte & Sincronização ERP Firebird</p>
                </div>
              </div>

              {/* SELETOR DE 2 ABAS DE CADASTRO */}
              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setActiveClientModalTab('dados_gerais')}
                  className={clsx(
                    "px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer",
                    activeClientModalTab === 'dados_gerais'
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-300 hover:text-indigo-600"
                  )}
                >
                  <Building size={13} /> 1. Dados Gerais & Fiscais
                </button>
                <button
                  type="button"
                  onClick={() => setActiveClientModalTab('localizacao_outros')}
                  className={clsx(
                    "px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer",
                    activeClientModalTab === 'localizacao_outros'
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-300 hover:text-indigo-600"
                  )}
                >
                  <MapPin size={13} /> 2. Localização & Responsável
                </button>
              </div>

              <button 
                type="button"
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer" 
                onClick={() => setIsCreateOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveClient} className="flex flex-col flex-1 overflow-hidden">
              
              <div className="flex-1 overflow-y-auto pr-1 space-y-3.5 py-1">
                {/* UNICO BLOCO CNPJ / CONSULTA AUTOMÁTICA DA RECEITA */}
                <div className="p-3 bg-gradient-to-r from-indigo-50/80 via-white to-purple-50/50 dark:from-indigo-950/40 dark:via-slate-900 dark:to-purple-950/30 border border-indigo-200 dark:border-indigo-800 rounded-2xl flex flex-col sm:flex-row items-center gap-3 shadow-2xs">
                  <div className="flex-1 w-full space-y-1">
                    <label className="text-[10.5px] font-black text-indigo-950 dark:text-indigo-200 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText size={14} className="text-indigo-600 dark:text-indigo-400" />
                      CPF / CNPJ (CONSULTA AUTOMÁTICA DA RECEITA FEDERAL) *
                    </label>
                    <input
                      type="text"
                      className="input font-mono font-black text-sm uppercase rounded-xl border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs"
                      placeholder="00.000.000/0000-00"
                      value={newClient.documento}
                      onChange={(e) => setNewClient({ ...newClient, documento: formatCpfCnpjMask(e.target.value) })}
                    />
                  </div>
                  <button
                    type="button"
                    className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black flex items-center justify-center gap-2 text-xs shadow-md hover:shadow-lg transition-all rounded-xl cursor-pointer shrink-0 mt-auto"
                    onClick={handleCnpjLookup}
                    disabled={consultingCnpj}
                  >
                    {consultingCnpj ? (
                      <>
                        <Loader2 size={15} className="animate-spin text-white" />
                        <span>Consultando...</span>
                      </>
                    ) : (
                      <>
                        <Search size={15} />
                        <span>Consultar CNPJ</span>
                      </>
                    )}
                  </button>
                </div>

                {/* CONTEÚDO DA ABAS */}
                {activeClientModalTab === 'dados_gerais' ? (
                  /* GUIA 1: DADOS GERAIS, EMPRESA & CONTATOS */
                  <div className="space-y-3.5 text-xs animate-fade-in">
                    
                    {/* NOME RAZÃO SOCIAL E NOME FANTASIA (LARGURA TOTAL ESPAÇOSA) */}
                    <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3 shadow-2xs">
                      <h4 className="font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                        <Building size={15} className="text-indigo-600 dark:text-indigo-400" />
                        Razão Social & Nome Comercial
                      </h4>

                      <div className="space-y-3">
                        {/* Nome / Razão Social - Full Width */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                            Nome / Razão Social Completa *
                          </label>
                          <input
                            type="text"
                            className="input font-extrabold text-sm w-full rounded-xl border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500"
                            required
                            placeholder="EX: PIMENTA DOCE MODA INTIMA LTDA"
                            value={newClient.nome}
                            onChange={(e) => setNewClient({ ...newClient, nome: e.target.value.toUpperCase() })}
                          />
                        </div>

                        {/* Nome Fantasia - Full Width */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                            <Award size={13} className="text-indigo-600 dark:text-indigo-400" />
                            Nome Fantasia / Nome Comercial
                          </label>
                          <input
                            type="text"
                            className="input font-extrabold text-xs w-full rounded-xl border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500"
                            placeholder="EX: PIMENTA DOCE LINGERIE"
                            value={newClient.nome_fantasia}
                            onChange={(e) => setNewClient({ ...newClient, nome_fantasia: e.target.value.toUpperCase() })}
                          />
                        </div>
                      </div>
                    </div>

                    {/* TIPO DE ENTIDADE, CLASSE DO CLIENTE & CLASSIFICAÇÃO STATUS */}
                    <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3 shadow-2xs">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                            <UserCheck size={13} className="text-indigo-600 dark:text-indigo-400" />
                            Tipo de Entidade (ERP) *
                          </label>
                          <select
                            className="input font-extrabold text-xs rounded-xl text-indigo-950 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/30"
                            value={newClient.tipo_cliente}
                            onChange={(e) => setNewClient({ ...newClient, tipo_cliente: e.target.value })}
                          >
                            <option value="CLIENTE">👤 CLIENTE (Consumidor / Comprador)</option>
                            <option value="FUNCIONARIO">💼 FUNCIONÁRIO (Colaborador / Staff)</option>
                            <option value="FORNECEDOR">🚚 FORNECEDOR (Prestador / Distribuidor)</option>
                            <option value="PARCEIRO">🤝 PARCEIRO (Representante / Outros)</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                            <Tag size={13} className="text-indigo-600 dark:text-indigo-400" />
                            Classe do Cliente (ERP) *
                          </label>
                          <select
                            className="input font-extrabold text-xs rounded-xl uppercase text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border-indigo-300 dark:border-indigo-800 focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                            value={newClient.classe || 'GERAL'}
                            onChange={(e) => setNewClient({ ...newClient, classe: e.target.value.toUpperCase() })}
                          >
                            {Array.from(new Set([newClient.classe, ...classesClienteOptions])).filter(Boolean).map((cls) => (
                              <option key={cls} value={cls}>{cls}</option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                            <ShieldCheck size={13} className="text-emerald-600 dark:text-emerald-400" />
                            Classificação / Status *
                          </label>
                          <select
                            className="input font-extrabold text-xs rounded-xl text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700"
                            value={newClient.classificacao}
                            onChange={(e) => setNewClient({ ...newClient, classificacao: e.target.value })}
                          >
                            <option value="Ativo">✅ Ativo (Liberado)</option>
                            <option value="Inativo">⛔ Inativo (Bloqueado)</option>
                            <option value="Potencial">⭐ Potencial / Prospect</option>
                            <option value="Devedor">⚠️ Inadimplente / Restrição</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* CONTATOS DIGITAIS E TELEFONES */}
                    <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3 shadow-2xs">
                      <h4 className="font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                        <Phone size={15} className="text-indigo-600 dark:text-indigo-400" />
                        Comunicação Digital & Telefonia
                      </h4>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                            <Mail size={13} className="text-indigo-600 dark:text-indigo-400" />
                            E-mail Comercial (Principal)
                          </label>
                          <input
                            type="email"
                            className="input text-xs rounded-xl border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50"
                            placeholder="contato@empresa.com.br"
                            value={newClient.email}
                            onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                            <Receipt size={13} className="text-indigo-600 dark:text-indigo-400" />
                            E-mail Financeiro (Faturas / Cobrança)
                          </label>
                          <input
                            type="email"
                            className="input text-xs rounded-xl border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50"
                            placeholder="financeiro@empresa.com.br"
                            value={newClient.email_financeiro}
                            onChange={(e) => setNewClient({ ...newClient, email_financeiro: e.target.value })}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                            Telefone Fixo
                          </label>
                          <input
                            type="text"
                            className="input font-mono font-bold text-xs rounded-xl border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50"
                            placeholder="(00) 0000-0000"
                            value={newClient.telefone}
                            onChange={(e) => setNewClient({ ...newClient, telefone: formatPhoneMask(e.target.value) })}
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                              <MessageCircle size={13} className="text-emerald-600 dark:text-emerald-400" />
                              Celular / WhatsApp
                            </label>
                            {newClient.celular_secundario && checkIsWhatsApp(newClient.celular_secundario) && (
                              <span className="text-[9px] text-emerald-600 font-black flex items-center gap-0.5">
                                <CheckCircle size={10} /> Whats
                              </span>
                            )}
                          </div>
                          <input
                            type="text"
                            className="input font-mono font-bold text-xs rounded-xl border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50"
                            placeholder="(00) 90000-0000"
                            value={newClient.celular_secundario}
                            onChange={(e) => setNewClient({ ...newClient, celular_secundario: formatPhoneMask(e.target.value) })}
                          />
                        </div>
                      </div>
                    </div>

                  </div>
                ) : (
                  /* GUIA 2: LOCALIZAÇÃO, RESPONSÁVEL & OBSERVAÇÕES */
                  <div className="space-y-3.5 text-xs animate-fade-in">
                    
                    {/* ENDEREÇO E LOCALIZAÇÃO */}
                    <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3 shadow-2xs">
                      <h4 className="font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                        <MapPin size={15} className="text-indigo-600 dark:text-indigo-400" />
                        Localização & Endereço Comercial
                      </h4>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div className="sm:col-span-2 space-y-1">
                          <label className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                            Endereço Completo (Logradouro, Nº, Bairro, CEP)
                          </label>
                          <input
                            type="text"
                            className="input text-xs font-bold rounded-xl border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50"
                            placeholder="RUA PRESIDENTE VARGAS, Nº 615, JARDIM AMÉRICA..."
                            value={newClient.endereco_completo}
                            onChange={(e) => setNewClient({ ...newClient, endereco_completo: e.target.value.toUpperCase() })}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                            Cidade / Município
                          </label>
                          <input
                            type="text"
                            className="input text-xs font-bold rounded-xl border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50"
                            placeholder="DOURADOS"
                            value={newClient.cidade}
                            onChange={(e) => setNewClient({ ...newClient, cidade: e.target.value.toUpperCase() })}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                            Estado (UF)
                          </label>
                          <input
                            type="text"
                            className="input font-mono text-xs font-black uppercase rounded-xl border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50"
                            maxLength={2}
                            placeholder="MS"
                            value={newClient.estado}
                            onChange={(e) => setNewClient({ ...newClient, estado: e.target.value.toUpperCase() })}
                          />
                        </div>
                      </div>
                    </div>

                    {/* REPRESENTANTE LEGAL */}
                    <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3 shadow-2xs">
                      <h4 className="font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                        <Users size={15} className="text-indigo-600 dark:text-indigo-400" />
                        Representante Legal & Regime Tributário
                      </h4>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                            Nome do Responsável
                          </label>
                          <input
                            type="text"
                            className="input text-xs font-bold rounded-xl border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50"
                            placeholder="EX: JEFFERSON SILVA"
                            value={newClient.responsavel_nome}
                            onChange={(e) => setNewClient({ ...newClient, responsavel_nome: e.target.value.toUpperCase() })}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                            CPF do Responsável
                          </label>
                          <input
                            type="text"
                            className="input font-mono text-xs font-bold rounded-xl border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50"
                            placeholder="000.000.000-00"
                            value={newClient.responsavel_cpf}
                            onChange={(e) => setNewClient({ ...newClient, responsavel_cpf: e.target.value })}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                            Regime Tributário
                          </label>
                          <select
                            className="input font-extrabold text-xs rounded-xl border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50"
                            value={newClient.regime_tributario}
                            onChange={(e) => setNewClient({ ...newClient, regime_tributario: e.target.value })}
                          >
                            <option>Simples Nacional</option>
                            <option>Lucro Presumido</option>
                            <option>Lucro Real</option>
                            <option>MEI (Microempreendedor)</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* OBSERVAÇÕES INTERNAS */}
                    <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2 shadow-2xs">
                      <label className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                        Observações Internas ERP / Referências Comerciais
                      </label>
                      <textarea
                        className="input h-20 text-xs font-medium rounded-xl border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50"
                        placeholder="Adicione referências comerciais, limites de crédito ou observações gerais da empresa..."
                        value={newClient.observacoes}
                        onChange={(e) => setNewClient({ ...newClient, observacoes: e.target.value.toUpperCase() })}
                      />
                    </div>

                  </div>
                )}
              </div>

              {/* BOTÕES GRANDES DE AÇÃO NO RODAPÉ ESTILO ERP */}
              <div className="flex flex-col sm:flex-row justify-end items-center gap-3 pt-3 border-t border-slate-200 dark:border-slate-800 shrink-0 mt-2">
                <button 
                  type="button" 
                  className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-extrabold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2" 
                  onClick={() => {
                    setIsCreateOpen(false);
                    setIsEditing(false);
                    setEditingClientId(null);
                  }}
                >
                  <X size={16} />
                  <span>Cancelar (ESC)</span>
                </button>

                <button 
                  type="submit" 
                  className="w-full sm:w-auto px-7 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow-lg hover:shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Check size={16} />
                  <span>{isEditing ? '💾 Salvar Alterações (F5)' : '➕ Concluir Cadastro'}</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Quitação / Baixa de Título Modal Estilo ERP Coliseu */}
      {quitarInstallment && (
        <ModalLiquidarTitulo
          isOpen={!!quitarInstallment}
          titulo={quitarInstallment}
          onClose={() => setQuitarInstallment(null)}
          onSuccess={() => {
            setQuitarInstallment(null)
            if (selectedClientId) handleRefreshProfile(selectedClientId)
          }}
        />
      )}

      {/* Choice Modal (Programar vs Individual) */}
      {modalChoiceOpen && (
        <ModalEscolhaLancamento
          onClose={() => setModalChoiceOpen(false)}
          onProgramar={() => { setModalChoiceOpen(false); setModalProgramacaoOpen(true) }}
          onLancarIndividual={() => { setModalChoiceOpen(false); setModalIndividualOpen(true) }}
        />
      )}

      {/* Programação de Contas (com cliente pré-selecionado) */}
      {modalProgramacaoOpen && (
        <ModalProgramacaoContas
          tipo="RECEBER"
          initialCliente={selectedClienteForLancamento}
          onClose={() => setModalProgramacaoOpen(false)}
          onSuccess={() => {
            if (selectedClientId) handleRefreshProfile(selectedClientId);
          }}
        />
      )}

      {/* Lançamento Individual (com cliente pré-selecionado) */}
      {modalIndividualOpen && (
        <ModalLancamentoIndividual
          tipo="RECEBER"
          initialCliente={selectedClienteForLancamento}
          onClose={() => setModalIndividualOpen(false)}
          onSuccess={() => {
            if (selectedClientId) handleRefreshProfile(selectedClientId);
          }}
        />
      )}

      {/* Preview e Envio de Boleto Emitido */}
      {previewBoletoData && (
        <ModalBoletoPreview
          boleto={previewBoletoData}
          onClose={() => setPreviewBoletoData(null)}
        />
      )}

      {/* Modal de Validação e Confirmação de Emissão de Boleto na Ficha */}
      <ModalConfirmacaoEmissaoBoleto
        isOpen={Boolean(titleToEmitConfirm)}
        title={titleToEmitConfirm}
        onClose={() => setTitleToEmitConfirm(null)}
        onSuccess={() => {
          if (selectedClientId) handleRefreshProfile(selectedClientId)
        }}
      />

      {/* Modal de Detalhes e Rastreabilidade do Título */}
      <ModalDetalhesTitulo
        isOpen={!!selectedTituloForLog}
        tituloId={selectedTituloForLog}
        onClose={() => setSelectedTituloForLog(null)}
        onUpdated={() => {
          if (selectedClientId) handleRefreshProfile(selectedClientId);
        }}
      />

      {/* MODAL DE EMISSÃO E TRANSMISSÃO EM LOTE DO CLIENTE (MESMA DINÂMICA DO GESTÃO FINANCEIRA) */}
      {isBatchProgressModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 z-[70] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="card w-full max-w-xl p-5 bg-slate-900 border border-indigo-700 text-white shadow-2xl space-y-4 rounded-2xl">
            
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Printer size={20} className="text-emerald-400" />
                <h3 className="font-extrabold text-base text-white">
                  Emissão e Transmissão em Lote ({batchProgressCount}/{batchTotalCount})
                </h3>
              </div>
              {!issuingBoleto && (
                <button
                  type="button"
                  onClick={() => setIsBatchProgressModalOpen(false)}
                  className="p-1 rounded text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Barra e Contador de Progresso */}
            <div className="space-y-2 font-mono">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="flex items-center gap-2 text-indigo-300">
                  {issuingBoleto ? (
                    <>
                      <Loader2 size={14} className="animate-spin text-emerald-400" />
                      Emitindo e transmitindo boletos em lote...
                    </>
                  ) : (
                    <span className="text-emerald-400 font-extrabold">
                      ✓ Emissão em Lote Concluída!
                    </span>
                  )}
                </span>
                <span className="text-emerald-400 text-xs font-black bg-emerald-950 px-2 py-0.5 rounded border border-emerald-500/40">
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
                <div className="mt-2 max-h-56 overflow-y-auto space-y-1.5 p-1 font-mono text-[11px]">
                  {batchItemsDetail.map((item, idx) => (
                    <div key={idx} className={clsx(
                      "p-2 rounded border leading-tight flex flex-col gap-1 transition-all",
                      item.status === 'success' ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-200" :
                      "bg-rose-950/40 border-rose-500/50 text-rose-200"
                    )}>
                      <div className="flex items-center justify-between font-bold text-xs">
                        <span>Boleto {item.index}/{item.total} — <strong className="text-white">{item.cliente}</strong></span>
                        <span className="text-[10.5px]">Venc: {item.vencimento} | Valor: {item.valor}</span>
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

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsBatchProgressModalOpen(false)}
                disabled={issuingBoleto}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer disabled:opacity-50"
              >
                {issuingBoleto ? 'Aguarde o término...' : 'Concluir'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal de Gerenciamento de Softwares e Módulos do Cliente */}
      {isManageModulesOpen && (
        <div className="fixed inset-0 bg-slate-900/70 z-[70] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="card w-full max-w-2xl p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 shadow-2xl space-y-4 rounded-2xl max-h-[92vh] flex flex-col">
            
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <Settings size={20} className="text-indigo-600 dark:text-indigo-400" />
                <div>
                  <h3 className="font-extrabold text-base">Gerenciar Softwares & Módulos</h3>
                  <p className="text-[11px] text-slate-500 font-medium">{profileData?.cliente?.nome || profileData?.cliente?.razao_social}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsManageModulesOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveModulesForm} className="flex-1 overflow-y-auto pr-1 space-y-4">
              {/* Build e Vencimento do Certificado */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-emerald-500" /> Licença & Certificado Digital
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-[10.5px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Vencimento Certificado Digital</label>
                    <input
                      type="date"
                      className="input w-full font-mono text-xs"
                      value={modulesEditForm.certificado_vencimento || ''}
                      onChange={(e) => setModulesEditForm({ ...modulesEditForm, certificado_vencimento: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-[10.5px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Versão / Build do Software</label>
                    <input
                      type="text"
                      className="input w-full font-mono text-xs"
                      value={modulesEditForm.versao_atualizacao || ''}
                      onChange={(e) => setModulesEditForm({ ...modulesEditForm, versao_atualizacao: e.target.value })}
                      placeholder="EX: 2026.07.15"
                    />
                  </div>
                </div>
              </div>

              {/* Softwares Licenciados */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Cpu size={14} className="text-indigo-500" /> Softwares Licenciados
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {["COLISEU GESTAO", "COLISEU FISCAL", "COLISEU WEB", "APP"].map(sw => {
                    const currentSofts: string[] = modulesEditForm.softwares || []
                    const isChecked = currentSofts.includes(sw)
                    return (
                      <label
                        key={sw}
                        className={clsx(
                          "p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition-all",
                          isChecked 
                            ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-950 dark:text-emerald-200 font-extrabold" 
                            : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 opacity-70"
                        )}
                      >
                        <input
                          type="checkbox"
                          className="checkbox rounded border-slate-300"
                          checked={isChecked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...currentSofts, sw]
                              : currentSofts.filter(s => s !== sw)
                            setModulesEditForm({ ...modulesEditForm, softwares: next })
                          }}
                        />
                        <span className="text-[11px]">{sw}</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* Módulos Habilitados */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <FileCode size={14} className="text-indigo-500" /> Módulos Habilitados (Ativar / Desativar)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {[
                    { key: 'usa_nfe', label: 'NFe (Nota Fiscal Eletrônica)' },
                    { key: 'usa_nfce', label: 'NFCe (Nota Fiscal Consumidor)' },
                    { key: 'usa_nfse', label: 'NFSe (Nota Fiscal de Serviço)' },
                    { key: 'usa_mdfe', label: 'MDFe (Manifesto Eletrônico)' },
                    { key: 'usa_cte', label: 'CTe (Conhecimento de Transporte)' },
                    { key: 'usa_sped', label: 'SPED Fiscal / Contribuições' },
                    { key: 'usa_boleto', label: 'Boleto Bancário' },
                    { key: 'usa_folha', label: 'Folha de Pagamento' },
                    { key: 'usa_whats', label: 'Envio Orçamento WhatsApp' },
                    { key: 'usa_pix', label: 'PIX Integrado' },
                    { key: 'usa_cobranca', label: 'Régua de Cobrança' },
                    { key: 'usa_pontuacao', label: 'Pontuação / Fidelidade' },
                    { key: 'usa_os', label: 'Ordem de Serviço (OS)' },
                    { key: 'usa_sales', label: 'Módulo Sales (Vendas)' },
                    { key: 'usa_dash', label: 'Dashboard & BI Mobile' },
                    { key: 'usa_coletor', label: 'Coletor de Dados' },
                  ].map(m => {
                    const isChecked = String(modulesEditForm[m.key] || 'NÃO').toUpperCase() === 'SIM'
                    return (
                      <label
                        key={m.key}
                        className={clsx(
                          "p-2 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all",
                          isChecked
                            ? "bg-indigo-50/70 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800 text-indigo-950 dark:text-indigo-200 font-bold"
                            : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 opacity-60"
                        )}
                      >
                        <input
                          type="checkbox"
                          className="checkbox rounded border-slate-300"
                          checked={isChecked}
                          onChange={(e) => {
                            setModulesEditForm({
                              ...modulesEditForm,
                              [m.key]: e.target.checked ? 'SIM' : 'NÃO'
                            })
                          }}
                        />
                        <span className="text-[11.5px] truncate">{m.label}</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsManageModulesOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingModules}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {savingModules ? (
                    <>
                      <Loader2 size={14} className="animate-spin text-white" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={14} />
                      Salvar Módulos & Licenças
                    </>
                  )}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* Modal de Anexar Contrato Externo */}
      {selectedClientId && (
        <ModalAnexarContrato
          isOpen={isAnexarContratoOpen}
          clienteId={selectedClientId}
          clienteNome={profileData?.cliente?.nome || profileData?.cliente?.razao_social || 'Cliente'}
          onClose={() => setIsAnexarContratoOpen(false)}
          onSuccess={() => {
            if (selectedClientId) handleRefreshProfile(selectedClientId)
          }}
        />
      )}

    </div>
  )
}

