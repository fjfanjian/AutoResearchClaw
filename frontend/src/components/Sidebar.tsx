import { NavLink } from 'react-router-dom'
import {
  Activity,
  Clock,
  FileText,
  LayoutDashboard,
  Package,
  Settings,
} from 'lucide-react'

interface NavItem {
  to: string
  icon: React.ReactNode
  label: string
}

const navItems: NavItem[] = [
  { to: '/', icon: <LayoutDashboard size={18} />, label: 'Pipeline' },
  { to: '/runs', icon: <Clock size={18} />, label: 'Runs' },
  { to: '/deliverables', icon: <Package size={18} />, label: 'Deliverables' },
  { to: '/logs', icon: <Activity size={18} />, label: 'Logs' },
  { to: '/paper', icon: <FileText size={18} />, label: 'Paper' },
  { to: '/settings', icon: <Settings size={18} />, label: 'Settings' },
]

export function Sidebar() {
  return (
    <aside className="flex flex-col w-14 lg:w-52 h-full bg-surface-raised border-r border-surface-border shrink-0">
      <nav className="flex-1 py-4">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-2 py-2 rounded-md text-sm transition-colors ${
                    isActive
                      ? 'bg-accent/20 text-accent-bright font-medium'
                      : 'text-muted hover:bg-surface-overlay hover:text-gray-100'
                  }`
                }
              >
                {item.icon}
                <span className="hidden lg:inline">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="px-4 py-3 border-t border-surface-border hidden lg:block">
        <p className="text-xs text-muted">ResearchClaw</p>
        <p className="text-xs text-muted/60">v0.5.0</p>
      </div>
    </aside>
  )
}
