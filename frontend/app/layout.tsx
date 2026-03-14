import type { Metadata } from 'next'

import './globals.css'
import Providers from './providers'
import { Toaster } from '../components/ui/sonner'

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
          <Toaster />
        </Providers>
      </body>
    </html>
  )
}
