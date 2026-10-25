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

// ─────────────────────────────────────────────────────────────
// Módulo Coliseu Transporte
// ─────────────────────────────────────────────────────────────
import CargasPage from './pages/transporte/CargasPage'
import CtesPage from './pages/transporte/CtesPage'
import MdfesPage from './pages/transporte/MdfesPage'
import FrotaPage from './pages/transporte/FrotaPage'
import ContratosCiotPage from './pages/transporte/ContratosCiotPage'
import EmitentesPage from './pages/transporte/EmitentesPage'
import PartesPage from './pages/transporte/PartesPage'
import RelatoriosPage from './pages/transporte/RelatoriosPage'
import RegrasFiscaisPage from './pages/transporte/RegrasFiscaisPage'
import CamposDinamicosPage from './pages/transporte/CamposDinamicosPage'

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

        {/* ── Módulo Coliseu Transporte ── */}
        <Route path="transporte/cargas" element={<CargasPage />} />
        <Route path="transporte/ctes" element={<CtesPage />} />
        <Route path="transporte/mdfes" element={<MdfesPage />} />
        <Route path="transporte/contratos" element={<ContratosCiotPage />} />
        <Route path="transporte/frota" element={<FrotaPage />} />
        <Route path="transporte/emitentes" element={<EmitentesPage />} />
        <Route path="transporte/partes" element={<PartesPage />} />
        <Route path="transporte/relatorios" element={<RelatoriosPage />} />
        <Route path="transporte/config" element={<RegrasFiscaisPage />} />
        <Route path="transporte/campos" element={<CamposDinamicosPage />} />

        {/* Administração (mantida do sistema base) */}
        <Route path="usuarios" element={<RequirePermission module="configuracoes" submenu="usuarios"><Usuarios /></RequirePermission>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
