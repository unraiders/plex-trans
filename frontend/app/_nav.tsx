'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'

import { Button } from '../components/ui/button'
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
} from '../components/ui/navigation-menu'
import { getToken, setToken } from '../lib/api'

export default function Nav() {
  const [mounted, setMounted] = useState(false)
  const { resolvedTheme, setTheme } = useTheme()
  const themeActionLabel =
    !mounted || !resolvedTheme
      ? 'Cambiar tema'
      : resolvedTheme === 'dark'
        ? 'Cambiar a modo claro'
        : 'Cambiar a modo oscuro'

  useEffect(() => {
    setMounted(true)
  }, [])

  function toggleTheme() {
    const current = resolvedTheme ?? 'dark'
    setTheme(current === 'dark' ? 'light' : 'dark')
  }

  function logout() {
    setToken('')
    sessionStorage.removeItem('plex_page_cache')
    sessionStorage.removeItem('plex_translations')
    sessionStorage.removeItem('plex_processed')
    window.location.href = '/'
  }

  return (
    <div className="nav">
      <a href="/media">
        <img src="/logo.png" alt="Plex Trans" className="h-7 w-7" />
      </a>

      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuLink href="/media">Medios</NavigationMenuLink>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink href="/settings">Ajustes</NavigationMenuLink>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink href="/profile">Perfil</NavigationMenuLink>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink href="/help">Ayuda</NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>

      <div className="flex-1" />

      <Button
        variant="ghost"
        onClick={toggleTheme}
        type="button"
        size="icon"
        disabled={!mounted || !resolvedTheme}
        aria-label={themeActionLabel}
        title={themeActionLabel}
      >
        {!mounted || !resolvedTheme ? (
          <span className="h-5 w-5" />
        ) : resolvedTheme === 'dark' ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2" /><path d="M12 20v2" />
            <path d="M4.93 4.93l1.41 1.41" /><path d="M17.66 17.66l1.41 1.41" />
            <path d="M2 12h2" /><path d="M20 12h2" />
            <path d="M4.93 19.07l1.41-1.41" /><path d="M17.66 6.34l1.41-1.41" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
          </svg>
        )}
      </Button>

      <Button variant="secondary" onClick={logout} type="button">
        Salir
      </Button>
    </div>
  )
}
