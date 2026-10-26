import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)   // drawer mobile/tablet

  return (
    <div className="min-h-screen bg-[#F4F7FE] dark:bg-[#0B1220] flex">
      {/* ═══ MENU LATERAL FIXO (desktop) — sempre visível ═══ */}
      <div className="hidden lg:block shrink-0 sticky top-0 h-screen z-40">
        <Sidebar open onClose={() => {}} />
      </div>

      {/* ═══ MENU LATERAL (mobile/tablet) ═══ */}
      <div className={`lg:hidden fixed inset-0 z-50 ${sidebarOpen ? '' : 'pointer-events-none'}`}>
        <div
          className="absolute inset-0 bg-slate-900/50 transition-opacity duration-250"
          style={{ opacity: sidebarOpen ? 1 : 0 }}
          onClick={() => setSidebarOpen(false)}
        />
        <div
          className="absolute inset-y-0 left-0 bg-white dark:bg-slate-900 shadow-2xl transition-transform duration-300"
          style={{ width: 268, transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)' }}
        >
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        </div>
      </div>

      {/* ═══ CONTEÚDO ═══ */}
      <main className="flex-1 min-w-0 p-3 sm:p-4 lg:p-6 max-w-[1680px] mx-auto">
        <Outlet />
      </main>
    </div>
  )
}
