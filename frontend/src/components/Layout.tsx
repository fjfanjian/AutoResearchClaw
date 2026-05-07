import { Outlet } from 'react-router-dom'
import { useAppState } from '@/context/AppContext'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import NotificationToast from './NotificationToast'

export default function Layout() {
  const { sidebarCollapsed } = useAppState()

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <TopBar />
        <main
          className="flex-1 overflow-auto p-6 transition-all"
          style={{
            marginLeft: sidebarCollapsed ? '4rem' : '16rem',
          }}
        >
          <Outlet />
        </main>
      </div>
      <NotificationToast />
    </div>
  )
}
