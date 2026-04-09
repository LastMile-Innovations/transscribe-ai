import { redirect } from 'next/navigation'
import EditorPageClient from '@/components/editor-page-client'
import { TopBar } from '@/components/top-bar'
import { AppProvider } from '@/lib/app-context'
import { getProjectData, listTranscriptsForMediaAction } from '@/lib/actions'

export default async function EditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ t?: string }>
}) {
  const { id } = await params
  const { t } = await searchParams
  let data
  let transcriptList

  try {
    data = await getProjectData(id, t || undefined)
    transcriptList = await listTranscriptsForMediaAction(id)
  } catch {
    redirect('/')
  }

  if (!data) {
    redirect('/')
  }

  return (
    <AppProvider
      key={`${id}:${t ?? ''}`}
      initialState={{
        projects: [data.project],
        activeProjectId: id,
        transcript: data.transcript,
        overlays: data.overlays ?? [],
      }}
    >
      <TopBar project={data.project} initialTranscriptList={transcriptList} />
      <EditorPageClient projectId={id} />
    </AppProvider>
  )
}
