import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { NotificationToast } from './NotificationToast'

interface LayoutProps {
  children: React.ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="flex flex-col h-screen bg-surface text-gray-100 overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
      <NotificationToast />
    </div>
  )
}
