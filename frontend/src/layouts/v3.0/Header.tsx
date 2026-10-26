import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Menu, LogOut, X, ChevronDown, HelpCircle, User,
  Users, Package, Network, Settings,
  FileText, Shield, BrainCircuit, BarChart3, ChevronRight,
  Building2, Key, Truck, Navigation, FileStack, BadgeCheck, Plus
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useSyncStatus } from '../../hooks/useSync'
import ModalAlterarSenha from '../../components/ModalAlterarSenha'
import clsx from 'clsx'

export default function Header({ onOpenSidebar }: { onOpenSidebar?: () => void }) {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { status, lastSync, triggerSync, isSyncing } = useSyncStatus()
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false)
  const [configDropdownOpen, setConfigDropdownOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [empresaNome, setEmpresaNome] = useState<string>('')
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [mobileExpanded, setMobileExpanded] = useState<Record<string, boolean>>({})
  const [isModalSenhaOpen, setIsModalSenhaOpen] = useState(false)
  const location = useLocation()

  // Click outside listener for desktop nav dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const navElement = document.getElementById('desktop-nav')
      if (navElement && !navElement.contains(event.target as Node)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  // ─────────────────────────────────────────────────────────────
  // Barra Principal — 8 botões independentes conforme especificação
  // ─────────────────────────────────────────────────────────────
  const navigationGroups = [
    {
      // 1. CADASTROS — primeiro botão, incorpora Frota e demais cadastros
      label: 'Cadastros',
      icon: Users,
      hexColor: '#6366F1',
      textColor: 'text-[#6366F1]',
      hoverBg: 'hover:bg-[#6366F1]/10',
      activeBg: 'bg-[#6366F1]/10 text-[#6366F1] border-[#6366F1]/30',
      hoverBorderLeft: 'hover:border-l-[#6366F1]',
      items: [
        { to: '/clientes', label: 'Clientes (ERP Coliseu)', icon: Users },
        { to: '/regioes', label: 'Regiões & Cidades', icon: Network },
        { to: '/transporte/frota', label: 'Frota & Condutores', icon: Truck },
        { to: '/transporte/partes', label: 'Partes do Transporte', icon: Building2 },
      ]
    },
    {
      // 2. TRANSPORTES — ações de emissão, simples e sem poluir
      label: 'Transportes',
      icon: Truck,
      hexColor: '#0284C7',
      textColor: 'text-[#0284C7]',
      hoverBg: 'hover:bg-[#0284C7]/10',
      activeBg: 'bg-[#E0F2FE] text-[#0284C7] border-[#7DD3FC]',
      hoverBorderLeft: 'hover:border-l-[#0284C7]',
      items: [
        { to: '/transporte/cte/novo', label: 'Emitir CT-e', icon: FileText },
        { to: '/transporte/mdfe/novo', label: 'Emitir MDF-e', icon: Truck },
      ]
    },
    {
      // 3. DOCUMENTOS EMITIDOS — listagem unificada CT-e + MDF-e
      label: 'Documentos',
      icon: FileStack,
      hexColor: '#2563EB',
      textColor: 'text-[#2563EB]',
      hoverBg: 'hover:bg-[#2563EB]/10',
      activeBg: 'bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]',
      hoverBorderLeft: 'hover:border-l-[#2563EB]',
      items: [
        { to: '/transporte/documentos', label: 'Todos os Documentos', icon: FileStack },
        { to: '/transporte/documentos?tipo=cte', label: 'Somente CT-e', icon: FileText },
        { to: '/transporte/documentos?tipo=mdfe', label: 'Somente MDF-e', icon: Truck },
      ]
    },
    {
      // 4. CIOT — botão individual com ícone próprio
      label: 'CIOT',
      icon: BadgeCheck,
      hexColor: '#7C3AED',
      textColor: 'text-[#7C3AED]',
      hoverBg: 'hover:bg-[#7C3AED]/10',
      activeBg: 'bg-[#F5F3FF] text-[#7C3AED] border-[#DDD6FE]',
      hoverBorderLeft: 'hover:border-l-[#7C3AED]',
      items: [
        { to: '/transporte/ciot', label: 'Consultar CIOT', icon: BadgeCheck },
        { to: '/transporte/ciot?acao=novo', label: 'Criar Operação (CIOT)', icon: Plus },
      ]
    },
    {
      // 5. ROTEIRO DE ENTREGA — botão individual
      label: 'Roteiro',
      icon: Navigation,
      hexColor: '#0D9488',
      textColor: 'text-[#0D9488]',
      hoverBg: 'hover:bg-[#0D9488]/10',
      activeBg: 'bg-[#F0FDFA] text-[#0D9488] border-[#99F6E4]',
      hoverBorderLeft: 'hover:border-l-[#0D9488]',
      items: [
        { to: '/transporte/roteiro', label: 'Roteiro de Entrega (Mapa)', icon: Navigation },
      ]
    },
    {
      // 6. CENTRAL DE CARGAS — botão individual
      label: 'Cargas',
      icon: Package,
      hexColor: '#D97706',
      textColor: 'text-[#D97706]',
      hoverBg: 'hover:bg-[#D97706]/10',
      activeBg: 'bg-[#FFFBEB] text-[#D97706] border-[#FDE68A]',
      hoverBorderLeft: 'hover:border-l-[#D97706]',
      items: [
        { to: '/transporte/cargas', label: 'Central de Cargas (NF-e)', icon: Package },
      ]
    },
    {
      // 7. RELATÓRIOS — botão individual
      label: 'Relatórios',
      icon: BarChart3,
      hexColor: '#0D9488',
      textColor: 'text-[#0D9488]',
      hoverBg: 'hover:bg-[#0D9488]/10',
      activeBg: 'bg-[#F0FDFA] text-[#0D9488] border-[#99F6E4]',
      hoverBorderLeft: 'hover:border-l-[#0D9488]',
      items: [
        { to: '/transporte/relatorios', label: 'Desempenho Fiscal', icon: BarChart3 },
        { to: '/transporte/relatorios?tipo=cte', label: 'Relatório de CT-e', icon: FileText },
        { to: '/transporte/relatorios?tipo=mdfe', label: 'Relatório de MDF-e', icon: Truck },
      ]
    },
    {
      // 8. CONFIGURAÇÕES — botão individual
      label: 'Configurações',
      icon: Settings,
      hexColor: '#64748B',
      textColor: 'text-[#64748B]',
      hoverBg: 'hover:bg-[#64748B]/10',
      activeBg: 'bg-slate-100 text-[#475569] border-[#CBD5E1]',
      hoverBorderLeft: 'hover:border-l-[#64748B]',
      items: [
        { to: '/transporte/empresa', label: 'Dados da Empresa (Emitente Fiscal)', icon: Building2 },
        { to: '/transporte/config', label: 'Regras Fiscais & UF', icon: Settings },
        { to: '/transporte/campos', label: 'Campos Dinâmicos', icon: BrainCircuit },
        { to: '/transporte/certificados', label: 'Certificados Digitais A1', icon: Key },
        { to: '/usuarios', label: 'Usuários & Permissões', icon: Shield },
      ]
    }
  ]

  return (
    <>
      {/* 3. NAVBAR (BARRA PRINCIPAL) - Altura: 74px, Fundo: #ffffff, Sombra elegante e proporcional */}
      <header className="h-[74px] bg-white border-b border-[#e8ecf1] sticky top-0 z-50 flex items-center px-3 sm:px-4 xl:px-5 shadow-[0_4px_20px_rgba(0,0,0,0.05),0_1px_3px_rgba(0,0,0,0.03)] transition-all">
        
        {/* Hambúrguer Menu (Tablet e Mobile) — no desktop o menu lateral fixo assume */}
        <button
          className="lg:hidden p-1.5 -ml-1 text-slate-600 hover:bg-slate-100 rounded-xl mr-0.5 transition-colors"
          onClick={() => { setMobileMenuOpen(true); onOpenSidebar?.(); }}
          aria-label="Abrir menu"
        >
          <Menu size={22} />
        </button>

        {/* 1. LOGO COLISEU TRANSPORTE — COMPACTO */}
        <div className="flex items-center shrink-0">
          <Link
            to="/"
            className="flex items-center group transition-transform duration-250 hover:scale-105"
          >
            <img
              src="/assets/logo-coliseu-transporte-compacto.svg"
              alt="Coliseu Transporte"
              className="h-[34px] lg:h-[38px] w-auto object-contain"
            />
          </Link>

          <div className="hidden lg:block h-[30px] w-px bg-[#e2e8f0] mx-2 xl:mx-2.5" />
        </div>

        {/* 2. BOTÕES DO MENU DE NAVEGAÇÃO — COMPACTOS E RESPONSIVOS */}
        <nav id="desktop-nav" className="hidden lg:flex items-center gap-0.5 xl:gap-1 relative mr-auto min-w-0">
          {navigationGroups.map((group) => {
            const GroupIcon = group.icon
            const isGroupActive = group.items.some(item => {
              const basePath = item.to.split('?')[0]
              return location.pathname === basePath || (basePath !== '/' && location.pathname.startsWith(basePath))
            })
            const isOpen = openDropdown === group.label

            return (
              <div key={group.label} className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if ((group as any).to) {
                      navigate((group as any).to)
                      setOpenDropdown(null)
                    } else {
                      setOpenDropdown(isOpen ? null : group.label)
                    }
                  }}
                  title={group.label}
                  className={clsx(
                    'group relative flex items-center gap-1.5 px-2 xl:px-2.5 py-1.5 rounded-lg text-[12.5px] font-semibold tracking-tight transition-all duration-200 cursor-pointer select-none border whitespace-nowrap',
                    isGroupActive
                      ? 'bg-white border shadow-md -translate-y-0.5'
                      : isOpen
                      ? 'bg-white text-slate-900 border-slate-300 shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:text-slate-900 hover:border-slate-300 hover:shadow-sm hover:-translate-y-0.5'
                  )}
                  style={isGroupActive ? {
                    color: group.hexColor,
                    borderColor: `${group.hexColor}55`,
                    boxShadow: `0 4px 12px -2px ${group.hexColor}33`
                  } : undefined}
                >
                  {/* Ícone colorido em um badge suave */}
                  <div
                    className="p-0.5 rounded shrink-0 flex items-center justify-center transition-transform duration-200 group-hover:scale-110"
                    style={{ backgroundColor: `${group.hexColor}18`, color: group.hexColor }}
                  >
                    <GroupIcon size={14} />
                  </div>

                  <span className="whitespace-nowrap">{group.label}</span>

                  {!(group as any).to && (
                    <ChevronDown
                      size={11}
                      className={clsx(
                        'transition-all duration-200 opacity-40 group-hover:opacity-100',
                        (isOpen || isGroupActive) && 'rotate-180 opacity-100'
                      )}
                    />
                  )}
                </button>

                {/* Dropdown Menu dos Módulos Flutuante 3D Moderno */}
                {isOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpenDropdown(null)} />
                    <div className="absolute left-0 mt-2 min-w-[280px] max-w-[320px] max-h-[calc(100vh-100px)] overflow-y-auto bg-white/95 dark:bg-slate-900/95 border border-slate-200/80 dark:border-slate-700/80 shadow-2xl backdrop-blur-xl rounded-2xl z-50 p-2 text-left space-y-0.5 text-slate-900 dark:text-slate-100 animate-in fade-in zoom-in-95 duration-150">
                      {group.items.map((item) => {
                        const ItemIcon = item.icon
                        const isItemActive = location.pathname === item.to.split('?')[0] && (!item.to.includes('tab=') || location.search.includes(item.to.split('?')[1] || ''))
                        return (
                          <Link
                            key={item.to}
                            to={item.to}
                            onClick={() => setOpenDropdown(null)}
                            className={clsx(
                              'flex items-center justify-between px-3 py-2 rounded-xl text-[12.5px] font-semibold transition-all duration-150 group/item',
                              isItemActive
                                ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300 border border-brand-500/30 font-bold shadow-xs'
                                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white'
                            )}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className="p-1.5 rounded-lg shrink-0 flex items-center justify-center transition-transform duration-150 group-hover/item:scale-110"
                                style={{ backgroundColor: `${group.hexColor}25`, color: group.hexColor }}
                              >
                                <ItemIcon size={15} />
                              </div>
                              <span className="truncate">{item.label}</span>
                            </div>
                            <ChevronRight size={13} className="opacity-30 group-hover/item:opacity-100 transition-opacity text-slate-400 shrink-0 ml-1" />
                          </Link>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </nav>

        {/* ÁREA DA DIREITA: USUÁRIO (compacta, sem sobrepor o menu) */}
        <div className="flex items-center gap-1.5 shrink-0 ml-1">

          {/* 5. USUÁRIO (avatar compacto + nome) */}
          <div className="relative">
            <button
              onClick={() => setProfileDropdownOpen((o) => !o)}
              className="flex items-center gap-1.5 p-[3px_10px_3px_3px] bg-white border border-[#e2e8f0] rounded-full hover:border-[#cbd5e1] hover:shadow-xs transition-all duration-250 cursor-pointer"
            >
              {/* Avatar 30px */}
              <div className="w-[30px] h-[30px] rounded-full bg-gradient-to-tr from-[#1e3a8a] to-[#1e40af] text-white flex items-center justify-center text-xs font-black shadow-[0_2px_6px_rgba(30,58,138,0.3)] shrink-0">
                {user?.nome?.[0]?.toUpperCase() || 'U'}
              </div>

              {/* Nome do usuário */}
              <span className="text-xs font-extrabold text-slate-800 hidden xl:inline truncate max-w-[90px]">
                {user?.nome || 'Usuário'}
              </span>

              <ChevronDown size={11} className="text-[#94a3b8] opacity-70 hidden xl:block" />
            </button>

            {profileDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setProfileDropdownOpen(false)} />
                <div className="absolute right-0 mt-2 w-56 bg-white border border-[#e2e8f0] rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.08)] z-50 py-2 animate-scale-up text-left">
                  <div className="px-4 py-2 border-b border-[#e2e8f0]">
                    <div className="text-sm font-bold text-[#334155] truncate">{user?.nome}</div>
                    <div className="text-[11px] text-slate-500 truncate mt-0.5">{user?.email}</div>
                  </div>
                  <div className="py-1">
                    <Link
                      to="/config-integracoes"
                      className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-[#f8fafc] flex items-center gap-2"
                      onClick={() => setProfileDropdownOpen(false)}
                    >
                      <Settings size={14} className="text-slate-500" />
                      Configurações
                    </Link>
                    <button
                      className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-[#f8fafc] flex items-center gap-2 cursor-pointer"
                      onClick={() => {
                        setProfileDropdownOpen(false)
                        setIsModalSenhaOpen(true)
                      }}
                    >
                      <Key size={14} className="text-indigo-500" />
                      Alterar Senha
                    </button>
                    <button
                      className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-[#f8fafc] flex items-center gap-2 cursor-pointer"
                      onClick={() => {
                        setProfileDropdownOpen(false)
                        alert('Manual e central de ajuda em breve!')
                      }}
                    >
                      <HelpCircle size={14} className="text-slate-500" />
                      Ajuda & Suporte
                    </button>
                  </div>
                  <div className="border-t border-[#e2e8f0] pt-1 mt-1">
                    <button
                      onClick={() => {
                        setProfileDropdownOpen(false)
                        logout()
                        window.location.href = '/login'
                      }}
                      className="w-full text-left px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer"
                    >
                      <LogOut size={14} />
                      Sair do Sistema
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* MODAL DE ALTERAÇÃO DE SENHA */}
          <ModalAlterarSenha
            isOpen={isModalSenhaOpen || Boolean(user?.precisa_alterar_senha)}
            isForced={Boolean(user?.precisa_alterar_senha)}
            onClose={() => setIsModalSenhaOpen(false)}
          />

          {/* 6. BOTÃO DE LOGOUT (QUADRADO 40x40px COM HOVER VERMELHO) */}
          <button
            onClick={() => {
              logout()
              window.location.href = '/login'
            }}
            className="w-[40px] h-[40px] rounded-[12px] border border-transparent hover:border-[#fecaca] hover:bg-[#fef2f2] text-[#cbd5e1] hover:text-[#ef4444] flex items-center justify-center transition-all duration-250 cursor-pointer"
            title="Sair do Sistema"
          >
            <LogOut size={18} />
          </button>

        </div>

      </header>

      {/* Drawer Responsivo (Mobile Menu) */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-slate-900/50 z-40 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="fixed top-0 left-0 bottom-0 w-64 bg-white border-r border-[#e2e8f0] z-50 p-5 flex flex-col justify-between shadow-xl animate-slide-in">
            <div className="space-y-6">
              {/* Top Mobile Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <img
                    src="/assets/logo-coliseu-transporte-compacto.svg"
                    alt="Coliseu Transporte"
                    className="h-7 w-auto object-contain"
                  />
                </div>
                <button
                  className="p-1 text-slate-500 hover:bg-slate-100 rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Navigation Items */}
              <nav className="flex flex-col gap-1 overflow-y-auto max-h-[60vh] pr-1 text-left">
                {navigationGroups.map((group) => {
                  const GroupIcon = group.icon
                  const isExpanded = !!mobileExpanded[group.label]
                  const isGroupActive = group.items.some(item => {
                    const basePath = item.to.split('?')[0]
                    return location.pathname === basePath || (basePath !== '/' && location.pathname.startsWith(basePath))
                  })

                  return (
                    <div key={group.label} className="border-b border-[#e2e8f0]/60 last:border-0 pb-1">
                      <button
                        onClick={() => setMobileExpanded(prev => ({ ...prev, [group.label]: !prev[group.label] }))}
                        className={clsx(
                          'w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer',
                          isGroupActive
                            ? 'bg-indigo-50 text-indigo-600'
                            : 'text-slate-700 hover:bg-slate-50'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <GroupIcon size={16} style={{ color: group.hexColor }} className="shrink-0" />
                          <span>{group.label}</span>
                        </div>
                        <ChevronDown size={12} className={clsx('transition-transform duration-200 opacity-60', isExpanded && 'rotate-180')} />
                      </button>

                      {isExpanded && (
                        <div className="pl-6 mt-1 flex flex-col gap-1 border-l border-slate-200 ml-5">
                          {group.items.map((item) => {
                            const ItemIcon = item.icon
                            const isItemActive = location.pathname === item.to.split('?')[0]
                            return (
                              <Link
                                key={item.to}
                                to={item.to}
                                onClick={() => setMobileMenuOpen(false)}
                                className={clsx(
                                  'flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all duration-200',
                                  isItemActive
                                    ? 'bg-indigo-50 border-l-2 border-indigo-600 text-indigo-600 font-bold'
                                    : 'text-slate-600 hover:bg-slate-50'
                                )}
                              >
                                <ItemIcon size={13} className="shrink-0 opacity-80" />
                                <span>{item.label}</span>
                              </Link>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </nav>
            </div>

            {/* User Footer Mobile */}
            <div className="border-t border-[#e2e8f0] pt-4 mt-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#3b82f6] to-[#6366f1] text-white flex items-center justify-center text-xs font-semibold shadow-xs">
                  {user?.nome?.[0]?.toUpperCase() || 'U'}
                </div>
                <div className="text-left text-xs">
                  <div className="font-bold text-slate-800 leading-tight truncate max-w-[120px]">{user?.nome}</div>
                  <div className="text-[10px] text-slate-500 leading-tight capitalize">{user?.role}</div>
                </div>
              </div>
              <button
                onClick={() => {
                  setMobileMenuOpen(false)
                  logout()
                  window.location.href = '/login'
                }}
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Sair"
              >
                <LogOut size={16} />
              </button>
            </div>
          </aside>
        </>
      )}
    </>
  )
}
