import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Package, FileText, Settings, ChevronDown, ChevronUp,
  LogOut, Shield, X, BarChart3, Truck, BrainCircuit, Route, Building2,
  Navigation, KeyRound, FileStack, BadgeCheck, Search, ChevronLeft, ChevronRight,
  ScrollText, Menu, CircleDot
} from 'lucide-react'
import clsx from 'clsx'
import { useAuthStore } from '../../store/authStore'
import { useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  /** Modo recolhido: apenas ícones */
  collapsed?: boolean
  onToggleCollapse?: () => void
  /** Abre o menu no mobile/tablet */
  onOpenMobile?: () => void
}

interface MenuGroup {
  id: string
  label: string
  icon: any
  cor: string
  items: { to: string; label: string; icon: any; end?: boolean; palavras?: string[] }[]
}

/**
 * Menu lateral do Coliseu Transporte — única navegação do sistema.
 *
 * Cada destino aparece uma única vez. A criação de CIOT acontece na própria
 * tela de consulta, por isso não existe item separado para "Criar CIOT".
 */
const GRUPOS: MenuGroup[] = [
  {
    id: 'operacao',
    label: 'Operação',
    icon: LayoutDashboard,
    cor: '#0B63A5',
    items: [
      { to: '/', label: 'Cockpit de Transporte', icon: LayoutDashboard, end: true, palavras: ['dashboard', 'home', 'painel', 'inicio'] },
      { to: '/transporte/cargas', label: 'Central de Cargas', icon: Package, palavras: ['notas', 'nfe', 'carga', 'erp'] },
      { to: '/transporte/roteiro', label: 'Roteiro de Entrega', icon: Navigation, palavras: ['mapa', 'rota', 'entrega', 'parada'] }
    ]
  },
  {
    id: 'documentos',
    label: 'Documentos Fiscais',
    icon: FileStack,
    cor: '#2563EB',
    items: [
      { to: '/transporte/cte/novo', label: 'Emitir CT-e', icon: FileText, palavras: ['cte', 'conhecimento', 'frete'] },
      { to: '/transporte/mdfe/novo', label: 'Emitir MDF-e', icon: Truck, palavras: ['mdfe', 'manifesto', 'carga propria'] },
      { to: '/transporte/documentos', label: 'Documentos Emitidos', icon: FileStack, palavras: ['emitidos', 'consultar', 'chave', 'protocolo'] }
    ]
  },
  {
    id: 'ciot',
    label: 'CIOT',
    icon: BadgeCheck,
    cor: '#7C3AED',
    items: [
      { to: '/transporte/ciot', label: 'Consultar e Gerenciar CIOT', icon: BadgeCheck, palavras: ['ciot', 'contrato', 'antt', 'piso'] }
    ]
  },
  {
    id: 'cadastros',
    label: 'Cadastros',
    icon: Users,
    cor: '#6366F1',
    items: [
      { to: '/clientes', label: 'Clientes (ERP Coliseu)', icon: Users, palavras: ['cliente', 'parceiro'] },
      { to: '/regioes', label: 'Regiões & Cidades', icon: Route, palavras: ['regiao', 'cidade', 'municipio', 'ibge'] },
      { to: '/transporte/frota', label: 'Frota & Condutores', icon: Truck, palavras: ['veiculo', 'placa', 'motorista', 'condutor'] },
      { to: '/transporte/partes', label: 'Partes do Transporte', icon: Building2, palavras: ['remetente', 'destinatario', 'tomador'] }
    ]
  },
  {
    id: 'relatorios',
    label: 'Relatórios',
    icon: BarChart3,
    cor: '#0D9488',
    items: [
      { to: '/transporte/relatorios', label: 'Desempenho Fiscal', icon: BarChart3, palavras: ['relatorio', 'indicador', 'grafico', 'desempenho'] }
    ]
  },
  {
    id: 'configuracoes',
    label: 'Configurações',
    icon: Settings,
    cor: '#64748B',
    items: [
      { to: '/transporte/empresa', label: 'Dados da Empresa', icon: Building2, palavras: ['emitente', 'cnpj', 'rntrc', 'focus', 'certificado'] },
      { to: '/transporte/config', label: 'Regras Fiscais por UF', icon: ScrollText, palavras: ['icms', 'aliquota', 'fcp', 'uf', 'tributacao'] },
      { to: '/transporte/campos', label: 'Campos Dinâmicos', icon: BrainCircuit, palavras: ['campo', 'formulario', 'personalizar'] },
      { to: '/transporte/certificados', label: 'Certificados A1', icon: KeyRound, palavras: ['certificado', 'pfx', 'a1'] },
      { to: '/usuarios', label: 'Usuários & Permissões', icon: Shield, palavras: ['usuario', 'permissao', 'grupo', 'acesso'] }
    ]
  }
]

export default function Sidebar({ open, onClose, collapsed = false, onToggleCollapse, onOpenMobile }: Props) {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const [abertos, setAbertos] = useState<Record<string, boolean>>({
    operacao: true,
    documentos: true,
    ciot: false,
    cadastros: false,
    relatorios: false,
    configuracoes: false
  })
  const [busca, setBusca] = useState('')

  const toggle = (id: string) => setAbertos(a => ({ ...a, [id]: !a[id] }))

  const itemAtivo = (to: string) => {
    if (to === '/') return window.location.pathname === '/'
    return window.location.pathname.startsWith(to.split('?')[0])
  }

  // Itens que casam com a busca
  const termo = busca.trim().toLowerCase()
  const gruposFiltrados = GRUPOS
    .map(g => ({
      ...g,
      items: g.items.filter(i =>
        !termo ||
        i.label.toLowerCase().includes(termo) ||
        (i.palavras || []).some(p => p.includes(termo))
      )
    }))
    .filter(g => g.items.length > 0)

  const totalResultados = gruposFiltrados.reduce((acc, g) => acc + g.items.length, 0)

  return (
    <aside className={clsx(
      'flex flex-col h-screen bg-white dark:bg-slate-900 border-r border-slate-200/70 dark:border-slate-700/60 transition-[width] duration-300 ease-out',
      collapsed ? 'w-[68px]' : 'w-[248px]'
    )}>

      {/* ═══ TOPO: LOGO + CONTROLES ═══ */}
      <div className="flex items-center gap-2 px-4 h-[68px] border-b border-slate-200/70 dark:border-slate-700/60 shrink-0">
        {collapsed ? (
          <button
            onClick={onToggleCollapse}
            className="w-full flex justify-center py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Expandir menu"
          >
            <img src="/assets/logo-coliseu-transporte.svg" alt="Coliseu Transporte" className="w-8 h-8 object-contain object-left" />
          </button>
        ) : (
          <>
            <img
              src="/assets/logo-coliseu-transporte.svg"
              alt="Coliseu Transporte"
              className="h-10 w-auto shrink-0"
            />
            <button
              onClick={onToggleCollapse}
              className="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 transition-colors"
              title="Recolher menu"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Botão de menu (mobile/tablet) */}
      <button
        onClick={() => { onOpenMobile?.(); onClose() }}
        className="lg:hidden flex items-center gap-2.5 px-4 py-3 border-b border-slate-200/70 dark:border-slate-700/60 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
      >
        <Menu className="w-4 h-4" />
        Menu
        <X className="w-4 h-4 ml-auto text-slate-400" />
      </button>

      {/* ═══ BUSCA ═══ */}
      {!collapsed && (
        <div className="px-3 pt-3 pb-1 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar no sistema..."
              className="w-full pl-8 pr-7 py-2 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400 transition-all"
            />
            {busca && (
              <button
                onClick={() => setBusca('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {termo && (
            <p className="text-[10px] text-slate-400 mt-1.5 px-1">
              {totalResultados} resultado{totalResultados !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}

      {/* ═══ NAVEGAÇÃO ═══ */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 pb-2">
        {gruposFiltrados.map(grupo => {
          const Icon = grupo.icon
          const aberto = abertos[grupo.id] && !collapsed
          const grupoAtivo = grupo.items.some(i => itemAtivo(i.to))

          if (collapsed) {
            const primeiro = grupo.items[0]
            return (
              <NavLink
                key={grupo.id}
                to={primeiro.to}
                end={primeiro.end}
                title={grupo.label}
                className={({ isActive }) => clsx(
                  'flex items-center justify-center h-10 rounded-xl mb-1 transition-all duration-200',
                  isActive
                    ? 'bg-brand-500/12 text-brand-600 dark:text-brand-400'
                    : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200'
                )}
              >
                <Icon className="w-[18px] h-[18px]" />
              </NavLink>
            )
          }

          return (
            <div key={grupo.id} className="mb-1">
              <button
                onClick={() => toggle(grupo.id)}
                className={clsx(
                  'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all duration-200',
                  grupoAtivo
                    ? 'text-slate-900 dark:text-white'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                )}
              >
                <span
                  className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${grupo.cor}18`, color: grupo.cor }}
                >
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <span className="truncate">{grupo.label}</span>
                {grupoAtivo ? (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: grupo.cor }} />
                ) : (
                  <ChevronDown className={clsx(
                    'ml-auto w-3.5 h-3.5 shrink-0 transition-transform duration-200',
                    aberto && 'rotate-180'
                  )} />
                )}
              </button>

              {aberto && (
                <div className="mt-0.5 space-y-0.5 pl-1 ml-3 border-l-2 border-slate-200/80 dark:border-slate-700/60">
                  {grupo.items.map(item => {
                    const ItemIcon = item.icon
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        onClick={onClose}
                        title={item.label}
                        className={({ isActive }) => clsx(
                          'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200',
                          isActive
                            ? 'text-brand-600 dark:text-brand-400 bg-brand-500/10 font-semibold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/70'
                        )}
                      >
                        <ItemIcon className="w-4 h-4 shrink-0 opacity-80" />
                        <span className="truncate">{item.label}</span>
                      </NavLink>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {gruposFiltrados.length === 0 && (
          <div className="px-4 py-10 text-center">
            <CircleDot className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
            <p className="text-xs text-slate-400">Nenhum item encontrado para "{busca}"</p>
          </div>
        )}
      </nav>

      {/* ═══ RODAPÉ: EMPRESA + USUÁRIO + SAIR ═══ */}
      <div className="border-t border-slate-200/70 dark:border-slate-700/60 p-2.5 shrink-0 space-y-2">

        {/* Empresa ativa */}
        {!collapsed && (
          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#0B3B66] to-[#0B63A5] text-white flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide leading-none">Empresa</p>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate mt-0.5">
                {user?.grupo_nome || 'Coliseu Transporte'}
              </p>
            </div>
          </div>
        )}

        {/* Usuário + sair */}
        <div className={clsx('flex items-center gap-2', collapsed ? 'justify-center' : 'px-1')}>
          {collapsed && (
            <button
              onClick={onToggleCollapse}
              className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 transition-all"
              title="Expandir menu"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}

          <div className={clsx('flex items-center gap-2.5 min-w-0 flex-1', collapsed && 'flex-col gap-1.5')}>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1E3A8A] to-[#1E40AF] text-white flex items-center justify-center text-xs font-black shrink-0">
              {user?.nome?.[0]?.toUpperCase() || 'U'}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                  {user?.nome || 'Usuário'}
                </p>
                <p className="text-[10px] text-slate-400 truncate">{user?.email}</p>
              </div>
            )}
            <button
              onClick={async () => { await logout(); onClose() }}
              title="Sair"
              className="p-2 rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400 transition-colors shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
