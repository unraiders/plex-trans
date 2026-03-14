'use client'

import { Toaster as Sonner, ToasterProps } from 'sonner'

function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      position="top-center"
      {...props}
    />
  )
}

export { Toaster }
