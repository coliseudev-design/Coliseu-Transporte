import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { useThemeStore } from './store/themeStore'
import api from './services/api'

import Login from './pages/Login'
import Register from './pages/Register'
import DashboardLayout from './components/DashboardLayout'

import Home from './pages/Home'
import Usuarios from './pages/Usuarios'
import Clientes from './pages/Clientes'
import CadastrosPage from './pages/CadastrosPage'

// ─────────────────────────────────────────────────────────────
// Módulo Coliseu Transporte
// ─────────────────────────────────────────────────────────────
import CargasPage from './pages/transporte/CargasPage'
import CtesPage from './pages/transporte/CtesPage'
import MdfesPage from './pages/transporte/MdfesPage'
import FrotaPage from './pages/transporte/FrotaPage'
import EmitentesPage from './pages/transporte/EmitentesPage'
import PartesPage from './pages/transporte/PartesPage'
import RelatoriosPage from './pages/transporte/RelatoriosPage'
import RegrasFiscaisPage from './pages/transporte/RegrasFiscaisPage'
import CamposDinamicosPage from './pages/transporte/CamposDinamicosPage'
import RoteiroEntregaPage from './pages/transporte/RoteiroEntregaPage'
import CertificadosPage from './pages/transporte/CertificadosPage'
import DadosEmpresaPage from './pages/transporte/DadosEmpresaPage'
import DocumentosEmitidosPage from './pages/transporte/DocumentosEmitidosPage'
import CteWizardPage from './pages/transporte/CteWizardPage'
import MdfeWizardPage from './pages/transporte/MdfeWizardPage'
import CiotConsultaPage from './pages/transporte/CiotConsultaPage'

function Protected({ children }: { children: JSX.Element }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  return children
}

function RequirePermission({ module, submenu, children }: { module?: string; submenu?: string; children: JSX.Element }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.tenant_id === '00000000-0000-0000-0000-000000000000' || user.role === 'master' || user.role === 'admin' || (user.grupo_nome && user.grupo_nome.toLowerCase() === 'master')) {
    return children
  }
  if (module && user.permissoes_menus && typeof user.permissoes_menus === 'object' && Object.keys(user.permissoes_menus).length > 0) {
    const moduleConf = user.permissoes_menus[module]
    if (!moduleConf || moduleConf.acesso === false) {
      return <Navigate to="/" replace />
    }
    if (submenu && moduleConf.submenus && moduleConf.submenus[submenu] === false) {
      return <Navigate to="/" replace />
    }
  } else if (module && (user.grupo_id || user.grupo_nome)) {
    return <Navigate to="/" replace />
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

        {/* ── Módulo Coliseu Transporte (Protegido por RBAC RequirePermission) ── */}
        <Route path="transporte/cargas" element={<RequirePermission module="operacao" submenu="cargas"><CargasPage /></RequirePermission>} />
        <Route path="transporte/ctes" element={<RequirePermission module="documentos" submenu="documentos_emitidos"><CtesPage /></RequirePermission>} />
        <Route path="transporte/mdfes" element={<RequirePermission module="documentos" submenu="documentos_emitidos"><MdfesPage /></RequirePermission>} />
        <Route path="transporte/contratos" element={<RequirePermission module="ciot" submenu="consultar_ciot"><CiotConsultaPage /></RequirePermission>} />
        <Route path="transporte/ciot" element={<RequirePermission module="ciot" submenu="consultar_ciot"><CiotConsultaPage /></RequirePermission>} />
        <Route path="transporte/frota" element={<RequirePermission module="cadastros" submenu="frota"><FrotaPage /></RequirePermission>} />
        <Route path="transporte/empresa" element={<RequirePermission module="configuracoes" submenu="dados_empresa"><DadosEmpresaPage /></RequirePermission>} />
        <Route path="transporte/emitentes" element={<RequirePermission module="configuracoes" submenu="dados_empresa"><DadosEmpresaPage /></RequirePermission>} />
        <Route path="transporte/partes" element={<RequirePermission module="cadastros" submenu="partes"><PartesPage /></RequirePermission>} />
        <Route path="transporte/relatorios" element={<RequirePermission module="relatorios" submenu="desempenho"><RelatoriosPage /></RequirePermission>} />
        <Route path="transporte/config" element={<RequirePermission module="configuracoes" submenu="regras_fiscais"><RegrasFiscaisPage /></RequirePermission>} />
        <Route path="transporte/campos" element={<RequirePermission module="configuracoes" submenu="campos_dinamicos"><CamposDinamicosPage /></RequirePermission>} />
        <Route path="transporte/roteiro" element={<RequirePermission module="operacao" submenu="roteiro"><RoteiroEntregaPage /></RequirePermission>} />
        <Route path="transporte/certificados" element={<RequirePermission module="configuracoes" submenu="certificados"><CertificadosPage /></RequirePermission>} />
        <Route path="transporte/documentos" element={<RequirePermission module="documentos" submenu="documentos_emitidos"><DocumentosEmitidosPage /></RequirePermission>} />
        <Route path="transporte/cte/novo" element={<RequirePermission module="documentos" submenu="emitir_cte"><CteWizardPage /></RequirePermission>} />
        <Route path="transporte/mdfe/novo" element={<RequirePermission module="documentos" submenu="emitir_mdfe"><MdfeWizardPage /></RequirePermission>} />

        {/* ── Cadastros do ERP Sincronizados ── */}
        <Route path="clientes" element={<RequirePermission module="cadastros" submenu="clientes"><Clientes /></RequirePermission>} />
        <Route path="regioes" element={<RequirePermission module="cadastros" submenu="regioes"><CadastrosPage type="regioes" /></RequirePermission>} />
        <Route path="departamentos" element={<RequirePermission module="cadastros" submenu="regioes"><CadastrosPage type="regioes" /></RequirePermission>} />

        {/* Administração (mantida do sistema base) */}
        <Route path="usuarios" element={<RequirePermission module="configuracoes" submenu="usuarios"><Usuarios /></RequirePermission>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
