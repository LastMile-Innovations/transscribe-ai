'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { renameProjectAction } from '@/lib/actions'
import { useApp } from '@/lib/app-context'

export function EditorTopBarTitle({
  projectId,
  initialTitle,
}: {
  projectId: string
  initialTitle: string
}) {
  const { state, dispatch } = useApp()
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(initialTitle)
  const project = state.projects.find((entry) => entry.id === projectId)

  if (!project) {
    return null
  }

  const handleTitleClick = () => {
    setTitleValue(project.title)
    setEditingTitle(true)
  }

  const commitTitle = async () => {
    const trimmed = titleValue.trim()
    if (!trimmed) {
      toast.error('Name is required.')
      setTitleValue(project.title)
      setEditingTitle(false)
      return
    }
    if (trimmed === project.title) {
      setEditingTitle(false)
      return
    }
    try {
      const updated = await renameProjectAction(project.id, trimmed)
      dispatch({ type: 'UPDATE_PROJECT', id: project.id, updates: { title: updated.title } })
      toast.success('Project renamed.')
    } catch {
      toast.error('Could not save name.')
      setTitleValue(project.title)
    }
    setEditingTitle(false)
  }

  if (editingTitle) {
    return (
      <Input
        autoFocus
        value={titleValue}
        onChange={(e) => setTitleValue(e.target.value)}
        onBlur={() => void commitTitle()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void commitTitle()
          }
          if (e.key === 'Escape') {
            setTitleValue(project.title)
            setEditingTitle(false)
          }
        }}
        className="min-w-0 flex-1 rounded-lg border-brand/50 bg-background text-sm font-semibold ring-2 ring-brand/20"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={handleTitleClick}
      className="truncate text-left text-sm font-semibold transition-colors hover:text-brand md:text-base"
      title="Click to rename"
    >
      {project.title}
    </button>
  )
}
