import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Header from './Header'
import Sidebar from './Sidebar'

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[#F4F7FE] flex flex-col">
      <Header onOpenSidebar={() => setSidebarOpen(true)} />
      <div className="flex-1 flex min-w-0">
        {/* Menu lateral fixo (desktop) */}
        <aside className="hidden lg:flex w-[228px] shrink-0 border-r border-slate-200/70 bg-white/70 backdrop-blur-sm sticky top-[62px] h-[calc(100vh-62px)] overflow-y-auto">
          <Sidebar open={true} onClose={() => {}} />
        </aside>

        {/* Menu lateral (mobile/tablet) */}
        <div className={`lg:hidden fixed inset-0 z-50 ${sidebarOpen ? '' : 'pointer-events-none'}`}>
          <div
            className={`absolute inset-0 bg-slate-900/50 transition-opacity ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}
            onClick={() => setSidebarOpen(false)}
          />
          <div className={`absolute inset-y-0 left-0 w-[260px] bg-white shadow-2xl transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          </div>
        </div>

        <main className="flex-1 min-w-0 p-2 sm:p-3 md:p-4 max-w-[1900px] mx-auto space-y-2">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
