'use client'

import React, { createContext, useContext, useReducer, type Dispatch } from 'react'
import type { AppState, AppAction, TranscriptSegment } from './types'
// ─── Initial State ────────────────────────────────────────────────────────────
const initialState: AppState = {
  projects: [],
  activeProjectId: null,
  transcript: null,
  overlays: [],
  trimRange: null,
  aiMessages: [],
  playerTime: 0,
  isPlaying: false,
}

// ─── Reducer ──────────────────────────────────────────────────────────────────
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PROJECTS':
      return { ...state, projects: action.projects }

    case 'ADD_PROJECT':
      return { ...state, projects: [action.project, ...state.projects] }

    case 'UPDATE_PROJECT':
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.id ? { ...p, ...action.updates } : p,
        ),
      }

    case 'SET_ACTIVE_PROJECT': {
      const project = state.projects.find((p) => p.id === action.id)
      return {
        ...state,
        activeProjectId: action.id,
        // When setting active project initially, we don't know the transcript yet. 
        // We'll dispatch a SET_TRANSCRIPT action right after loading from DB.
        transcript: state.transcript, 
        overlays: [],
        trimRange: state.transcript
          ? { start: 0, end: state.transcript.totalDuration }
          : null,
        playerTime: 0,
        isPlaying: false,
        aiMessages: [],
      }
    }

    case 'SET_TRANSCRIPT':
      if (!action.transcript) {
        return { ...state, transcript: null, trimRange: null }
      }
      return {
        ...state,
        transcript: action.transcript,
        trimRange: { start: 0, end: action.transcript.totalDuration },
      }

    case 'UPDATE_SEGMENT':
      if (!state.transcript) return state
      return {
        ...state,
        transcript: {
          ...state.transcript,
          segments: state.transcript.segments.map((s) =>
            s.id === action.id ? { ...s, ...action.updates } : s,
          ),
        },
      }

    case 'ADD_SEGMENT': {
      if (!state.transcript) return state
      const idx = state.transcript.segments.findIndex((s) => s.id === action.afterId)
      const segments = [...state.transcript.segments]
      segments.splice(idx + 1, 0, action.segment)
      return { ...state, transcript: { ...state.transcript, segments } }
    }

    case 'DELETE_SEGMENT':
      if (!state.transcript) return state
      return {
        ...state,
        transcript: {
          ...state.transcript,
          segments: state.transcript.segments.filter((s) => s.id !== action.id),
        },
      }

    case 'MERGE_SEGMENTS': {
      if (!state.transcript) return state
      const segs = state.transcript.segments
      const i1 = segs.findIndex((s) => s.id === action.id1)
      const i2 = segs.findIndex((s) => s.id === action.id2)
      if (i1 === -1 || i2 === -1) return state
      const a = segs[i1]
      const b = segs[i2]
      const merged: TranscriptSegment = {
        ...a,
        end: b.end,
        text: `${a.text} ${b.text}`,
        confidence: (a.confidence + b.confidence) / 2,
      }
      const next = segs.filter((_, i) => i !== i1 && i !== i2)
      next.splice(Math.min(i1, i2), 0, merged)
      return { ...state, transcript: { ...state.transcript, segments: next } }
    }

    case 'SET_OVERLAYS':
      return { ...state, overlays: action.overlays }

    case 'ADD_OVERLAY':
      return { ...state, overlays: [...state.overlays, action.overlay] }

    case 'UPDATE_OVERLAY':
      return {
        ...state,
        overlays: state.overlays.map((o) =>
          o.id === action.id ? { ...o, ...action.updates } : o,
        ),
      }

    case 'DELETE_OVERLAY':
      return { ...state, overlays: state.overlays.filter((o) => o.id !== action.id) }

    case 'SET_TRIM':
      return { ...state, trimRange: action.trimRange }

    case 'RESET_TRIM':
      return {
        ...state,
        trimRange: state.transcript
          ? { start: 0, end: state.transcript.totalDuration }
          : state.trimRange,
      }

    case 'SET_PLAYER_TIME':
      return { ...state, playerTime: action.time }

    case 'SET_PLAYING':
      return { ...state, isPlaying: action.isPlaying }

    case 'ADD_AI_MESSAGE':
      return { ...state, aiMessages: [...state.aiMessages, action.message] }

    case 'UPDATE_AI_MESSAGE':
      return {
        ...state,
        aiMessages: state.aiMessages.map((m) =>
          m.id === action.id ? { ...m, ...action.updates } : m,
        ),
      }

    case 'CLEAR_AI_MESSAGES':
      return { ...state, aiMessages: [] }

    default:
      return state
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────
interface AppContextValue {
  state: AppState
  dispatch: Dispatch<AppAction>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState)
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
