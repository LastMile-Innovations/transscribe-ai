export async function loadEditorPageData<TData, TTranscriptSummary>(input: {
  id: string
  transcriptId?: string
  getProjectData: (projectId: string, transcriptId?: string) => Promise<TData | null>
  listTranscriptsForMediaAction: (projectId: string) => Promise<TTranscriptSummary[]>
}): Promise<{ data: TData; transcriptList: TTranscriptSummary[] } | null> {
  const data = await input.getProjectData(input.id, input.transcriptId || undefined)
  if (!data) {
    return null
  }

  let transcriptList: TTranscriptSummary[] = []
  try {
    transcriptList = await input.listTranscriptsForMediaAction(input.id)
  } catch (error) {
    console.error('Failed to load transcript list for editor:', error)
  }

  return { data, transcriptList }
}
