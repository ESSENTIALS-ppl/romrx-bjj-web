import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { cn } from '../lib/utils'
import { Dumbbell, Layers, ClipboardList, MessageSquare, Settings, LogOut, Users, UserCheck, Building2 } from 'lucide-react'

const ATHLETE_NAV = [
  { to: '/dashboard/my-body',     icon: Dumbbell,       label: 'My Body' },
  { to: '/dashboard/my-game',     icon: Layers,          label: 'My Game' },
  { to: '/dashboard/my-protocol', icon: ClipboardList,   label: 'My Protocol' },
  { to: '/dashboard/my-coach',    icon: UserCheck,       label: 'My Coach' },
  { to: '/dashboard/my-school',   icon: Building2,       label: 'My School' },
  { to: '/dashboard/chat',        icon: MessageSquare,   label: 'ROMBot' },
  { to: '/dashboard/settings',    icon: Settings,        label: 'Settings' },
]

const COACH_NAV = [
  { to: '/dashboard/coach',    icon: Users,         label: 'My Team' },
  { to: '/dashboard/chat',     icon: MessageSquare, label: 'ROMBot' },
  { to: '/dashboard/settings', icon: Settings,      label: 'Settings' },
]

const ATHLETE_ONLY_ROUTES = ['/dashboard/my-body', '/dashboard/my-game', '/dashboard/my-protocol']

export function Layout() {
  const { user, signOut } = useAuth()
  const { profile } = useProfile(user?.id)
  const navigate = useNavigate()
  const location = useLocation()
  const isCoach = profile?.portal_role === 'coach'

  // Redirect coaches away from athlete-only pages
  useEffect(() => {
    if (!isCoach) return
    if (ATHLETE_ONLY_ROUTES.some(r => location.pathname.startsWith(r))) {
      navigate('/dashboard/coach', { replace: true })
    }
  }, [isCoach, location.pathname, navigate])

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
            {(isCoach ? COACH_NAV : ATHLETE_NAV).map(({ to, icon: Icon, label }) => (
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
