import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Menu, Search, X, LogOut, ChevronDown, User, HelpCircle, Package, Truck, FileStack, BadgeCheck, Navigation } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import ModalAlterarSenha from '../../components/ModalAlterarSenha'
import clsx from 'clsx'

interface Props {
  onOpenSidebar?: () => void
  onToggleSidebar?: () => void
  sidebarCollapsed?: boolean
}

/**
 * Barra superior enxuta do Coliseu Transporte.
 * Todo o menu de navegação vive no menu lateral — aqui ficam apenas
 * busca global, atalhos rápidos de emissão e ações do usuário.
 */
export default function Header({ onOpenSidebar, onToggleSidebar, sidebarCollapsed }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const [profileOpen, setProfileOpen] = useState(false)
  const [modalSenha, setModalSenha] = useState(false)
  const [busca, setBusca] = useState('')
  const [buscaAberta, setBuscaAberta] = useState(false)
  const buscaRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (buscaAberta) buscaRef.current?.focus()
  }, [buscaAberta])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setBuscaAberta(true)
      }
      if (e.key === 'Escape') {
        setBuscaAberta(false)
        setBusca('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const resultados = [
    { to: '/transporte/cargas', label: 'Central de Cargas (NF-e do ERP)', icon: Package },
    { to: '/transporte/cte/novo', label: 'Emitir CT-e', icon: FileStack },
    { to: '/transporte/mdfe/novo', label: 'Emitir MDF-e', icon: Truck },
    { to: '/transporte/documentos', label: 'Documentos Emitidos', icon: FileStack },
    { to: '/transporte/roteiro', label: 'Roteiro de Entrega', icon: Navigation },
    { to: '/transporte/ciot', label: 'Consultar CIOT', icon: BadgeCheck }
  ].filter(r => !busca || r.label.toLowerCase().includes(busca.toLowerCase()))

  return (
    <>
      <header className="h-[62px] bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/70 dark:border-slate-700/60 sticky top-0 z-40 flex items-center gap-3 px-3 sm:px-4 transition-all">
        {/* Botão de menu (mobile/tablet) */}
        <button
          className="lg:hidden p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          onClick={onOpenSidebar}
          aria-label="Abrir menu"
        >
          <Menu size={20} />
        </button>

        {/* Recolher / expandir menu (desktop) */}
        <button
          className="hidden lg:flex p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 rounded-xl transition-colors"
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          <Menu size={18} />
        </button>

        {/* Busca global */}
        <div className="relative flex-1 max-w-lg">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            ref={buscaRef}
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            onFocus={() => setBuscaAberta(true)}
            placeholder="Buscar: CT-e, MDF-e, cargas, CIOT, rota..."
            className="w-full pl-9 pr-16 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400 transition-all"
          />
          {!buscaAberta && (
            <kbd className="hidden sm:block absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600 text-[10px] font-sans text-slate-400 bg-white dark:bg-slate-800">
              ⌘K
            </kbd>
          )}
          {buscaAberta && busca && (
            <button
              onClick={() => { setBusca(''); setBuscaAberta(false) }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Resultados da busca */}
          {buscaAberta && busca && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setBuscaAberta(false)} />
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                {resultados.length === 0 ? (
                  <p className="px-4 py-5 text-xs text-slate-400 text-center">Nenhum resultado para "{busca}"</p>
                ) : (
                  resultados.map(r => {
                    const Icon = r.icon
                    return (
                      <button
                        key={r.to}
                        onClick={() => { navigate(r.to); setBusca(''); setBuscaAberta(false) }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                        {r.label}
                      </button>
                    )
                  })
                )}
              </div>
            </>
          )}
        </div>

        {/* Atalhos rápidos de emissão */}
        <div className="hidden xl:flex items-center gap-1.5">
          <button
            onClick={() => navigate('/transporte/cte/novo')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-800/60 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
          >
            <FileStack className="w-3.5 h-3.5" />
            CT-e
          </button>
          <button
            onClick={() => navigate('/transporte/mdfe/novo')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
          >
            <Truck className="w-3.5 h-3.5" />
            MDF-e
          </button>
        </div>

        {/* Ações do usuário */}
        <div className="flex items-center gap-1.5 ml-auto xl:ml-0">
          <button
            onClick={() => setModalSenha(true)}
            className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 transition-colors"
            title="Alterar senha"
          >
            <HelpCircle className="w-[18px] h-[18px]" />
          </button>

          <div className="relative">
            <button
              onClick={() => setProfileOpen(o => !o)}
              className="flex items-center gap-2 p-[3px_10px_3px_3px] bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 rounded-full hover:border-slate-300 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              <div className="w-[30px] h-[30px] rounded-full bg-gradient-to-br from-[#0B3B66] to-[#0B63A5] text-white flex items-center justify-center text-xs font-black shrink-0">
                {user?.nome?.[0]?.toUpperCase() || 'U'}
              </div>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-100 hidden lg:inline max-w-[110px] truncate">
                {user?.nome || 'Usuário'}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400 hidden lg:block" />
            </button>

            {profileOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                <div className="absolute right-0 mt-2 w-60 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 rounded-2xl shadow-2xl z-50 py-2 animate-in fade-in zoom-in-95 duration-150 text-left">
                  <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
                    <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{user?.nome}</div>
                    <div className="text-[11px] text-slate-500 truncate mt-0.5">{user?.email}</div>
                  </div>
                  <button
                    onClick={() => { setProfileOpen(false); setModalSenha(true) }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <User className="w-4 h-4 text-slate-400" />
                    Minha conta
                  </button>
                  <button
                    onClick={async () => { await logout() }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sair do sistema
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <ModalAlterarSenha isOpen={modalSenha} onClose={() => setModalSenha(false)} />
    </>
  )
}
