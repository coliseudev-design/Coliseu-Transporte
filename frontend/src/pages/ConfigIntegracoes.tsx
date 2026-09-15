import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useApiQuery } from '../hooks/useApi'
import { useBranch } from '../contexts/BranchContext'
import api from '../services/api'
import clsx from 'clsx'
import {
  Settings, Key, Shield, MessageSquare, Edit3, DollarSign, Sliders, CheckCircle2,
  XCircle, RefreshCw, HelpCircle, Save, Info, AlertTriangle, Play, Calendar, Users, UserPlus, Trash2, Mail, Send,
  Building, Building2, Upload, FileText, Printer, Image, FileSpreadsheet, MapPin, Phone, Globe, Layers, Loader2,
  SlidersHorizontal, Check, MessageCircle, Sparkles, X
} from 'lucide-react'
import { formatBRL } from '../utils/format'
import ModalCadastroCedente, { CedenteItem } from '../components/configuracoes/ModalCadastroCedente'
import ModalCadastroGrupoAcesso from '../components/configuracoes/ModalCadastroGrupoAcesso'
import CoraBankSection from '../components/configuracoes/CoraBankSection'

interface IntegracoesConfig {
  ai_api_key: string | null
  ai_system_prompt: string | null
  ai_openai_key: string | null
  ai_openai_active: boolean
  ai_deepseek_key: string | null
  ai_deepseek_active: boolean
  ai_gemini_key: string | null
  ai_gemini_active: boolean
  ai_manus_key: string | null
  ai_manus_active: boolean
  ai_prompt_marketing: string | null
  ai_prompt_cobranca: string | null
  ai_prompt_contratos: string | null
  ai_prompt_bi: string | null
  whatsapp_instancia_id: string | null
  whatsapp_token: string | null
  whatsapp_server_url: string | null
  whatsapp_enabled: boolean
  whatsapp_admin_phone: string | null
  whatsapp_api_provider: string | null
  whatsapp_meta_business_id: string | null
  whatsapp_meta_phone_id: string | null
  whatsapp_meta_token: string | null
  whatsapp_meta_verify_token: string | null
  whatsapp_permitir_multiplos_envios_dia: boolean
  clicksign_token: string | null
  clicksign_ambiente: string
  salario_minimo_anterior: number
  salario_minimo_atual: number
  lembrete_preventivo_script: string | null
  aviso_vencimento_script: string | null
  atraso_inicial_script: string | null
  atraso_critico_script: string | null
  asaas_access_token: string | null
  asaas_ambiente: string
  asaas_webhook_secret: string | null
  asaas_juros_padrao: number
  asaas_multa_padrao: number
  asaas_desconto_padrao: number
  // Banco Cora
  cora_ativo: boolean
  cora_client_id: string
  cora_cert_pem: string | null
  cora_private_key: string | null
  cora_juros_padrao: number
  cora_multa_padrao: number
  cora_desconto_padrao: number
  cora_webhook_url: string | null
  // E-mail
  email_provedor: string
  email_smtp_host: string | null
  email_smtp_port: number
  email_smtp_user: string | null
  email_smtp_pass: string | null
  email_smtp_secure: boolean
  email_remetente_nome: string | null
  email_remetente: string | null
  email_brevo_api_key: string | null
  email_marketing_topo_url?: string | null
  email_marketing_rodape_url?: string | null
  email_cobranca_topo_url?: string | null
  email_cobranca_rodape_url?: string | null
  // Portador e Espécie Padrão
  portador_padrao_id: number | null
  portador_padrao_nome: string | null
  especie_padrao_id: number | null
  especie_padrao_nome: string | null
  // Dados da Empresa
  empresa_codigo?: number
  empresa_nome?: string
  empresa_razao_social?: string
  empresa_cnpj?: string
  empresa_ie?: string
  empresa_im?: string
  empresa_tipo?: string
  empresa_regiao?: string
  empresa_endereco?: string
  empresa_numero?: string
  empresa_bairro?: string
  empresa_complemento?: string
  empresa_cep?: string
  empresa_fax?: string
  empresa_fone1?: string
  empresa_fone2?: string
  empresa_praca?: string
  empresa_responsavel?: string
  empresa_email?: string
  empresa_site?: string
  empresa_logo_url?: string
  // Modelos de Documentos
  doc_modelo_pedidos?: string
  doc_modelo_extrato?: string
  doc_modelo_orcamento?: string
  doc_modelo_recibo?: string
  doc_termo_garantia?: string
  doc_observacao_padrao?: string
  // Padronização (Movimentação e Financeiro)
  padrao_nat_venda?: string
  padrao_nat_compra?: string
  padrao_nat_dev_saida?: string
  padrao_nat_dev_entrada?: string
  padrao_nat_servico_saida?: string
  padrao_nat_servico_entrada?: string
  padrao_departamento?: string
  padrao_codigo_produto?: string
  padrao_numero_pedido?: string
  padrao_rota_pedidos?: string
  padrao_centro_custo?: string
  padrao_centro_custo_id?: number | null
  padrao_caixa?: string
  padrao_caixa_cofre?: string
  padrao_moeda?: string
  padrao_portador?: string
  padrao_forma_pagto_prazo?: string
  padrao_tabela_precos?: string
  padrao_tipo_juros_titulo?: string
  padrao_tipo_juros_venda?: string
  padrao_modelo_resumo_financeiro?: string
  padrao_juros_carencia_dias?: number
  padrao_juros_percentual?: number
  padrao_plano_contas_id?: number | null
  padrao_plano_contas_nome?: string | null
}

import SystemLogsSection from '../components/configuracoes/SystemLogsSection'
import { ScrollText } from 'lucide-react'

type TabType = 'empresa' | 'padronizacao' | 'usuarios' | 'documentos' | 'gerais' | 'apis' | 'seguranca' | 'fiscal' | 'logs' | 'automacoes' | 'index'
type PadronizacaoSubTab = 'movimentacao' | 'financeiro' | 'cobrancas_ativas' | 'portadores_especies' | 'outras'
type ApiSubTab = 'bancos' | 'email' | 'whats' | 'ia' | 'assinaturas'
type DocumentosSubTab = 'modelos' | 'impressao'

export default function ConfigIntegracoes() {
  const { selectedBranch, filiais, setSelectedBranch } = useBranch()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState<TabType>(
    tabParam === 'automacoes' ? 'documentos' : tabParam === 'apis' ? 'apis' : 'empresa'
  )
  const [padronizacaoSubTab, setPadronizacaoSubTab] = useState<PadronizacaoSubTab>('movimentacao')
  const [apiSubTab, setApiSubTab] = useState<ApiSubTab>('bancos')
  const [documentosSubTab, setDocumentosSubTab] = useState<DocumentosSubTab>('modelos')

  const [cedentes, setCedentes] = useState<CedenteItem[]>([])
  const [isModalCedenteOpen, setIsModalCedenteOpen] = useState(false)
  const [editingCedente, setEditingCedente] = useState<CedenteItem | null>(null)
  const [centrosCustoList, setCentrosCustoList] = useState<{ id?: any; codigo?: any; descricao?: string; nome?: string }[]>([])

  const fetchCedentes = async () => {
    try {
      const { data } = await api.get('/configuracoes/cedentes')
      setCedentes(data.data || [])
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    fetchCedentes()
    api.get('/cadastros/centro-custos').then(r => {
      const d = r.data?.data || r.data || []
      if (Array.isArray(d)) setCentrosCustoList(d)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (tabParam === 'automacoes') {
      setActiveTab('automacoes')
    } else if (tabParam === 'apis') {
      setActiveTab('apis')
    }
  }, [tabParam])
  
  // Queries
  const { data: configRes, isLoading: isConfigLoading, refetch: refetchConfig } = useApiQuery<{ data: IntegracoesConfig }>(
    '/configuracoes/integracoes',
    selectedBranch !== 'todas' ? { depto_id: String(selectedBranch) } : undefined
  )

  const { data: aiUsageRes, refetch: refetchAiUsage } = useApiQuery<{
    openai: { spent: number; balance: string }
    deepseek: { spent: number; balance: string }
    gemini: { spent: number; balance: string }
    manus: { spent: number; balance: string }
  }>('/configuracoes/ai-usage')
  
  // Local Form state
  const [form, setForm] = useState<Partial<IntegracoesConfig>>({
    ai_api_key: '',
    ai_system_prompt: '',
    ai_openai_key: '',
    ai_openai_active: false,
    ai_deepseek_key: '',
    ai_deepseek_active: false,
    ai_gemini_key: '',
    ai_gemini_active: false,
    ai_manus_key: '',
    ai_manus_active: false,
    ai_prompt_marketing: '',
    ai_prompt_cobranca: '',
    ai_prompt_contratos: '',
    ai_prompt_bi: '',
    whatsapp_instancia_id: '',
    whatsapp_token: '',
    whatsapp_server_url: '',
    whatsapp_enabled: true,
    whatsapp_admin_phone: '',
    whatsapp_api_provider: 'uazapi',
    whatsapp_meta_business_id: '',
    whatsapp_meta_phone_id: '',
    whatsapp_meta_token: '',
    whatsapp_meta_verify_token: '',
    whatsapp_permitir_multiplos_envios_dia: false,
    clicksign_token: '',
    clicksign_ambiente: 'Sandbox',
    salario_minimo_atual: 1412,
    lembrete_preventivo_script: '',
    aviso_vencimento_script: '',
    atraso_inicial_script: '',
    atraso_critico_script: '',
    asaas_access_token: '',
    asaas_ambiente: 'Sandbox',
    asaas_webhook_secret: '',
    asaas_juros_padrao: 1,
    asaas_multa_padrao: 2,
    asaas_desconto_padrao: 0,
    // Banco Cora
    cora_ativo: false,
    cora_client_id: 'int-6niGnUQSRUDauHBRYg0xCP',
    cora_cert_pem: '',
    cora_private_key: '',
    cora_juros_padrao: 1,
    cora_multa_padrao: 2,
    cora_desconto_padrao: 0,
    cora_webhook_url: 'https://transporte.coliseusistemas.com.br/api/webhooks/cora/webhook-receive',
    // E-mail
    email_provedor: 'smtp',
    email_smtp_host: '',
    email_smtp_port: 587,
    email_smtp_user: '',
    email_smtp_pass: '',
    email_smtp_secure: false,
    email_remetente_nome: 'Coliseu Transporte',
    email_remetente: '',
    email_brevo_api_key: '',
    email_marketing_topo_url: '',
    email_marketing_rodape_url: '',
    email_cobranca_topo_url: '',
    email_cobranca_rodape_url: '',
    // Portador e Espécie Padrão
    portador_padrao_id: null,
    portador_padrao_nome: '',
    especie_padrao_id: null,
    especie_padrao_nome: ''
  })

  const [testingAI, setTestingAI] = useState<{ [key: string]: boolean }>({})
  const [aiStatus, setAiStatus] = useState<{ [key: string]: 'idle' | 'success' | 'failed' }>({})
  const [aiMessage, setAiMessage] = useState<{ [key: string]: string }>({})

  const handleTestAIConnection = async (provider: 'openai' | 'deepseek' | 'gemini' | 'manus') => {
    setTestingAI(prev => ({ ...prev, [provider]: true }))
    setAiStatus(prev => ({ ...prev, [provider]: 'idle' }))
    setAiMessage(prev => ({ ...prev, [provider]: '' }))
    try {
      const keyToSubmit = 
        provider === 'openai' ? form.ai_openai_key :
        provider === 'deepseek' ? form.ai_deepseek_key :
        provider === 'gemini' ? form.ai_gemini_key :
        provider === 'manus' ? form.ai_manus_key : ''

      const res = await api.post('/configuracoes/test-ai-connection', {
        provider,
        ai_api_key: keyToSubmit
      })
      if (res.data?.success) {
        setAiStatus(prev => ({ ...prev, [provider]: 'success' }))
        setAiMessage(prev => ({ ...prev, [provider]: res.data?.message || 'Conectado com sucesso!' }))
        // Auto-ativar o switch ao obter sucesso no teste de conexão
        setForm(prev => {
          const updated = { ...prev };
          if (provider === 'openai') updated.ai_openai_active = true;
          else if (provider === 'deepseek') updated.ai_deepseek_active = true;
          else if (provider === 'gemini') updated.ai_gemini_active = true;
          else if (provider === 'manus') updated.ai_manus_active = true;
          return updated;
        });
      } else {
        setAiStatus(prev => ({ ...prev, [provider]: 'failed' }))
        setAiMessage(prev => ({ ...prev, [provider]: res.data?.error || 'Erro desconhecido na resposta.' }))
      }
    } catch (err: any) {
      console.error(err)
      setAiStatus(prev => ({ ...prev, [provider]: 'failed' }))
      setAiMessage(prev => ({ ...prev, [provider]: err.response?.data?.error || err.message || 'Falha na conexão com a API de AI.' }))
    } finally {
      setTestingAI(prev => ({ ...prev, [provider]: false }))
    }
  }

  const [testingAsaas, setTestingAsaas] = useState(false)
  const [testingEmail, setTestingEmail] = useState(false)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [recalcFeedback, setRecalcFeedback] = useState<{
    applied: boolean;
    installmentsCount: number;
    message: string;
  } | null>(null)

  const handleTestAsaasConnection = async () => {
    setTestingAsaas(true)
    try {
      const cleanToken = (form.asaas_access_token && !form.asaas_access_token.includes('...')) ? form.asaas_access_token : undefined
      const res = await api.post('/asaas/test-connection', {
        token: cleanToken,
        ambiente: form.asaas_ambiente || 'Produção'
      })

      const data = res.data?.data || {}
      if (data.avisoAmbiente) {
        alert(`⚡ CONEXÃO AUTENTICADA COM SUCESSO!\n\n${data.avisoAmbiente.replace(/\*\*/g, '')}\n\nSaldo disponível na conta: R$ ${data.balance ?? 0}`)
        if (data.ambienteDetectado) {
          setForm(prev => ({ ...prev, asaas_ambiente: data.ambienteDetectado }))
        }
      } else {
        alert(`✅ Sucesso! Conexão autenticada com o Banco Asaas (${form.asaas_ambiente || 'Produção'}).\n\nSaldo disponível na conta: R$ ${data.balance ?? 0}`)
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message
      alert(`❌ Falha na conexão com o Asaas:\n${msg}`)
    } finally {
      setTestingAsaas(false)
    }
  }

  const handleTestEmailConnection = async () => {
    setTestingEmail(true)
    try {
      // Se a senha contém '...' (mascarada do banco), NÃO enviar no body
      // Isso faz o backend buscar a senha real do banco de dados
      const senhaFornecida = form.email_smtp_pass && !form.email_smtp_pass.includes('...')
        ? form.email_smtp_pass
        : undefined

      // Se a senha está mascarada, testar usando a config salva no banco
      if (!senhaFornecida) {
        // Deixa o backend usar a senha salva (não envia corpo de teste)
        const res = await api.post('/email/test-connection', {})
        const d = res.data?.data
        alert(`✅ Conexão de e-mail OK!\nProvedor: ${d?.provedor}\n${d?.conta ? `Conta: ${d.conta}` : `Host: ${d?.host}:${d?.porta}`}`)
        return
      }

      const payload = {
        provedor:         form.email_provedor,
        smtp_host:        form.email_smtp_host,
        smtp_port:        form.email_smtp_port,
        smtp_user:        form.email_smtp_user,
        smtp_pass:        senhaFornecida,
        smtp_secure:      form.email_smtp_secure,
        remetente_nome:   form.email_remetente_nome,
        remetente_email:  form.email_remetente,
        brevo_api_key:    (form.email_brevo_api_key && !form.email_brevo_api_key.includes('...')) ? form.email_brevo_api_key : undefined
      }
      const res = await api.post('/email/test-connection', payload)
      const d = res.data?.data
      alert(`✅ Conexão de e-mail OK!\nProvedor: ${d?.provedor}\n${d?.conta ? `Conta: ${d.conta}` : `Host: ${d?.host}:${d?.porta}`}`)
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message
      // Traduz erros comuns do Gmail para português
      const msgFriendly = msg.includes('Invalid login') || msg.includes('Username and Password not accepted')
        ? '❌ Usuário ou Senha inválidos.\n\n💡 Para Gmail, use uma SENHA DE APP:\nmyaccount.google.com/apppasswords\n\nGere uma senha para "Outro aplicativo" e use ela.'
        : msg.includes('self signed') || msg.includes('certificate')
        ? '❌ Erro de certificado SSL. Desative TLS/SSL Seguro ou use porta 587.'
        : msg.includes('ECONNREFUSED') || msg.includes('connect')
        ? '❌ Não foi possível conectar ao servidor SMTP.\nVerifique Host e Porta.'
        : `❌ Falha na conexão:\n${msg}`
      alert(msgFriendly)
    } finally {
      setTestingEmail(false)
    }
  }


  // Sync initial configuration to local form
  useEffect(() => {
    if (configRes?.data) {
      const c = configRes.data
      const currentFilial = filiais.find(f => f.depto_id === selectedBranch)
      setForm({
        ai_api_key: c.ai_api_key || '',
        ai_system_prompt: c.ai_system_prompt || '',
        ai_openai_key: c.ai_openai_key || '',
        ai_openai_active: !!c.ai_openai_active,
        ai_deepseek_key: c.ai_deepseek_key || '',
        ai_deepseek_active: !!c.ai_deepseek_active,
        ai_gemini_key: c.ai_gemini_key || '',
        ai_gemini_active: !!c.ai_gemini_active,
        ai_manus_key: c.ai_manus_key || '',
        ai_manus_active: !!c.ai_manus_active,
        ai_prompt_marketing: c.ai_prompt_marketing || '',
        ai_prompt_cobranca: c.ai_prompt_cobranca || '',
        ai_prompt_contratos: c.ai_prompt_contratos || '',
        ai_prompt_bi: c.ai_prompt_bi || '',
        whatsapp_instancia_id: c.whatsapp_instancia_id || '',
        whatsapp_token: c.whatsapp_token || '',
        whatsapp_server_url: c.whatsapp_server_url || '',
        whatsapp_enabled: c.whatsapp_enabled !== false,
        whatsapp_admin_phone: c.whatsapp_admin_phone || '',
        whatsapp_api_provider: c.whatsapp_api_provider || 'uazapi',
        whatsapp_meta_business_id: c.whatsapp_meta_business_id || '',
        whatsapp_meta_phone_id: c.whatsapp_meta_phone_id || '',
        whatsapp_meta_token: c.whatsapp_meta_token || '',
        whatsapp_meta_verify_token: c.whatsapp_meta_verify_token || '',
        whatsapp_permitir_multiplos_envios_dia: !!c.whatsapp_permitir_multiplos_envios_dia,
        clicksign_token: c.clicksign_token || '',
        clicksign_ambiente: c.clicksign_ambiente || 'Sandbox',
        salario_minimo_atual: Number(c.salario_minimo_atual || 1412),
        lembrete_preventivo_script: c.lembrete_preventivo_script || '',
        aviso_vencimento_script: c.aviso_vencimento_script || '',
        atraso_inicial_script: c.atraso_inicial_script || '',
        atraso_critico_script: c.atraso_critico_script || '',
        asaas_access_token: c.asaas_access_token || '',
        asaas_ambiente: c.asaas_ambiente || 'Sandbox',
        asaas_webhook_secret: c.asaas_webhook_secret || '',
        asaas_juros_padrao: Number(c.asaas_juros_padrao ?? 1),
        asaas_multa_padrao: Number(c.asaas_multa_padrao ?? 2),
        asaas_desconto_padrao: Number(c.asaas_desconto_padrao ?? 0),
        // Banco Cora
        cora_ativo: !!c.cora_ativo,
        cora_client_id: c.cora_client_id || 'int-6niGnUQSRUDauHBRYg0xCP',
        cora_cert_pem: c.cora_cert_pem || '',
        cora_private_key: c.cora_private_key || '',
        cora_juros_padrao: Number(c.cora_juros_padrao ?? 1),
        cora_multa_padrao: Number(c.cora_multa_padrao ?? 2),
        cora_desconto_padrao: Number(c.cora_desconto_padrao ?? 0),
        cora_webhook_url: c.cora_webhook_url || 'https://transporte.coliseusistemas.com.br/api/webhooks/cora/webhook-receive',
        // E-mail
        email_provedor: c.email_provedor || 'smtp',
        email_smtp_host: c.email_smtp_host || '',
        email_smtp_port: Number(c.email_smtp_port ?? 587),
        email_smtp_user: c.email_smtp_user || '',
        email_smtp_pass: c.email_smtp_pass || '',
        email_smtp_secure: !!c.email_smtp_secure,
        email_remetente_nome: c.email_remetente_nome || 'Coliseu Transporte',
        email_remetente: c.email_remetente || '',
        email_brevo_api_key: c.email_brevo_api_key || '',
        email_marketing_topo_url: c.email_marketing_topo_url || '',
        email_marketing_rodape_url: c.email_marketing_rodape_url || '',
        email_cobranca_topo_url: c.email_cobranca_topo_url || '',
        email_cobranca_rodape_url: c.email_cobranca_rodape_url || '',
        // Portador e Espécie Padrão
        portador_padrao_id: c.portador_padrao_id ? Number(c.portador_padrao_id) : null,
        portador_padrao_nome: c.portador_padrao_nome || '',
        especie_padrao_id: c.especie_padrao_id ? Number(c.especie_padrao_id) : null,
        especie_padrao_nome: c.especie_padrao_nome || '',
        // Dados da Empresa (Carregamento Dinâmico por Filial/Empresa selecionada)
        empresa_codigo: currentFilial?.depto_id || c.empresa_codigo || 1,
        empresa_nome: currentFilial?.nome || c.empresa_nome || 'COLISEU SISTEMAS',
        empresa_razao_social: currentFilial?.nome || c.empresa_razao_social || 'COLISEU SISTEMAS E SERVICOS LTDA',
        empresa_cnpj: currentFilial?.documento || c.empresa_cnpj || '00.000.000/0001-00',
        empresa_ie: c.empresa_ie || 'Isento',
        empresa_im: c.empresa_im || '',
        empresa_tipo: c.empresa_tipo || 'MONO-EMPRESA',
        empresa_regiao: c.empresa_regiao || 'CAMPO GRANDE',
        empresa_endereco: c.empresa_endereco || 'AVENIDA EDUARDO ELIAS ZAHRAN',
        empresa_numero: c.empresa_numero || '807',
        empresa_bairro: c.empresa_bairro || 'JARDIM PAULISTA',
        empresa_complemento: c.empresa_complemento || '',
        empresa_cep: c.empresa_cep || '79004-000',
        empresa_fax: c.empresa_fax || '',
        empresa_fone1: c.empresa_fone1 || '(67) 3042-3506',
        empresa_fone2: c.empresa_fone2 || '',
        empresa_praca: c.empresa_praca || '',
        empresa_responsavel: c.empresa_responsavel || '',
        empresa_email: c.empresa_email || 'contato@coliseusistemas.com.br',
        empresa_site: c.empresa_site || 'www.coliseusistemas.com.br',
        empresa_logo_url: c.empresa_logo_url || '',
        // Modelos de Documentos
        doc_modelo_pedidos: c.doc_modelo_pedidos || '',
        doc_modelo_extrato: c.doc_modelo_extrato || '',
        doc_modelo_orcamento: c.doc_modelo_orcamento || '',
        doc_modelo_recibo: c.doc_modelo_recibo || '',
        doc_termo_garantia: c.doc_termo_garantia || '',
        doc_observacao_padrao: c.doc_observacao_padrao || '',
        // Padronização
        padrao_nat_venda: c.padrao_nat_venda || 'VENDA DENTRO DO ESTADO',
        padrao_nat_compra: c.padrao_nat_compra || 'COMPRA MERC. DENTRO DO ESTADO',
        padrao_nat_dev_saida: c.padrao_nat_dev_saida || 'DEVOLUÇÃO VENDAS',
        padrao_nat_dev_entrada: c.padrao_nat_dev_entrada || 'DEVOLUÇÃO VENDAS',
        padrao_nat_servico_saida: c.padrao_nat_servico_saida || '',
        padrao_nat_servico_entrada: c.padrao_nat_servico_entrada || '',
        padrao_departamento: c.padrao_departamento || 'COLISEU GERAL',
        padrao_codigo_produto: c.padrao_codigo_produto || 'CODIGO_FAB',
        padrao_numero_pedido: c.padrao_numero_pedido || 'PEDIDO',
        padrao_rota_pedidos: c.padrao_rota_pedidos || '',
        padrao_centro_custo: c.padrao_centro_custo || 'COLISEU RECEITAS',
        padrao_centro_custo_id: c.padrao_centro_custo_id ? Number(c.padrao_centro_custo_id) : (c.padrao_centro_custo === 'COLISEU RECEITAS' ? 6 : null),
        padrao_caixa: c.padrao_caixa || 'CAIXA DIARIO - LOJA',
        padrao_caixa_cofre: c.padrao_caixa_cofre || 'CAIXA COFRE',
        padrao_moeda: c.padrao_moeda || 'REAL',
        padrao_portador: c.padrao_portador || 'CARTEIRA',
        padrao_forma_pagto_prazo: c.padrao_forma_pagto_prazo || 'A VENCER',
        padrao_tabela_precos: c.padrao_tabela_precos || '',
        padrao_tipo_juros_titulo: c.padrao_tipo_juros_titulo || 'Composto',
        padrao_tipo_juros_venda: c.padrao_tipo_juros_venda || 'Juros Composto',
        padrao_modelo_resumo_financeiro: c.padrao_modelo_resumo_financeiro || 'Modelo 1.4 - Vendas e Financeiro II',
        padrao_juros_carencia_dias: Number(c.padrao_juros_carencia_dias ?? 0),
        padrao_juros_percentual: Number(c.padrao_juros_percentual ?? 0),
        padrao_plano_contas_id: c.padrao_plano_contas_id ? Number(c.padrao_plano_contas_id) : null,
        padrao_plano_contas_nome: c.padrao_plano_contas_nome || ''
      })
    }
  }, [configRes, selectedBranch, filiais])

  // Automation Queries
  const { data: automacoesRes, refetch: refetchAutomacoes } = useApiQuery<{ data: any[] }>('/automacoes')
  const { data: templatesRes } = useApiQuery<{ data: any[] }>('/templates')
  const automacoes = automacoesRes?.data || []
  const templates = templatesRes?.data || []

  // Portadores, Espécies e Planos de Contas (sincronizados do ERP Firebird)
  const { data: portadoresRes } = useApiQuery<{ data: { id: number; descricao: string }[] }>('/financeiro/portadores')
  const { data: especiesRes } = useApiQuery<{ data: { id: number; descricao: string; tipo: number }[] }>('/financeiro/especies')
  const { data: planosRes } = useApiQuery<{ data: { id: number; nome: string; tipo: string }[] }>('/financeiro/plano-contas')
  const portadores = portadoresRes?.data || []
  const especies = especiesRes?.data || []
  const planos = planosRes?.data || []

  // Usuários do Tenant & Grupos de Acesso
  const { data: usuariosRes, isLoading: isUsuariosLoading, refetch: refetchUsuarios } = useApiQuery<any>('/usuarios')
  const { data: gruposRes } = useApiQuery<any>('/grupos-acesso')
  const usuariosList = Array.isArray(usuariosRes) ? usuariosRes : (usuariosRes?.data || [])
  const gruposList = gruposRes?.data || (Array.isArray(gruposRes) ? gruposRes : [])

  const [selectedUserToEdit, setSelectedUserToEdit] = useState<any>(null)
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false)
  const [isGrupoModalOpen, setIsGrupoModalOpen] = useState(false)
  const [editingGrupo, setEditingGrupo] = useState<any>(null)

  // Local state for automation parameters (in Days)
  // Marketing Configs
  const [periodicDays, setPeriodicDays] = useState(1)
  const [postPurchaseDays, setPostPurchaseDays] = useState(3)
  const [brandXName, setBrandXName] = useState('Coliseu')

  // Cobrança Configs (Relative days to due date)
  const [preventivoDays, setPreventivoDays] = useState(-5)
  const [encargosDays, setEncargosDays] = useState(3)
  const [suspensaoDays, setSuspensaoDays] = useState(12)

  // Pedidos Configs (in Days)
  const [onboardingDays, setOnboardingDays] = useState(1)
  const [suporteDays, setSuporteDays] = useState(20)
  const [npsDays, setNpsDays] = useState(90)

  // Templates state
  const [periodicTemplateId, setPeriodicTemplateId] = useState('')
  const [periodicEmailTemplateId, setPeriodicEmailTemplateId] = useState('')
  const [birthdayTemplateId, setBirthdayTemplateId] = useState('')
  const [birthdayEmailTemplateId, setBirthdayEmailTemplateId] = useState('')
  const [postPurchaseTemplateId, setPostPurchaseTemplateId] = useState('')
  const [postPurchaseEmailTemplateId, setPostPurchaseEmailTemplateId] = useState('')
  const [brandXTemplateId, setBrandXTemplateId] = useState('')
  const [brandXEmailTemplateId, setBrandXEmailTemplateId] = useState('')

  const [preventivoTemplateId, setPreventivoTemplateId] = useState('')
  const [preventivoEmailTemplateId, setPreventivoEmailTemplateId] = useState('')
  const [encargosTemplateId, setEncargosTemplateId] = useState('')
  const [encargosEmailTemplateId, setEncargosEmailTemplateId] = useState('')
  const [suspensaoTemplateId, setSuspensaoTemplateId] = useState('')
  const [suspensaoEmailTemplateId, setSuspensaoEmailTemplateId] = useState('')

  const [onboardingTemplateId, setOnboardingTemplateId] = useState('')
  const [onboardingEmailTemplateId, setOnboardingEmailTemplateId] = useState('')
  const [auditoriaTemplateId, setAuditoriaTemplateId] = useState('')
  const [auditoriaEmailTemplateId, setAuditoriaEmailTemplateId] = useState('')
  const [suporteTemplateId, setSuporteTemplateId] = useState('')
  const [suporteEmailTemplateId, setSuporteEmailTemplateId] = useState('')
  const [npsTemplateId, setNpsTemplateId] = useState('')
  const [npsEmailTemplateId, setNpsEmailTemplateId] = useState('')

  // Channels state
  const [periodicCanal, setPeriodicCanal] = useState('whatsapp')
  const [birthdayCanal, setBirthdayCanal] = useState('whatsapp')
  const [postPurchaseCanal, setPostPurchaseCanal] = useState('whatsapp')
  const [brandXCanal, setBrandXCanal] = useState('whatsapp')

  const [preventivoCanal, setPreventivoCanal] = useState('whatsapp')
  const [encargosCanal, setEncargosCanal] = useState('whatsapp')
  const [suspensaoCanal, setSuspensaoCanal] = useState('whatsapp')

  const [onboardingCanal, setOnboardingCanal] = useState('whatsapp')
  const [auditoriaCanal, setAuditoriaCanal] = useState('whatsapp')
  const [suporteCanal, setSuporteCanal] = useState('whatsapp')
  const [npsCanal, setNpsCanal] = useState('whatsapp')

  // Active status state
  const [periodicActive, setPeriodicActive] = useState(false)
  const [birthdayActive, setBirthdayActive] = useState(false)
  const [postPurchaseActive, setPostPurchaseActive] = useState(false)
  const [brandXActive, setBrandXActive] = useState(false)

  const [preventivoActive, setPreventivoActive] = useState(false)
  const [encargosActive, setEncargosActive] = useState(false)
  const [suspensaoActive, setSuspensaoActive] = useState(false)

  const [onboardingActive, setOnboardingActive] = useState(false)
  const [auditoriaActive, setAuditoriaActive] = useState(false)
  const [suporteActive, setSuporteActive] = useState(false)
  const [npsActive, setNpsActive] = useState(false)

  // Sync loaded automations parameters
  useEffect(() => {
    if (automacoesRes?.data) {
      const list = automacoesRes.data

      const periodic = list.find((a: any) => a.gatilho === 'tempo_em_tempo')
      if (periodic) {
        setPeriodicDays(Math.max(1, Math.round((periodic.tempo_segundos || 86400) / 86400)))
        setPeriodicTemplateId(periodic.template_id ? String(periodic.template_id) : '')
        setPeriodicEmailTemplateId(periodic.template_email_id ? String(periodic.template_email_id) : '')
        setPeriodicCanal(periodic.canal || 'whatsapp')
        setPeriodicActive(!!periodic.ativo)
      }

      const birthday = list.find((a: any) => a.gatilho === 'aniversario')
      if (birthday) {
        setBirthdayTemplateId(birthday.template_id ? String(birthday.template_id) : '')
        setBirthdayEmailTemplateId(birthday.template_email_id ? String(birthday.template_email_id) : '')
        setBirthdayCanal(birthday.canal || 'whatsapp')
        setBirthdayActive(!!birthday.ativo)
      }

      const postPurchase = list.find((a: any) => a.gatilho === 'pos_compra')
      if (postPurchase) {
        setPostPurchaseDays(Math.max(1, Math.round((postPurchase.tempo_segundos || 259200) / 86400)))
        setPostPurchaseTemplateId(postPurchase.template_id ? String(postPurchase.template_id) : '')
        setPostPurchaseEmailTemplateId(postPurchase.template_email_id ? String(postPurchase.template_email_id) : '')
        setPostPurchaseCanal(postPurchase.canal || 'whatsapp')
        setPostPurchaseActive(!!postPurchase.ativo)
      }

      const brandX = list.find((a: any) => a.gatilho === 'compra_marca')
      if (brandX) {
        let brand = 'Coliseu';
        if (brandX.meta) {
          if (typeof brandX.meta === 'object') {
            brand = brandX.meta.marca || 'Coliseu';
          } else if (typeof brandX.meta === 'string') {
            try {
              const parsed = JSON.parse(brandX.meta);
              brand = parsed.marca || 'Coliseu';
            } catch (e) {
              brand = brandX.meta;
            }
          }
        }
        setBrandXName(brand)
        setBrandXTemplateId(brandX.template_id ? String(brandX.template_id) : '')
        setBrandXEmailTemplateId(brandX.template_email_id ? String(brandX.template_email_id) : '')
        setBrandXCanal(brandX.canal || 'whatsapp')
        setBrandXActive(!!brandX.ativo)
      }

      const preventivo = list.find((a: any) => a.gatilho === 'lembrete_preventivo')
      if (preventivo) {
        setPreventivoDays(preventivo.dias_vencimento)
        setPreventivoTemplateId(preventivo.template_id ? String(preventivo.template_id) : '')
        setPreventivoEmailTemplateId(preventivo.template_email_id ? String(preventivo.template_email_id) : '')
        setPreventivoCanal(preventivo.canal || 'whatsapp')
        setPreventivoActive(!!preventivo.ativo)
      }

      const encargos = list.find((a: any) => a.gatilho === 'encargos_d3')
      if (encargos) {
        setEncargosDays(encargos.dias_vencimento)
        setEncargosTemplateId(encargos.template_id ? String(encargos.template_id) : '')
        setEncargosEmailTemplateId(encargos.template_email_id ? String(encargos.template_email_id) : '')
        setEncargosCanal(encargos.canal || 'whatsapp')
        setEncargosActive(!!encargos.ativo)
      }

      const suspensao = list.find((a: any) => a.gatilho === 'suspensao_d12')
      if (suspensao) {
        setSuspensaoDays(suspensao.dias_vencimento)
        setSuspensaoTemplateId(suspensao.template_id ? String(suspensao.template_id) : '')
        setSuspensaoEmailTemplateId(suspensao.template_email_id ? String(suspensao.template_email_id) : '')
        setSuspensaoCanal(suspensao.canal || 'whatsapp')
        setSuspensaoActive(!!suspensao.ativo)
      }

      const onboarding = list.find((a: any) => a.gatilho === 'pedido_onboarding')
      if (onboarding) {
        setOnboardingDays(Math.max(1, Math.round((onboarding.tempo_segundos || 86400) / 86400)))
        setOnboardingTemplateId(onboarding.template_id ? String(onboarding.template_id) : '')
        setOnboardingEmailTemplateId(onboarding.template_email_id ? String(onboarding.template_email_id) : '')
        setOnboardingCanal(onboarding.canal || 'whatsapp')
        setOnboardingActive(!!onboarding.ativo)
      }

      const auditoria = list.find((a: any) => a.gatilho === 'auditoria_terminais')
      if (auditoria) {
        setAuditoriaTemplateId(auditoria.template_id ? String(auditoria.template_id) : '')
        setAuditoriaEmailTemplateId(auditoria.template_email_id ? String(auditoria.template_email_id) : '')
        setAuditoriaCanal(auditoria.canal || 'whatsapp')
        setAuditoriaActive(!!auditoria.ativo)
      }

      const suporte = list.find((a: any) => a.gatilho === 'pos_venda_suporte')
      if (suporte) {
        setSuporteDays(Math.max(1, Math.round((suporte.tempo_segundos || 1728000) / 86400)))
        setSuporteTemplateId(suporte.template_id ? String(suporte.template_id) : '')
        setSuporteEmailTemplateId(suporte.template_email_id ? String(suporte.template_email_id) : '')
        setSuporteCanal(suporte.canal || 'whatsapp')
        setSuporteActive(!!suporte.ativo)
      }

      const nps = list.find((a: any) => a.gatilho === 'nps_periodico')
      if (nps) {
        setNpsDays(Math.max(1, Math.round((nps.tempo_segundos || 7776000) / 86400)))
        setNpsTemplateId(nps.template_id ? String(nps.template_id) : '')
        setNpsEmailTemplateId(nps.template_email_id ? String(nps.template_email_id) : '')
        setNpsCanal(nps.canal || 'whatsapp')
        setNpsActive(!!nps.ativo)
      }
    }
  }, [automacoesRes])

  // Reset Automacoes History
  const handleResetAutomacoes = async () => {
    const confirmReset = window.confirm(
      "ATENÇÃO: Isso irá limpar o histórico de mensagens já enviadas para todos os seus clientes nas automações.\n\n" +
      "Caso algum cliente atenda aos critérios das réguas ativas, ele receberá a mensagem novamente no próximo ciclo do agendador.\n\n" +
      "Deseja continuar?"
    );

    if (!confirmReset) return;

    try {
      setResetting(true);
      const response = await api.delete('/configuracoes/reset-automacoes');
      if (response.data && response.data.success) {
        alert("Histórico de envios de automações resetado com sucesso!");
      } else {
        alert("Erro ao resetar: " + (response.data?.message || "Erro desconhecido"));
      }
    } catch (err: any) {
      alert("Erro na conexão: " + (err.response?.data?.message || err.message));
    } finally {
      setResetting(false);
    }
  };

  // Save Automacoes Parameters
  const handleSaveAutomacoes = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const updates = [
        { 
          gatilho: 'tempo_em_tempo', 
          fields: { 
            tempo_segundos: periodicDays * 86400,
            template_id: periodicTemplateId ? parseInt(periodicTemplateId, 10) : null,
            template_email_id: periodicEmailTemplateId ? parseInt(periodicEmailTemplateId, 10) : null,
            canal: periodicCanal,
            ativo: periodicActive
          } 
        },
        { 
          gatilho: 'aniversario', 
          fields: { 
            template_id: birthdayTemplateId ? parseInt(birthdayTemplateId, 10) : null,
            template_email_id: birthdayEmailTemplateId ? parseInt(birthdayEmailTemplateId, 10) : null,
            canal: birthdayCanal,
            ativo: birthdayActive
          } 
        },
        { 
          gatilho: 'pos_compra', 
          fields: { 
            tempo_segundos: postPurchaseDays * 86400,
            template_id: postPurchaseTemplateId ? parseInt(postPurchaseTemplateId, 10) : null,
            template_email_id: postPurchaseEmailTemplateId ? parseInt(postPurchaseEmailTemplateId, 10) : null,
            canal: postPurchaseCanal,
            ativo: postPurchaseActive
          } 
        },
        { 
          gatilho: 'compra_marca', 
          fields: { 
            meta: { marca: brandXName },
            template_id: brandXTemplateId ? parseInt(brandXTemplateId, 10) : null,
            template_email_id: brandXEmailTemplateId ? parseInt(brandXEmailTemplateId, 10) : null,
            canal: brandXCanal,
            ativo: brandXActive
          } 
        },
        { 
          gatilho: 'lembrete_preventivo', 
          fields: { 
            dias_vencimento: preventivoDays,
            template_id: preventivoTemplateId ? parseInt(preventivoTemplateId, 10) : null,
            template_email_id: preventivoEmailTemplateId ? parseInt(preventivoEmailTemplateId, 10) : null,
            canal: preventivoCanal,
            ativo: preventivoActive
          } 
        },
        { 
          gatilho: 'encargos_d3', 
          fields: { 
            dias_vencimento: encargosDays,
            template_id: encargosTemplateId ? parseInt(encargosTemplateId, 10) : null,
            template_email_id: encargosEmailTemplateId ? parseInt(encargosEmailTemplateId, 10) : null,
            canal: encargosCanal,
            ativo: encargosActive
          } 
        },
        { 
          gatilho: 'suspensao_d12', 
          fields: { 
            dias_vencimento: suspensaoDays,
            template_id: suspensaoTemplateId ? parseInt(suspensaoTemplateId, 10) : null,
            template_email_id: suspensaoEmailTemplateId ? parseInt(suspensaoEmailTemplateId, 10) : null,
            canal: suspensaoCanal,
            ativo: suspensaoActive
          } 
        },
        { 
          gatilho: 'pedido_onboarding', 
          fields: { 
            tempo_segundos: onboardingDays * 86400,
            template_id: onboardingTemplateId ? parseInt(onboardingTemplateId, 10) : null,
            template_email_id: onboardingEmailTemplateId ? parseInt(onboardingEmailTemplateId, 10) : null,
            canal: onboardingCanal,
            ativo: onboardingActive
          } 
        },
        { 
          gatilho: 'auditoria_terminais', 
          fields: { 
            template_id: auditoriaTemplateId ? parseInt(auditoriaTemplateId, 10) : null,
            template_email_id: auditoriaEmailTemplateId ? parseInt(auditoriaEmailTemplateId, 10) : null,
            canal: auditoriaCanal,
            ativo: auditoriaActive
          } 
        },
        { 
          gatilho: 'pos_venda_suporte', 
          fields: { 
            tempo_segundos: suporteDays * 86400,
            template_id: suporteTemplateId ? parseInt(suporteTemplateId, 10) : null,
            template_email_id: suporteEmailTemplateId ? parseInt(suporteEmailTemplateId, 10) : null,
            canal: suporteCanal,
            ativo: suporteActive
          } 
        },
        { 
          gatilho: 'nps_periodico', 
          fields: { 
            tempo_segundos: npsDays * 86400,
            template_id: npsTemplateId ? parseInt(npsTemplateId, 10) : null,
            template_email_id: npsEmailTemplateId ? parseInt(npsEmailTemplateId, 10) : null,
            canal: npsCanal,
            ativo: npsActive
          } 
        }
      ]

      for (const item of updates) {
        const existing = automacoes.find((a: any) => a.gatilho === item.gatilho)
        if (existing) {
          await api.put(`/automacoes/${existing.id}`, item.fields)
        } else if (item.fields.template_id) {
          // Fallback: create default automation rule if it doesn't exist yet and template_id is selected
          let category = 'marketing'
          if (['lembrete_preventivo', 'encargos_d3', 'suspensao_d12'].includes(item.gatilho)) {
            category = 'cobranca'
          } else if (['pedido_onboarding', 'auditoria_terminais', 'pos_venda_suporte', 'nps_periodico'].includes(item.gatilho)) {
            category = 'pos_venda'
          }
          await api.post('/automacoes', {
            gatilho: item.gatilho,
            dias_vencimento: 0,
            tempo_segundos: 0,
            meta: {},
            ...item.fields
          })
        }
      }

      alert('Parâmetros de automação salvos com sucesso!')
      refetchAutomacoes()
    } catch (err) {
      console.error(err)
      alert('Erro ao salvar parâmetros de automação.')
    } finally {
      setSaving(false)
    }
  }

  // Save Settings
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setRecalcFeedback(null)

    try {
      const res = await api.post('/configuracoes/integracoes', form)
      refetchConfig()
      
      if (res.data.recalculation?.applied) {
        setRecalcFeedback({
          applied: true,
          installmentsCount: res.data.recalculation.installmentsCount,
          message: res.data.recalculation.message
        })
      } else {
        alert('Configurações salvas com sucesso!')
      }
    } catch (err: any) {
      console.error(err)
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || 'Erro ao salvar configurações.'
      alert(`❌ Erro ao salvar configurações:\n\n${errorMsg}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Header Compacto Unificado com Barra de Abas */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 px-3 shadow-2xs space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-gradient-to-tr from-indigo-600 to-purple-600 text-white rounded-lg shadow-2xs">
              <Settings size={16} />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight leading-tight">
                Configurações do Sistema
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Informações da empresa, usuários vinculados, modelos de documentos e integrações
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={activeTab === 'automacoes' ? handleSaveAutomacoes : handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-lg shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar Configurações
          </button>
        </div>

        {/* BARRA DE MENUS / ABAS (COMPACTA) */}
        <div className="flex items-center gap-1 overflow-x-auto pt-1 border-t border-slate-100 dark:border-slate-800 font-heading">
          <button
            type="button"
            onClick={() => setActiveTab('empresa')}
            className={clsx(
              "py-1.5 px-3 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              activeTab === 'empresa'
                ? "bg-indigo-600 text-white shadow-2xs"
                : "bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            )}
          >
            <Building size={13} /> Dados da Empresa
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('padronizacao')}
            className={clsx(
              "py-1.5 px-3 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              activeTab === 'padronizacao'
                ? "bg-indigo-600 text-white shadow-2xs"
                : "bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            )}
          >
            <SlidersHorizontal size={13} /> Padronização
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('usuarios')}
            className={clsx(
              "py-1.5 px-3 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              activeTab === 'usuarios'
                ? "bg-indigo-600 text-white shadow-2xs"
                : "bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            )}
          >
            <Users size={13} /> Usuários Vinculados
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('documentos')}
            className={clsx(
              "py-1.5 px-3 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              activeTab === 'documentos'
                ? "bg-indigo-600 text-white shadow-2xs"
                : "bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            )}
          >
            <FileText size={13} /> Documentos, Impressão & Mensagens
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('gerais')}
            className={clsx(
              "py-1.5 px-3 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              activeTab === 'gerais'
                ? "bg-indigo-600 text-white shadow-2xs"
                : "bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            )}
          >
            <Sliders size={13} /> Opções Gerais & Atividade
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('apis')}
            className={clsx(
              "py-1.5 px-3 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              activeTab === 'apis'
                ? "bg-indigo-600 text-white shadow-2xs"
                : "bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            )}
          >
            <Key size={13} /> Módulos & APIs (Bancos / Email / IA / Whats)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('seguranca')}
            className={clsx(
              "py-1.5 px-3 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              activeTab === 'seguranca'
                ? "bg-indigo-600 text-white shadow-2xs"
                : "bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            )}
          >
            <Shield size={13} /> Segurança
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('fiscal')}
            className={clsx(
              "py-1.5 px-3 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              activeTab === 'fiscal'
                ? "bg-indigo-600 text-white shadow-2xs"
                : "bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            )}
          >
            <Building2 size={13} /> Fiscal
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={clsx(
              "py-1.5 px-3 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              activeTab === 'logs'
                ? "bg-indigo-600 text-white shadow-2xs"
                : "bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            )}
          >
            <ScrollText size={13} /> Logs do Sistema (Auditoria)
          </button>
        </div>
      </div>

      {/* ALERTA DE SELEÇÃO OBRIGATÓRIA DE FILIAL PARA AMBIENTE MULTI-EMPRESA */}
      {selectedBranch === 'todas' && (activeTab === 'empresa' || activeTab === 'padronizacao') && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700/60 rounded-xl p-3 shadow-2xs space-y-2 animate-fade-in">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
            <AlertTriangle size={18} className="shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <h4 className="font-extrabold text-xs uppercase tracking-tight">
                Modo Multi-Empresa: Seleção de Empresa Obrigatória
              </h4>
              <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
                Não é permitido editar configurações para "Todas as Filiais". Por favor, selecione qual empresa deseja configurar:
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {filiais.map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedBranch(f.depto_id)}
                className="px-3 py-1 bg-white dark:bg-slate-900 hover:bg-amber-100 border border-amber-300 dark:border-amber-700 font-bold text-xs text-amber-900 dark:text-amber-100 rounded-lg shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Building size={13} className="text-amber-600" />
                <span>{f.nome}</span>
                <span className="text-[10px] text-amber-500 font-mono">#{f.depto_id}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {isConfigLoading ? (
        <div className="card p-6 text-center text-xs text-text-muted flex justify-center items-center gap-2">
          <RefreshCw size={14} className="animate-spin" /> Carregando parâmetros de integração...
        </div>
      ) : (
        <form onSubmit={activeTab === 'automacoes' ? handleSaveAutomacoes : handleSave} className="space-y-3">
          
          {/* TAB: DADOS DA EMPRESA */}
          {activeTab === 'empresa' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 sm:p-4 shadow-2xs space-y-3 animate-fade-in">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                  <Building size={16} />
                  <h3 className="font-extrabold text-xs uppercase text-slate-800 dark:text-slate-200 font-heading">
                    Informações da Empresa ({form.empresa_nome || 'Selecione a Filial'})
                  </h3>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">
                  Código Filial ERP: #{form.empresa_codigo || selectedBranch}
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                
                {/* 3 COLUNAS DE FORMULÁRIO (ESQUERDA) */}
                <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  
                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">Código</label>
                    <input
                      type="number"
                      value={form.empresa_codigo || 1}
                      onChange={(e) => setForm({ ...form, empresa_codigo: parseInt(e.target.value) || 1 })}
                      className="input !py-1 !px-2.5 text-xs font-mono font-bold w-full h-8 bg-slate-100 dark:bg-slate-800 border-slate-300 rounded-lg"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">Nome Fantasia</label>
                    <input
                      type="text"
                      value={form.empresa_nome || ''}
                      onChange={(e) => setForm({ ...form, empresa_nome: e.target.value })}
                      placeholder="COLISEU SISTEMAS"
                      className="input !py-1 !px-2.5 text-xs font-bold uppercase w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">Razão Social</label>
                    <input
                      type="text"
                      value={form.empresa_razao_social || ''}
                      onChange={(e) => setForm({ ...form, empresa_razao_social: e.target.value })}
                      placeholder="COLISEU SISTEMAS E SERVICOS LTDA"
                      className="input !py-1 !px-2.5 text-xs font-bold uppercase w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">CNPJ</label>
                    <input
                      type="text"
                      value={form.empresa_cnpj || ''}
                      onChange={(e) => setForm({ ...form, empresa_cnpj: e.target.value })}
                      placeholder="00.000.000/0001-00"
                      className="input !py-1 !px-2.5 text-xs font-mono font-bold w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">Inscrição Estadual (I.E.)</label>
                    <input
                      type="text"
                      value={form.empresa_ie || ''}
                      onChange={(e) => setForm({ ...form, empresa_ie: e.target.value })}
                      placeholder="Isento"
                      className="input !py-1 !px-2.5 text-xs font-mono font-bold w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">Inscrição Municipal (I.M.)</label>
                    <input
                      type="text"
                      value={form.empresa_im || ''}
                      onChange={(e) => setForm({ ...form, empresa_im: e.target.value })}
                      placeholder="Isento"
                      className="input !py-1 !px-2.5 text-xs font-mono font-bold w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">Tipo de Empresa</label>
                    <select
                      value={form.empresa_tipo || 'MONO-EMPRESA'}
                      onChange={(e) => setForm({ ...form, empresa_tipo: e.target.value })}
                      className="input !py-1 !px-2 text-xs font-bold w-full h-8 bg-white dark:bg-slate-900 border-slate-300 cursor-pointer rounded-lg"
                    >
                      <option value="MONO-EMPRESA">MONO-EMPRESA</option>
                      <option value="MULTI-EMPRESA">MULTI-EMPRESA (MATRIZ/FILIAL)</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">Região / Cidade Sede</label>
                    <input
                      type="text"
                      value={form.empresa_regiao || ''}
                      onChange={(e) => setForm({ ...form, empresa_regiao: e.target.value })}
                      placeholder="CAMPO GRANDE"
                      className="input !py-1 !px-2.5 text-xs font-bold uppercase w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">Endereço</label>
                    <input
                      type="text"
                      value={form.empresa_endereco || ''}
                      onChange={(e) => setForm({ ...form, empresa_endereco: e.target.value })}
                      placeholder="AVENIDA EDUARDO ELIAS ZAHRAN"
                      className="input !py-1 !px-2.5 text-xs font-bold uppercase w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">Número</label>
                    <input
                      type="text"
                      value={form.empresa_numero || ''}
                      onChange={(e) => setForm({ ...form, empresa_numero: e.target.value })}
                      placeholder="807"
                      className="input !py-1 !px-2.5 text-xs font-bold uppercase w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">Bairro</label>
                    <input
                      type="text"
                      value={form.empresa_bairro || ''}
                      onChange={(e) => setForm({ ...form, empresa_bairro: e.target.value })}
                      placeholder="JARDIM PAULISTA"
                      className="input !py-1 !px-2.5 text-xs font-bold uppercase w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">Complemento</label>
                    <input
                      type="text"
                      value={form.empresa_complemento || ''}
                      onChange={(e) => setForm({ ...form, empresa_complemento: e.target.value })}
                      placeholder="SALA, BLOCO..."
                      className="input !py-1 !px-2.5 text-xs font-bold uppercase w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">CEP</label>
                    <input
                      type="text"
                      value={form.empresa_cep || ''}
                      onChange={(e) => setForm({ ...form, empresa_cep: e.target.value })}
                      placeholder="79004-000"
                      className="input !py-1 !px-2.5 text-xs font-mono font-bold w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">Fax</label>
                    <input
                      type="text"
                      value={form.empresa_fax || ''}
                      onChange={(e) => setForm({ ...form, empresa_fax: e.target.value })}
                      placeholder="( ) -"
                      className="input !py-1 !px-2.5 text-xs font-mono font-bold w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">Fone 1 (Principal)</label>
                    <input
                      type="text"
                      value={form.empresa_fone1 || ''}
                      onChange={(e) => setForm({ ...form, empresa_fone1: e.target.value })}
                      placeholder="(67) 3042-3506"
                      className="input !py-1 !px-2.5 text-xs font-mono font-bold w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">Fone 2 (Secundário)</label>
                    <input
                      type="text"
                      value={form.empresa_fone2 || ''}
                      onChange={(e) => setForm({ ...form, empresa_fone2: e.target.value })}
                      placeholder="( ) -"
                      className="input !py-1 !px-2.5 text-xs font-mono font-bold w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">E-mail Comercial / Financeiro</label>
                    <input
                      type="email"
                      value={form.empresa_email || ''}
                      onChange={(e) => setForm({ ...form, empresa_email: e.target.value })}
                      placeholder="contato@coliseusistemas.com.br"
                      className="input !py-1 !px-2.5 text-xs font-bold w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">Website Oficial</label>
                    <input
                      type="text"
                      value={form.empresa_site || ''}
                      onChange={(e) => setForm({ ...form, empresa_site: e.target.value })}
                      placeholder="www.coliseusistemas.com.br"
                      className="input !py-1 !px-2.5 text-xs font-bold w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                {/* QUADRO DIREITO: LOGO DA EMPRESA */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl flex flex-col items-center justify-between gap-2 text-center">
                  <div className="w-full space-y-0.5">
                    <span className="text-xs font-extrabold uppercase tracking-tight text-slate-700 dark:text-slate-300 block">
                      Logo Oficial da Empresa
                    </span>
                    <p className="text-[10px] text-slate-400">
                      Impressa em pedidos, relatórios, boletos e extratos.
                    </p>
                  </div>

                  {/* ÁREA DE PREVIEW DA LOGO */}
                  <div className="w-full h-36 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-center p-2 overflow-hidden shadow-2xs group relative">
                    {form.empresa_logo_url ? (
                      <img
                        src={form.empresa_logo_url}
                        alt="Logo da Empresa"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-1.5 text-slate-400">
                        <Building size={36} className="text-slate-300 dark:text-slate-700" />
                        <span className="text-[11px] font-bold">Sem Logo Cadastrada</span>
                      </div>
                    )}
                  </div>

                  {/* CONTROLES DE UPLOAD DE ARQUIVO E URL */}
                  <div className="w-full space-y-1">
                    <label className="w-full py-1.5 px-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-lg shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer transition-all">
                      <Upload size={13} /> Selecionar Imagem
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (evt) => {
                              setForm(prev => ({ ...prev, empresa_logo_url: evt.target?.result as string }));
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>

                    <input
                      type="text"
                      value={form.empresa_logo_url || ''}
                      onChange={(e) => setForm({ ...form, empresa_logo_url: e.target.value })}
                      placeholder="URL da imagem..."
                      className="input !py-0.5 text-[10px] font-mono text-center w-full h-7 bg-white dark:bg-slate-900 border-slate-300 rounded-md"
                    />

                    {form.empresa_logo_url && (
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, empresa_logo_url: '' })}
                        className="w-full py-0.5 text-[10px] font-bold text-rose-600 hover:text-rose-700 cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Trash2 size={11} /> Remover Logo
                      </button>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB: PADRONIZAÇÃO (MOVIMENTAÇÃO, FINANCEIRO, OUTRAS) */}
          {activeTab === 'padronizacao' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 sm:p-4 shadow-2xs space-y-3 animate-fade-in">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                  <SlidersHorizontal size={16} />
                  <h3 className="font-extrabold text-xs uppercase text-slate-800 dark:text-slate-200 font-heading">
                    Cadastro de Informações Padronizado ({form.empresa_nome || 'Filial Selecionada'})
                  </h3>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">
                  Parâmetros Padrão de Vendas, Estoque e Financeiro
                </span>
              </div>

              {/* SUB-ABAS INTERNAS DA PADRONIZAÇÃO */}
              <div className="flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-2">
                <button
                  type="button"
                  onClick={() => setPadronizacaoSubTab('movimentacao')}
                  className={clsx(
                    "px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer",
                    padronizacaoSubTab === 'movimentacao'
                      ? "bg-indigo-600 text-white shadow-2xs font-black"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                >
                  Movimentação
                </button>

                <button
                  type="button"
                  onClick={() => setPadronizacaoSubTab('financeiro')}
                  className={clsx(
                    "px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer",
                    padronizacaoSubTab === 'financeiro'
                      ? "bg-indigo-600 text-white shadow-2xs font-black"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                >
                  Financeiro
                </button>

                <button
                  type="button"
                  onClick={() => setPadronizacaoSubTab('cobrancas_ativas')}
                  className={clsx(
                    "px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer flex items-center gap-1",
                    padronizacaoSubTab === 'cobrancas_ativas'
                      ? "bg-indigo-600 text-white shadow-2xs font-black"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                >
                  💳 Cobranças Ativas & Cedentes
                </button>

                <button
                  type="button"
                  onClick={() => setPadronizacaoSubTab('portadores_especies')}
                  className={clsx(
                    "px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer flex items-center gap-1",
                    padronizacaoSubTab === 'portadores_especies'
                      ? "bg-indigo-600 text-white shadow-2xs font-black"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                >
                  🏷️ Portadores & Espécies ERP
                </button>

                <button
                  type="button"
                  onClick={() => setPadronizacaoSubTab('outras')}
                  className={clsx(
                    "px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer",
                    padronizacaoSubTab === 'outras'
                      ? "bg-indigo-600 text-white shadow-2xs font-black"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                >
                  Outras
                </button>
              </div>

              {/* SUB-TAB PORTADORES E ESPÉCIES DO ERP */}
              {padronizacaoSubTab === 'portadores_especies' && (
                <div className="space-y-4 pt-1 text-xs animate-fade-in">
                  <div className="card p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
                    <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                      <Sliders size={15} className="text-indigo-600 dark:text-indigo-400" />
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                        Portador e Espécie Padrão (Sincronizados do ERP Firebird)
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Portador Padrão (Carteira / Banco)</label>
                        <select className="input !py-1.5 rounded-lg text-xs"
                          value={form.portador_padrao_id ?? ''}
                          onChange={(e) => {
                            const sel = portadores.find(p => String(p.id) === e.target.value)
                            setForm({ ...form, portador_padrao_id: sel ? sel.id : null, portador_padrao_nome: sel?.descricao || '' })
                          }}>
                          <option value="">— Sem portador padrão —</option>
                          {portadores.map(p => <option key={p.id} value={p.id}>{p.descricao}</option>)}
                        </select>
                        {form.portador_padrao_nome && (
                          <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-2 py-1 rounded text-[10px] text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 size={11} /> Padrão: <strong>{form.portador_padrao_nome}</strong>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Espécie Padrão (Forma de Pagamento)</label>
                        <select className="input !py-1.5 rounded-lg text-xs"
                          value={form.especie_padrao_id ?? ''}
                          onChange={(e) => {
                            const sel = especies.find(s => String(s.id) === e.target.value)
                            setForm({ ...form, especie_padrao_id: sel ? sel.id : null, especie_padrao_nome: sel?.descricao || '' })
                          }}>
                          <option value="">— Sem espécie padrão —</option>
                          {especies.map(s => <option key={s.id} value={s.id}>{s.descricao}</option>)}
                        </select>
                        {form.especie_padrao_nome && (
                          <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-2 py-1 rounded text-[10px] text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 size={11} /> Padrão: <strong>{form.especie_padrao_nome}</strong>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase mb-1.5">Portadores Cadastrados no ERP:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {portadores.map(p => (
                            <span key={p.id}
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold border cursor-pointer transition-all ${form.portador_padrao_id === p.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-indigo-400'}`}
                              onClick={() => setForm({ ...form, portador_padrao_id: p.id, portador_padrao_nome: p.descricao })}>
                              #{p.id} {p.descricao}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase mb-1.5">Espécies Cadastradas no ERP:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {especies.map(s => (
                            <span key={s.id}
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold border cursor-pointer transition-all ${form.especie_padrao_id === s.id ? 'bg-amber-600 text-white border-amber-600 shadow-2xs' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-amber-400'}`}
                              onClick={() => setForm({ ...form, especie_padrao_id: s.id, especie_padrao_nome: s.descricao })}>
                              #{s.id} {s.descricao}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SUB-TAB 1: MOVIMENTAÇÃO */}
              {padronizacaoSubTab === 'movimentacao' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                      Natureza de Operação padrão para Venda:
                    </label>
                    <select
                      value={form.padrao_nat_venda || 'VENDA DENTRO DO ESTADO'}
                      onChange={(e) => setForm({ ...form, padrao_nat_venda: e.target.value })}
                      className="input !py-1 !px-2.5 text-xs font-bold w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg cursor-pointer"
                    >
                      <option value="VENDA DENTRO DO ESTADO">VENDA DENTRO DO ESTADO</option>
                      <option value="VENDA FORA DO ESTADO">VENDA FORA DO ESTADO</option>
                      <option value="VENDA MERC. ADQUIRIDA TERCEIROS">VENDA MERC. ADQUIRIDA TERCEIROS</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                      Natureza de Operação padrão para Compra:
                    </label>
                    <select
                      value={form.padrao_nat_compra || 'COMPRA MERC. DENTRO DO ESTADO'}
                      onChange={(e) => setForm({ ...form, padrao_nat_compra: e.target.value })}
                      className="input !py-1 !px-2.5 text-xs font-bold w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg cursor-pointer"
                    >
                      <option value="COMPRA MERC. DENTRO DO ESTADO">COMPRA MERC. DENTRO DO ESTADO</option>
                      <option value="COMPRA MERC. FORA DO ESTADO">COMPRA MERC. FORA DO ESTADO</option>
                      <option value="COMPRA PARA COMERCIALIZAÇÃO">COMPRA PARA COMERCIALIZAÇÃO</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                      Natureza de Operação de Devolução de Saída:
                    </label>
                    <select
                      value={form.padrao_nat_dev_saida || 'DEVOLUÇÃO VENDAS'}
                      onChange={(e) => setForm({ ...form, padrao_nat_dev_saida: e.target.value })}
                      className="input !py-1 !px-2.5 text-xs font-bold w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg cursor-pointer"
                    >
                      <option value="DEVOLUÇÃO VENDAS">DEVOLUÇÃO VENDAS</option>
                      <option value="DEVOLUÇÃO DE COMPRAS">DEVOLUÇÃO DE COMPRAS</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                      Natureza de Operação de Devolução de Entrada:
                    </label>
                    <select
                      value={form.padrao_nat_dev_entrada || 'DEVOLUÇÃO VENDAS'}
                      onChange={(e) => setForm({ ...form, padrao_nat_dev_entrada: e.target.value })}
                      className="input !py-1 !px-2.5 text-xs font-bold w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg cursor-pointer"
                    >
                      <option value="DEVOLUÇÃO VENDAS">DEVOLUÇÃO VENDAS</option>
                      <option value="DEVOLUÇÃO DE COMPRAS">DEVOLUÇÃO DE COMPRAS</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                      Natureza de Operação para Prestação de Serviços (Saída):
                    </label>
                    <input
                      type="text"
                      value={form.padrao_nat_servico_saida || ''}
                      onChange={(e) => setForm({ ...form, padrao_nat_servico_saida: e.target.value })}
                      placeholder="PRESTAÇÃO DE SERVIÇOS"
                      className="input !py-1 !px-2.5 text-xs font-bold uppercase w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                      Natureza de Operação para Prestação de Serviços (Entrada):
                    </label>
                    <input
                      type="text"
                      value={form.padrao_nat_servico_entrada || ''}
                      onChange={(e) => setForm({ ...form, padrao_nat_servico_entrada: e.target.value })}
                      placeholder="TOMADA DE SERVIÇOS"
                      className="input !py-1 !px-2.5 text-xs font-bold uppercase w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                      Departamento Padrão:
                    </label>
                    <select
                      value={form.padrao_departamento || form.empresa_nome || 'COLISEU GERAL'}
                      onChange={(e) => setForm({ ...form, padrao_departamento: e.target.value })}
                      className="input !py-1 !px-2.5 text-xs font-bold w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg cursor-pointer"
                    >
                      {filiais.length > 0 ? (
                        filiais.map(f => (
                          <option key={f.id} value={f.nome}>{f.nome}</option>
                        ))
                      ) : (
                        <option value="COLISEU GERAL">COLISEU GERAL</option>
                      )}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                        Código Padrão Produto:
                      </label>
                      <select
                        value={form.padrao_codigo_produto || 'CODIGO_FAB'}
                        onChange={(e) => setForm({ ...form, padrao_codigo_produto: e.target.value })}
                        className="input !py-1 !px-2 text-xs font-bold w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg cursor-pointer"
                      >
                        <option value="CODIGO_FAB">CODIGO_FAB</option>
                        <option value="CODIGO_PRODUTO">CODIGO_PRODUTO</option>
                        <option value="CODIGO_BARRA">CODIGO_BARRA</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                        Número Padrão Pedido:
                      </label>
                      <select
                        value={form.padrao_numero_pedido || 'PEDIDO'}
                        onChange={(e) => setForm({ ...form, padrao_numero_pedido: e.target.value })}
                        className="input !py-1 !px-2 text-xs font-bold w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg cursor-pointer"
                      >
                        <option value="PEDIDO">PEDIDO</option>
                        <option value="SEQUENCIAL">SEQUENCIAL</option>
                      </select>
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                      Rota Padrão para Orçamentos/Pedidos:
                    </label>
                    <input
                      type="text"
                      value={form.padrao_rota_pedidos || ''}
                      onChange={(e) => setForm({ ...form, padrao_rota_pedidos: e.target.value })}
                      placeholder="ROTA PRINCIPAL - CAMPO GRANDE"
                      className="input !py-1 !px-2.5 text-xs font-bold uppercase w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              )}

              {/* SUB-TAB 2: FINANCEIRO */}
              {padronizacaoSubTab === 'financeiro' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                      Centro de Custo Padrão:
                    </label>
                    <select
                      value={form.padrao_centro_custo || 'COLISEU RECEITAS'}
                      onChange={(e) => {
                        const val = e.target.value;
                        const ccItem = centrosCustoList.find(c => (c.descricao || c.nome) === val || String(c.codigo || c.id) === val);
                        setForm({
                          ...form,
                          padrao_centro_custo: ccItem?.descricao || ccItem?.nome || val,
                          padrao_centro_custo_id: ccItem?.codigo ? Number(ccItem.codigo) : (ccItem?.id ? Number(ccItem.id) : (val === 'COLISEU RECEITAS' ? 6 : null))
                        });
                      }}
                      className="input !py-1 !px-2.5 text-xs font-bold w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg cursor-pointer"
                    >
                      {centrosCustoList.length > 0 ? (
                        centrosCustoList.map(cc => (
                          <option key={cc.id || cc.codigo} value={cc.descricao || cc.nome}>
                            {cc.codigo ? `[${cc.codigo}] ` : ''}{cc.descricao || cc.nome}
                          </option>
                        ))
                      ) : filiais.length > 0 ? (
                        filiais.map(f => (
                          <option key={f.id} value={f.nome}>{f.nome}</option>
                        ))
                      ) : (
                        <option value="COLISEU RECEITAS">[6] COLISEU RECEITAS</option>
                      )}
                      {form.padrao_centro_custo && !centrosCustoList.some(c => (c.descricao || c.nome) === form.padrao_centro_custo) && (
                        <option value={form.padrao_centro_custo}>{form.padrao_centro_custo}</option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                      Plano de Contas Padrão:
                    </label>
                    <select
                      value={form.padrao_plano_contas_id ? String(form.padrao_plano_contas_id) : (form.padrao_plano_contas_nome || '')}
                      onChange={(e) => {
                        const val = e.target.value;
                        const selectedItem = planos.find(p => String(p.id) === val || p.nome === val);
                        setForm({
                          ...form,
                          padrao_plano_contas_id: selectedItem?.id || (Number(val) || null),
                          padrao_plano_contas_nome: selectedItem?.nome || val || ''
                        });
                      }}
                      className="input !py-1 !px-2.5 text-xs font-bold w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg cursor-pointer"
                    >
                      <option value="">Selecione um plano de contas...</option>
                      {planos.map(p => (
                        <option key={p.id} value={p.id}>[{p.tipo || 'Receita'}] {p.nome}</option>
                      ))}
                      {form.padrao_plano_contas_nome && !planos.some(p => p.nome === form.padrao_plano_contas_nome || String(p.id) === String(form.padrao_plano_contas_id)) && (
                        <option value={form.padrao_plano_contas_id || form.padrao_plano_contas_nome}>
                          {form.padrao_plano_contas_nome}
                        </option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                      Caixa Padrão:
                    </label>
                    <select
                      value={form.padrao_caixa || 'CAIXA DIARIO - LOJA'}
                      onChange={(e) => setForm({ ...form, padrao_caixa: e.target.value })}
                      className="input !py-1 !px-2.5 text-xs font-bold w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg cursor-pointer"
                    >
                      <option value="CAIXA DIARIO - LOJA">CAIXA DIARIO - LOJA</option>
                      <option value="CAIXA GERAL">CAIXA GERAL</option>
                      <option value="CAIXA BALCÃO">CAIXA BALCÃO</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                      Caixa Cofre (Retaguarda):
                    </label>
                    <select
                      value={form.padrao_caixa_cofre || 'CAIXA COFRE'}
                      onChange={(e) => setForm({ ...form, padrao_caixa_cofre: e.target.value })}
                      className="input !py-1 !px-2.5 text-xs font-bold w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg cursor-pointer"
                    >
                      <option value="CAIXA COFRE">CAIXA COFRE</option>
                      <option value="TESOURARIA">TESOURARIA</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                      Moeda Padrão:
                    </label>
                    <select
                      value={form.padrao_moeda || 'REAL'}
                      onChange={(e) => setForm({ ...form, padrao_moeda: e.target.value })}
                      className="input !py-1 !px-2.5 text-xs font-bold w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg cursor-pointer"
                    >
                      <option value="REAL">REAL (R$)</option>
                      <option value="DOLAR">DÓLAR (US$)</option>
                      <option value="EURO">EURO (€)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                      Portador Padrão:
                    </label>
                    <select
                      value={form.padrao_portador || 'CARTEIRA'}
                      onChange={(e) => setForm({ ...form, padrao_portador: e.target.value })}
                      className="input !py-1 !px-2.5 text-xs font-bold w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg cursor-pointer"
                    >
                      <option value="CARTEIRA">CARTEIRA</option>
                      <option value="ASAAS">ASAAS (BANCO)</option>
                      <option value="BANCO SANTANDER">BANCO SANTANDER</option>
                      <option value="BANCO ITAU">BANCO ITAU</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                      Forma de Pagamento à Prazo Padrão:
                    </label>
                    <select
                      value={form.padrao_forma_pagto_prazo || 'A VENCER'}
                      onChange={(e) => setForm({ ...form, padrao_forma_pagto_prazo: e.target.value })}
                      className="input !py-1 !px-2.5 text-xs font-bold w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg cursor-pointer"
                    >
                      <option value="A VENCER">A VENCER</option>
                      <option value="BOLETO 30 DIAS">BOLETO 30 DIAS</option>
                      <option value="CARTÃO CRÉDITO">CARTÃO CRÉDITO</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                      Tabela de Preços Padrão:
                    </label>
                    <input
                      type="text"
                      value={form.padrao_tabela_precos || ''}
                      onChange={(e) => setForm({ ...form, padrao_tabela_precos: e.target.value })}
                      placeholder="TABELA 1 - VAREJO"
                      className="input !py-1 !px-2.5 text-xs font-bold uppercase w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                        Juros Título:
                      </label>
                      <select
                        value={form.padrao_tipo_juros_titulo || 'Composto'}
                        onChange={(e) => setForm({ ...form, padrao_tipo_juros_titulo: e.target.value })}
                        className="input !py-1 !px-2 text-xs font-bold w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg cursor-pointer"
                      >
                        <option value="Composto">Composto</option>
                        <option value="Simples">Simples</option>
                        <option value="Sem Juros">Sem Juros</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                        Juros Venda:
                      </label>
                      <select
                        value={form.padrao_tipo_juros_venda || 'Juros Composto'}
                        onChange={(e) => setForm({ ...form, padrao_tipo_juros_venda: e.target.value })}
                        className="input !py-1 !px-2 text-xs font-bold w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg cursor-pointer"
                      >
                        <option value="Juros Composto">Juros Composto</option>
                        <option value="Juros Simples">Juros Simples</option>
                        <option value="Sem Juros">Sem Juros</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                      Modelo Resumo Financeiro:
                    </label>
                    <select
                      value={form.padrao_modelo_resumo_financeiro || 'Modelo 1.4 - Vendas e Financeiro II'}
                      onChange={(e) => setForm({ ...form, padrao_modelo_resumo_financeiro: e.target.value })}
                      className="input !py-1 !px-2.5 text-xs font-bold w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg cursor-pointer"
                    >
                      <option value="Modelo 1.4 - Vendas e Financeiro II">Modelo 1.4 - Vendas e Financeiro II</option>
                      <option value="Modelo 1.0 - Padrão">Modelo 1.0 - Padrão</option>
                      <option value="Modelo 2.0 - Resumido">Modelo 2.0 - Resumido</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                        Juros dias carência:
                      </label>
                      <input
                        type="number"
                        value={form.padrao_juros_carencia_dias ?? 0}
                        onChange={(e) => setForm({ ...form, padrao_juros_carencia_dias: parseInt(e.target.value) || 0 })}
                        className="input !py-1 !px-2.5 text-xs font-mono font-bold w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                        Juros percentual (%):
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.padrao_juros_percentual ?? 0}
                        onChange={(e) => setForm({ ...form, padrao_juros_percentual: parseFloat(e.target.value) || 0 })}
                        className="input !py-1 !px-2.5 text-xs font-mono font-bold w-full h-8 bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* SUB-TAB 3: COBRANÇAS ATIVAS & CEDENTES */}
              {padronizacaoSubTab === 'cobrancas_ativas' && (
                <div className="space-y-4 pt-1 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div>
                      <h4 className="font-extrabold text-slate-900 dark:text-slate-100 text-xs uppercase tracking-tight">
                        APIs de Cobrança e Bancos Abertos / Aptos
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Cadastre os bancos disponíveis (Asaas, Sicredi, Cora, Itaú, Sicoob, etc.). Quando houver mais de um ativo, o sistema solicitará a escolha no momento da emissão.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => navigate('/bancos')}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-lg shadow-2xs flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
                    >
                      <Building2 size={14} /> + Cadastrar / Consultar Bancos
                    </button>
                  </div>

                  {cedentes.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-300 dark:border-slate-800">
                      Nenhum banco ou cedente cadastrado ainda. Clique no botão acima para adicionar.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {cedentes.map(c => (
                        <div
                          key={c.id}
                          className={clsx(
                            "p-3.5 rounded-xl border transition-all flex flex-col justify-between space-y-3 shadow-2xs",
                            c.ativo
                              ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                              : "bg-slate-100/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-60"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className={clsx(
                                "w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs uppercase shrink-0 text-white",
                                c.provedor_banco === 'asaas' ? "bg-emerald-600" :
                                c.provedor_banco === 'sicredi' ? "bg-emerald-800" :
                                c.provedor_banco === 'cora' ? "bg-pink-600" :
                                c.provedor_banco === 'itau' ? "bg-amber-600" : "bg-indigo-600"
                              )}>
                                {c.provedor_banco.substring(0, 3)}
                              </div>
                              <div>
                                <h5 className="font-black text-slate-900 dark:text-slate-100 text-xs">
                                  {c.nome}
                                </h5>
                                <span className="text-[10px] font-mono text-slate-500 block">
                                  {c.ambiente} • Provedor: {c.provedor_banco.toUpperCase()}
                                </span>
                              </div>
                            </div>

                            {c.is_default && (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[9px] font-black uppercase rounded">
                                Padrão ERP
                              </span>
                            )}
                          </div>

                          <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg border border-slate-100 dark:border-slate-800/80 space-y-1 text-[11px]">
                            <div className="flex justify-between">
                              <span className="text-slate-400 font-medium">Portador ERP:</span>
                              <strong className="text-indigo-600 dark:text-indigo-400 uppercase font-black">{c.portador_nome_erp}</strong>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400 font-medium">Juros A.M. / Multa:</span>
                              <span className="font-mono">{c.juros_am}% a.m. | {c.multa_pct}% multa</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
                            <label className="flex items-center gap-1.5 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={c.ativo}
                                onChange={async (e) => {
                                  await api.put(`/configuracoes/cedentes/${c.id}`, { ativo: e.target.checked })
                                  fetchCedentes()
                                }}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                              />
                              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                                {c.ativo ? 'Ativo para Emissão' : 'Inativo'}
                              </span>
                            </label>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => { setEditingCedente(c); setIsModalCedenteOpen(true); }}
                                className="px-2 py-1 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-300 font-bold text-[11px] rounded cursor-pointer"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (confirm(`Excluir cedente "${c.nome}"?`)) {
                                    await api.delete(`/configuracoes/cedentes/${c.id}`)
                                    fetchCedentes()
                                  }
                                }}
                                className="px-2 py-1 bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-bold text-[11px] rounded cursor-pointer"
                              >
                                Excluir
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SUB-TAB 3: OUTRAS */}
              {padronizacaoSubTab === 'outras' && (
                <div className="space-y-3 text-xs pt-1">
                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                      Observações Padrão dos Pedidos & Orçamentos:
                    </label>
                    <textarea
                      rows={3}
                      value={form.doc_observacao_padrao || ''}
                      onChange={(e) => setForm({ ...form, doc_observacao_padrao: e.target.value })}
                      placeholder="Texto de observação padrão para novos pedidos..."
                      className="input !p-2 text-xs font-medium w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-slate-500 block mb-0.5">
                      Termo de Garantia Padrão:
                    </label>
                    <textarea
                      rows={4}
                      value={form.doc_termo_garantia || ''}
                      onChange={(e) => setForm({ ...form, doc_termo_garantia: e.target.value })}
                      placeholder="Termos de garantia impressos nos pedidos..."
                      className="input !p-2 text-xs font-medium w-full bg-white dark:bg-slate-900 border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: USUÁRIOS VINCULADOS AO TENANT */}
          {activeTab === 'usuarios' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 sm:p-4 shadow-2xs space-y-3 animate-fade-in">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                  <Users size={16} />
                  <h3 className="font-extrabold text-xs uppercase text-slate-800 dark:text-slate-200 font-heading">
                    Usuários & Operadores Vinculados
                  </h3>
                  <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-black rounded-md">
                    {Array.isArray(usuariosList) ? usuariosList.length : 0} Usuário(s)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingGrupo(null);
                      setIsGrupoModalOpen(true);
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-lg shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Shield size={13} /> + Novo Grupo de Acesso
                  </button>
                  <a
                    href="/usuarios"
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-lg shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <UserPlus size={13} /> Gerenciar Usuários
                  </a>
                </div>
              </div>

              {isUsuariosLoading ? (
                <div className="p-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <RefreshCw size={14} className="animate-spin" /> Carregando lista de usuários...
                </div>
              ) : Array.isArray(usuariosList) && usuariosList.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800/80 text-[10px] font-black uppercase text-slate-500 border-b border-slate-200 dark:border-slate-700">
                        <th className="p-2 px-3">Usuário / Operador</th>
                        <th className="p-2 px-3">E-mail de Acesso</th>
                        <th className="p-2 px-3">Perfil / Regra</th>
                        <th className="p-2 px-3">Filial Acesso</th>
                        <th className="p-2 px-3">Status</th>
                        <th className="p-2 px-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {usuariosList.map((u: any) => (
                        <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="p-2 px-3 font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white font-black text-xs flex items-center justify-center uppercase shadow-2xs">
                              {(u.nome || u.email || 'U').substring(0, 2)}
                            </div>
                            <div>
                              <div className="font-extrabold">{u.nome || 'Sem Nome'}</div>
                              <div className="text-[10px] font-normal text-slate-400 font-mono">ID #{u.id}</div>
                            </div>
                          </td>
                          <td className="p-2 px-3 font-mono font-medium text-slate-600 dark:text-slate-300">
                            {u.email}
                          </td>
                          <td className="p-2 px-3">
                            <div className="flex flex-col gap-1">
                              <span className="px-2 py-0.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-extrabold uppercase rounded-md w-fit">
                                {u.grupo_nome || u.role || 'OPERADOR'}
                              </span>
                              <select
                                value={u.grupo_id || ''}
                                onChange={async (e) => {
                                  const gId = parseInt(e.target.value, 10);
                                  if (gId) {
                                    try {
                                      await api.put(`/usuarios/${u.id}/grupo`, { grupo_id: gId });
                                      refetchUsuarios();
                                    } catch (err: any) {
                                      alert(err.response?.data?.error || 'Erro ao vincular grupo de acesso');
                                    }
                                  }
                                }}
                                className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-[10.5px] font-extrabold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-2xs"
                              >
                                <option value="">Associar Grupo...</option>
                                {gruposList.map((g: any) => (
                                  <option key={g.id} value={g.id}>{g.nome}</option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td className="p-2 px-3 text-slate-500 font-medium">
                            {u.filial_acesso || 'Todas as Filiais'}
                          </td>
                          <td className="p-2 px-3">
                            {u.ativo !== false ? (
                              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-black text-[10px] rounded-md border border-emerald-500/20">
                                ATIVO
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-rose-500/10 text-rose-600 font-black text-[10px] rounded-md border border-rose-500/20">
                                INATIVO
                              </span>
                            )}
                          </td>
                          <td className="p-2 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedUserToEdit(u);
                                setIsEditUserModalOpen(true);
                              }}
                              className="p-1 px-2 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded transition-all inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Edit3 size={12} /> Editar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-6 text-center text-xs text-slate-400">
                  Nenhum usuário cadastrado para este tenant.
                </div>
              )}
            </div>
          )}

          {/* TAB: DOCUMENTOS, IMPRESSÃO & MENSAGENS */}
          {activeTab === 'documentos' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-5 animate-fade-in">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2.5 text-indigo-600 dark:text-indigo-400">
                  <FileText size={20} />
                  <h3 className="font-extrabold text-sm uppercase text-slate-800 dark:text-slate-200 font-heading">
                    Modelos de Documentos, Impressão & Mensagens
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setDocumentosSubTab('modelos')}
                    className={clsx(
                      "px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5",
                      documentosSubTab === 'modelos'
                        ? "bg-indigo-600 text-white shadow-2xs font-black"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                    )}
                  >
                    <FileText size={13} /> 1. Modelos de Documentos
                  </button>

                  <button
                    type="button"
                    onClick={() => setDocumentosSubTab('impressao')}
                    className={clsx(
                      "px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5",
                      documentosSubTab === 'impressao'
                        ? "bg-indigo-600 text-white shadow-2xs font-black"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                    )}
                  >
                    <Printer size={13} /> 2. Impressão & Mensagens
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* MODELO DE IMPRESSÃO DE PEDIDOS DE VENDA */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200 text-xs uppercase">
                    <Printer size={16} className="text-indigo-600" />
                    1. Modelo de Pedidos e Ordens de Serviço
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Texto ou instruções personalizadas no rodapé de pedidos de venda e impressões oficiais.
                  </p>
                  <textarea
                    rows={5}
                    value={form.doc_modelo_pedidos || 'Agradecemos a preferência! Mercadoria sujeita a conferência no ato da entrega.'}
                    onChange={(e) => setForm({ ...form, doc_modelo_pedidos: e.target.value })}
                    className="input w-full p-2.5 font-mono text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 border-slate-300"
                  />
                </div>

                {/* MODELO DE EXTRATO DO CLIENTE */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200 text-xs uppercase">
                    <FileSpreadsheet size={16} className="text-emerald-600" />
                    2. Modelo de Extrato Financeiro do Cliente
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Mensagem institucional exibida no topo/rodapé do extrato de débitos do cliente.
                  </p>
                  <textarea
                    rows={5}
                    value={form.doc_modelo_extrato || 'Prezado cliente, este extrato resume seus títulos e pagamentos pendentes.'}
                    onChange={(e) => setForm({ ...form, doc_modelo_extrato: e.target.value })}
                    className="input w-full p-2.5 font-mono text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 border-slate-300"
                  />
                </div>

                {/* MODELO DE ORÇAMENTOS E PROPOSTAS */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200 text-xs uppercase">
                    <FileText size={16} className="text-amber-600" />
                    3. Modelo de Orçamentos e Propostas Comerciais
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Termos de validade e condições comerciais padrão para orçamentos emitidos.
                  </p>
                  <textarea
                    rows={5}
                    value={form.doc_modelo_orcamento || 'Orçamento válido por 10 dias. Preços sujeitos a reajuste sem aviso prévio.'}
                    onChange={(e) => setForm({ ...form, doc_modelo_orcamento: e.target.value })}
                    className="input w-full p-2.5 font-mono text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 border-slate-300"
                  />
                </div>

                {/* RECIBOS E COMPROVANTES */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200 text-xs uppercase">
                    <CheckCircle2 size={16} className="text-blue-600" />
                    4. Modelo de Recibos de Quitação
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Texto padrão impresso no comprovante oficial de quitação de títulos recebidos.
                  </p>
                  <textarea
                    rows={5}
                    value={form.doc_modelo_recibo || 'Recebemos o valor supracitado referente ao pagamento integral do título especificado.'}
                    onChange={(e) => setForm({ ...form, doc_modelo_recibo: e.target.value })}
                    className="input w-full p-2.5 font-mono text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 border-slate-300"
                  />
                </div>

              </div>
            </div>
          )}
          
          {/* TAB 1: API KEYS */}
          {activeTab === 'apis' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-6 animate-fade-in">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2.5 text-indigo-600 dark:text-indigo-400">
                  <Key size={20} />
                  <h3 className="font-extrabold text-sm uppercase text-slate-800 dark:text-slate-200 font-heading">
                    Módulos & APIs de Integração
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setApiSubTab('bancos')}
                    className={clsx(
                      "px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5",
                      apiSubTab === 'bancos'
                        ? "bg-indigo-600 text-white shadow-2xs font-black"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                    )}
                  >
                    <Building2 size={13} /> 🏦 APIs de Bancos
                  </button>

                  <button
                    type="button"
                    onClick={() => setApiSubTab('email')}
                    className={clsx(
                      "px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5",
                      apiSubTab === 'email'
                        ? "bg-indigo-600 text-white shadow-2xs font-black"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                    )}
                  >
                    <Mail size={13} /> ✉️ API de E-mail
                  </button>

                  <button
                    type="button"
                    onClick={() => setApiSubTab('whats')}
                    className={clsx(
                      "px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5",
                      apiSubTab === 'whats'
                        ? "bg-indigo-600 text-white shadow-2xs font-black"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                    )}
                  >
                    <MessageCircle size={13} /> 💬 API de WhatsApp
                  </button>

                  <button
                    type="button"
                    onClick={() => setApiSubTab('ia')}
                    className={clsx(
                      "px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5",
                      apiSubTab === 'ia'
                        ? "bg-indigo-600 text-white shadow-2xs font-black"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                    )}
                  >
                    <Sparkles size={13} /> 🤖 API de IA
                  </button>

                  <button
                    type="button"
                    onClick={() => setApiSubTab('assinaturas')}
                    className={clsx(
                      "px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5",
                      apiSubTab === 'assinaturas'
                        ? "bg-indigo-600 text-white shadow-2xs font-black"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                    )}
                  >
                    <Shield size={13} /> ✍️ API de Assinatura
                  </button>
                </div>
              </div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-px flex-1 bg-divider" />
                  <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-1.5">
                    <DollarSign size={11} className="text-emerald-500" /> Financeiro & Cobrança
                  </span>
                  <div className="h-px flex-1 bg-divider" />
                </div>

                {apiSubTab === 'bancos' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                    {/* Asaas Bank Integration */}
                    <div className="card p-5 bg-bg-primary border border-divider rounded-sm space-y-4 text-xs">
                      <div className="flex items-center gap-2 border-b border-divider pb-2 mb-1">
                        <DollarSign size={14} className="text-emerald-500" />
                        <span className="text-[10px] text-text-primary uppercase font-bold tracking-wider">Banco Asaas — Emissão de Boletos</span>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-text-secondary uppercase">Ambiente de Operação *</label>
                        <select
                          className="input !py-2 rounded-sm text-xs font-semibold"
                          value={form.asaas_ambiente || 'Sandbox'}
                          onChange={(e) => setForm({ ...form, asaas_ambiente: e.target.value })}
                        >
                          <option value="Sandbox">Homologação / Testes (api-sandbox.asaas.com)</option>
                          <option value="Producao">Produção (api.asaas.com)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-text-secondary uppercase">Chave de API / Access Token *</label>
                        <input
                          type="password"
                          className="input !py-2 rounded-sm font-mono text-xs"
                          placeholder="$aact_YTU5YTE0M2M2N2I4MT..."
                          value={form.asaas_access_token || ''}
                          onChange={(e) => setForm({ ...form, asaas_access_token: e.target.value })}
                        />
                        <span className="text-[8px] text-text-muted block">Painel Asaas: Minha Conta ➔ Integrações ➔ Chaves de API</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-text-secondary uppercase">Juros a.m. (%)</label>
                          <input type="number" step="0.1" className="input !py-1.5 rounded-sm font-mono text-xs"
                            value={form.asaas_juros_padrao ?? 1}
                            onChange={(e) => setForm({ ...form, asaas_juros_padrao: parseFloat(e.target.value) || 0 })} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-text-secondary uppercase">Multa (%)</label>
                          <input type="number" step="0.1" className="input !py-1.5 rounded-sm font-mono text-xs"
                            value={form.asaas_multa_padrao ?? 2}
                            onChange={(e) => setForm({ ...form, asaas_multa_padrao: parseFloat(e.target.value) || 0 })} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-text-secondary uppercase">Desconto (%)</label>
                          <input type="number" step="0.1" className="input !py-1.5 rounded-sm font-mono text-xs"
                            value={form.asaas_desconto_padrao ?? 0}
                            onChange={(e) => setForm({ ...form, asaas_desconto_padrao: parseFloat(e.target.value) || 0 })} />
                        </div>
                      </div>

                      <div className="space-y-1 bg-slate-50 border border-slate-200 p-2.5 rounded text-[10px]">
                        <span className="font-bold text-slate-700 block">URL do Webhook (Cole no Painel Asaas):</span>
                        <code className="bg-white border border-slate-300 px-1.5 py-0.5 rounded text-[9px] font-mono text-indigo-700 block select-all overflow-x-auto">
                          {window.location.origin.replace('3000', '3001')}/api/webhooks/asaas/webhook
                        </code>
                      </div>

                      <button type="button" onClick={handleTestAsaasConnection} disabled={testingAsaas}
                        className="btn-secondary w-full !py-2 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer hover:bg-slate-100">
                        <RefreshCw size={13} className={testingAsaas ? 'animate-spin' : ''} />
                        {testingAsaas ? 'Testando Conexão...' : 'Testar Conexão com Banco Asaas'}
                      </button>
                    </div>

                    {/* Banco Cora Integration */}
                    <div className="card p-5 bg-bg-primary border border-divider rounded-sm">
                      <div className="flex items-center gap-2 border-b border-divider pb-2 mb-4">
                        <Building2 size={14} className="text-blue-500" />
                        <span className="text-[10px] text-text-primary uppercase font-bold tracking-wider">Banco Cora — Emissão de Boletos</span>
                        {form.cora_ativo && (
                          <span className="ml-auto text-[9px] text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">ATIVO</span>
                        )}
                      </div>
                      <CoraBankSection
                        config={form}
                        onChange={(field, value) => setForm(prev => ({ ...prev, [field]: value }))}
                      />
                    </div>

                    {/* Portador & Espécie Padrão */}
                    <div className="card p-5 bg-bg-primary border border-divider rounded-sm space-y-4 text-xs">
                      <div className="flex items-center gap-2 border-b border-divider pb-2 mb-1">
                        <DollarSign size={14} className="text-amber-500" />
                        <span className="text-[10px] text-text-primary uppercase font-bold tracking-wider">Portador & Espécie Padrão — ERP</span>
                        <span className="ml-auto text-[9px] text-text-muted bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          {portadores.length}p · {especies.length}e
                        </span>
                      </div>

                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-text-secondary uppercase">Portador Padrão (Carteira de Cobrança)</label>
                          <select className="input !py-2 rounded-sm text-xs"
                            value={form.portador_padrao_id ?? ''}
                            onChange={(e) => {
                              const sel = portadores.find(p => String(p.id) === e.target.value)
                              setForm({ ...form, portador_padrao_id: sel ? sel.id : null, portador_padrao_nome: sel?.descricao || '' })
                            }}>
                            <option value="">— Sem portador padrão —</option>
                            {portadores.map(p => <option key={p.id} value={p.id}>{p.descricao}</option>)}
                          </select>
                          {form.portador_padrao_nome && (
                            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded text-[9px] text-emerald-700">
                              <CheckCircle2 size={10} /> Padrão: <strong>{form.portador_padrao_nome}</strong>
                            </div>
                          )}
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-text-secondary uppercase">Espécie Padrão (Forma de Pagamento)</label>
                          <select className="input !py-2 rounded-sm text-xs"
                            value={form.especie_padrao_id ?? ''}
                            onChange={(e) => {
                              const sel = especies.find(s => String(s.id) === e.target.value)
                              setForm({ ...form, especie_padrao_id: sel ? sel.id : null, especie_padrao_nome: sel?.descricao || '' })
                            }}>
                            <option value="">— Sem espécie padrão —</option>
                            {especies.map(s => <option key={s.id} value={s.id}>{s.descricao}</option>)}
                          </select>
                          {form.especie_padrao_nome && (
                            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded text-[9px] text-emerald-700">
                              <CheckCircle2 size={10} /> Padrão: <strong>{form.especie_padrao_nome}</strong>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-divider/50 space-y-2">
                        <div>
                          <p className="text-[9px] font-bold text-text-secondary uppercase mb-1.5">Portadores no ERP:</p>
                          <div className="flex flex-wrap gap-1">
                            {portadores.map(p => (
                              <span key={p.id}
                                className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium border cursor-pointer transition-all ${form.portador_padrao_id === p.id ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-bg-secondary text-text-secondary border-divider hover:border-emerald-400'}`}
                                onClick={() => setForm({ ...form, portador_padrao_id: p.id, portador_padrao_nome: p.descricao })}>
                                #{p.id} {p.descricao}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-text-secondary uppercase mb-1.5">Espécies no ERP:</p>
                          <div className="flex flex-wrap gap-1">
                            {especies.map(s => (
                              <span key={s.id}
                                className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium border cursor-pointer transition-all ${form.especie_padrao_id === s.id ? 'bg-amber-500 text-white border-amber-500' : 'bg-bg-secondary text-text-secondary border-divider hover:border-amber-400'}`}
                                onClick={() => setForm({ ...form, especie_padrao_id: s.id, especie_padrao_nome: s.descricao })}>
                                #{s.id} {s.descricao}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              {/* ══════════════════════════════════════════════════════════
                  SEÇÃO 2 — COMUNICAÇÃO
                  WhatsApp + E-mail
              ══════════════════════════════════════════════════════════ */}
              {(apiSubTab === 'whats' || apiSubTab === 'email') && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-px flex-1 bg-divider" />
                    <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-1.5">
                      <MessageSquare size={11} className="text-brand-500" /> Comunicação
                    </span>
                    <div className="h-px flex-1 bg-divider" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                    {/* WhatsApp */}
                    {apiSubTab === 'whats' && (
                      <div className="card p-5 bg-bg-primary border border-divider rounded-sm space-y-4 text-xs">
                        <div className="flex items-center gap-2 border-b border-divider pb-2 mb-1">
                          <MessageSquare size={14} className="text-brand-500" />
                          <span className="text-[10px] text-text-primary uppercase font-bold tracking-wider">WhatsApp Integração</span>
                        </div>

                        <div className="flex items-center justify-between py-1.5 border-b border-divider/50">
                          <div className="space-y-0.5">
                            <label className="text-[9px] font-bold text-text-secondary uppercase">Status da Integração</label>
                            <span className="text-[8px] text-text-muted block">Ativar disparos automáticos</span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer"
                              checked={form.whatsapp_enabled || false}
                              onChange={(e) => setForm({ ...form, whatsapp_enabled: e.target.checked })} />
                            <div className="w-8 h-4 bg-bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-divider after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500 font-sans"></div>
                          </label>
                        </div>

                        <div className="flex items-center justify-between py-1.5 border-b border-divider/50">
                          <div className="space-y-0.5">
                            <label className="text-[9px] font-bold text-text-secondary uppercase">Múltiplos Envios Diários</label>
                            <span className="text-[8px] text-text-muted block">Permite enviar mais de uma por dia ao mesmo contato</span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer"
                              checked={form.whatsapp_permitir_multiplos_envios_dia || false}
                              onChange={(e) => setForm({ ...form, whatsapp_permitir_multiplos_envios_dia: e.target.checked })} />
                            <div className="w-8 h-4 bg-bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-divider after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500 font-sans"></div>
                          </label>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-text-secondary uppercase">Provedor de API WhatsApp *</label>
                          <select className="input !py-2 rounded-sm text-xs"
                            value={form.whatsapp_api_provider || 'uazapi'}
                            onChange={(e) => setForm({ ...form, whatsapp_api_provider: e.target.value })}>
                            <option value="uazapi">Uazapi Broker</option>
                            <option value="meta">Meta (WhatsApp Business API)</option>
                          </select>
                        </div>

                        {(form.whatsapp_api_provider === 'uazapi' || !form.whatsapp_api_provider) && (
                          <div className="space-y-3">
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-text-secondary uppercase">WhatsApp do Administrador *</label>
                              <input type="text" className="input !py-2 rounded-sm font-mono text-xs"
                                placeholder="5567984028572"
                                value={form.whatsapp_admin_phone || ''}
                                onChange={(e) => setForm({ ...form, whatsapp_admin_phone: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-text-secondary uppercase">URL do Servidor Uazapi *</label>
                              <input type="text" className="input !py-2 rounded-sm font-mono text-xs"
                                placeholder="https://coliseu.uazapi.com"
                                value={form.whatsapp_server_url || ''}
                                onChange={(e) => setForm({ ...form, whatsapp_server_url: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-text-secondary uppercase">Token WhatsApp *</label>
                              <input type="password" className="input !py-2 rounded-sm font-mono text-xs"
                                placeholder="••••••••"
                                value={form.whatsapp_token || ''}
                                onChange={(e) => setForm({ ...form, whatsapp_token: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-text-secondary uppercase">Instância Uazapi (opcional)</label>
                              <input type="text" className="input !py-2 rounded-sm font-mono text-xs"
                                placeholder="coliseu-inst-12"
                                value={form.whatsapp_instancia_id || ''}
                                onChange={(e) => setForm({ ...form, whatsapp_instancia_id: e.target.value })} />
                            </div>
                          </div>
                        )}

                        {form.whatsapp_api_provider === 'meta' && (
                          <div className="space-y-3">
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-text-secondary uppercase">Meta Business Account ID *</label>
                              <input type="text" className="input !py-2 rounded-sm font-mono text-xs"
                                placeholder="123456789..."
                                value={form.whatsapp_meta_business_id || ''}
                                onChange={(e) => setForm({ ...form, whatsapp_meta_business_id: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-text-secondary uppercase">Phone Number ID *</label>
                              <input type="text" className="input !py-2 rounded-sm font-mono text-xs"
                                placeholder="123456789..."
                                value={form.whatsapp_meta_phone_id || ''}
                                onChange={(e) => setForm({ ...form, whatsapp_meta_phone_id: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-text-secondary uppercase">Verify Token (Webhook) *</label>
                              <input type="text" className="input !py-2 rounded-sm font-mono text-xs"
                                placeholder="Ex: coliseu_token_verify_2026"
                                value={form.whatsapp_meta_verify_token || ''}
                                onChange={(e) => setForm({ ...form, whatsapp_meta_verify_token: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-text-secondary uppercase">System User Token (Meta Access Token) *</label>
                              <input type="password" className="input !py-2 rounded-sm font-mono text-xs"
                                placeholder="EAAG..."
                                value={form.whatsapp_meta_token || ''}
                                onChange={(e) => setForm({ ...form, whatsapp_meta_token: e.target.value })} />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* E-mail */}
                    {apiSubTab === 'email' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                        {/* Servidor & Remetente */}
                        <div className="card p-5 bg-bg-primary border border-divider rounded-sm space-y-4 text-xs">
                          <div className="flex items-center gap-2 border-b border-divider pb-2 mb-1">
                            <Mail size={14} className="text-sky-500" />
                            <span className="text-[10px] text-text-primary uppercase font-bold tracking-wider">E-mail — Servidor & Remetente</span>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-text-secondary uppercase">Provedor de E-mail *</label>
                            <select className="input !py-2 rounded-sm text-xs"
                              value={form.email_provedor || 'smtp'}
                              onChange={(e) => setForm({ ...form, email_provedor: e.target.value })}>
                              <option value="smtp">SMTP Transacional (Nodemailer pool)</option>
                              <option value="brevo">Brevo / Sendinblue (API REST — até 1000 por lote)</option>
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-text-secondary uppercase">Nome do Remetente</label>
                            <input type="text" className="input !py-2 rounded-sm text-xs"
                              placeholder="Coliseu Transporte"
                              value={form.email_remetente_nome || ''}
                              onChange={(e) => setForm({ ...form, email_remetente_nome: e.target.value })} />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-text-secondary uppercase">E-mail do Remetente *</label>
                            <input type="email" className="input !py-2 rounded-sm font-mono text-xs"
                              placeholder="financeiro@suaempresa.com.br"
                              value={form.email_remetente || ''}
                              onChange={(e) => setForm({ ...form, email_remetente: e.target.value })} />
                          </div>

                          {form.email_provedor === 'brevo' ? (
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-text-secondary uppercase">Chave de API do Brevo *</label>
                              <input type="password" className="input !py-2 rounded-sm font-mono text-xs"
                                placeholder="xkeysib-..."
                                value={form.email_brevo_api_key || ''}
                                onChange={(e) => setForm({ ...form, email_brevo_api_key: e.target.value })} />
                              <span className="text-[8px] text-text-muted block">Painel Brevo → SMTP & API → Chaves de API</span>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-text-secondary uppercase">Host SMTP *</label>
                                  <input type="text" className="input !py-2 rounded-sm font-mono text-xs"
                                    placeholder="smtp.gmail.com"
                                    value={form.email_smtp_host || ''}
                                    onChange={(e) => setForm({ ...form, email_smtp_host: e.target.value })} />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-text-secondary uppercase">Porta SMTP *</label>
                                  <input type="number" className="input !py-2 rounded-sm font-mono text-xs"
                                    placeholder="587"
                                    value={form.email_smtp_port || 587}
                                    onChange={(e) => setForm({ ...form, email_smtp_port: parseInt(e.target.value) || 587 })} />
                                </div>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-text-secondary uppercase">Usuário SMTP *</label>
                                <input type="text" className="input !py-2 rounded-sm font-mono text-xs"
                                  placeholder="usuario@email.com"
                                  value={form.email_smtp_user || ''}
                                  onChange={(e) => setForm({ ...form, email_smtp_user: e.target.value })} />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-text-secondary uppercase">Senha SMTP *</label>
                                <input type="password" className="input !py-2 rounded-sm font-mono text-xs"
                                  placeholder="••••••••"
                                  value={form.email_smtp_pass || ''}
                                  onChange={(e) => setForm({ ...form, email_smtp_pass: e.target.value })} />
                              </div>
                              <div className="flex items-center justify-between py-1 border border-divider rounded px-2">
                                <span className="text-[9px] font-bold text-text-secondary uppercase">TLS / SSL Seguro</span>
                                <label className="relative inline-flex items-center cursor-pointer">
                                  <input type="checkbox" className="sr-only peer"
                                    checked={form.email_smtp_secure || false}
                                    onChange={(e) => setForm({ ...form, email_smtp_secure: e.target.checked })} />
                                  <div className="w-8 h-4 bg-bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-divider after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-sky-500"></div>
                                </label>
                              </div>
                            </div>
                          )}

                          <button type="button" onClick={handleTestEmailConnection} disabled={testingEmail}
                            className="btn-secondary w-full !py-2 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer hover:bg-slate-100">
                            <Send size={12} className={testingEmail ? 'animate-pulse' : ''} />
                            {testingEmail ? 'Testando...' : 'Testar Conexão de E-mail'}
                          </button>
                        </div>

                        {/* Padronização Visual (Artes de Topo e Rodapé) */}
                        <div className="card p-5 bg-bg-primary border border-divider rounded-sm space-y-4 text-xs">
                          <div className="flex items-center gap-2 border-b border-divider pb-2 mb-1">
                            <Image size={14} className="text-brand-500" />
                            <span className="text-[10px] text-text-primary uppercase font-bold tracking-wider">Padronização Visual (Artes do E-mail)</span>
                          </div>

                          <p className="text-[11px] text-text-muted">
                            Anexe as artes de cabeçalho (topo) e rodapé da sua empresa. Elas serão aplicadas automaticamente ao gerar e-mails com layout padrão.
                          </p>

                          {/* Bloco 1: E-mail Marketing */}
                          <div className="space-y-3 p-3 bg-slate-50 border border-slate-200 rounded-sm">
                            <span className="text-[10px] font-bold text-sky-700 uppercase block tracking-wider">
                              🎨 Artes para E-mail Marketing
                            </span>

                            {/* Topo Marketing */}
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-text-secondary uppercase">Arte do Topo (Header Marketing)</label>
                              <div className="flex items-center gap-2">
                                <label className="btn-secondary !py-1 px-2.5 text-[10px] cursor-pointer font-bold flex items-center gap-1 hover:bg-slate-200">
                                  <Upload size={11} /> Selecionar Imagem
                                  <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const reader = new FileReader();
                                      reader.onload = (evt) => setForm(prev => ({ ...prev, email_marketing_topo_url: evt.target?.result as string }));
                                      reader.readAsDataURL(file);
                                    }
                                  }} />
                                </label>
                                {form.email_marketing_topo_url && (
                                  <button type="button" onClick={() => setForm(prev => ({ ...prev, email_marketing_topo_url: '' }))} className="text-red-500 hover:text-red-700 text-[10px] font-bold">
                                    Remover
                                  </button>
                                )}
                              </div>
                              {form.email_marketing_topo_url && (
                                <div className="mt-1.5 p-1 bg-white border border-slate-200 rounded max-h-[80px] flex items-center justify-center">
                                  <img src={form.email_marketing_topo_url} alt="Topo Marketing" className="max-h-[70px] w-auto object-contain" />
                                </div>
                              )}
                            </div>

                            {/* Rodapé Marketing */}
                            <div className="space-y-1 pt-1 border-t border-slate-200">
                              <label className="text-[9px] font-bold text-text-secondary uppercase">Arte do Rodapé (Footer Marketing)</label>
                              <div className="flex items-center gap-2">
                                <label className="btn-secondary !py-1 px-2.5 text-[10px] cursor-pointer font-bold flex items-center gap-1 hover:bg-slate-200">
                                  <Upload size={11} /> Selecionar Imagem
                                  <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const reader = new FileReader();
                                      reader.onload = (evt) => setForm(prev => ({ ...prev, email_marketing_rodape_url: evt.target?.result as string }));
                                      reader.readAsDataURL(file);
                                    }
                                  }} />
                                </label>
                                {form.email_marketing_rodape_url && (
                                  <button type="button" onClick={() => setForm(prev => ({ ...prev, email_marketing_rodape_url: '' }))} className="text-red-500 hover:text-red-700 text-[10px] font-bold">
                                    Remover
                                  </button>
                                )}
                              </div>
                              {form.email_marketing_rodape_url && (
                                <div className="mt-1.5 p-1 bg-white border border-slate-200 rounded max-h-[80px] flex items-center justify-center">
                                  <img src={form.email_marketing_rodape_url} alt="Rodapé Marketing" className="max-h-[70px] w-auto object-contain" />
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Bloco 2: E-mail de Cobrança */}
                          <div className="space-y-3 p-3 bg-slate-50 border border-slate-200 rounded-sm">
                            <span className="text-[10px] font-bold text-amber-700 uppercase block tracking-wider">
                              📑 Artes para E-mail de Cobrança
                            </span>

                            {/* Topo Cobrança */}
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-text-secondary uppercase">Arte do Topo (Header Cobrança)</label>
                              <div className="flex items-center gap-2">
                                <label className="btn-secondary !py-1 px-2.5 text-[10px] cursor-pointer font-bold flex items-center gap-1 hover:bg-slate-200">
                                  <Upload size={11} /> Selecionar Imagem
                                  <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const reader = new FileReader();
                                      reader.onload = (evt) => setForm(prev => ({ ...prev, email_cobranca_topo_url: evt.target?.result as string }));
                                      reader.readAsDataURL(file);
                                    }
                                  }} />
                                </label>
                                {form.email_cobranca_topo_url && (
                                  <button type="button" onClick={() => setForm(prev => ({ ...prev, email_cobranca_topo_url: '' }))} className="text-red-500 hover:text-red-700 text-[10px] font-bold">
                                    Remover
                                  </button>
                                )}
                              </div>
                              {form.email_cobranca_topo_url && (
                                <div className="mt-1.5 p-1 bg-white border border-slate-200 rounded max-h-[80px] flex items-center justify-center">
                                  <img src={form.email_cobranca_topo_url} alt="Topo Cobrança" className="max-h-[70px] w-auto object-contain" />
                                </div>
                              )}
                            </div>

                            {/* Rodapé Cobrança */}
                            <div className="space-y-1 pt-1 border-t border-slate-200">
                              <label className="text-[9px] font-bold text-text-secondary uppercase">Arte do Rodapé (Footer Cobrança)</label>
                              <div className="flex items-center gap-2">
                                <label className="btn-secondary !py-1 px-2.5 text-[10px] cursor-pointer font-bold flex items-center gap-1 hover:bg-slate-200">
                                  <Upload size={11} /> Selecionar Imagem
                                  <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const reader = new FileReader();
                                      reader.onload = (evt) => setForm(prev => ({ ...prev, email_cobranca_rodape_url: evt.target?.result as string }));
                                      reader.readAsDataURL(file);
                                    }
                                  }} />
                                </label>
                                {form.email_cobranca_rodape_url && (
                                  <button type="button" onClick={() => setForm(prev => ({ ...prev, email_cobranca_rodape_url: '' }))} className="text-red-500 hover:text-red-700 text-[10px] font-bold">
                                    Remover
                                  </button>
                                )}
                              </div>
                              {form.email_cobranca_rodape_url && (
                                <div className="mt-1.5 p-1 bg-white border border-slate-200 rounded max-h-[80px] flex items-center justify-center">
                                  <img src={form.email_cobranca_rodape_url} alt="Rodapé Cobrança" className="max-h-[70px] w-auto object-contain" />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ══════════════════════════════════════════════════════════
                  SEÇÃO 3 — DOCUMENTOS & INTELIGÊNCIA ARTIFICIAL
                  ClickSign + OpenAI / DeepSeek
              ══════════════════════════════════════════════════════════ */}
              {/* ══════════════════════════════════════════════════════════
                  SUB-ABA: API DE ASSINATURA (CLICKSIGN)
              ══════════════════════════════════════════════════════════ */}
              {apiSubTab === 'assinaturas' && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-px flex-1 bg-divider" />
                    <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-1.5">
                      <Shield size={11} className="text-brand-500" /> API de Assinaturas Digitais
                    </span>
                    <div className="h-px flex-1 bg-divider" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                    {/* ClickSign Card */}
                    <div className="card p-5 bg-bg-primary border border-divider rounded-sm space-y-4 text-xs">
                      <div className="flex items-center gap-2 border-b border-divider pb-2 mb-1">
                        <Shield size={14} className="text-brand-500" />
                        <span className="text-[10px] text-text-primary uppercase font-bold tracking-wider">ClickSign — Assinaturas Digitais</span>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-text-secondary uppercase">Token ClickSign (API Key) *</label>
                        <input type="password" className="input !py-2 rounded-sm font-mono"
                          placeholder="clicksign_token_..."
                          value={form.clicksign_token || ''}
                          onChange={(e) => setForm({ ...form, clicksign_token: e.target.value })} />
                        <span className="text-[8px] text-text-muted block">Usado para automatizar envelopes e colher assinaturas digitais</span>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-text-secondary uppercase">Ambiente ClickSign</label>
                        <select className="input !py-2 rounded-sm"
                          value={form.clicksign_ambiente || 'Sandbox'}
                          onChange={(e) => setForm({ ...form, clicksign_ambiente: e.target.value })}>
                          <option value="Sandbox">Homologação (Sandbox)</option>
                          <option value="Producao">Produção (Live)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ══════════════════════════════════════════════════════════
                  SUB-ABA: API DE INTELIGÊNCIA ARTIFICIAL (IA)
              ══════════════════════════════════════════════════════════ */}
              {apiSubTab === 'ia' && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-px flex-1 bg-divider" />
                    <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-1.5">
                      <Key size={11} className="text-brand-500" /> Integrações com Modelos de IA
                    </span>
                    <div className="h-px flex-1 bg-divider" />
                  </div>

                  {/* Painel de Cada IA */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                    
                    {/* OpenAI Card */}
                    <div className="card p-5 bg-bg-primary border border-divider rounded-sm space-y-4 text-xs">
                      <div className="flex items-center justify-between border-b border-divider pb-2.5 mb-1">
                        <div className="flex items-center gap-2">
                          <svg viewBox="0 0 24 24" className="w-5 h-5 text-emerald-500 shrink-0" fill="currentColor">
                            <path d="M21.74 11.23a4.7 4.7 0 0 0-.25-2.28 4.75 4.75 0 0 0-1.74-2.2 4.8 4.8 0 0 0-2.47-.93 4.73 4.73 0 0 0-3.66 1.09A4.74 4.74 0 0 0 10.3 5.3a4.7 4.7 0 0 0-2.3-.92 4.76 4.76 0 0 0-3.3 1.25A4.75 4.75 0 0 0 3.3 8.94a4.7 4.7 0 0 0 .25 2.28 4.75 4.75 0 0 0 1.74 2.2 4.8 4.8 0 0 0 2.47.93 4.73 4.73 0 0 0 3.66-1.09 4.74 4.74 0 0 0 3.32 1.62 4.7 4.7 0 0 0 2.3.92 4.76 4.76 0 0 0 3.3-1.25 4.75 4.75 0 0 0 1.4-3.32zm-12.78 8.1a3.02 3.02 0 0 1-1.37-.33l4.3-2.48a.86.86 0 0 0 .43-.74v-5.26l1.64.95a.03.03 0 0 1 .02.03v4.6a3.06 3.06 0 0 1-3.05 3.07c-.67 0-1.33-.2-1.97-.56zm-4.7-6.2a3.02 3.02 0 0 1 .15-1.4l4.3 2.48a.86.86 0 0 0 .86 0l4.56-2.63v1.9a.03.03 0 0 1-.01.03l-4 2.3a3.06 3.06 0 0 1-4.23-1.1c-.36-.63-.56-1.36-.56-2.07v-.51zm.55-5.95c.34-.58.84-1.05 1.44-1.37l4.3 2.48a.86.86 0 0 0 .43.12c.26 0 .5-.08.7-.22L16 5.61v1.9a.03.03 0 0 1-.02.03l-4 2.3a3.06 3.06 0 0 1-4.24-1.12c-.36-.64-.56-1.37-.56-2.07v-.47zm12.92.51l-4.3 2.48a.86.86 0 0 0-.43.74v5.26l-1.64-.95a.03.03 0 0 1-.02-.03v-4.6a3.06 3.06 0 0 1 3.05-3.07c.67 0 1.33.2 1.97.56a3.02 3.02 0 0 1 1.37.33zm4.7 6.2a3.02 3.02 0 0 1-.15 1.4l-4.3-2.48a.86.86 0 0 0-.86 0L8.6 15.65v-1.9a.03.03 0 0 1 .01-.03l4-2.3a3.06 3.06 0 0 1 4.23 1.1c.36.63.56 1.36.56 2.07v.51zm-.55 5.95a3.02 3.02 0 0 1-1.44 1.37l-4.3-2.48a.86.86 0 0 0-.43-.12.86.86 0 0 0-.7.22L8 18.39v-1.9a.03.03 0 0 1 .02-.03l4-2.3a3.06 3.06 0 0 1 4.24 1.12c.36.64.56 1.37.56 2.07v.47zM12 13.5a1.5 1.5 0 1 1 1.5-1.5 1.5 1.5 0 0 1-1.5 1.5z"/>
                          </svg>
                          <span className="font-extrabold text-[10px] uppercase tracking-wider text-text-primary">OpenAI (ChatGPT)</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={clsx(
                            "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase border transition-all duration-300",
                            form.ai_openai_active
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400"
                              : "bg-rose-500/10 text-rose-600 border-rose-500/20 dark:bg-rose-500/20 dark:text-rose-400"
                          )}>
                            <span className={clsx(
                              "h-1.5 w-1.5 rounded-full",
                              form.ai_openai_active 
                                ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" 
                                : "bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                            )} />
                            {form.ai_openai_active ? 'Ativa' : 'Inativa'}
                          </span>
                          <button
                            type="button"
                            onClick={() => setForm({ ...form, ai_openai_active: !form.ai_openai_active })}
                            className={clsx(
                              "w-9 h-5 rounded-full relative transition-colors duration-200 cursor-pointer focus:outline-none shrink-0",
                              form.ai_openai_active ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-slate-200 dark:bg-slate-700"
                            )}
                          >
                            <span className={clsx(
                              "absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full transition-transform duration-200 shadow-sm",
                              form.ai_openai_active ? "translate-x-4" : "translate-x-0"
                            )} />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-bold text-text-secondary uppercase">Chave de API OpenAI *</label>
                        <div className="flex gap-2">
                          <input type="password" className="input !py-2 rounded-sm font-mono flex-1"
                            placeholder="sk-proj-..."
                            value={form.ai_openai_key || ''}
                            onChange={(e) => setForm({ ...form, ai_openai_key: e.target.value })} />
                          <button
                            type="button"
                            disabled={testingAI['openai']}
                            onClick={() => handleTestAIConnection('openai')}
                            className={clsx(
                              "px-3 py-1.5 rounded-sm border text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0",
                              testingAI['openai']
                                ? "bg-bg-secondary text-text-muted border-divider" 
                                : "bg-brand-500/10 text-brand-600 border-brand-500/20 hover:bg-brand-500/20"
                            )}
                          >
                            {testingAI['openai'] ? (
                              <>
                                <Loader2 size={11} className="animate-spin" />
                                Testando...
                              </>
                            ) : (
                              <>
                                <Sparkles size={11} />
                                Testar
                              </>
                            )}
                          </button>
                        </div>
                        
                        {aiStatus['openai'] && aiStatus['openai'] !== 'idle' && (
                          <div className={clsx(
                            "p-2.5 rounded-sm border text-[10px] font-medium leading-normal flex items-start gap-2 mt-2",
                            aiStatus['openai'] === 'success' 
                              ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" 
                              : "bg-rose-500/10 text-rose-700 border-rose-500/20"
                          )}>
                            {aiStatus['openai'] === 'success' ? (
                              <CheckCircle2 size={13} className="text-emerald-600 shrink-0 mt-0.5" />
                            ) : (
                              <XCircle size={13} className="text-rose-600 shrink-0 mt-0.5" />
                            )}
                            <div>
                              <span className="font-bold">{aiStatus['openai'] === 'success' ? 'Sucesso!' : 'Falha:'}</span> {aiMessage['openai']}
                            </div>
                          </div>
                        )}

                        {/* Balance and Spent Stats */}
                        <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-divider text-[10px]">
                          <div className="bg-slate-50 dark:bg-slate-800/40 p-2 rounded-lg border border-divider">
                            <span className="text-[8px] font-bold text-text-muted uppercase block">Gasto Estimado (Mês)</span>
                            <span className="font-extrabold text-slate-800 dark:text-slate-200 mt-0.5 block">
                              {aiUsageRes?.openai ? `$${aiUsageRes.openai.spent.toFixed(4)} USD` : 'Calculando...'}
                            </span>
                          </div>
                          <div className="bg-slate-50 dark:bg-slate-800/40 p-2 rounded-lg border border-divider">
                            <span className="text-[8px] font-bold text-text-muted uppercase block">Saldo da API</span>
                            <span className="font-extrabold text-slate-800 dark:text-slate-200 mt-0.5 block truncate" title={aiUsageRes?.openai?.balance}>
                              {aiUsageRes?.openai ? aiUsageRes.openai.balance : 'Consultando...'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* DeepSeek Card */}
                    <div className="card p-5 bg-bg-primary border border-divider rounded-sm space-y-4 text-xs">
                      <div className="flex items-center justify-between border-b border-divider pb-2.5 mb-1">
                        <div className="flex items-center gap-2">
                          <svg viewBox="0 0 24 24" className="w-5 h-5 text-indigo-500 shrink-0" fill="currentColor">
                            <path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61l1.42-1.42A6.97 6.97 0 0 1 5 12c0-3.87 3.13-7 7-7s7 3.13 7 7c0 1.63-.56 3.13-1.5 4.31l1.42 1.42A8.97 8.97 0 0 0 21 12c0-4.97-4.03-9-9-9zm-3.5 9a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0z"/>
                          </svg>
                          <span className="font-extrabold text-[10px] uppercase tracking-wider text-text-primary">DeepSeek AI</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={clsx(
                            "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase border transition-all duration-300",
                            form.ai_deepseek_active
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400"
                              : "bg-rose-500/10 text-rose-600 border-rose-500/20 dark:bg-rose-500/20 dark:text-rose-400"
                          )}>
                            <span className={clsx(
                              "h-1.5 w-1.5 rounded-full",
                              form.ai_deepseek_active 
                                ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" 
                                : "bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                            )} />
                            {form.ai_deepseek_active ? 'Ativa' : 'Inativa'}
                          </span>
                          <button
                            type="button"
                            onClick={() => setForm({ ...form, ai_deepseek_active: !form.ai_deepseek_active })}
                            className={clsx(
                              "w-9 h-5 rounded-full relative transition-colors duration-200 cursor-pointer focus:outline-none shrink-0",
                              form.ai_deepseek_active ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-slate-200 dark:bg-slate-700"
                            )}
                          >
                            <span className={clsx(
                              "absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full transition-transform duration-200 shadow-sm",
                              form.ai_deepseek_active ? "translate-x-4" : "translate-x-0"
                            )} />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-bold text-text-secondary uppercase">Chave de API DeepSeek *</label>
                        <div className="flex gap-2">
                          <input type="password" className="input !py-2 rounded-sm font-mono flex-1"
                            placeholder="sk-de-..."
                            value={form.ai_deepseek_key || ''}
                            onChange={(e) => setForm({ ...form, ai_deepseek_key: e.target.value })} />
                          <button
                            type="button"
                            disabled={testingAI['deepseek']}
                            onClick={() => handleTestAIConnection('deepseek')}
                            className={clsx(
                              "px-3 py-1.5 rounded-sm border text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0",
                              testingAI['deepseek']
                                ? "bg-bg-secondary text-text-muted border-divider" 
                                : "bg-brand-500/10 text-brand-600 border-brand-500/20 hover:bg-brand-500/20"
                            )}
                          >
                            {testingAI['deepseek'] ? (
                              <>
                                <Loader2 size={11} className="animate-spin" />
                                Testando...
                              </>
                            ) : (
                              <>
                                <Sparkles size={11} />
                                Testar
                              </>
                            )}
                          </button>
                        </div>
                        
                        {aiStatus['deepseek'] && aiStatus['deepseek'] !== 'idle' && (
                          <div className={clsx(
                            "p-2.5 rounded-sm border text-[10px] font-medium leading-normal flex items-start gap-2 mt-2",
                            aiStatus['deepseek'] === 'success' 
                              ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" 
                              : "bg-rose-500/10 text-rose-700 border-rose-500/20"
                          )}>
                            {aiStatus['deepseek'] === 'success' ? (
                              <CheckCircle2 size={13} className="text-emerald-600 shrink-0 mt-0.5" />
                            ) : (
                              <XCircle size={13} className="text-rose-600 shrink-0 mt-0.5" />
                            )}
                            <div>
                              <span className="font-bold">{aiStatus['deepseek'] === 'success' ? 'Sucesso!' : 'Falha:'}</span> {aiMessage['deepseek']}
                            </div>
                          </div>
                        )}

                        {/* Balance and Spent Stats */}
                        <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-divider text-[10px]">
                          <div className="bg-slate-50 dark:bg-slate-800/40 p-2 rounded-lg border border-divider">
                            <span className="text-[8px] font-bold text-text-muted uppercase block">Gasto Estimado (Mês)</span>
                            <span className="font-extrabold text-slate-800 dark:text-slate-200 mt-0.5 block">
                              {aiUsageRes?.deepseek ? `$${aiUsageRes.deepseek.spent.toFixed(4)} USD` : 'Calculando...'}
                            </span>
                          </div>
                          <div className="bg-slate-50 dark:bg-slate-800/40 p-2 rounded-lg border border-divider">
                            <span className="text-[8px] font-bold text-text-muted uppercase block">Saldo da API</span>
                            <span className="font-extrabold text-slate-800 dark:text-slate-200 mt-0.5 block truncate" title={aiUsageRes?.deepseek?.balance}>
                              {aiUsageRes?.deepseek ? aiUsageRes.deepseek.balance : 'Consultando...'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Gemini Card */}
                    <div className="card p-5 bg-bg-primary border border-divider rounded-sm space-y-4 text-xs">
                      <div className="flex items-center justify-between border-b border-divider pb-2.5 mb-1">
                        <div className="flex items-center gap-2">
                          <svg viewBox="0 0 24 24" className="w-5 h-5 text-blue-500 shrink-0" fill="currentColor">
                            <path d="M12 2a.75.75 0 0 0-.75.75c0 5.1-4.15 9.25-9.25 9.25a.75.75 0 0 0 0 1.5c5.1 0 9.25 4.15 9.25 9.25a.75.75 0 0 0 1.5 0c0-5.1 4.15-9.25 9.25-9.25a.75.75 0 0 0 0-1.5c-5.1 0-9.25-4.15-9.25-9.25A.75.75 0 0 0 12 2zm7 4a.5.5 0 0 0-.5.5c0 1.93-1.57 3.5-3.5 3.5a.5.5 0 0 0 0 1c1.93 0 3.5 1.57 3.5 3.5a.5.5 0 0 0 1 0c0-1.93 1.57-3.5 3.5-3.5a.5.5 0 0 0 0-1c-1.93 0-3.5-1.57-3.5-3.5A.5.5 0 0 0 19 6z"/>
                          </svg>
                          <span className="font-extrabold text-[10px] uppercase tracking-wider text-text-primary">Google Gemini AI</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={clsx(
                            "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase border transition-all duration-300",
                            form.ai_gemini_active
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400"
                              : "bg-rose-500/10 text-rose-600 border-rose-500/20 dark:bg-rose-500/20 dark:text-rose-400"
                          )}>
                            <span className={clsx(
                              "h-1.5 w-1.5 rounded-full",
                              form.ai_gemini_active 
                                ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" 
                                : "bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                            )} />
                            {form.ai_gemini_active ? 'Ativa' : 'Inativa'}
                          </span>
                          <button
                            type="button"
                            onClick={() => setForm({ ...form, ai_gemini_active: !form.ai_gemini_active })}
                            className={clsx(
                              "w-9 h-5 rounded-full relative transition-colors duration-200 cursor-pointer focus:outline-none shrink-0",
                              form.ai_gemini_active ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-slate-200 dark:bg-slate-700"
                            )}
                          >
                            <span className={clsx(
                              "absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full transition-transform duration-200 shadow-sm",
                              form.ai_gemini_active ? "translate-x-4" : "translate-x-0"
                            )} />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-bold text-text-secondary uppercase">Chave de API Gemini *</label>
                        <div className="flex gap-2">
                          <input type="password" className="input !py-2 rounded-sm font-mono flex-1"
                            placeholder="AIzaSy..."
                            value={form.ai_gemini_key || ''}
                            onChange={(e) => setForm({ ...form, ai_gemini_key: e.target.value })} />
                          <button
                            type="button"
                            disabled={testingAI['gemini']}
                            onClick={() => handleTestAIConnection('gemini')}
                            className={clsx(
                              "px-3 py-1.5 rounded-sm border text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0",
                              testingAI['gemini']
                                ? "bg-bg-secondary text-text-muted border-divider" 
                                : "bg-brand-500/10 text-brand-600 border-brand-500/20 hover:bg-brand-500/20"
                            )}
                          >
                            {testingAI['gemini'] ? (
                              <>
                                <Loader2 size={11} className="animate-spin" />
                                Testando...
                              </>
                            ) : (
                              <>
                                <Sparkles size={11} />
                                Testar
                              </>
                            )}
                          </button>
                        </div>
                        
                        {aiStatus['gemini'] && aiStatus['gemini'] !== 'idle' && (
                          <div className={clsx(
                            "p-2.5 rounded-sm border text-[10px] font-medium leading-normal flex items-start gap-2 mt-2",
                            aiStatus['gemini'] === 'success' 
                              ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" 
                              : "bg-rose-500/10 text-rose-700 border-rose-500/20"
                          )}>
                            {aiStatus['gemini'] === 'success' ? (
                              <CheckCircle2 size={13} className="text-emerald-600 shrink-0 mt-0.5" />
                            ) : (
                              <XCircle size={13} className="text-rose-600 shrink-0 mt-0.5" />
                            )}
                            <div>
                              <span className="font-bold">{aiStatus['gemini'] === 'success' ? 'Sucesso!' : 'Falha:'}</span> {aiMessage['gemini']}
                            </div>
                          </div>
                        )}

                        {/* Balance and Spent Stats */}
                        <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-divider text-[10px]">
                          <div className="bg-slate-50 dark:bg-slate-800/40 p-2 rounded-lg border border-divider">
                            <span className="text-[8px] font-bold text-text-muted uppercase block">Gasto Estimado (Mês)</span>
                            <span className="font-extrabold text-slate-800 dark:text-slate-200 mt-0.5 block">
                              {aiUsageRes?.gemini ? `$${aiUsageRes.gemini.spent.toFixed(4)} USD` : 'Calculando...'}
                            </span>
                          </div>
                          <div className="bg-slate-50 dark:bg-slate-800/40 p-2 rounded-lg border border-divider">
                            <span className="text-[8px] font-bold text-text-muted uppercase block">Saldo da API</span>
                            <span className="font-extrabold text-slate-800 dark:text-slate-200 mt-0.5 block truncate" title={aiUsageRes?.gemini?.balance}>
                              {aiUsageRes?.gemini ? aiUsageRes.gemini.balance : 'Consultando...'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Manus Card */}
                    <div className="card p-5 bg-bg-primary border border-divider rounded-sm space-y-4 text-xs">
                      <div className="flex items-center justify-between border-b border-divider pb-2.5 mb-1">
                        <div className="flex items-center gap-2">
                          <svg viewBox="0 0 24 24" className="w-5 h-5 text-amber-500 shrink-0" fill="currentColor">
                            <path d="M12 2A10 10 0 0 0 2 12a10 10 0 0 0 10 10 10 10 0 0 0 10-10A10 10 0 0 0 12 2zm4.5 11.5c-.8.8-2.1.8-2.9 0l-1.6-1.6v4.6c0 1.1-.9 2-2 2s-2-.9-2-2v-4.6l-1.6 1.6c-.8.8-2.1.8-2.9 0s-.8-2.1 0-2.9l4.5-4.5c.8-.8 2.1-.8 2.9 0l4.5 4.5c.8.8.8 2.1 0 2.9z"/>
                          </svg>
                          <span className="font-extrabold text-[10px] uppercase tracking-wider text-text-primary">Manus AI (Agent Platform)</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={clsx(
                            "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase border transition-all duration-300",
                            form.ai_manus_active
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400"
                              : "bg-rose-500/10 text-rose-600 border-rose-500/20 dark:bg-rose-500/20 dark:text-rose-400"
                          )}>
                            <span className={clsx(
                              "h-1.5 w-1.5 rounded-full",
                              form.ai_manus_active 
                                ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" 
                                : "bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                            )} />
                            {form.ai_manus_active ? 'Ativa' : 'Inativa'}
                          </span>
                          <button
                            type="button"
                            onClick={() => setForm({ ...form, ai_manus_active: !form.ai_manus_active })}
                            className={clsx(
                              "w-9 h-5 rounded-full relative transition-colors duration-200 cursor-pointer focus:outline-none shrink-0",
                              form.ai_manus_active ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-slate-200 dark:bg-slate-700"
                            )}
                          >
                            <span className={clsx(
                              "absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full transition-transform duration-200 shadow-sm",
                              form.ai_manus_active ? "translate-x-4" : "translate-x-0"
                            )} />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-bold text-text-secondary uppercase">Chave de API Manus *</label>
                        <div className="flex gap-2">
                          <input type="password" className="input !py-2 rounded-sm font-mono flex-1"
                            placeholder="x-manus-api-key..."
                            value={form.ai_manus_key || ''}
                            onChange={(e) => setForm({ ...form, ai_manus_key: e.target.value })} />
                          <button
                            type="button"
                            disabled={testingAI['manus']}
                            onClick={() => handleTestAIConnection('manus')}
                            className={clsx(
                              "px-3 py-1.5 rounded-sm border text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0",
                              testingAI['manus']
                                ? "bg-bg-secondary text-text-muted border-divider" 
                                : "bg-brand-500/10 text-brand-600 border-brand-500/20 hover:bg-brand-500/20"
                            )}
                          >
                            {testingAI['manus'] ? (
                              <>
                                <Loader2 size={11} className="animate-spin" />
                                Testando...
                              </>
                            ) : (
                              <>
                                <Sparkles size={11} />
                                Testar
                              </>
                            )}
                          </button>
                        </div>
                        
                        {aiStatus['manus'] && aiStatus['manus'] !== 'idle' && (
                          <div className={clsx(
                            "p-2.5 rounded-sm border text-[10px] font-medium leading-normal flex items-start gap-2 mt-2",
                            aiStatus['manus'] === 'success' 
                              ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" 
                              : "bg-rose-500/10 text-rose-700 border-rose-500/20"
                          )}>
                            {aiStatus['manus'] === 'success' ? (
                              <CheckCircle2 size={13} className="text-emerald-600 shrink-0 mt-0.5" />
                            ) : (
                              <XCircle size={13} className="text-rose-600 shrink-0 mt-0.5" />
                            )}
                            <div>
                              <span className="font-bold">{aiStatus['manus'] === 'success' ? 'Sucesso!' : 'Falha:'}</span> {aiMessage['manus']}
                            </div>
                          </div>
                        )}

                        {/* Balance and Spent Stats */}
                        <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-divider text-[10px]">
                          <div className="bg-slate-50 dark:bg-slate-800/40 p-2 rounded-lg border border-divider">
                            <span className="text-[8px] font-bold text-text-muted uppercase block">Gasto Estimado (Mês)</span>
                            <span className="font-extrabold text-slate-800 dark:text-slate-200 mt-0.5 block">
                              {aiUsageRes?.manus ? `$${aiUsageRes.manus.spent.toFixed(4)} USD` : 'Calculando...'}
                            </span>
                          </div>
                          <div className="bg-slate-50 dark:bg-slate-800/40 p-2 rounded-lg border border-divider">
                            <span className="text-[8px] font-bold text-text-muted uppercase block">Saldo da API</span>
                            <span className="font-extrabold text-slate-800 dark:text-slate-200 mt-0.5 block truncate" title={aiUsageRes?.manus?.balance}>
                              {aiUsageRes?.manus ? aiUsageRes.manus.balance : 'Consultando...'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Cadastro de Prompts Padrão */}
                  <div className="mt-8">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="h-px flex-1 bg-divider" />
                      <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-1.5">
                        <Edit3 size={11} className="text-brand-500" /> Prompts do Sistema
                      </span>
                      <div className="h-px flex-1 bg-divider" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Prompt de Marketing */}
                      <div className="card p-5 bg-bg-primary border border-divider rounded-sm space-y-3 text-xs">
                        <label className="text-[10px] font-bold text-text-primary uppercase tracking-wider block border-b border-divider pb-2">Prompt de Marketing *</label>
                        <textarea rows={6}
                          className="input resize-none rounded-sm font-mono text-[10px] leading-relaxed"
                          placeholder="Ex: Você é o agente de marketing da Coliseu Sistemas. Crie mensagens persuasivas com foco nas vantagens do ERP..."
                          value={form.ai_prompt_marketing || ''}
                          onChange={(e) => setForm({ ...form, ai_prompt_marketing: e.target.value })} />
                        <span className="text-[8px] text-text-muted block">Controla a geração de copys publicitárias e e-mails de marketing em massa.</span>
                      </div>

                      {/* Prompt de Cobrança */}
                      <div className="card p-5 bg-bg-primary border border-divider rounded-sm space-y-3 text-xs">
                        <label className="text-[10px] font-bold text-text-primary uppercase tracking-wider block border-b border-divider pb-2">Prompt de Cobrança *</label>
                        <textarea rows={6}
                          className="input resize-none rounded-sm font-mono text-[10px] leading-relaxed"
                          placeholder="Ex: Atue de forma cordial e resolutiva. Indique as formas de pagamento disponíveis e prazos de carência..."
                          value={form.ai_prompt_cobranca || ''}
                          onChange={(e) => setForm({ ...form, ai_prompt_cobranca: e.target.value })} />
                        <span className="text-[8px] text-text-muted block">Padrão de tom e restrições para envio de lembretes e avisos de vencimento.</span>
                      </div>

                      {/* Prompt de Contratos */}
                      <div className="card p-5 bg-bg-primary border border-divider rounded-sm space-y-3 text-xs">
                        <label className="text-[10px] font-bold text-text-primary uppercase tracking-wider block border-b border-divider pb-2">Prompt de Contratos *</label>
                        <textarea rows={6}
                          className="input resize-none rounded-sm font-mono text-[10px] leading-relaxed"
                          placeholder="Ex: Atue como especialista jurídico comercial de TI. Redija minutas extensas e robustas preservando as informações da Coliseu..."
                          value={form.ai_prompt_contratos || ''}
                          onChange={(e) => setForm({ ...form, ai_prompt_contratos: e.target.value })} />
                        <span className="text-[8px] text-text-muted block">Instrução para a criação de minutas de contratos e propostas a partir do CRM.</span>
                      </div>

                      {/* Prompt de BI */}
                      <div className="card p-5 bg-bg-primary border border-divider rounded-sm space-y-3 text-xs">
                        <label className="text-[10px] font-bold text-text-primary uppercase tracking-wider block border-b border-divider pb-2">Prompt de BI *</label>
                        <textarea rows={6}
                          className="input resize-none rounded-sm font-mono text-[10px] leading-relaxed"
                          placeholder="Ex: Você é um analista financeiro sênior. Resuma os indicadores de vendas e inadimplência identificando anomalias..."
                          value={form.ai_prompt_bi || ''}
                          onChange={(e) => setForm({ ...form, ai_prompt_bi: e.target.value })} />
                        <span className="text-[8px] text-text-muted block">Diretrizes para análises automáticas e resumos do painel gerencial.</span>
                      </div>
                    </div>
                  </div>

                </div>
              )}

            </div>
          )}

          {/* TAB 2: MINIMUM WAGE & INDEX ADJUSTMENT */}
          {activeTab === 'index' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
              <div className="card p-5 md:col-span-1 bg-bg-primary border border-divider rounded-sm space-y-4 text-xs">
                <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider block border-b border-divider pb-2">Salário Mínimo de Referência</span>
                
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-text-secondary uppercase">Salário Mínimo Atual (R$) *</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-text-muted font-bold">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      className="input !py-2 !pl-9 rounded-sm font-mono"
                      value={form.salario_minimo_atual || 0}
                      onChange={(e) => setForm({ ...form, salario_minimo_atual: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div className="bg-bg-secondary p-3 rounded-sm border border-divider space-y-1 font-mono text-[9px] text-text-secondary">
                  <div>Última base cadastrada:</div>
                  <div className="font-bold text-text-primary mt-1">Anterior: {configRes?.data?.salario_minimo_anterior ? formatBRL(configRes.data.salario_minimo_anterior) : 'R$ 0,00'}</div>
                  <div className="font-bold text-text-primary">Atual: {configRes?.data?.salario_minimo_atual ? formatBRL(configRes.data.salario_minimo_atual) : 'R$ 0,00'}</div>
                </div>

                <div className="flex gap-2 text-[9px] text-text-secondary leading-relaxed bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 p-2.5 rounded-sm">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <p><strong>Aviso Importante:</strong> Alterar o salário mínimo aciona um gatilho de reajuste automático para todos os contratos indexados a esse indicador que possuam parcelas em aberto!</p>
                </div>
              </div>

              {/* Informative index text or logs */}
              <div className="card p-5 md:col-span-2 bg-bg-primary border border-divider rounded-sm space-y-4">
                <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider block border-b border-divider pb-2">Relatório do Gatilho de Reajuste</span>

                {recalcFeedback ? (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-sm p-4 text-xs space-y-2 animate-scale-up">
                    <div className="font-bold text-emerald-800 dark:text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 size={16} /> Ajuste de Contratos Executado!
                    </div>
                    <p className="text-text-primary">{recalcFeedback.message}</p>
                    <div className="text-[10px] font-semibold text-emerald-700 bg-emerald-500/20 px-2 py-0.5 rounded-sm inline-block">
                      {recalcFeedback.installmentsCount} parcelas monetariamente reajustadas no banco de dados.
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-text-secondary space-y-3">
                    <p>O índice de reajuste de contratos calcula a razão entre o <strong>Salário Mínimo Novo</strong> e o <strong>Salário Mínimo Anterior</strong>.</p>
                    
                    <div className="bg-bg-secondary/40 p-4 border border-divider rounded-sm space-y-2 font-mono text-[10px] text-text-primary">
                      <div>Exemplo Prático:</div>
                      <div className="mt-2 text-text-secondary">· Salário Mínimo Anterior: R$ 1.412,00</div>
                      <div className="text-text-secondary">· Salário Mínimo Novo: R$ 1.502,00</div>
                      <div className="text-text-secondary">· Proporção do reajuste: 1.502 / 1.412 = <strong>1,0637 (+6.37%)</strong></div>
                      <div className="mt-2 text-text-secondary">Toda parcela com status de pagamento "ABERTO" indexada a Salário Mínimo terá seu valor reajustado em 6.37%.</div>
                    </div>

                    <p className="text-[10px] text-text-muted flex items-center gap-1">
                      <Info size={12} className="text-brand-500" /> Insira o novo valor e clique em "Salvar Configurações" na barra inferior para disparar o reajuste.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}



          {/* TAB 4: AUTOMATION RULES */}
          {activeTab === 'automacoes' && (() => {
            const marketingTemplates = templates.filter((t: any) => t.subcategoria === 'marketing' && t.categoria.includes('WhatsApp'))
            const marketingEmailTemplates = templates.filter((t: any) => t.subcategoria === 'marketing' && (t.categoria.includes('Email') || t.categoria.includes('E-mail') || !t.categoria.includes('WhatsApp')))
            const cobrancaTemplates = templates.filter((t: any) => t.subcategoria === 'cobranca' && t.categoria.includes('WhatsApp'))
            const cobrancaEmailTemplates = templates.filter((t: any) => t.subcategoria === 'cobranca' && (t.categoria.includes('Email') || t.categoria.includes('E-mail') || !t.categoria.includes('WhatsApp')))
            const posVendaTemplates = templates.filter((t: any) => t.subcategoria === 'pos_venda' && t.categoria.includes('WhatsApp'))
            const posVendaEmailTemplates = templates.filter((t: any) => t.subcategoria === 'pos_venda' && (t.categoria.includes('Email') || t.categoria.includes('E-mail') || !t.categoria.includes('WhatsApp')))
            const allEmailTemplates = templates.filter((t: any) => t.categoria.includes('Email') || t.categoria.includes('E-mail') || !t.categoria.includes('WhatsApp'))
            const allWhatsAppTemplates = templates.filter((t: any) => t.categoria.includes('WhatsApp'))

            return (
              <div className="space-y-6 animate-fade-in text-xs">
                
                {/* Marketing Automations Card */}
                <div className="card p-5 bg-bg-primary border border-divider rounded-xl space-y-4 shadow-xs">
                  <div className="border-b border-divider pb-3 flex items-center justify-between">
                    <span className="text-xs text-text-primary uppercase font-black tracking-wider flex items-center gap-2">
                      <Users size={16} className="text-brand-500" /> Parâmetros de Marketing em Massa (WhatsApp &amp; E-mail)
                    </span>
                    <span className="text-[11px] text-text-secondary">
                      Ative ou desative cada módulo de forma 100% independente
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Envio Periódico */}
                    <div className={clsx(
                      "p-4 rounded-xl border transition-all space-y-3",
                      periodicActive 
                        ? "bg-brand-500/5 border-brand-500/30 shadow-xs" 
                        : "bg-bg-secondary/20 border-divider opacity-80 hover:opacity-100"
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox"
                            id="periodicActive"
                            checked={periodicActive}
                            onChange={(e) => setPeriodicActive(e.target.checked)}
                            className="w-4 h-4 text-brand-600 border-divider rounded focus:ring-brand-500 cursor-pointer"
                          />
                          <label htmlFor="periodicActive" className="font-extrabold text-text-primary text-xs cursor-pointer">
                            Envio Periódico (Tempo em tempo)
                          </label>
                        </div>
                        <span className={clsx(
                          "px-2 py-0.5 rounded text-[10px] font-black uppercase border",
                          periodicActive ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400"
                        )}>
                          {periodicActive ? "ATIVO" : "INATIVO"}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-text-secondary leading-normal">
                        Envia mensagens de tempos em tempos para a base de clientes ativos.
                      </p>

                      <div className="space-y-2 pt-1 border-t border-divider/60">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-text-secondary uppercase">Canal de Envio</label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={periodicCanal}
                              onChange={(e) => setPeriodicCanal(e.target.value)}
                            >
                              <option value="whatsapp">🟢 Apenas WhatsApp</option>
                              <option value="email">✉️ Apenas E-mail</option>
                              <option value="ambos">🔄 Ambos (WhatsApp + E-mail)</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-text-secondary uppercase">Intervalo (Dias)</label>
                            <input
                              type="number"
                              min="1"
                              className="input !py-1 rounded-lg font-mono text-xs w-full bg-bg-primary border-divider"
                              value={periodicDays}
                              onChange={(e) => setPeriodicDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                            />
                          </div>
                        </div>

                        {(periodicCanal === 'whatsapp' || periodicCanal === 'ambos') && (
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 uppercase flex items-center gap-1">
                              <span>🟢 Modelo WhatsApp</span>
                            </label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={periodicTemplateId}
                              onChange={(e) => setPeriodicTemplateId(e.target.value)}
                            >
                              <option value="">Selecione...</option>
                              {marketingTemplates.map((t: any) => (
                                <option key={t.id} value={t.id}>{t.nome}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {(periodicCanal === 'email' || periodicCanal === 'ambos') && (
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-blue-700 dark:text-blue-400 uppercase flex items-center gap-1">
                              <span>✉️ Modelo de E-mail</span>
                            </label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={periodicEmailTemplateId}
                              onChange={(e) => setPeriodicEmailTemplateId(e.target.value)}
                            >
                              <option value="">Selecione...</option>
                              {(marketingEmailTemplates.length > 0 ? marketingEmailTemplates : allEmailTemplates).map((t: any) => (
                                <option key={t.id} value={t.id}>{t.nome}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Aniversariantes do Dia */}
                    <div className={clsx(
                      "p-4 rounded-xl border transition-all space-y-3",
                      birthdayActive 
                        ? "bg-brand-500/5 border-brand-500/30 shadow-xs" 
                        : "bg-bg-secondary/20 border-divider opacity-80 hover:opacity-100"
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox"
                            id="birthdayActive"
                            checked={birthdayActive}
                            onChange={(e) => setBirthdayActive(e.target.checked)}
                            className="w-4 h-4 text-brand-600 border-divider rounded focus:ring-brand-500 cursor-pointer"
                          />
                          <label htmlFor="birthdayActive" className="font-extrabold text-text-primary text-xs cursor-pointer">
                            Aniversariantes do Dia
                          </label>
                        </div>
                        <span className={clsx(
                          "px-2 py-0.5 rounded text-[10px] font-black uppercase border",
                          birthdayActive ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400"
                        )}>
                          {birthdayActive ? "ATIVO" : "INATIVO"}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-text-secondary leading-normal">
                        Envia mensagem de felicitações no dia de aniversário do cliente.
                      </p>

                      <div className="space-y-2 pt-1 border-t border-divider/60">
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-text-secondary uppercase">Canal de Envio</label>
                          <select
                            className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                            value={birthdayCanal}
                            onChange={(e) => setBirthdayCanal(e.target.value)}
                          >
                            <option value="whatsapp">🟢 Apenas WhatsApp</option>
                            <option value="email">✉️ Apenas E-mail</option>
                            <option value="ambos">🔄 Ambos (WhatsApp + E-mail)</option>
                          </select>
                        </div>

                        {(birthdayCanal === 'whatsapp' || birthdayCanal === 'ambos') && (
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 uppercase flex items-center gap-1">
                              <span>🟢 Modelo WhatsApp</span>
                            </label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={birthdayTemplateId}
                              onChange={(e) => setBirthdayTemplateId(e.target.value)}
                            >
                              <option value="">Selecione...</option>
                              {marketingTemplates.map((t: any) => (
                                <option key={t.id} value={t.id}>{t.nome}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {(birthdayCanal === 'email' || birthdayCanal === 'ambos') && (
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-blue-700 dark:text-blue-400 uppercase flex items-center gap-1">
                              <span>✉️ Modelo de E-mail</span>
                            </label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={birthdayEmailTemplateId}
                              onChange={(e) => setBirthdayEmailTemplateId(e.target.value)}
                            >
                              <option value="">Selecione...</option>
                              {(marketingEmailTemplates.length > 0 ? marketingEmailTemplates : allEmailTemplates).map((t: any) => (
                                <option key={t.id} value={t.id}>{t.nome}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Pós-Venda Automático */}
                    <div className={clsx(
                      "p-4 rounded-xl border transition-all space-y-3",
                      postPurchaseActive 
                        ? "bg-brand-500/5 border-brand-500/30 shadow-xs" 
                        : "bg-bg-secondary/20 border-divider opacity-80 hover:opacity-100"
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox"
                            id="postPurchaseActive"
                            checked={postPurchaseActive}
                            onChange={(e) => setPostPurchaseActive(e.target.checked)}
                            className="w-4 h-4 text-brand-600 border-divider rounded focus:ring-brand-500 cursor-pointer"
                          />
                          <label htmlFor="postPurchaseActive" className="font-extrabold text-text-primary text-xs cursor-pointer">
                            Pós-Venda Automático (Pós-Compra)
                          </label>
                        </div>
                        <span className={clsx(
                          "px-2 py-0.5 rounded text-[10px] font-black uppercase border",
                          postPurchaseActive ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400"
                        )}>
                          {postPurchaseActive ? "ATIVO" : "INATIVO"}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-text-secondary leading-normal">
                        Envia mensagem de pós-venda alguns dias após uma compra faturada.
                      </p>

                      <div className="space-y-2 pt-1 border-t border-divider/60">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-text-secondary uppercase">Canal de Envio</label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={postPurchaseCanal}
                              onChange={(e) => setPostPurchaseCanal(e.target.value)}
                            >
                              <option value="whatsapp">🟢 Apenas WhatsApp</option>
                              <option value="email">✉️ Apenas E-mail</option>
                              <option value="ambos">🔄 Ambos (WhatsApp + E-mail)</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-text-secondary uppercase">Atraso (Dias)</label>
                            <input
                              type="number"
                              min="1"
                              className="input !py-1 rounded-lg font-mono text-xs w-full bg-bg-primary border-divider"
                              value={postPurchaseDays}
                              onChange={(e) => setPostPurchaseDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                            />
                          </div>
                        </div>

                        {(postPurchaseCanal === 'whatsapp' || postPurchaseCanal === 'ambos') && (
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 uppercase flex items-center gap-1">
                              <span>🟢 Modelo WhatsApp</span>
                            </label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={postPurchaseTemplateId}
                              onChange={(e) => setPostPurchaseTemplateId(e.target.value)}
                            >
                              <option value="">Selecione...</option>
                              {marketingTemplates.map((t: any) => (
                                <option key={t.id} value={t.id}>{t.nome}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {(postPurchaseCanal === 'email' || postPurchaseCanal === 'ambos') && (
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-blue-700 dark:text-blue-400 uppercase flex items-center gap-1">
                              <span>✉️ Modelo de E-mail</span>
                            </label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={postPurchaseEmailTemplateId}
                              onChange={(e) => setPostPurchaseEmailTemplateId(e.target.value)}
                            >
                              <option value="">Selecione...</option>
                              {(marketingEmailTemplates.length > 0 ? marketingEmailTemplates : allEmailTemplates).map((t: any) => (
                                <option key={t.id} value={t.id}>{t.nome}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Compra de Marca Específica */}
                    <div className={clsx(
                      "p-4 rounded-xl border transition-all space-y-3",
                      brandXActive 
                        ? "bg-brand-500/5 border-brand-500/30 shadow-xs" 
                        : "bg-bg-secondary/20 border-divider opacity-80 hover:opacity-100"
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox"
                            id="brandXActive"
                            checked={brandXActive}
                            onChange={(e) => setBrandXActive(e.target.checked)}
                            className="w-4 h-4 text-brand-600 border-divider rounded focus:ring-brand-500 cursor-pointer"
                          />
                          <label htmlFor="brandXActive" className="font-extrabold text-text-primary text-xs cursor-pointer">
                            Compra de Marca Específica (Brand X)
                          </label>
                        </div>
                        <span className={clsx(
                          "px-2 py-0.5 rounded text-[10px] font-black uppercase border",
                          brandXActive ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400"
                        )}>
                          {brandXActive ? "ATIVO" : "INATIVO"}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-text-secondary leading-normal">
                        Envia mensagem direcionada para clientes que compraram produtos da marca configurada.
                      </p>

                      <div className="space-y-2 pt-1 border-t border-divider/60">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-text-secondary uppercase">Canal de Envio</label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={brandXCanal}
                              onChange={(e) => setBrandXCanal(e.target.value)}
                            >
                              <option value="whatsapp">🟢 Apenas WhatsApp</option>
                              <option value="email">✉️ Apenas E-mail</option>
                              <option value="ambos">🔄 Ambos (WhatsApp + E-mail)</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-text-secondary uppercase">Marca para Filtro</label>
                            <input
                              type="text"
                              placeholder="Ex: Coliseu"
                              className="input !py-1 rounded-lg text-xs w-full bg-bg-primary border-divider font-semibold"
                              value={brandXName}
                              onChange={(e) => setBrandXName(e.target.value)}
                            />
                          </div>
                        </div>

                        {(brandXCanal === 'whatsapp' || brandXCanal === 'ambos') && (
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 uppercase flex items-center gap-1">
                              <span>🟢 Modelo WhatsApp</span>
                            </label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={brandXTemplateId}
                              onChange={(e) => setBrandXTemplateId(e.target.value)}
                            >
                              <option value="">Selecione...</option>
                              {marketingTemplates.map((t: any) => (
                                <option key={t.id} value={t.id}>{t.nome}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {(brandXCanal === 'email' || brandXCanal === 'ambos') && (
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-blue-700 dark:text-blue-400 uppercase flex items-center gap-1">
                              <span>✉️ Modelo de E-mail</span>
                            </label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={brandXEmailTemplateId}
                              onChange={(e) => setBrandXEmailTemplateId(e.target.value)}
                            >
                              <option value="">Selecione...</option>
                              {(marketingEmailTemplates.length > 0 ? marketingEmailTemplates : allEmailTemplates).map((t: any) => (
                                <option key={t.id} value={t.id}>{t.nome}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cobrança Automations Card */}
                <div className="card p-5 bg-bg-primary border border-divider rounded-xl space-y-4 shadow-xs">
                  <div className="border-b border-divider pb-3 flex items-center justify-between">
                    <span className="text-xs text-text-primary uppercase font-black tracking-wider flex items-center gap-2">
                      <DollarSign size={16} className="text-brand-500" /> Parâmetros da Régua de Cobrança (WhatsApp &amp; E-mail)
                    </span>
                    <span className="text-[11px] text-text-secondary">
                      Configure os disparos preventivos, cobrança com juros e aviso de suspensão
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Lembrete Preventivo */}
                    <div className={clsx(
                      "p-4 rounded-xl border transition-all space-y-3",
                      preventivoActive 
                        ? "bg-brand-500/5 border-brand-500/30 shadow-xs" 
                        : "bg-bg-secondary/20 border-divider opacity-80 hover:opacity-100"
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox"
                            id="preventivoActive"
                            checked={preventivoActive}
                            onChange={(e) => setPreventivoActive(e.target.checked)}
                            className="w-4 h-4 text-brand-600 border-divider rounded focus:ring-brand-500 cursor-pointer"
                          />
                          <label htmlFor="preventivoActive" className="font-extrabold text-text-primary text-xs cursor-pointer">
                            Lembrete Preventivo
                          </label>
                        </div>
                        <span className={clsx(
                          "px-2 py-0.5 rounded text-[10px] font-black uppercase border",
                          preventivoActive ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400"
                        )}>
                          {preventivoActive ? "ATIVO" : "INATIVO"}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-text-secondary leading-normal">
                        Dispara lembrete dias antes do vencimento do título.
                      </p>

                      <div className="space-y-2 pt-1 border-t border-divider/60">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-text-secondary uppercase">Canal de Envio</label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={preventivoCanal}
                              onChange={(e) => setPreventivoCanal(e.target.value)}
                            >
                              <option value="whatsapp">🟢 Apenas WhatsApp</option>
                              <option value="email">✉️ Apenas E-mail</option>
                              <option value="ambos">🔄 Ambos (WhatsApp + E-mail)</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-text-secondary uppercase">Dias Antes Venc.</label>
                            <input
                              type="number"
                              max="-1"
                              className="input !py-1 rounded-lg font-mono text-xs w-full bg-bg-primary border-divider"
                              value={preventivoDays}
                              onChange={(e) => setPreventivoDays(Math.min(-1, parseInt(e.target.value, 10) || -5))}
                            />
                          </div>
                        </div>

                        {(preventivoCanal === 'whatsapp' || preventivoCanal === 'ambos') && (
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 uppercase flex items-center gap-1">
                              <span>🟢 Modelo WhatsApp</span>
                            </label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={preventivoTemplateId}
                              onChange={(e) => setPreventivoTemplateId(e.target.value)}
                            >
                              <option value="">Selecione...</option>
                              {(cobrancaTemplates.length > 0 ? cobrancaTemplates : allWhatsAppTemplates).map((t: any) => (
                                <option key={t.id} value={t.id}>{t.nome}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {(preventivoCanal === 'email' || preventivoCanal === 'ambos') && (
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-blue-700 dark:text-blue-400 uppercase flex items-center gap-1">
                              <span>✉️ Modelo de E-mail</span>
                            </label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={preventivoEmailTemplateId}
                              onChange={(e) => setPreventivoEmailTemplateId(e.target.value)}
                            >
                              <option value="">Selecione...</option>
                              {(cobrancaEmailTemplates.length > 0 ? cobrancaEmailTemplates : allEmailTemplates).map((t: any) => (
                                <option key={t.id} value={t.id}>{t.nome}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Notificação de Encargos */}
                    <div className={clsx(
                      "p-4 rounded-xl border transition-all space-y-3",
                      encargosActive 
                        ? "bg-brand-500/5 border-brand-500/30 shadow-xs" 
                        : "bg-bg-secondary/20 border-divider opacity-80 hover:opacity-100"
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox"
                            id="encargosActive"
                            checked={encargosActive}
                            onChange={(e) => setEncargosActive(e.target.checked)}
                            className="w-4 h-4 text-brand-600 border-divider rounded focus:ring-brand-500 cursor-pointer"
                          />
                          <label htmlFor="encargosActive" className="font-extrabold text-text-primary text-xs cursor-pointer">
                            Notificação de Encargos
                          </label>
                        </div>
                        <span className={clsx(
                          "px-2 py-0.5 rounded text-[10px] font-black uppercase border",
                          encargosActive ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400"
                        )}>
                          {encargosActive ? "ATIVO" : "INATIVO"}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-text-secondary leading-normal">
                        Notifica e cobra após o vencimento com acréscimo de juros e encargos.
                      </p>

                      <div className="space-y-2 pt-1 border-t border-divider/60">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-text-secondary uppercase">Canal de Envio</label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={encargosCanal}
                              onChange={(e) => setEncargosCanal(e.target.value)}
                            >
                              <option value="whatsapp">🟢 Apenas WhatsApp</option>
                              <option value="email">✉️ Apenas E-mail</option>
                              <option value="ambos">🔄 Ambos (WhatsApp + E-mail)</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-text-secondary uppercase">Dias Pós-Venc.</label>
                            <input
                              type="number"
                              min="1"
                              className="input !py-1 rounded-lg font-mono text-xs w-full bg-bg-primary border-divider"
                              value={encargosDays}
                              onChange={(e) => setEncargosDays(Math.max(1, parseInt(e.target.value, 10) || 3))}
                            />
                          </div>
                        </div>

                        {(encargosCanal === 'whatsapp' || encargosCanal === 'ambos') && (
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 uppercase flex items-center gap-1">
                              <span>🟢 Modelo WhatsApp</span>
                            </label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={encargosTemplateId}
                              onChange={(e) => setEncargosTemplateId(e.target.value)}
                            >
                              <option value="">Selecione...</option>
                              {(cobrancaTemplates.length > 0 ? cobrancaTemplates : allWhatsAppTemplates).map((t: any) => (
                                <option key={t.id} value={t.id}>{t.nome}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {(encargosCanal === 'email' || encargosCanal === 'ambos') && (
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-blue-700 dark:text-blue-400 uppercase flex items-center gap-1">
                              <span>✉️ Modelo de E-mail</span>
                            </label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={encargosEmailTemplateId}
                              onChange={(e) => setEncargosEmailTemplateId(e.target.value)}
                            >
                              <option value="">Selecione...</option>
                              {(cobrancaEmailTemplates.length > 0 ? cobrancaEmailTemplates : allEmailTemplates).map((t: any) => (
                                <option key={t.id} value={t.id}>{t.nome}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Aviso de Suspensão */}
                    <div className={clsx(
                      "p-4 rounded-xl border transition-all space-y-3",
                      suspensaoActive 
                        ? "bg-brand-500/5 border-brand-500/30 shadow-xs" 
                        : "bg-bg-secondary/20 border-divider opacity-80 hover:opacity-100"
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox"
                            id="suspensaoActive"
                            checked={suspensaoActive}
                            onChange={(e) => setSuspensaoActive(e.target.checked)}
                            className="w-4 h-4 text-brand-600 border-divider rounded focus:ring-brand-500 cursor-pointer"
                          />
                          <label htmlFor="suspensaoActive" className="font-extrabold text-text-primary text-xs cursor-pointer">
                            Aviso de Suspensão
                          </label>
                        </div>
                        <span className={clsx(
                          "px-2 py-0.5 rounded text-[10px] font-black uppercase border",
                          suspensaoActive ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400"
                        )}>
                          {suspensaoActive ? "ATIVO" : "INATIVO"}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-text-secondary leading-normal">
                        Avisa sobre a suspensão dos serviços e bloqueio de emissão fiscal.
                      </p>

                      <div className="space-y-2 pt-1 border-t border-divider/60">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-text-secondary uppercase">Canal de Envio</label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={suspensaoCanal}
                              onChange={(e) => setSuspensaoCanal(e.target.value)}
                            >
                              <option value="whatsapp">🟢 Apenas WhatsApp</option>
                              <option value="email">✉️ Apenas E-mail</option>
                              <option value="ambos">🔄 Ambos (WhatsApp + E-mail)</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-text-secondary uppercase">Dias Pós-Venc.</label>
                            <input
                              type="number"
                              min="1"
                              className="input !py-1 rounded-lg font-mono text-xs w-full bg-bg-primary border-divider"
                              value={suspensaoDays}
                              onChange={(e) => setSuspensaoDays(Math.max(1, parseInt(e.target.value, 10) || 12))}
                            />
                          </div>
                        </div>

                        {(suspensaoCanal === 'whatsapp' || suspensaoCanal === 'ambos') && (
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 uppercase flex items-center gap-1">
                              <span>🟢 Modelo WhatsApp</span>
                            </label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={suspensaoTemplateId}
                              onChange={(e) => setSuspensaoTemplateId(e.target.value)}
                            >
                              <option value="">Selecione...</option>
                              {(cobrancaTemplates.length > 0 ? cobrancaTemplates : allWhatsAppTemplates).map((t: any) => (
                                <option key={t.id} value={t.id}>{t.nome}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {(suspensaoCanal === 'email' || suspensaoCanal === 'ambos') && (
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-blue-700 dark:text-blue-400 uppercase flex items-center gap-1">
                              <span>✉️ Modelo de E-mail</span>
                            </label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={suspensaoEmailTemplateId}
                              onChange={(e) => setSuspensaoEmailTemplateId(e.target.value)}
                            >
                              <option value="">Selecione...</option>
                              {(cobrancaEmailTemplates.length > 0 ? cobrancaEmailTemplates : allEmailTemplates).map((t: any) => (
                                <option key={t.id} value={t.id}>{t.nome}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pedidos & Pós-Venda Automations Card */}
                <div className="card p-5 bg-bg-primary border border-divider rounded-xl space-y-4 shadow-xs">
                  <div className="border-b border-divider pb-3 flex items-center justify-between">
                    <span className="text-xs text-text-primary uppercase font-black tracking-wider flex items-center gap-2">
                      <Calendar size={16} className="text-brand-500" /> Parâmetros de Pós-Venda &amp; Pedidos (WhatsApp &amp; E-mail)
                    </span>
                    <span className="text-[11px] text-text-secondary">
                      Automatize o acolhimento, validação técnica, suporte e pesquisas de qualidade
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Onboarding de Clientes */}
                    <div className={clsx(
                      "p-4 rounded-xl border transition-all space-y-3",
                      onboardingActive 
                        ? "bg-brand-500/5 border-brand-500/30 shadow-xs" 
                        : "bg-bg-secondary/20 border-divider opacity-80 hover:opacity-100"
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox"
                            id="onboardingActive"
                            checked={onboardingActive}
                            onChange={(e) => setOnboardingActive(e.target.checked)}
                            className="w-4 h-4 text-brand-600 border-divider rounded focus:ring-brand-500 cursor-pointer"
                          />
                          <label htmlFor="onboardingActive" className="font-extrabold text-text-primary text-xs cursor-pointer">
                            Onboarding de Clientes
                          </label>
                        </div>
                        <span className={clsx(
                          "px-2 py-0.5 rounded text-[10px] font-black uppercase border",
                          onboardingActive ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400"
                        )}>
                          {onboardingActive ? "ATIVO" : "INATIVO"}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-text-secondary leading-normal">
                        Disparado após o faturamento para confirmar requisitos técnicos e acolhimento.
                      </p>

                      <div className="space-y-2 pt-1 border-t border-divider/60">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-text-secondary uppercase">Canal de Envio</label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={onboardingCanal}
                              onChange={(e) => setOnboardingCanal(e.target.value)}
                            >
                              <option value="whatsapp">🟢 Apenas WhatsApp</option>
                              <option value="email">✉️ Apenas E-mail</option>
                              <option value="ambos">🔄 Ambos (WhatsApp + E-mail)</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-text-secondary uppercase">Atraso (Dias)</label>
                            <input
                              type="number"
                              min="1"
                              className="input !py-1 rounded-lg font-mono text-xs w-full bg-bg-primary border-divider"
                              value={onboardingDays}
                              onChange={(e) => setOnboardingDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                            />
                          </div>
                        </div>

                        {(onboardingCanal === 'whatsapp' || onboardingCanal === 'ambos') && (
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 uppercase flex items-center gap-1">
                              <span>🟢 Modelo WhatsApp</span>
                            </label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={onboardingTemplateId}
                              onChange={(e) => setOnboardingTemplateId(e.target.value)}
                            >
                              <option value="">Selecione...</option>
                              {(posVendaTemplates.length > 0 ? posVendaTemplates : allWhatsAppTemplates).map((t: any) => (
                                <option key={t.id} value={t.id}>{t.nome}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {(onboardingCanal === 'email' || onboardingCanal === 'ambos') && (
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-blue-700 dark:text-blue-400 uppercase flex items-center gap-1">
                              <span>✉️ Modelo de E-mail</span>
                            </label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={onboardingEmailTemplateId}
                              onChange={(e) => setOnboardingEmailTemplateId(e.target.value)}
                            >
                              <option value="">Selecione...</option>
                              {(posVendaEmailTemplates.length > 0 ? posVendaEmailTemplates : allEmailTemplates).map((t: any) => (
                                <option key={t.id} value={t.id}>{t.nome}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Auditoria de Terminais */}
                    <div className={clsx(
                      "p-4 rounded-xl border transition-all space-y-3",
                      auditoriaActive 
                        ? "bg-brand-500/5 border-brand-500/30 shadow-xs" 
                        : "bg-bg-secondary/20 border-divider opacity-80 hover:opacity-100"
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox"
                            id="auditoriaActive"
                            checked={auditoriaActive}
                            onChange={(e) => setAuditoriaActive(e.target.checked)}
                            className="w-4 h-4 text-brand-600 border-divider rounded focus:ring-brand-500 cursor-pointer"
                          />
                          <label htmlFor="auditoriaActive" className="font-extrabold text-text-primary text-xs cursor-pointer">
                            Auditoria de Terminais
                          </label>
                        </div>
                        <span className={clsx(
                          "px-2 py-0.5 rounded text-[10px] font-black uppercase border",
                          auditoriaActive ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400"
                        )}>
                          {auditoriaActive ? "ATIVO" : "INATIVO"}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-text-secondary leading-normal">
                        Disparado ao identificar adição de terminais extras cadastrados no ERP.
                      </p>

                      <div className="space-y-2 pt-1 border-t border-divider/60">
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-text-secondary uppercase">Canal de Envio</label>
                          <select
                            className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                            value={auditoriaCanal}
                            onChange={(e) => setAuditoriaCanal(e.target.value)}
                          >
                            <option value="whatsapp">🟢 Apenas WhatsApp</option>
                            <option value="email">✉️ Apenas E-mail</option>
                            <option value="ambos">🔄 Ambos (WhatsApp + E-mail)</option>
                          </select>
                        </div>

                        {(auditoriaCanal === 'whatsapp' || auditoriaCanal === 'ambos') && (
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 uppercase flex items-center gap-1">
                              <span>🟢 Modelo WhatsApp</span>
                            </label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={auditoriaTemplateId}
                              onChange={(e) => setAuditoriaTemplateId(e.target.value)}
                            >
                              <option value="">Selecione...</option>
                              {(posVendaTemplates.length > 0 ? posVendaTemplates : allWhatsAppTemplates).map((t: any) => (
                                <option key={t.id} value={t.id}>{t.nome}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {(auditoriaCanal === 'email' || auditoriaCanal === 'ambos') && (
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-blue-700 dark:text-blue-400 uppercase flex items-center gap-1">
                              <span>✉️ Modelo de E-mail</span>
                            </label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={auditoriaEmailTemplateId}
                              onChange={(e) => setAuditoriaEmailTemplateId(e.target.value)}
                            >
                              <option value="">Selecione...</option>
                              {(posVendaEmailTemplates.length > 0 ? posVendaEmailTemplates : allEmailTemplates).map((t: any) => (
                                <option key={t.id} value={t.id}>{t.nome}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Suporte Assistido Pós-Instalação */}
                    <div className={clsx(
                      "p-4 rounded-xl border transition-all space-y-3",
                      suporteActive 
                        ? "bg-brand-500/5 border-brand-500/30 shadow-xs" 
                        : "bg-bg-secondary/20 border-divider opacity-80 hover:opacity-100"
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox"
                            id="suporteActive"
                            checked={suporteActive}
                            onChange={(e) => setSuporteActive(e.target.checked)}
                            className="w-4 h-4 text-brand-600 border-divider rounded focus:ring-brand-500 cursor-pointer"
                          />
                          <label htmlFor="suporteActive" className="font-extrabold text-text-primary text-xs cursor-pointer">
                            Suporte Assistido Pós-Instalação
                          </label>
                        </div>
                        <span className={clsx(
                          "px-2 py-0.5 rounded text-[10px] font-black uppercase border",
                          suporteActive ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400"
                        )}>
                          {suporteActive ? "ATIVO" : "INATIVO"}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-text-secondary leading-normal">
                        Pesquisa de acompanhamento de suporte técnico após a implantação.
                      </p>

                      <div className="space-y-2 pt-1 border-t border-divider/60">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-text-secondary uppercase">Canal de Envio</label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={suporteCanal}
                              onChange={(e) => setSuporteCanal(e.target.value)}
                            >
                              <option value="whatsapp">🟢 Apenas WhatsApp</option>
                              <option value="email">✉️ Apenas E-mail</option>
                              <option value="ambos">🔄 Ambos (WhatsApp + E-mail)</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-text-secondary uppercase">Atraso (Dias)</label>
                            <input
                              type="number"
                              min="1"
                              className="input !py-1 rounded-lg font-mono text-xs w-full bg-bg-primary border-divider"
                              value={suporteDays}
                              onChange={(e) => setSuporteDays(Math.max(1, parseInt(e.target.value, 10) || 20))}
                            />
                          </div>
                        </div>

                        {(suporteCanal === 'whatsapp' || suporteCanal === 'ambos') && (
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 uppercase flex items-center gap-1">
                              <span>🟢 Modelo WhatsApp</span>
                            </label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={suporteTemplateId}
                              onChange={(e) => setSuporteTemplateId(e.target.value)}
                            >
                              <option value="">Selecione...</option>
                              {(posVendaTemplates.length > 0 ? posVendaTemplates : allWhatsAppTemplates).map((t: any) => (
                                <option key={t.id} value={t.id}>{t.nome}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {(suporteCanal === 'email' || suporteCanal === 'ambos') && (
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-blue-700 dark:text-blue-400 uppercase flex items-center gap-1">
                              <span>✉️ Modelo de E-mail</span>
                            </label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={suporteEmailTemplateId}
                              onChange={(e) => setSuporteEmailTemplateId(e.target.value)}
                            >
                              <option value="">Selecione...</option>
                              {(posVendaEmailTemplates.length > 0 ? posVendaEmailTemplates : allEmailTemplates).map((t: any) => (
                                <option key={t.id} value={t.id}>{t.nome}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Pesquisa de NPS Periódico */}
                    <div className={clsx(
                      "p-4 rounded-xl border transition-all space-y-3",
                      npsActive 
                        ? "bg-brand-500/5 border-brand-500/30 shadow-xs" 
                        : "bg-bg-secondary/20 border-divider opacity-80 hover:opacity-100"
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox"
                            id="npsActive"
                            checked={npsActive}
                            onChange={(e) => setNpsActive(e.target.checked)}
                            className="w-4 h-4 text-brand-600 border-divider rounded focus:ring-brand-500 cursor-pointer"
                          />
                          <label htmlFor="npsActive" className="font-extrabold text-text-primary text-xs cursor-pointer">
                            Pesquisa de NPS Periódico
                          </label>
                        </div>
                        <span className={clsx(
                          "px-2 py-0.5 rounded text-[10px] font-black uppercase border",
                          npsActive ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400"
                        )}>
                          {npsActive ? "ATIVO" : "INATIVO"}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-text-secondary leading-normal">
                        Dispara pesquisa de satisfação NPS periódica pós-faturamento.
                      </p>

                      <div className="space-y-2 pt-1 border-t border-divider/60">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-text-secondary uppercase">Canal de Envio</label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={npsCanal}
                              onChange={(e) => setNpsCanal(e.target.value)}
                            >
                              <option value="whatsapp">🟢 Apenas WhatsApp</option>
                              <option value="email">✉️ Apenas E-mail</option>
                              <option value="ambos">🔄 Ambos (WhatsApp + E-mail)</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-text-secondary uppercase">Intervalo (Dias)</label>
                            <input
                              type="number"
                              min="1"
                              className="input !py-1 rounded-lg font-mono text-xs w-full bg-bg-primary border-divider"
                              value={npsDays}
                              onChange={(e) => setNpsDays(Math.max(1, parseInt(e.target.value, 10) || 90))}
                            />
                          </div>
                        </div>

                        {(npsCanal === 'whatsapp' || npsCanal === 'ambos') && (
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 uppercase flex items-center gap-1">
                              <span>🟢 Modelo WhatsApp</span>
                            </label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={npsTemplateId}
                              onChange={(e) => setNpsTemplateId(e.target.value)}
                            >
                              <option value="">Selecione...</option>
                              {(posVendaTemplates.length > 0 ? posVendaTemplates : allWhatsAppTemplates).map((t: any) => (
                                <option key={t.id} value={t.id}>{t.nome}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {(npsCanal === 'email' || npsCanal === 'ambos') && (
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-blue-700 dark:text-blue-400 uppercase flex items-center gap-1">
                              <span>✉️ Modelo de E-mail</span>
                            </label>
                            <select
                              className="input !py-1 text-xs rounded-lg font-semibold w-full bg-bg-primary border-divider"
                              value={npsEmailTemplateId}
                              onChange={(e) => setNpsEmailTemplateId(e.target.value)}
                            >
                              <option value="">Selecione...</option>
                              {(posVendaEmailTemplates.length > 0 ? posVendaEmailTemplates : allEmailTemplates).map((t: any) => (
                                <option key={t.id} value={t.id}>{t.nome}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )
          })()}

          {/* TAB: OPÇÕES GERAIS & ATIVIDADE */}
          {activeTab === 'gerais' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-6 animate-fade-in">
              <div className="flex items-center gap-2.5 text-indigo-600 dark:text-indigo-400 border-b border-slate-200 dark:border-slate-800 pb-3">
                <Sliders size={20} />
                <h3 className="font-extrabold text-sm uppercase text-slate-800 dark:text-slate-200 font-heading">
                  Opções Gerais, Atividades e Parâmetros Financeiros
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* SALÁRIO MÍNIMO */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 font-extrabold text-slate-800 dark:text-slate-200 text-xs uppercase">
                    <DollarSign size={16} className="text-emerald-500" /> Reajuste de Contratos (Salário Mínimo)
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Ao alterar o Salário Mínimo Vigente, todas as parcelas em aberto atreladas a contratos de reajuste automático serão recalculadas proporcionalmente.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Salário Anterior</label>
                      <input
                        type="number"
                        disabled
                        value={form.salario_minimo_atual ? 1412 : 1412}
                        className="input bg-slate-200 dark:bg-slate-800 font-mono font-bold w-full"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-emerald-600 uppercase block mb-1">Novo Salário Mínimo (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.salario_minimo_atual || 1502}
                        onChange={(e) => setForm({ ...form, salario_minimo_atual: parseFloat(e.target.value) || 0 })}
                        className="input border-emerald-500 font-mono font-bold w-full text-emerald-600"
                      />
                    </div>
                  </div>
                </div>

                {/* PORTADOR E ESPÉCIE PADRÃO */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 font-extrabold text-slate-800 dark:text-slate-200 text-xs uppercase">
                    <Building size={16} className="text-indigo-500" /> Portador & Espécie Padrão do ERP
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Defina a conta bancária/portador padrão e o tipo de espécie utilizado na emissão de cobranças.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Portador Padrão</label>
                      <select
                        value={form.portador_padrao_id || ''}
                        onChange={(e) => {
                          const selected = portadores.find(p => p.id === Number(e.target.value));
                          setForm({
                            ...form,
                            portador_padrao_id: selected ? selected.id : null,
                            portador_padrao_nome: selected ? selected.descricao : ''
                          });
                        }}
                        className="input font-bold w-full cursor-pointer bg-white dark:bg-slate-900 border-slate-300"
                      >
                        <option value="">Selecione Portador...</option>
                        {portadores.map((p) => (
                          <option key={p.id} value={p.id}>
                            #{p.id} - {p.descricao}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Espécie Padrão</label>
                      <select
                        value={form.especie_padrao_id || ''}
                        onChange={(e) => {
                          const selected = especies.find(esp => esp.id === Number(e.target.value));
                          setForm({
                            ...form,
                            especie_padrao_id: selected ? selected.id : null,
                            especie_padrao_nome: selected ? selected.descricao : ''
                          });
                        }}
                        className="input font-bold w-full cursor-pointer bg-white dark:bg-slate-900 border-slate-300"
                      >
                        <option value="">Selecione Espécie...</option>
                        {especies.map((esp) => (
                          <option key={esp.id} value={esp.id}>
                            #{esp.id} - {esp.descricao}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB: SEGURANÇA */}
          {activeTab === 'seguranca' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-5 animate-fade-in">
              <div className="flex items-center gap-2.5 text-indigo-600 dark:text-indigo-400 border-b border-slate-200 dark:border-slate-800 pb-3">
                <Shield size={20} />
                <h3 className="font-extrabold text-sm uppercase text-slate-800 dark:text-slate-200 font-heading">
                  Segurança, Licenciamento & Controle de Acesso
                </h3>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-xs text-slate-800 dark:text-slate-200 uppercase">
                    🔒 Identity Server & Status da Licença Coliseu Transporte SaaS
                  </span>
                  <span className="px-2.5 py-0.5 bg-emerald-500/10 text-emerald-600 font-bold text-[10px] rounded-full border border-emerald-500/20">
                    LICENÇA ATIVA E VERIFICADA
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Sua empresa possui autorização oficial para operação do sistema Coliseu Transporte no domínio cadastrado. Todas as conexões utilizam autenticação JWT com chaves criptográficas RSA de 256 bits.
                </p>
              </div>
            </div>
          )}

          {/* TAB: FISCAL */}
          {activeTab === 'fiscal' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-5 animate-fade-in">
              <div className="flex items-center gap-2.5 text-indigo-600 dark:text-indigo-400 border-b border-slate-200 dark:border-slate-800 pb-3">
                <Building2 size={20} />
                <h3 className="font-extrabold text-sm uppercase text-slate-800 dark:text-slate-200 font-heading">
                  Parâmetros Fiscais & Certificados Digitais
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Regime Tributário</label>
                  <select className="input font-bold w-full bg-white dark:bg-slate-900 border-slate-300">
                    <option value="1">Simples Nacional</option>
                    <option value="2">Simples Nacional - Excesso de Sublimite</option>
                    <option value="3">Regime Normal (Lucro Presumido / Real)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Ambiente de Emissão Fiscal</label>
                  <select className="input font-bold w-full bg-white dark:bg-slate-900 border-slate-300">
                    <option value="homologacao">Homologação (Testes)</option>
                    <option value="producao">Produção (Com Valor Fiscal)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <SystemLogsSection />
          )}

          {/* Sticky footer action button */}
          <div className="flex justify-between items-center pt-4 border-t border-divider mt-6 bg-bg-primary py-3">
            <div>
              {activeTab === 'automacoes' && (
                <button
                  type="button"
                  onClick={handleResetAutomacoes}
                  disabled={resetting}
                  className="px-4 py-2 bg-red-500/10 text-red-600 hover:bg-red-500/20 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 rounded-sm transition-all border border-red-200 cursor-pointer disabled:opacity-50"
                >
                  {resetting ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" /> Resetando...
                    </>
                  ) : (
                    <>
                      <Trash2 size={12} /> Resetar Envio de Automações
                    </>
                  )}
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary py-2 px-6 text-xs flex items-center gap-1.5 rounded-sm font-semibold text-white"
            >
              {saving ? (
                <>
                  <RefreshCw size={14} className="animate-spin" /> Salvando...
                </>
              ) : (
                <>
                  <Save size={14} /> Salvar Configurações
                </>
              )}
            </button>
          </div>

        </form>
      )}

      {/* Modal de Cadastro de Cedente Bancário */}
      <ModalCadastroCedente
        isOpen={isModalCedenteOpen}
        initialData={editingCedente}
        portadoresList={portadores.map(p => ({ id: p.id, nome: p.descricao }))}
        onClose={() => setIsModalCedenteOpen(false)}
        onSaved={fetchCedentes}
      />

      {/* Modal Inline de Edição de Usuário & Grupo de Acesso */}
      {isEditUserModalOpen && selectedUserToEdit && (
        <div className="fixed inset-0 bg-slate-900/70 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-2xl max-w-md w-full space-y-4 animate-scale-up text-xs">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Users className="text-indigo-600 dark:text-indigo-400" size={18} />
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  Editar Usuário — {selectedUserToEdit.nome || selectedUserToEdit.email}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditUserModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Grupo de Acesso (Perfil)
                </label>
                <select
                  value={selectedUserToEdit.grupo_id || ''}
                  onChange={(e) => setSelectedUserToEdit({ ...selectedUserToEdit, grupo_id: parseInt(e.target.value, 10) || null })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 font-bold text-xs text-slate-900 dark:text-slate-100"
                >
                  <option value="">Selecione um Grupo...</option>
                  {gruposList.map((g: any) => (
                    <option key={g.id} value={g.id}>{g.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Regra do Perfil
                </label>
                <select
                  value={selectedUserToEdit.role || 'viewer'}
                  onChange={(e) => setSelectedUserToEdit({ ...selectedUserToEdit, role: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 font-bold text-xs text-slate-900 dark:text-slate-100"
                >
                  <option value="admin">Administrador (Total)</option>
                  <option value="operador">Operador (Padrão)</option>
                  <option value="viewer">Visualizador</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsEditUserModalOpen(false)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-extrabold rounded-xl hover:bg-slate-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    if (selectedUserToEdit.grupo_id) {
                      await api.put(`/usuarios/${selectedUserToEdit.id}/grupo`, { grupo_id: selectedUserToEdit.grupo_id });
                    }
                    if (selectedUserToEdit.role) {
                      await api.put(`/usuarios/${selectedUserToEdit.id}/role`, { role: selectedUserToEdit.role });
                    }
                    setIsEditUserModalOpen(false);
                    refetchUsuarios();
                  } catch (err: any) {
                    alert(err.response?.data?.error || 'Erro ao salvar alterações do usuário.');
                  }
                }}
                className="px-4 py-2 bg-indigo-600 text-white font-extrabold rounded-xl hover:bg-indigo-700 cursor-pointer shadow-md"
              >
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Cadastro e Edição de Grupo de Acesso / Perfis */}
      <ModalCadastroGrupoAcesso
        isOpen={isGrupoModalOpen}
        grupo={editingGrupo}
        onClose={() => setIsGrupoModalOpen(false)}
        onSaved={() => {
          refetchUsuarios()
        }}
      />
    </div>
  )
}
