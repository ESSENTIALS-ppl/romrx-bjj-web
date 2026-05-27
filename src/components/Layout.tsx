import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { cn } from '../lib/utils'
import { Dumbbell, Layers, ClipboardList, MessageSquare, Settings, LogOut, Users } from 'lucide-react'

const ATHLETE_NAV = [
  { to: '/dashboard/my-body',     icon: Dumbbell,       label: 'My Body' },
  { to: '/dashboard/my-game',     icon: Layers,          label: 'My Game' },
  { to: '/dashboard/my-protocol', icon: ClipboardList,   label: 'My Protocol' },
  { to: '/dashboard/chat',        icon: MessageSquare,   label: 'ROMBot' },
  { to: '/dashboard/settings',    icon: Settings,        label: 'Settings' },
]

export function Layout() {
  const { user, signOut } = useAuth()
  const { profile } = useProfile(user?.id)
  const navigate = useNavigate()
  const isCoach = profile?.portal_role === 'coach'

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      {/* Top nav */}
      <header className="sticky top-0 z-10 bg-white border-b border-teal-light">
        <div className="max-w-5xl mx-auto px-4 flex items-center h-14 gap-1">
          <span className="font-display font-bold text-teal mr-4 text-base">ROMRx</span>
          <nav className="flex gap-1 flex-1 overflow-x-auto scrollbar-none">
            {isCoach && (
              <NavLink
                to="/dashboard/coach"
                className={({ isActive }) => cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                  isActive ? 'bg-teal text-white' : 'text-charcoal-light hover:bg-teal-light hover:text-teal'
                )}
              >
                <Users size={14} /> My Team
              </NavLink>
            )}
            {ATHLETE_NAV.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                  isActive
                    ? 'bg-teal text-white'
                    : 'text-charcoal-light hover:bg-teal-light hover:text-teal'
                )}
              >
                <Icon size={14} />
                {label}
              </NavLink>
            ))}
          </nav>
          <button
            onClick={handleSignOut}
            className="ml-2 p-2 rounded-full text-charcoal-light hover:bg-red-50 hover:text-red-600 transition-colors"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
