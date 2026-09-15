import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, Package, Trophy, FileText,
  Layers, Wallet, Megaphone, Settings, ChevronDown, ChevronUp,
  LogOut, Shield, X, HelpCircle, BarChart3, ShoppingCart, Truck, Map, BrainCircuit, RefreshCw
} from 'lucide-react'
import clsx from 'clsx'
import { useAuthStore } from '../../store/authStore'
import { useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
}

export default function Sidebar({ open, onClose }: Props) {
  const user = useAuthStore((s) => s.user)
  
  // Collapsible groups state
  const [cadastrosOpen, setCadastrosOpen] = useState(true)
  const [crmOpen, setCrmOpen] = useState(true)
  const [faturamentoOpen, setFaturamentoOpen] = useState(true)
  const [cobrancaOpen, setCobrancaOpen] = useState(true)
  const [financeiroOpen, setFinanceiroOpen] = useState(true)
  const [marketingOpen, setMarketingOpen] = useState(true)
  const [configOpen, setConfigOpen] = useState(false)
  const [biOpen, setBiOpen] = useState(false)

  // Auth permissions helper para menus e submenus
  const hasAccess = (moduleId: string, submenuId?: string) => {
    if (!user) return false
    if (user.role === 'master' || (user.grupo_nome && user.grupo_nome.toLowerCase() === 'master')) return true

    // Validação por Grupos de Acesso Estruturados
    if (user.permissoes_menus && typeof user.permissoes_menus === 'object' && Object.keys(user.permissoes_menus).length > 0) {
      const moduleConf = user.permissoes_menus[moduleId]
      if (!moduleConf || moduleConf.acesso === false) return false
      if (submenuId && moduleConf.submenus && moduleConf.submenus[submenuId] === false) return false
      return true
    }

    // Se possui um grupo de acesso associado mas permissoes_menus está vazio/bloqueado, negar acesso
    if (user.grupo_id || user.grupo_nome) {
      return false
    }

    // Fallback legado apenas se o usuário não possuir grupo associado
    if (Array.isArray(user.permissions)) {
      return user.permissions.includes(moduleId)
    }

    return user.role === 'admin'
  }

  const renderGroupHeader = (label: string, icon: any, isOpen: boolean, toggleFn: () => void) => {
    const Icon = icon
    return (
      <button
        onClick={toggleFn}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-text-secondary hover:bg-bg-secondary hover:text-text-primary transition-all duration-300 mt-3 mb-1"
      >
        <div className="flex items-center gap-2">
          <Icon size={14} className="opacity-80" />
          <span className="uppercase tracking-wider">{label}</span>
        </div>
        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
    )
  }

  const renderLink = (to: string, label: string, icon: any, exact = false) => {
    const Icon = icon
    return (
      <NavLink
        key={to}
        to={to}
        end={exact}
        onClick={onClose}
        className={({ isActive }) =>
          clsx(
            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-300 mb-0.5 border-l-2',
            isActive
              ? 'bg-brand-500/10 border-brand-500 text-brand-500 font-semibold'
              : 'border-transparent text-text-secondary hover:bg-bg-secondary hover:text-text-primary'
          )
        }
      >
        <Icon size={16} className="flex-shrink-0" />
        <span className="truncate">{label}</span>
      </NavLink>
    )
  }

  return (
    <>
      {/* Backdrop mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-slate-900/60 z-30 lg:hidden backdrop-blur-sm transition-opacity duration-300"
          onClick={onClose}
        />
      )}
      <aside
        className={clsx(
          'fixed lg:sticky top-0 left-0 h-screen w-64 bg-bg-primary/95 backdrop-blur-xl border-r border-divider z-40',
          'transform transition-transform duration-300 ease-out lg:translate-x-0',
          'flex flex-col shadow-card lg:shadow-none',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Logo */}
        <div className="h-20 px-5 flex items-center justify-between border-b border-divider bg-transparent">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 bg-brand-500 rounded-md flex items-center justify-center text-white font-extrabold text-lg shadow-sm">
              N
            </div>
            <div>
              <div className="font-bold text-text-primary tracking-tight leading-none text-base">NEXOS</div>
              <div className="text-[10px] text-text-secondary tracking-widest mt-0.5 uppercase">Financeiro</div>
            </div>
          </div>
          <button
            className="lg:hidden p-1.5 text-text-secondary hover:bg-bg-secondary rounded"
            onClick={onClose}
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 flex flex-col space-y-1">
          
          {/* Dashboard Executivo */}
          {renderLink('/', 'Dashboard Executivo', LayoutDashboard, true)}

          {/* Grupo: Cadastros */}
          {(hasAccess('cadastros') || hasAccess('clientes')) && (
            <>
              {renderGroupHeader('Cadastros', Users, cadastrosOpen, () => setCadastrosOpen(!cadastrosOpen))}
              {cadastrosOpen && (
                <div className="space-y-0.5 pl-1">
                  {hasAccess('cadastros', 'clientes') && renderLink('/clientes', 'Clientes', Users)}
                  {hasAccess('cadastros', 'produtos') && renderLink('/produtos', 'Catálogo Comercial', Package)}
                </div>
              )}
            </>
          )}

          {/* Grupo: CRM e Vendas */}
          {(hasAccess('crm') || hasAccess('contratos')) && (
            <>
              {renderGroupHeader('CRM e Vendas', Trophy, crmOpen, () => setCrmOpen(!crmOpen))}
              {crmOpen && (
                <div className="space-y-0.5 pl-1">
                  {hasAccess('crm', 'kanban') && renderLink('/crm', 'Kanban de Vendas', Trophy)}
                  {hasAccess('crm', 'contratos') && renderLink('/contratos', 'Gestão de Contratos', FileText)}
                  {hasAccess('crm', 'pedidos') && renderLink('/pedidos', 'Pedidos Faturados', FileText)}
                </div>
              )}
            </>
          )}

          {/* Grupo: Cobrança */}
          {hasAccess('cobranca') && (
            <>
              {renderGroupHeader('Cobrança', Layers, cobrancaOpen, () => setCobrancaOpen(!cobrancaOpen))}
              {cobrancaOpen && (
                <div className="space-y-0.5 pl-1">
                  {hasAccess('cobranca', 'kanban') && renderLink('/kanban-cobranca', 'Kanban Operacional', Layers)}
                  {hasAccess('cobranca', 'regua') && renderLink('/regua-cobranca', 'Régua de Cobrança', HelpCircle)}
                  {hasAccess('cobranca', 'motores') && renderLink('/motores-cobranca', 'Motores de Cobrança', RefreshCw)}
                </div>
              )}
            </>
          )}

          {/* Grupo: Financeiro */}
          {hasAccess('financeiro') && (
            <>
              {renderGroupHeader('Financeiro', Wallet, financeiroOpen, () => setFinanceiroOpen(!financeiroOpen))}
              {financeiroOpen && (
                <div className="space-y-0.5 pl-1">
                  {hasAccess('financeiro', 'fluxo_caixa') && renderLink('/fluxo-caixa', 'Tesouraria & Caixa', Wallet)}
                </div>
              )}
            </>
          )}

          {/* Grupo: Campanhas e Marketing */}
          {hasAccess('marketing') && (
            <>
              {renderGroupHeader('Marketing', Megaphone, marketingOpen, () => setMarketingOpen(!marketingOpen))}
              {marketingOpen && (
                <div className="space-y-0.5 pl-1">
                  {hasAccess('marketing', 'massa') && renderLink('/marketing', 'Marketing em Massa', Megaphone)}
                  {hasAccess('marketing', 'templates') && renderLink('/templates', 'Templates / Acervos', FileText)}
                </div>
              )}
            </>
          )}

          {/* Grupo: Business Intelligence */}
          {hasAccess('bi') && (
            <>
              {renderGroupHeader('Business Intel', BarChart3, biOpen, () => setBiOpen(!biOpen))}
              {biOpen && (
                <div className="space-y-0.5 pl-1">
                  {renderLink('/bi/sales', 'Inteligência de Vendas', BarChart3)}
                  {renderLink('/bi/hub', 'Hub de Vendas', ShoppingCart)}
                  {renderLink('/bi/supplier', 'Hub do Fornecedor', Truck)}
                  {renderLink('/bi/abc', 'Gestão de Inventário', Package)}
                  {renderLink('/bi/finance', 'Financeiro BI', Wallet)}
                  {renderLink('/bi/heatmap', 'Mapa de Calor', Map)}
                </div>
              )}
            </>
          )}

          {/* Grupo: Configurações */}
          {(hasAccess('configuracoes') || hasAccess('usuarios')) && (
            <>
              {renderGroupHeader('Configurações', Settings, configOpen, () => setConfigOpen(!configOpen))}
              {configOpen && (
                <div className="space-y-0.5 pl-1">
                  {hasAccess('configuracoes', 'integracoes') && renderLink('/config-integracoes', 'Chaves e Integrações', Settings)}
                  {(hasAccess('configuracoes', 'usuarios') || hasAccess('configuracoes', 'grupos')) && renderLink('/usuarios', 'Usuários & Perfis', Shield)}
                </div>
              )}
            </>
          )}

        </nav>

        {/* Footer com Sair */}
        <div className="px-5 py-4 border-t border-divider text-[11px] text-text-secondary flex items-center justify-between bg-bg-secondary/40">
          <div>
            <div className="font-bold text-text-primary text-xs">NEXOS SaaS</div>
            <div className="text-[10px] opacity-75">v3.0 Reconstruction</div>
          </div>
          <button
            onClick={() => {
              useAuthStore.getState().logout()
              window.location.href = '/login'
            }}
            className="p-2 text-text-secondary hover:text-danger hover:bg-danger/10 rounded-lg transition-colors duration-300"
            title="Sair do sistema"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
    </>
  )
}
