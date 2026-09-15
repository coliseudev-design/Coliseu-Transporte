import { Outlet } from 'react-router-dom'
import Header from './Header'

export default function DashboardLayout() {
  return (
    <div className="min-h-screen bg-[#F4F7FE] flex flex-col">
      <Header />
      <main className="flex-1 p-2 sm:p-3 md:p-4 max-w-[1900px] w-full mx-auto space-y-2">
        <Outlet />
      </main>
    </div>
  )
}
