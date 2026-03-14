import type { Metadata } from 'next'

import './globals.css'
import Providers from './providers'
import { Toaster } from '../components/ui/sonner'
import { version } from '../package.json'

export const metadata: Metadata = {
  title: 'Plex Language Media Tool',
  description: 'Traducción de sinopsis en Plex',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <Providers>
          <div className="container">
            <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full items-start justify-center">
              <div className="w-full">{children}</div>
            </div>
          </div>
          <footer className="py-4 text-center text-xs text-zinc-400 dark:text-zinc-600 flex items-center justify-center gap-1">
            <span>Hecho con</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
            </svg>
            <span>· v{version}</span>
          </footer>
          <Toaster />
        </Providers>
      </body>
    </html>
  )
}
