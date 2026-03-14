'use client'

import { useEffect, useState } from 'react'
import { getToken } from './api'

export function useAuth() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!getToken()) {
      window.location.href = '/'
      return
    }
    setReady(true)
  }, [])

  return ready
}
