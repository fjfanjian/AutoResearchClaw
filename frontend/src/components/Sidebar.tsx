import { NavLink } from 'react-router-dom'
import {
  Activity,
  Archive,
  ChevronLeft,
  ChevronRight,
  FileText,
  GitBranch,
  Settings,
} from 'lucide-react'
import { useAppState, useAppDispatch } from '@/context/AppContext'

const navItems = [
  { to: '/', icon: Activity, label: '流水线' },
  { to: '/runs', icon: GitBranch, label: '运行历史' },
  { to: '/deliverables', icon: FileText, label: '交付物' },
  { to: '/settings', icon: Settings, label: '设置' },
]

export default function Sidebar() {
  const { sidebarCollapsed } = useAppState()
  const dispatch = useAppDispatch()

  return (
    <aside
      className="fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-slate-800 bg-slate-900 transition-all"
      style={{ width: sidebarCollapsed ? '4rem' : '16rem' }}
    >
      <div className="flex h-14 items-center gap-3 border-b border-slate-800 px-4">
        <Archive className="h-6 w-6 shrink-0 text-indigo-400" />
        {!sidebarCollapsed && (
          <span className="truncate text-sm font-semibold tracking-wide text-slate-100">
            ResearchClaw
          </span>
        )}
      </div>

      <nav className="flex-1 py-4">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `mx-2 mb-1 flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600/20 text-indigo-300'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`
            }
            title={item.label}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!sidebarCollapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-800 p-2">
        <button
          onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
          className="flex w-full items-center justify-center rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          title="收起/展开侧边栏"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
        </button>
      </div>
    </aside>
  )
}
