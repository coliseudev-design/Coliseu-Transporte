import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { useThemeStore } from './store/themeStore'
import api from './services/api'

import Login from './pages/Login'
import Register from './pages/Register'
import DashboardLayout from './components/DashboardLayout'

import Home from './pages/Home'
import FinanceiroEmDesenvolvimento from './pages/FinanceiroEmDesenvolvimento'
import FluxoCaixa from './pages/Financeiro' // Usaremos a mesma página por enquanto ou podemos separar futuramente
import Comissoes from './pages/Comissoes'
import Ranking from './pages/Ranking'
import Estatisticas from './pages/Estatisticas'
import InteligenciaDashboard from './pages/inteligencia/InteligenciaDashboard'
import Produtos from './pages/Produtos'
import Clientes from './pages/Clientes'
import Estoque from './pages/Estoque'
import Vendas from './pages/Vendas'
import Usuarios from './pages/Usuarios'
import GerenciaFinanceiro from './pages/GerenciaFinanceiro'
import ContasBancarias from './pages/ContasBancarias'

import KanbanCRM from './pages/KanbanCRM'
import Contratos from './pages/Contratos'
import Pedidos from './pages/Pedidos'
import KanbanCobranca from './pages/KanbanCobranca'
import ReguaCobranca from './pages/ReguaCobranca'
import Acervos from './pages/Acervos'
import MarketingMassa from './pages/MarketingMassa'
import ConfigIntegracoes from './pages/ConfigIntegracoes'
import CadastrosPage from './pages/CadastrosPage'
import MotoresCobranca from './pages/MotoresCobranca'

// BI Modules
import BiDashboard from './pages/bi/BiDashboard'
import SalesIntelligenceDashboard from './pages/bi/SalesIntelligenceDashboard'
import SalesHubDashboard from './pages/bi/SalesHubDashboard'
import ABCAnalysisDashboard from './pages/bi/ABCAnalysisDashboard'
import FinancialIntelligenceDashboard from './pages/bi/FinancialIntelligenceDashboard'
import Radar360Dashboard from './pages/bi/Radar360Dashboard'
import ComparativeAnalysisDashboard from './pages/bi/ComparativeAnalysisDashboard'
import CustomerAnalyticsDashboard from './pages/bi/CustomerAnalyticsDashboard'
import GoalsPerformanceDashboard from './pages/bi/GoalsPerformanceDashboard'
import SupplierAnalyticsDashboard from './pages/bi/SupplierAnalyticsDashboard'
import HeatmapDashboard from './pages/bi/HeatmapDashboard'
import AIInsightsDashboard from './pages/bi/AIInsightsDashboard'

function Protected({ children }: { children: JSX.Element }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  return children
}

function RequirePermission({ module, submenu, children }: { module?: string; submenu?: string; children: JSX.Element }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'master' || (user.grupo_nome && user.grupo_nome.toLowerCase() === 'master')) {
    return children
  }
  if (module && user.permissoes_menus && typeof user.permissoes_menus === 'object' && Object.keys(user.permissoes_menus).length > 0) {
    const moduleConf = user.permissoes_menus[module]
    if (!moduleConf || moduleConf.acesso === false) {
      return <Navigate to="/fluxo-caixa" replace />
    }
    if (submenu && moduleConf.submenus && moduleConf.submenus[submenu] === false) {
      return <Navigate to="/fluxo-caixa" replace />
    }
  } else if (module && (user.grupo_id || user.grupo_nome)) {
    return <Navigate to="/fluxo-caixa" replace />
  }
  return children
}

export default function App() {
  const init = useAuthStore((s) => s.init)
  const initTheme = useThemeStore((s) => s.initTheme)
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    init()
    initTheme()
  }, [init, initTheme])

  // Busca dados e permissões atualizadas do usuário logado via GET /api/auth/me
  useEffect(() => {
    if (token) {
      api.get('/auth/me').then(res => {
        if (res.data?.user) {
          useAuthStore.setState({ user: res.data.user })
          localStorage.setItem('coliseu_user', JSON.stringify(res.data.user))
        }
      }).catch(() => {})
    }
  }, [token])

  // Gerencia o ciclo de vida do Web Worker de sincronização reativamente com o token de autenticação
  useEffect(() => {
    if (!token || typeof Worker === 'undefined') return

    let w: Worker | null = null
    try {
      w = new Worker(new URL('./workers/syncWorker.ts', import.meta.url), { type: 'module' })
      w.postMessage({ type: 'INIT', token })
    } catch (err) {
      console.error('[SyncWorker] Erro ao inicializar worker:', err)
    }

    return () => {
      if (w) {
        w.postMessage({ type: 'STOP' })
        w.terminate()
      }
    }
  }, [token])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/"
        element={
          <Protected>
            <DashboardLayout />
          </Protected>
        }
      >
        <Route index element={<Home />} />
        <Route path="financeiro" element={<FinanceiroEmDesenvolvimento />} />
        <Route path="fluxo-caixa" element={<FluxoCaixa />} />
        <Route path="estoque" element={<Estoque />} />
        <Route path="comissoes" element={<Comissoes />} />
        <Route path="ranking" element={<Ranking />} />
        <Route path="estatisticas" element={<Estatisticas />} />
        <Route path="inteligencia" element={<InteligenciaDashboard />} />
        <Route path="produtos" element={<Produtos />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="vendas" element={<Vendas />} />
        <Route path="usuarios" element={<RequirePermission module="configuracoes" submenu="usuarios"><Usuarios /></RequirePermission>} />
        <Route path="bancos" element={<ContasBancarias />} />
        <Route path="gerencia-financeiro" element={<RequirePermission module="gerencia" submenu="gerencia_financeira"><GerenciaFinanceiro /></RequirePermission>} />
        
        {/* Novas Rotas NEXOS */}
        <Route path="crm" element={<RequirePermission module="crm"><KanbanCRM /></RequirePermission>} />
        <Route path="contratos" element={<RequirePermission module="crm" submenu="contratos"><Contratos /></RequirePermission>} />
        <Route path="pedidos" element={<RequirePermission module="crm" submenu="pedidos"><Pedidos /></RequirePermission>} />
        <Route path="kanban-cobranca" element={<RequirePermission module="cobranca" submenu="kanban"><KanbanCobranca /></RequirePermission>} />
        <Route path="regua-cobranca" element={<RequirePermission module="cobranca" submenu="regua"><ReguaCobranca /></RequirePermission>} />
        <Route path="motores-cobranca" element={<RequirePermission module="cobranca"><MotoresCobranca /></RequirePermission>} />
        <Route path="templates" element={<RequirePermission module="marketing" submenu="acervos"><Acervos /></RequirePermission>} />
        <Route path="marketing" element={<RequirePermission module="marketing" submenu="marketing_massa"><MarketingMassa /></RequirePermission>} />
        <Route path="config-integracoes" element={<RequirePermission module="configuracoes"><ConfigIntegracoes /></RequirePermission>} />
        
        {/* Rotas de Cadastros Coliseu */}
        <Route path="departamentos" element={<CadastrosPage type="departamentos" />} />
        <Route path="centro-custos" element={<CadastrosPage type="centro-custos" />} />
        <Route path="regioes" element={<CadastrosPage type="regioes" />} />
        <Route path="formas-pagamento" element={<CadastrosPage type="formas-pagamento" />} />
        <Route path="especies-pagamento" element={<CadastrosPage type="especies-pagamento" />} />
        
        {/* Novas Rotas de BI */}
        <Route path="bi" element={<BiDashboard />}>
          <Route index element={<SalesIntelligenceDashboard />} />
          <Route path="sales" element={<SalesIntelligenceDashboard />} />
          <Route path="hub" element={<SalesHubDashboard />} />
          <Route path="abc" element={<ABCAnalysisDashboard />} />
          <Route path="finance" element={<FinancialIntelligenceDashboard />} />
          <Route path="customer" element={<Radar360Dashboard />} />
          <Route path="comparative" element={<ComparativeAnalysisDashboard />} />
          <Route path="customer-analytics" element={<CustomerAnalyticsDashboard />} />
          <Route path="goals" element={<GoalsPerformanceDashboard />} />
          <Route path="supplier" element={<SupplierAnalyticsDashboard />} />
          <Route path="heatmap" element={<HeatmapDashboard />} />
          <Route path="ai-insights" element={<AIInsightsDashboard />} />
          {/* Adicionaremos as sub-rotas nas Fases futuras */}
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
