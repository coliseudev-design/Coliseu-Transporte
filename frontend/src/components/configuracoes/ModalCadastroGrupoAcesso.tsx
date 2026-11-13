import { useState, useEffect } from 'react'
import {
  X, Shield, Check, Lock, ChevronDown, ChevronUp, Layers, Users, Settings,
  AlertCircle, Ban, FileStack, BadgeCheck, BarChart3, LayoutDashboard
} from 'lucide-react'
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

export const DEFAULT_MENUS = {
  operacao: {
    label: 'Operação Logística',
    icon: LayoutDashboard,
    submenus: {
      cockpit: 'Cockpit de Transporte (Painel Geral)',
      cargas: 'Central de Cargas (NF-e / XML / MDe)',
      roteiro: 'Roteiro de Entrega & Paradas'
    }
  },
  documentos: {
    label: 'Documentos Fiscais (SEFAZ)',
    icon: FileStack,
    submenus: {
      emitir_cte: 'Emitir CT-e / CT-e OS',
      emitir_mdfe: 'Emitir MDF-e (Manifesto Eletrônico)',
      documentos_emitidos: 'Documentos Emitidos (XML, DACTE, DAMDFE)'
    }
  },
  ciot: {
    label: 'CIOT & ANTT',
    icon: BadgeCheck,
    submenus: {
      consultar_ciot: 'Consultar, Gerar e Encerrar CIOT'
    }
  },
  cadastros: {
    label: 'Cadastros de Transporte',
    icon: Users,
    submenus: {
      clientes: 'Clientes (ERP Coliseu)',
      regioes: 'Regiões & Cidades (IBGE)',
      frota: 'Frota de Veículos & Condutores',
      partes: 'Partes do Transporte (Remetente / Destinatário)'
    }
  },
  relatorios: {
    label: 'Relatórios & Indicadores',
    icon: BarChart3,
    submenus: {
      desempenho: 'Desempenho Fiscal & Fretes'
    }
  },
  configuracoes: {
    label: 'Configurações & Segurança',
    icon: Settings,
    submenus: {
      dados_empresa: 'Dados da Empresa & Credenciais Focus NFe',
      regras_fiscais: 'Regras Fiscais de ICMS por UF',
      campos_dinamicos: 'Campos Dinâmicos Personalizados',
      certificados: 'Certificados Digitais A1 (.pfx)',
      usuarios: 'Usuários & Perfis de Acesso (RBAC)'
    }
  }
}

export const DEFAULT_ACOES = [
  {
    key: 'permitir_emitir_cte',
    label: 'Permitir Emitir e Transmitir CT-e na SEFAZ',
    desc: 'Autoriza o faturista/operador a gerar e transmitir Conhecimentos de Transporte Eletrônicos.'
  },
  {
    key: 'permitir_emitir_mdfe',
    label: 'Permitir Emitir e Encerrar MDF-e na SEFAZ',
    desc: 'Autoriza a emissão e o encerramento de Manifestos Eletrônicos de Documentos Fiscais.'
  },
  {
    key: 'permitir_cancelar_documentos',
    label: 'Permitir Cancelar Documentos Fiscais e Emitir CC-e',
    desc: 'Se bloqueado, impede o cancelamento de CT-e/MDF-e autorizados e cartas de correção na SEFAZ.'
  },
  {
    key: 'permitir_gerenciar_ciot',
    label: 'Permitir Cadastrar e Encerrar Contratos CIOT',
    desc: 'Controla o registro e encerramento de operações de transporte junto à ANTT.'
  },
  {
    key: 'permitir_gerenciar_certificados',
    label: 'Permitir Gerenciar Certificados A1 e Credenciais Focus NFe',
    desc: 'Se bloqueado, protege o upload de certificados digitais e a troca de ambiente Homologação/Produção.'
  },
  {
    key: 'permitir_gerenciar_usuarios',
    label: 'Permitir Gerenciar Usuários e Grupos de Acesso',
    desc: 'Restringe a criação/inativação de contas e alteração de permissões RBAC.'
  },
  {
    key: 'permitir_ver_ficha_cliente',
    label: 'Permitir Visualizar Ficha Logística 360° de Clientes',
    desc: 'Se desativado, restringe a abertura do histórico de cargas, CT-es e entregas na tela de Clientes.'
  }
]

function buildDefaultMenusState(source?: Record<string, any>) {
  const result: Record<string, { acesso: boolean; submenus: Record<string, boolean> }> = {}
  const hasTransportKeys = Boolean(source && ('operacao' in source || 'documentos' in source))

  Object.keys(DEFAULT_MENUS).forEach((modKey) => {
    const modConf = (DEFAULT_MENUS as any)[modKey]
    const existingCat = hasTransportKeys ? source?.[modKey] : undefined
    const subObj: Record<string, boolean> = {}

    Object.keys(modConf.submenus).forEach((subKey) => {
      subObj[subKey] = existingCat?.submenus?.[subKey] ?? (existingCat?.acesso ?? true)
    })

    const hasAnySub = Object.values(subObj).some(Boolean)
    result[modKey] = {
      acesso: existingCat ? Boolean(existingCat.acesso && hasAnySub) : true,
      submenus: subObj
    }
  })

  return result
}

function buildDefaultAcoesState(source?: Record<string, boolean>) {
  const result: Record<string, boolean> = {}
  DEFAULT_ACOES.forEach((ac) => {
    result[ac.key] = source?.[ac.key] ?? true
  })
  return result
}

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
    operacao: true,
    documentos: true,
    cadastros: true
  })

  useEffect(() => {
    if (isOpen) {
      if (grupo) {
        setNome(grupo.nome)
        setDescricao(grupo.descricao || '')
        setPermissoesMenus(buildDefaultMenusState(grupo.permissoes_menus))
        setPermissoesAcoes(buildDefaultAcoesState(grupo.permissoes_acoes))
      } else {
        setNome('')
        setDescricao('')
        setPermissoesMenus(buildDefaultMenusState())
        setPermissoesAcoes(buildDefaultAcoesState())
      }
    }
  }, [isOpen, grupo])

  if (!isOpen) return null

  const toggleCategoryAccess = (categoryKey: string) => {
    const current = permissoesMenus[categoryKey] || { acesso: false, submenus: {} }
    const newAcesso = !current.acesso
    const categoryDef = (DEFAULT_MENUS as any)[categoryKey]

    const newSubmenus: Record<string, boolean> = {}
    if (categoryDef && categoryDef.submenus) {
      Object.keys(categoryDef.submenus).forEach((subKey) => {
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

    const hasAnySub = Object.values(updatedSubmenus).some((v) => Boolean(v))

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
        <div className="px-5 py-4 border-b border-slate-800 bg-gradient-to-r from-sky-950 via-slate-900 to-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-600/25 border border-sky-500/40 flex items-center justify-center text-sky-400">
              <Shield size={18} />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">
                {grupo ? `Editar Perfil: ${grupo.nome}` : 'Novo Grupo de Acesso / Perfil'}
              </h3>
              <p className="text-[11px] text-slate-400">
                Permissões de menus e travas operacionais do Coliseu Transporte
              </p>
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
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Fiscal / Emissão, Expedição, Motorista..."
              disabled={grupo?.nome?.trim().toLowerCase() === 'master'}
              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500 disabled:opacity-60"
              required
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Descrição / Finalidade</label>
            <input
              type="text"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Emissão de CT-e e MDF-e sem acesso a certificados..."
              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
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
                ? 'border-sky-500 text-sky-400 bg-slate-900/60 rounded-t-lg'
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
                ? 'border-sky-500 text-sky-400 bg-slate-900/60 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            )}
          >
            <Lock size={14} /> Travas Fiscais & Operacionais
          </button>
        </div>

        {/* CORPO DA SELEÇÃO DE PERMISSÕES */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
          {activeTab === 'menus' && (
            <div className="space-y-3">
              {Object.keys(DEFAULT_MENUS).map((categoryKey) => {
                const categoryDef = (DEFAULT_MENUS as any)[categoryKey]
                const Icon = categoryDef.icon
                const isExpanded = expandedCategories[categoryKey] ?? true
                const categoryState = permissoesMenus[categoryKey] || { acesso: false, submenus: {} }
                const isCategoryActive = Boolean(categoryState.acesso)

                return (
                  <div key={categoryKey} className="bg-slate-950/70 border border-slate-800 rounded-xl overflow-hidden">
                    <div className="px-3.5 py-2.5 bg-slate-800/80 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isCategoryActive}
                          onChange={() => toggleCategoryAccess(categoryKey)}
                          className="w-4 h-4 rounded text-sky-600 focus:ring-0 cursor-pointer accent-sky-600"
                        />
                        <Icon size={15} className="text-sky-400" />
                        <span className="font-extrabold text-white text-xs uppercase tracking-wider">
                          {categoryDef.label}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setExpandedCategories({ ...expandedCategories, [categoryKey]: !isExpanded })}
                        className="text-slate-400 hover:text-white p-1"
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-900/40">
                        {Object.keys(categoryDef.submenus).map((subKey) => {
                          const subLabel = categoryDef.submenus[subKey]
                          const isSubActive = Boolean(categoryState.submenus?.[subKey])

                          return (
                            <label
                              key={subKey}
                              className={clsx(
                                'flex items-center gap-2 p-2 rounded-lg border transition-all cursor-pointer',
                                isSubActive
                                  ? 'bg-sky-950/40 border-sky-800/60 text-slate-200'
                                  : 'bg-slate-950/40 border-slate-800/60 text-slate-500 opacity-70 hover:opacity-100'
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={isSubActive}
                                onChange={() => toggleSubmenuAccess(categoryKey, subKey)}
                                className="w-3.5 h-3.5 rounded text-sky-600 focus:ring-0 accent-sky-600"
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

          {activeTab === 'acoes' && (
            <div className="space-y-2.5">
              <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl text-amber-300 text-[11px] flex items-center gap-2 mb-3">
                <AlertCircle size={16} className="shrink-0 text-amber-400" />
                <span>
                  Defina o nível de autoridade fiscal e operacional deste perfil. Desativar uma opção bloqueia imediatamente a ação.
                </span>
              </div>

              {DEFAULT_ACOES.map((ac) => {
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
                        {isAllowed ? (
                          <Check size={14} className="text-emerald-400" />
                        ) : (
                          <Ban size={14} className="text-rose-400" />
                        )}
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
            className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-extrabold shadow-md flex items-center gap-1.5 transition-all cursor-pointer text-xs disabled:opacity-60"
          >
            {saving ? <Shield size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? 'Salvando...' : 'Salvar Grupo de Acesso'}
          </button>
        </div>
      </div>
    </div>
  )
}
