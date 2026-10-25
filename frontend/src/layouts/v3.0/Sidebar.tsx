import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, Package, FileText,
  Layers, Settings, ChevronDown, ChevronUp,
  LogOut, Shield, X, BarChart3, Truck, BrainCircuit,
  Route, ClipboardList, Building2, Navigation, KeyRound
} from 'lucide-react'
import clsx from 'clsx'
import { useAuthStore } from '../../store/authStore'
import { useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
}

export default function Sidebar({ open, onClose }: Props) {
  // Collapsible groups state
  const [transporteOpen, setTransporteOpen] = useState(true)
  const [cadastrosOpen, setCadastrosOpen] = useState(true)
  const [configOpen, setConfigOpen] = useState(false)
  const [biOpen, setBiOpen] = useState(false)

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

          {/* Dashboard */}
          {renderLink('/', 'Cockpit de Transporte', LayoutDashboard, true)}

          {/* Grupo: Transporte (CT-e / MDF-e) */}
          {renderGroupHeader('Transporte', Truck, transporteOpen, () => setTransporteOpen(!transporteOpen))}
          {transporteOpen && (
            <div className="space-y-0.5 pl-1">
              {renderLink('/transporte/cargas', 'Central de Cargas (NF-e)', Package)}
              {renderLink('/transporte/ctes', 'Conhecimentos (CT-e)', FileText)}
              {renderLink('/transporte/mdfes', 'Manifestos (MDF-e)', Truck)}
              {renderLink('/transporte/roteiro', 'Roteiro de Entrega (Mapa)', Navigation)}
              {renderLink('/transporte/contratos', 'Contratos & CIOT', Route)}
            </div>
          )}

          {/* Grupo: Cadastros (ERP Coliseu) */}
          {renderGroupHeader('Cadastros', ClipboardList, cadastrosOpen, () => setCadastrosOpen(!cadastrosOpen))}
          {cadastrosOpen && (
            <div className="space-y-0.5 pl-1">
              {renderLink('/clientes', 'Clientes (ERP Coliseu)', Users)}
              {renderLink('/regioes', 'Regiões & Cidades', Route)}
              {renderLink('/transporte/frota', 'Frota & Condutores', Layers)}
            </div>
          )}

          {/* Grupo: Relatórios Fiscais */}
          {renderGroupHeader('Relatórios', BarChart3, biOpen, () => setBiOpen(!biOpen))}
          {biOpen && (
            <div className="space-y-0.5 pl-1">
              {renderLink('/transporte/relatorios', 'Desempenho Fiscal', BarChart3)}
              {renderLink('/transporte/relatorios?tipo=cte', 'Detalhado de CT-e', FileText)}
              {renderLink('/transporte/relatorios?tipo=mdfe', 'Detalhado de MDF-e', Truck)}
            </div>
          )}

          {/* Grupo: Configurações */}
          {renderGroupHeader('Configurações', Settings, configOpen, () => setConfigOpen(!configOpen))}
          {configOpen && (
            <div className="space-y-0.5 pl-1">
              {renderLink('/transporte/empresa', 'Dados da Empresa (Emitente)', Building2)}
              {renderLink('/transporte/config', 'Regras Fiscais por UF', Settings)}
              {renderLink('/transporte/campos', 'Campos Dinâmicos', BrainCircuit)}
              {renderLink('/transporte/certificados', 'Certificados Digitais A1', KeyRound)}
              {renderLink('/usuarios', 'Usuários & Permissões', Shield)}
            </div>
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
