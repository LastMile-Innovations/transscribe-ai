import { jsPDF } from 'jspdf'
import type { NumberedTranscriptLine } from './legal-transcript-export'

export function buildLegalTranscriptPdf(input: {
  projectTitle: string
  transcriptId: string
  lines: NumberedTranscriptLine[]
}): Uint8Array {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 48
  const maxWidth = pageWidth - margin * 2
  let y = margin

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Transcript — legal export', margin, y)
  y += 20

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  for (const line of [
    `Title: ${input.projectTitle}`,
    `Transcript ID: ${input.transcriptId}`,
    `Exported (UTC): ${new Date().toISOString()}`,
    'Line numbers are for reference only; verify against source media before filing.',
  ]) {
    const parts = doc.splitTextToSize(line, maxWidth)
    for (const p of parts) {
      if (y > pageHeight - margin) {
        doc.addPage()
        y = margin
      }
      doc.text(p, margin, y)
      y += 12
    }
  }
  y += 8

  doc.setFontSize(8)
  for (const row of input.lines) {
    const n = String(row.lineNumber).padStart(5, ' ')
    const combined = `${n}  ${row.text}`
    const split = doc.splitTextToSize(combined, maxWidth)
    for (const chunk of split) {
      if (y > pageHeight - margin) {
        doc.addPage()
        y = margin
      }
      doc.text(chunk, margin, y)
      y += 10
    }
  }

  const out = doc.output('arraybuffer')
  return new Uint8Array(out)
}
