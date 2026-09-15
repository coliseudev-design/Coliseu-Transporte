import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import DataTable from '../components/DataTable'
import { Shield, UserPlus, CheckCircle, XCircle, Lock, Building2, Layers, Plus, Edit2, Trash2, Users as UsersIcon, Check, AlertCircle, Ban } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useBranch } from '../contexts/BranchContext'
import ModalCadastroGrupoAcesso, { GrupoAcesso } from '../components/configuracoes/ModalCadastroGrupoAcesso'

interface UserRow {
  id: number
  email: string
  nome: string
  role: string
  ativo: boolean
  created_at: string
  permissions: string[] | null
  tenant_id: string
  layout_version?: string
  filial_acesso?: string
  grupo_id?: number
  grupo_nome?: string
  permissoes_menus?: any
  permissoes_acoes?: any
}

const AVAILABLE_MODULES = [
  {
    id: 'clientes',
    label: 'Cadastros',
    description: 'Permite gerenciar clientes cadastrados no sistema e acessar o catálogo comercial de produtos.',
    menus: ['Clientes', 'Catálogo Comercial']
  },
  {
    id: 'crm',
    label: 'CRM e Vendas',
    description: 'Acesso ao Kanban de Vendas para acompanhamento de leads e negócios comerciais.',
    menus: ['Kanban de Vendas']
  },
  {
    id: 'contratos',
    label: 'Faturamento',
    description: 'Controle de contratos ativos com clientes e visualização de pedidos faturados.',
    menus: ['Gestão de Contratos', 'Pedidos Faturados']
  },
  {
    id: 'cobranca',
    label: 'Cobrança',
    description: 'Acesso ao Kanban Operacional de inadimplentes e definição da Régua de Cobrança.',
    menus: ['Kanban Operacional', 'Régua de Cobrança']
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    description: 'Gestão de contas a pagar, receber, bancos, fluxo de caixa diário e tesouraria.',
    menus: ['Tesouraria & Caixa']
  },
  {
    id: 'marketing',
    label: 'Marketing',
    description: 'Criação e agendamento de disparos de mensagens em massa de WhatsApp e gestão de templates.',
    menus: ['Marketing em Massa', 'Templates / Acervos']
  },
  {
    id: 'bi',
    label: 'Business Intelligence (BI)',
    description: 'Visualização de relatórios analíticos, gráficos estratégicos, mapa de calor e insights de Inteligência Artificial.',
    menus: [
      'Inteligência de Vendas', 'Hub de Vendas', 'Hub do Fornecedor',
      'Gestão de Inventário', 'Financeiro BI', 'Mapa de Calor', 'Coliseu AI Insights'
    ]
  },
  {
    id: 'usuarios',
    label: 'Configurações',
    description: 'Gestão de usuários, permissões de acesso do sistema, chaves de API e integrações SaaS.',
    menus: ['Chaves e Integrações', 'Usuários & Permissões']
  }
]

export default function Usuarios() {
  const queryClient = useQueryClient()
  const { filiais } = useBranch()
  const [modalOpen, setModalOpen] = useState(false)
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false)
  const [filialModalOpen, setFilialModalOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null)
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([])
  const [selectedFilialAcesso, setSelectedFilialAcesso] = useState<string>('todas')
  
  // Admin lock
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [adminPassInput, setAdminPassInput] = useState('')
  const [adminPassError, setAdminPassError] = useState('')

  // Form states
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [companyKey, setCompanyKey] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const { data: users, isLoading } = useQuery<UserRow[]>({
    queryKey: ['usuarios'],
    queryFn: async () => {
      const res = await api.get('/usuarios')
      return res.data
    }
  })

  const toggleStatus = useMutation({
    mutationFn: async ({ id, ativo }: { id: number, ativo: boolean }) => {
      const res = await api.put(`/usuarios/${id}/status`, { ativo })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] })
    },
    onError: (err: any) => {
      alert(err.response?.data?.error || 'Erro ao alterar status')
    }
  })

  const createUser = useMutation({
    mutationFn: async () => {
      const res = await api.post('/usuarios', { nome, email, password, companyKey })
      return res.data
    },
    onSuccess: () => {
      setModalOpen(false)
      setNome('')
      setEmail('')
      setPassword('')
      setCompanyKey('')
      queryClient.invalidateQueries({ queryKey: ['usuarios'] })
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.error || 'Erro ao criar usuário')
    }
  })

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    createUser.mutate()
  }

  const updatePermissions = useMutation({
    mutationFn: async ({ id, permissions }: { id: number, permissions: string[] | null }) => {
      const res = await api.put(`/usuarios/${id}/permissions`, { permissions })
      return res.data
    },
    onSuccess: () => {
      setPermissionsModalOpen(false)
      setSelectedUser(null)
      queryClient.invalidateQueries({ queryKey: ['usuarios'] })
    },
    onError: (err: any) => {
      alert(err.response?.data?.error || 'Erro ao alterar permissões')
    }
  })

  const openPermissionsModal = (user: UserRow) => {
    setSelectedUser(user)
    setSelectedPermissions(user.permissions || AVAILABLE_MODULES.map(m => m.id))
    setPermissionsModalOpen(true)
  }

  const handleSavePermissions = () => {
    if (!selectedUser) return
    updatePermissions.mutate({ id: selectedUser.id, permissions: selectedPermissions })
  }

  const updateLayout = useMutation({
    mutationFn: async ({ id, layout_version }: { id: number, layout_version: string }) => {
      const res = await api.put(`/usuarios/${id}/layout`, { layout_version })
      return res.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] })
      const currentUser = useAuthStore.getState().user;
      if (currentUser && data.user && data.user.id === currentUser.id) {
         const user = { ...currentUser, layout_version: data.user.layout_version };
         useAuthStore.setState({ user });
         localStorage.setItem('coliseu_user', JSON.stringify(user));
      }
    },
    onError: (err: any) => {
      alert(err.response?.data?.error || 'Erro ao alterar layout')
    }
  })

  const updateFilialAcesso = useMutation({
    mutationFn: async ({ id, filial_acesso }: { id: number, filial_acesso: string }) => {
      const res = await api.put(`/usuarios/${id}/filial-acesso`, { filial_acesso })
      return res.data
    },
    onSuccess: () => {
      setFilialModalOpen(false)
      setSelectedUser(null)
      queryClient.invalidateQueries({ queryKey: ['usuarios'] })
    },
    onError: (err: any) => {
      alert(err.response?.data?.error || 'Erro ao alterar acesso de filial')
    }
  })

  const openFilialModal = (user: UserRow) => {
    setSelectedUser(user)
    setSelectedFilialAcesso(user.filial_acesso || 'todas')
    setFilialModalOpen(true)
  }

  const togglePermission = (id: string) => {
    setSelectedPermissions(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    )
  }

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault()
    if (adminPassInput === '13894645') {
      setIsUnlocked(true)
      setAdminPassError('')
    } else {
      setAdminPassError('Senha de administrador incorreta')
    }
  }

  // Removeram a tela de senha a pedido do usuário

  const [searchParams] = useSearchParams()
  const initialSection = (searchParams.get('tab') === 'grupos' || searchParams.get('section') === 'grupos') ? 'grupos' : 'usuarios'
  const [activeSection, setActiveSection] = useState<'usuarios' | 'grupos'>(initialSection)

  useEffect(() => {
    const tabParam = searchParams.get('tab') || searchParams.get('section')
    if (tabParam === 'grupos') {
      setActiveSection('grupos')
    }
  }, [searchParams])

  const [grupoModalOpen, setGrupoModalOpen] = useState(false)
  const [editingGrupo, setEditingGrupo] = useState<GrupoAcesso | null>(null)

  const { data: gruposList, isLoading: isLoadingGrupos } = useQuery<any[]>({
    queryKey: ['grupos-acesso'],
    queryFn: async () => {
      const res = await api.get('/grupos-acesso')
      return res.data?.data || []
    }
  })

  const updateUserGrupo = useMutation({
    mutationFn: async ({ userId, grupo_id }: { userId: number, grupo_id: number }) => {
      const res = await api.put(`/usuarios/${userId}/grupo`, { grupo_id })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] })
      queryClient.invalidateQueries({ queryKey: ['grupos-acesso'] })
    },
    onError: (err: any) => {
      alert(err.response?.data?.error || 'Erro ao alterar grupo de acesso do usuário')
    }
  })

  const deleteGrupo = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/grupos-acesso/${id}`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grupos-acesso'] })
      queryClient.invalidateQueries({ queryKey: ['usuarios'] })
    },
    onError: (err: any) => {
      alert(err.response?.data?.error || 'Erro ao excluir grupo de acesso')
    }
  })

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in">
      {/* CABEÇALHO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl font-semibold text-text-primary">Gestão de Usuários & Perfis de Acesso</h2>
          <p className="text-text-secondary text-sm">Controle de segurança, grupos de acesso (RBAC) e filiais autorizadas.</p>
        </div>

        <div className="flex items-center gap-2">
          {activeSection === 'usuarios' ? (
            <button
              onClick={() => setModalOpen(true)}
              className="btn-primary flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl shadow-sm hover:shadow-md transition-all font-semibold cursor-pointer"
            >
              <UserPlus size={18} />
              <span>Novo Usuário</span>
            </button>
          ) : (
            <button
              onClick={() => {
                setEditingGrupo(null)
                setGrupoModalOpen(true)
              }}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer text-sm"
            >
              <Plus size={18} />
              <span>Novo Grupo de Acesso</span>
            </button>
          )}
        </div>
      </div>

      {/* ABAS DE SEÇÃO */}
      <div className="flex border-b border-border gap-3">
        <button
          onClick={() => setActiveSection('usuarios')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeSection === 'usuarios'
              ? 'border-brand-500 text-brand-600'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <UsersIcon size={16} /> Usuários do Sistema ({users?.length || 0})
        </button>
        <button
          onClick={() => setActiveSection('grupos')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeSection === 'grupos'
              ? 'border-brand-500 text-brand-600'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <Shield size={16} /> Perfis / Grupos de Acesso RBAC ({gruposList?.length || 0})
        </button>
      </div>

      {/* SEÇÃO 1: USUÁRIOS */}
      {activeSection === 'usuarios' && (
        <div className="bg-bg-primary rounded-2xl shadow-sm border border-border overflow-hidden">
          <DataTable
            loading={isLoading}
            data={users || []}
            empty="Nenhum usuário cadastrado."
            columns={[
              {
                key: 'nome',
                label: 'NOME',
                render: (r: UserRow) => (
                  <div>
                    <div className="font-medium text-text-primary capitalize">{r.nome}</div>
                    <div className="text-xs text-text-secondary">{r.email}</div>
                  </div>
                )
              },
              {
                key: 'grupo',
                label: 'GRUPO DE ACESSO (PERFIL)',
                render: (r: UserRow) => (
                  <div className="flex items-center gap-2">
                    <select
                      value={r.grupo_id || ''}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10)
                        if (val) updateUserGrupo.mutate({ userId: r.id, grupo_id: val })
                      }}
                      className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs font-bold text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="">Selecione um Grupo...</option>
                      {gruposList?.map(g => (
                        <option key={g.id} value={g.id}>
                          {g.nome} {g.nome.toLowerCase() === 'master' ? '(Total)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              },
            {
              key: 'role',
              label: 'PERFIL',
              render: (r: UserRow) => (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md bg-gray-100 text-gray-700 w-fit">
                    <Shield size={14} />
                    <span>{r.role === 'viewer' ? 'Visualizador' : r.role}</span>
                  </div>
                </div>
              )
            },
            {
              key: 'tenant',
              label: 'EMPRESA / CHAVE',
              render: (r: UserRow) => {
                const isMaster = r.tenant_id === '00000000-0000-0000-0000-000000000000'
                return (
                  <div>
                    <div className="font-medium text-text-primary text-sm">
                      {isMaster ? 'Coliseu Transporte (Master)' : 'Empresa Cliente'}
                    </div>
                    <div className="text-xs text-text-secondary font-mono mt-0.5">
                      {isMaster ? 'Master Key' : r.tenant_id}
                    </div>
                  </div>
                )
              }
            },

            {
              key: 'ativo',
              label: 'STATUS',
              render: (r: UserRow) => (
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${r.ativo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {r.ativo ? 'Ativo' : 'Inativo'}
                </span>
              )
            },
            {
              key: 'actions',
              label: 'AÇÕES',
              align: 'right',
              render: (r: UserRow) => (
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => openPermissionsModal(r)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-brand-600 hover:bg-brand-50 transition-colors"
                  >
                    <Shield size={16} />
                    <span>Grupo de Acesso</span>
                  </button>
                  {filiais.length > 0 && (
                    <button
                      onClick={() => openFilialModal(r)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
                    >
                      <Building2 size={16} />
                      <span>Filiais</span>
                    </button>
                  )}
                  <button
                    onClick={() => toggleStatus.mutate({ id: r.id, ativo: !r.ativo })}
                    disabled={toggleStatus.isPending}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      r.ativo 
                        ? 'text-red-600 hover:bg-red-50' 
                        : 'text-green-600 hover:bg-green-50'
                    }`}
                    title={r.ativo ? "Inativar Usuário" : "Ativar Usuário"}
                  >
                    {r.ativo ? <XCircle size={16} /> : <CheckCircle size={16} />}
                    <span>{r.ativo ? 'Inativar' : 'Ativar'}</span>
                  </button>
                </div>
              )
            }
          ]}
        />
      </div>
      )}

      {/* Modal de Criação */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg-primary rounded-2xl shadow-xl border border-border w-full max-w-md overflow-hidden animate-fade-in">
            <div className="p-5 border-b border-border flex justify-between items-center bg-bg-secondary/50">
              <h3 className="font-semibold text-lg text-text-primary">Novo Acesso</h3>
              <button onClick={() => setModalOpen(false)} className="text-text-secondary hover:text-text-primary">
                <XCircle size={24} />
              </button>
            </div>
            
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm font-medium border border-red-100">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-2 border border-border rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-shadow outline-none bg-bg-primary text-text-primary"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">E-mail</label>
                <input
                  type="email"
                  required
                  className="w-full px-4 py-2 border border-border rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-shadow outline-none bg-bg-primary text-text-primary"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">CompanyKey (Identity Vault Hash)</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 123e4567-e89b-12d3-a456-426614174000"
                  className="w-full px-4 py-2 border border-border rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-shadow outline-none font-mono text-sm bg-bg-primary text-text-primary"
                  value={companyKey}
                  onChange={(e) => setCompanyKey(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Senha Inicial</label>
                <input
                  type="password"
                  required
                  className="w-full px-4 py-2 border border-border rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-shadow outline-none bg-bg-primary text-text-primary"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-border text-text-secondary font-medium hover:bg-bg-secondary transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createUser.isPending}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-medium transition-colors disabled:opacity-50 flex items-center justify-center"
                >
                  {createUser.isPending ? 'Salvando...' : 'Cadastrar Usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Grupo de Acesso */}
      {permissionsModalOpen && selectedUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg-primary rounded-2xl shadow-xl border border-border w-full max-w-xl overflow-hidden animate-fade-in">
            <div className="p-5 border-b border-border flex justify-between items-center bg-bg-secondary/50">
              <div>
                <h3 className="font-semibold text-base text-text-primary flex items-center gap-1.5">
                  <Shield size={18} className="text-brand-500" />
                  Definir Grupo de Acesso
                </h3>
                <p className="text-[10px] text-text-secondary mt-0.5">Usuário: <span className="font-bold text-text-primary">{selectedUser.nome}</span></p>
              </div>
              <button onClick={() => setPermissionsModalOpen(false)} className="text-text-secondary hover:text-text-primary">
                <XCircle size={24} />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <p className="text-xs text-text-secondary">
                Selecione as permissões de acesso do grupo. Cada permissão libera abas e menus específicos do sistema:
              </p>

              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {AVAILABLE_MODULES.map(mod => (
                  <div key={mod.id} className="p-3.5 rounded-xl border border-divider hover:border-border transition-all bg-bg-secondary/15 flex flex-col gap-2.5">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedPermissions.includes(mod.id)}
                        onChange={() => togglePermission(mod.id)}
                        className="w-4 h-4 mt-0.5 rounded border-divider text-brand-500 focus:ring-brand-500/20"
                      />
                      <div>
                        <span className="text-xs font-black text-text-primary block uppercase tracking-wider">{mod.label}</span>
                        <p className="text-[10px] text-text-secondary mt-0.5 leading-relaxed">{mod.description}</p>
                      </div>
                    </label>
                    <div className="pl-8 flex flex-wrap gap-1.5 border-t border-divider/40 pt-2">
                      <span className="text-[9px] font-bold text-text-muted mr-1 mt-0.5">Menus liberados:</span>
                      {mod.menus.map(menu => (
                        <span key={menu} className="text-[9px] font-semibold bg-bg-secondary border border-divider text-text-secondary px-2 py-0.5 rounded-md">
                          {menu}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-divider flex gap-3">
                <button
                  type="button"
                  onClick={() => setPermissionsModalOpen(false)}
                  className="flex-1 py-2 rounded-xl border border-divider text-text-secondary text-xs font-bold hover:bg-bg-secondary transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSavePermissions}
                  disabled={updatePermissions.isPending}
                  className="flex-1 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center cursor-pointer shadow-xs"
                >
                  {updatePermissions.isPending ? 'Salvando...' : 'Salvar Grupo de Acesso'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Acesso por Filial */}
      {filialModalOpen && selectedUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg-primary rounded-2xl shadow-xl border border-border w-full max-w-md overflow-hidden animate-fade-in">
            <div className="p-5 border-b border-border flex justify-between items-center bg-bg-secondary/50">
              <div>
                <h3 className="font-semibold text-lg text-text-primary flex items-center gap-2">
                  <Building2 size={18} className="text-indigo-500" />
                  Acesso de Filiais
                </h3>
                <p className="text-xs text-text-secondary mt-0.5">{selectedUser.nome}</p>
              </div>
              <button onClick={() => setFilialModalOpen(false)} className="text-text-secondary hover:text-text-primary">
                <XCircle size={24} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-text-secondary">
                Defina quais filiais este usuário pode visualizar no dashboard.
              </p>

              <div className="space-y-2">
                {/* Opção: Todas */}
                <label className="flex items-center gap-3 p-3 rounded-xl border border-border cursor-pointer hover:bg-bg-secondary transition-colors">
                  <input
                    type="radio"
                    name="filial_acesso"
                    value="todas"
                    checked={selectedFilialAcesso === 'todas'}
                    onChange={() => setSelectedFilialAcesso('todas')}
                    className="w-4 h-4 text-brand-500"
                  />
                  <span className="text-sm font-medium text-text-primary">Todas as Filiais</span>
                </label>

                {/* Filiais individuais */}
                {filiais.map((f) => (
                  <label key={f.depto_id} className="flex items-center gap-3 p-3 rounded-xl border border-border cursor-pointer hover:bg-bg-secondary transition-colors">
                    <input
                      type="radio"
                      name="filial_acesso"
                      value={String(f.depto_id)}
                      checked={selectedFilialAcesso === String(f.depto_id)}
                      onChange={() => setSelectedFilialAcesso(String(f.depto_id))}
                      className="w-4 h-4 text-indigo-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-text-primary block">{f.nome}</span>
                      {f.documento && <span className="text-xs text-text-muted font-mono">{f.documento}</span>}
                    </div>
                  </label>
                ))}
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setFilialModalOpen(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-border text-text-secondary font-medium hover:bg-bg-secondary transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => selectedUser && updateFilialAcesso.mutate({ id: selectedUser.id, filial_acesso: selectedFilialAcesso })}
                  disabled={updateFilialAcesso.isPending}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-medium transition-colors disabled:opacity-50 flex items-center justify-center"
                >
                  {updateFilialAcesso.isPending ? 'Salvando...' : 'Salvar Acesso'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SEÇÃO 2: GRUPOS DE ACESSO (RBAC) */}
      {activeSection === 'grupos' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isLoadingGrupos ? (
            <div className="col-span-full py-12 text-center text-text-secondary text-sm">Carregando grupos de acesso...</div>
          ) : gruposList && gruposList.length > 0 ? (
            gruposList.map((g: any) => {
              const isMaster = g.nome.toLowerCase() === 'master'
              const isComercial = g.nome.toLowerCase() === 'comercial'

              return (
                <div key={g.id} className="bg-bg-primary border border-border rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-indigo-500/50 transition-all">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-xl text-white font-bold text-xs uppercase ${isMaster ? 'bg-purple-600' : isComercial ? 'bg-blue-600' : 'bg-indigo-600'}`}>
                          <Shield size={16} />
                        </div>
                        <div>
                          <h3 className="font-extrabold text-text-primary text-base flex items-center gap-2">
                            {g.nome}
                            {isMaster && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">Total / Mestre</span>}
                            {isComercial && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold font-mono">Sem Financeiro</span>}
                          </h3>
                          <span className="text-xs text-text-secondary font-medium">
                            👥 {g.total_usuarios || 0} usuário(s) associado(s)
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditingGrupo(g)
                            setGrupoModalOpen(true)
                          }}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 rounded-lg transition-colors cursor-pointer"
                          title="Editar Perfil de Acesso"
                        >
                          <Edit2 size={16} />
                        </button>
                        {!isMaster && (
                          <button
                            onClick={() => {
                              if (confirm(`Deseja remover o grupo "${g.nome}"? Usuários vinculados serão movidos para o grupo Master.`)) {
                                deleteGrupo.mutate(g.id)
                              }
                            }}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg transition-colors cursor-pointer"
                            title="Excluir Grupo de Acesso"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-text-secondary leading-relaxed bg-bg-secondary/40 p-2.5 rounded-xl border border-divider">
                      {g.descricao || 'Sem descrição cadastrada.'}
                    </p>

                    {/* RESUMO DE TRAVAS */}
                    <div className="pt-2 flex flex-wrap gap-1.5 text-[10.5px]">
                      {g.permissoes_menus?.financeiro?.acesso === false ? (
                        <span className="px-2 py-0.5 bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 rounded-md font-bold flex items-center gap-1 border border-rose-200 dark:border-rose-800">
                          <Ban size={10} /> Sem Financeiro
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 rounded-md font-bold flex items-center gap-1 border border-emerald-200 dark:border-emerald-800">
                          <Check size={10} /> Financeiro Liberado
                        </span>
                      )}

                      {g.permissoes_acoes?.permitir_cancelar_titulos === false && (
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 rounded-md font-bold flex items-center gap-1 border border-amber-200 dark:border-amber-800">
                          <Ban size={10} /> Bloqueio: Cancelar Título
                        </span>
                      )}

                      {g.permissoes_acoes?.permitir_cancelar_boletos === false && (
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 rounded-md font-bold flex items-center gap-1 border border-amber-200 dark:border-amber-800">
                          <Ban size={10} /> Bloqueio: Cancelar Boleto
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="col-span-full py-12 text-center text-text-secondary text-sm">Nenhum grupo de acesso cadastrado.</div>
          )}
        </div>
      )}

      {/* Modal de Cadastro e Edição de Grupo de Acesso */}
      <ModalCadastroGrupoAcesso
        isOpen={grupoModalOpen}
        grupo={editingGrupo}
        onClose={() => setGrupoModalOpen(false)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['grupos-acesso'] })
          queryClient.invalidateQueries({ queryKey: ['usuarios'] })
        }}
      />
    </div>
  )
}
