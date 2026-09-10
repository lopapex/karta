import {
  FileText,
  GearSix,
  UsersThree,
  type Icon,
} from '@phosphor-icons/react'
import { NavLink, Outlet } from 'react-router'

interface NavigationItem {
  label: string
  path: string
  icon: Icon
}

const navigationItems: NavigationItem[] = [
  { label: 'Klienti', path: '/clients', icon: UsersThree },
  { label: 'Šablony', path: '/templates', icon: FileText },
]

export function AppShell() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Přejít k obsahu</a>
      <aside className="sidebar">
        <div className="wordmark" aria-label="Karta">
          <img className="wordmark-logo" src="/karta-logo.png" alt="" />
          <span>Karta</span>
        </div>

        <nav className="primary-navigation" aria-label="Hlavní navigace">
          {navigationItems.map(({ label, path, icon: NavigationIcon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `navigation-link${isActive ? ' navigation-link--active' : ''}`
              }
            >
              <NavigationIcon size={20} weight="regular" aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <NavLink to="/settings" className={({ isActive }) => `navigation-link navigation-link--settings${isActive ? ' navigation-link--active' : ''}`}>
          <GearSix size={19} weight="regular" aria-hidden="true" />
          <span>Nastavení</span>
        </NavLink>
      </aside>

      <main className="main-content" id="main-content">
        <Outlet />
      </main>
    </div>
  )
}
