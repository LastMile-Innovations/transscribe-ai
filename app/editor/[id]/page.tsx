import { redirect } from 'next/navigation'
import EditorPageClient from '@/components/editor-page-client'
import { TopBar } from '@/components/top-bar'
import { AppProvider } from '@/lib/app-context'
import { getProjectData, listTranscriptsForMediaAction } from '@/lib/actions'
import { loadEditorPageData } from '@/lib/editor-page-data'

export default async function EditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ t?: string }>
}) {
  const { id } = await params
  const { t } = await searchParams
  let pageData
  try {
    pageData = await loadEditorPageData({
      id,
      transcriptId: t || undefined,
      getProjectData,
      listTranscriptsForMediaAction,
    })
  } catch {
    redirect('/')
  }
  if (!pageData) {
    redirect('/')
  }

  return (
    <AppProvider
      key={`${id}:${t ?? ''}`}
      initialState={{
        projects: [pageData.data.project],
        activeProjectId: id,
        transcript: pageData.data.transcript,
        overlays: pageData.data.overlays ?? [],
      }}
    >
      <div className="flex min-h-dvh flex-col overflow-hidden bg-background">
        <TopBar project={pageData.data.project} initialTranscriptList={pageData.transcriptList} />
        <EditorPageClient projectId={id} />
      </div>
    </AppProvider>
  )
}
