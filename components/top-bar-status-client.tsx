'use client'

import { CheckCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useApp } from '@/lib/app-context'

export function EditorTopBarStatus() {
  const { state } = useApp()

  return (
    <Badge
      variant={state.transcript ? 'default' : 'secondary'}
      className="hidden h-6 shrink-0 gap-1 rounded-full px-2.5 text-[10px] font-bold uppercase tracking-tight md:flex"
    >
      <CheckCircle className="size-3" />
      {state.transcript ? `${state.transcript.segments.length} segments` : 'Processing'}
    </Badge>
  )
}
