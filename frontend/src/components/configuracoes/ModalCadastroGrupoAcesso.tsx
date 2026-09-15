import { useState, useEffect } from 'react'
import { X, Shield, Check, Lock, ChevronDown, ChevronUp, Layers, Users, Wallet, Trophy, Settings, AlertCircle, Ban, Eye, FileText, Megaphone, BarChart3 } from 'lucide-react'
import api from '../../services/api'
import clsx from 'clsx'

export interface GrupoAcesso {
  id?: number
  nome: string
  descricao: string
  permissoes_menus: Record<string, { acesso: boolean; submenus: Record<string, boolean> }>
  permissoes_acoes: Record<string, boolean>
  ativo?: boolean
}

interface ModalCadastroGrupoAcessoProps {
  isOpen: boolean
  grupo: GrupoAcesso | null
  onClose: () => void
  onSaved: () => void
}

const DEFAULT_MENUS = {
  cadastros: {
    label: 'Cadastros Base',
    icon: Users,
    submenus: {
      clientes: 'Cadastro & Lista de Clientes',
      produtos: 'Catálogo Comercial & Produtos',
      fornecedores: 'Cadastro de Fornecedores',
      filiais: 'Gestão de Filiais / Departamentos'
    }
  },
  consultas: {
    label: 'Consultas & Relatórios',
    icon: FileText,
    submenus: {
      clientes: 'Consulta Rápida de Clientes',
      titulos: 'Consulta de Títulos / Extrato',
      produtos: 'Consulta de Tabela de Preços',
      estoque: 'Controle & Consulta de Estoque'
    }
  },
  crm: {
    label: 'CRM & Vendas',
    icon: Trophy,
    submenus: {
      kanban: 'Kanban de Oportunidades / Vendas',
      contratos: 'Gestão de Contratos de Clientes',
      pedidos: 'Pedidos Faturados & Emissão'
    }
  },
  cobranca: {
    label: 'Cobrança Operacional',
    icon: Layers,
    submenus: {
      kanban: 'Kanban Operacional de Cobrança',
      regua: 'Configuração de Régua de Cobrança'
    }
  },
  financeiro: {
    label: 'Financeiro & Tesouraria',
    icon: Wallet,
    submenus: {
      titulos: 'Guia de Títulos & Lançamentos',
      fluxo_caixa: 'Fluxo de Caixa & Tesouraria',
      banco_asaas: 'Extrato Bancário & Banco Asaas',
      emissao_lote: 'Emissão em Lote de Boletos',
      conciliacao: 'Conciliação Bancária Automática'
    }
  },
  gerencia: {
    label: 'Gerência & Inteligência BI',
    icon: BarChart3,
    submenus: {
      gerencia_financeira: 'Gestão Financeira & Análise Executiva',
      visao_estrategica: 'Visão Estratégica & BI (V3)',
      dashboard_bi: 'Dashboards & Indicadores Executivos',
      estatisticas: 'Estatísticas & Performance Comercial',
      comissoes: 'Relatório de Comissões',
      ranking: 'Ranking Comercial & Desempenho'
    }
  },
  marketing: {
    label: 'Marketing & Comunicação',
    icon: Megaphone,
    submenus: {
      marketing_massa: 'Disparador & Marketing em Massa (WhatsApp)',
      acervos: 'Acervos & Materiais de Apoio'
    }
  },
  configuracoes: {
    label: 'Configurações & Segurança',
    icon: Settings,
    submenus: {
      usuarios: 'Gestão de Usuários do Sistema',
      grupos: 'Gestão de Perfis & Grupos de Acesso',
      integracoes: 'Chaves de API & Webhooks Asaas'
    }
  }
}

const DEFAULT_ACOES = [
  { key: 'permitir_ver_ficha_cliente', label: 'Permitir Visualizar Ficha / Perfil 360 do Cliente', desc: 'Se desativado, o usuário não consegue abrir os detalhes do cliente.' },
  { key: 'permitir_ver_titulos_cliente', label: 'Permitir Visualizar Títulos do Cliente', desc: 'Se desativado, oculta os títulos e valores em aberto na ficha do cliente.' },
  { key: 'permitir_cancelar_titulos', label: 'Permitir Cancelar / Estornar Títulos', desc: 'Se desativado, o botão de cancelar títulos em aberto fica bloqueado.' },
  { key: 'permitir_eliminar_titulos', label: 'Permitir Eliminar Títulos (Exclusão Definitiva)', desc: 'Se desativado, oculta/bloqueia o botão de eliminar lançamentos de títulos no sistema.' },
  { key: 'permitir_cancelar_boletos', label: 'Permitir Cancelar Boletos no Banco Asaas', desc: 'Se desativado, o usuário não consegue cancelar boletos bancários já registrados.' },
  { key: 'permitir_liquidar_titulos', label: 'Permitir Liquidar / Quitar Títulos (F9)', desc: 'Se desativado, o usuário não pode realizar baixas manuais na tesouraria.' },
  { key: 'ocultar_totais_financeiro', label: 'Ocultar Valor Total Acumulado na Guia Títulos', desc: 'Se ativado, oculta o badge/botão com o valor Total Geral (ex: R$ 77.890,49) na guia Títulos.' }
]

export default function ModalCadastroGrupoAcesso({
  isOpen,
  grupo,
  onClose,
  onSaved
}: ModalCadastroGrupoAcessoProps) {
  const [activeTab, setActiveTab] = useState<'menus' | 'acoes'>('menus')
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [permissoesMenus, setPermissoesMenus] = useState<any>({})
  const [permissoesAcoes, setPermissoesAcoes] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    cadastros: true,
    financeiro: true,
    crm: true
  })

  useEffect(() => {
    if (isOpen) {
      if (grupo) {
        setNome(grupo.nome)
        setDescricao(grupo.descricao || '')
        setPermissoesMenus(grupo.permissoes_menus || {})
        setPermissoesAcoes(grupo.permissoes_acoes || {})
      } else {
        setNome('')
        setDescricao('')
        // Preenche com padrão Master
        const initialMenus: any = {}
        Object.keys(DEFAULT_MENUS).forEach(modKey => {
          const modConf = (DEFAULT_MENUS as any)[modKey]
          const subObj: any = {}
          Object.keys(modConf.submenus).forEach(subKey => {
            subObj[subKey] = true
          })
          initialMenus[modKey] = { acesso: true, submenus: subObj }
        })
        setPermissoesMenus(initialMenus)

        const initialAcoes: any = {}
        DEFAULT_ACOES.forEach(ac => {
          initialAcoes[ac.key] = true
        })
        setPermissoesAcoes(initialAcoes)
      }
    }
  }, [isOpen, grupo])

  if (!isOpen) return null

  const toggleCategoryAccess = (categoryKey: string) => {
    const current = permissoesMenus[categoryKey] || { acesso: false, submenus: {} }
    const newAcesso = !current.acesso
    const categoryDef = (DEFAULT_MENUS as any)[categoryKey]

    const newSubmenus: any = {}
    if (categoryDef && categoryDef.submenus) {
      Object.keys(categoryDef.submenus).forEach(subKey => {
        newSubmenus[subKey] = newAcesso
      })
    }

    setPermissoesMenus({
      ...permissoesMenus,
      [categoryKey]: {
        acesso: newAcesso,
        submenus: newSubmenus
      }
    })
  }

  const toggleSubmenuAccess = (categoryKey: string, submenuKey: string) => {
    const currentCategory = permissoesMenus[categoryKey] || { acesso: true, submenus: {} }
    const currentSubmenus = currentCategory.submenus || {}
    const newSubVal = !currentSubmenus[submenuKey]

    const updatedSubmenus = {
      ...currentSubmenus,
      [submenuKey]: newSubVal
    }

    // Se pelo menos 1 submenu estiver ativo, a categoria fica ativa
    const hasAnySub = Object.values(updatedSubmenus).some(v => Boolean(v))

    setPermissoesMenus({
      ...permissoesMenus,
      [categoryKey]: {
        acesso: hasAnySub,
        submenus: updatedSubmenus
      }
    })
  }

  const toggleActionPermission = (actionKey: string) => {
    setPermissoesAcoes({
      ...permissoesAcoes,
      [actionKey]: !permissoesAcoes[actionKey]
    })
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) {
      alert('Por favor, informe o nome do Grupo de Acesso.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        nome: nome.trim(),
        descricao,
        permissoes_menus: permissoesMenus,
        permissoes_acoes: permissoesAcoes
      }

      if (grupo && grupo.id) {
        await api.put(`/grupos-acesso/${grupo.id}`, payload)
      } else {
        await api.post('/grupos-acesso', payload)
      }

      onSaved()
      onClose()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao salvar o grupo de acesso.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-100">
        
        {/* HEADER */}
        <div className="px-5 py-4 border-b border-slate-800 bg-gradient-to-r from-indigo-900 via-slate-900 to-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Shield size={18} />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">
                {grupo ? `Editar Perfil: ${grupo.nome}` : 'Novo Grupo de Acesso / Perfil'}
              </h3>
              <p className="text-[11px] text-slate-400">Organize permissões por menus principais, submenus e ações restritas</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* NOME E DESCRIÇÃO */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/60 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Nome do Perfil / Grupo *</label>
            <input
              type="text"
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Ex: Comercial, Operador Financeiro..."
              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              required
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Descrição / Finalidade</label>
            <input
              type="text"
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Ex: Acesso a vendas e clientes sem permissão para cancelar títulos..."
              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* NAVEGAÇÃO DE ABAS */}
        <div className="flex border-b border-slate-800 bg-slate-950/80 px-4 pt-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('menus')}
            className={clsx(
              'px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5',
              activeTab === 'menus'
                ? 'border-indigo-500 text-indigo-400 bg-slate-900/60 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            )}
          >
            <Layers size={14} /> Permissões por Menus & Submenus
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('acoes')}
            className={clsx(
              'px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5',
              activeTab === 'acoes'
                ? 'border-indigo-500 text-indigo-400 bg-slate-900/60 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            )}
          >
            <Lock size={14} /> Restrições de Ações Gerais (Travas Operacionais)
          </button>
        </div>

        {/* CORPO DA SELEÇÃO DE PERMISSÕES */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
          
          {/* ABA 1: PERMISSÕES DE MENUS */}
          {activeTab === 'menus' && (
            <div className="space-y-3">
              {Object.keys(DEFAULT_MENUS).map(categoryKey => {
                const categoryDef = (DEFAULT_MENUS as any)[categoryKey]
                const Icon = categoryDef.icon
                const isExpanded = expandedCategories[categoryKey] ?? true
                const categoryState = permissoesMenus[categoryKey] || { acesso: false, submenus: {} }
                const isCategoryActive = Boolean(categoryState.acesso)

                return (
                  <div key={categoryKey} className="bg-slate-950/70 border border-slate-800 rounded-xl overflow-hidden">
                    
                    {/* TOPO DA CATEGORIA / MENU PRINCIPAL */}
                    <div className="px-3.5 py-2.5 bg-slate-800/80 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isCategoryActive}
                          onChange={() => toggleCategoryAccess(categoryKey)}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-0 cursor-pointer accent-indigo-600"
                        />
                        <Icon size={15} className="text-indigo-400" />
                        <span className="font-extrabold text-white text-xs uppercase tracking-wider">{categoryDef.label}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setExpandedCategories({ ...expandedCategories, [categoryKey]: !isExpanded })}
                        className="text-slate-400 hover:text-white p-1"
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>

                    {/* LISTA DE SUBMENUS */}
                    {isExpanded && (
                      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-900/40">
                        {Object.keys(categoryDef.submenus).map(subKey => {
                          const subLabel = categoryDef.submenus[subKey]
                          const isSubActive = Boolean(categoryState.submenus?.[subKey])

                          return (
                            <label
                              key={subKey}
                              className={clsx(
                                'flex items-center gap-2 p-2 rounded-lg border transition-all cursor-pointer',
                                isSubActive
                                  ? 'bg-indigo-950/40 border-indigo-800/60 text-slate-200'
                                  : 'bg-slate-950/40 border-slate-800/60 text-slate-500 opacity-70 hover:opacity-100'
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={isSubActive}
                                onChange={() => toggleSubmenuAccess(categoryKey, subKey)}
                                className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-0 accent-indigo-600"
                              />
                              <span className="font-medium text-[11px] select-none">{subLabel}</span>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* ABA 2: RESTRIÇÕES DE AÇÕES GERAIS */}
          {activeTab === 'acoes' && (
            <div className="space-y-2.5">
              <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl text-amber-300 text-[11px] flex items-center gap-2 mb-3">
                <AlertCircle size={16} className="shrink-0 text-amber-400" />
                <span>Defina o nível de controle operacional. Desativar uma permissão aplicará uma trava imediata nas telas da aplicação.</span>
              </div>

              {DEFAULT_ACOES.map(ac => {
                const isAllowed = permissoesAcoes[ac.key] ?? true

                return (
                  <div
                    key={ac.key}
                    onClick={() => toggleActionPermission(ac.key)}
                    className={clsx(
                      'p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all',
                      isAllowed
                        ? 'bg-slate-950/80 border-slate-800 text-slate-200'
                        : 'bg-rose-950/30 border-rose-900/60 text-rose-300'
                    )}
                  >
                    <div className="space-y-0.5 max-w-md">
                      <div className="font-extrabold text-xs flex items-center gap-2">
                        {isAllowed ? <Check size={14} className="text-emerald-400" /> : <Ban size={14} className="text-rose-400" />}
                        {ac.label}
                      </div>
                      <p className="text-[10px] text-slate-400">{ac.desc}</p>
                    </div>

                    <div className="shrink-0">
                      <span
                        className={clsx(
                          'px-2.5 py-1 rounded-full text-[10px] font-black uppercase border',
                          isAllowed
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                            : 'bg-rose-950 text-rose-300 border-rose-800'
                        )}
                      >
                        {isAllowed ? 'Permitido' : 'Bloqueado'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

        </div>

        {/* FOOTER */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all cursor-pointer text-xs"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-extrabold shadow-md flex items-center gap-1.5 transition-all cursor-pointer text-xs"
          >
            {saving ? <Shield size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? 'Salvando...' : 'Salvar Grupo de Acesso'}
          </button>
        </div>

      </div>
    </div>
  )
}
