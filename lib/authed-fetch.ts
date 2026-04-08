'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback } from 'react'

/**
 * Same-origin API calls with Clerk session: sends cookies and a fresh Bearer token
 * so route handlers see a user after long uploads or edge cases where cookies alone fail.
 */
export function useAuthedFetch() {
  const { getToken } = useAuth()

  return useCallback(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const token = await getToken()
      const headers = new Headers(init?.headers)
      if (token) {
        headers.set('Authorization', `Bearer ${token}`)
      }
      return fetch(input, {
        ...init,
        credentials: 'include',
        headers,
      })
    },
    [getToken],
  )
}
