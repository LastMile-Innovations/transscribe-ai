'use client'

import { useEffect, useState } from 'react'
import { useTheme } from '@wrksz/themes/client'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Theme toggle button that avoids hydration mismatch by only rendering
 * the icon after the component has mounted on the client.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label="Toggle theme"
      className={className}
    >
      {/* Render a fixed placeholder until mounted to avoid SSR mismatch */}
      {mounted ? (
        theme === 'dark' ? (
          <Sun className="size-4" aria-hidden="true" />
        ) : (
          <Moon className="size-4" aria-hidden="true" />
        )
      ) : (
        <Sun className="size-4 opacity-0" aria-hidden="true" />
      )}
    </Button>
  )
}
