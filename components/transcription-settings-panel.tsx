'use client'

import { Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function TranscriptionSettingsPanel({
  speechModel,
  setSpeechModel,
  speakerLabels,
  setSpeakerLabels,
  languageDetection,
  setLanguageDetection,
  temperature,
  setTemperature,
  keyterms,
  setKeyterms,
  customPrompt,
  setCustomPrompt,
  speakersExpected,
  setSpeakersExpected,
  minSpeakers,
  setMinSpeakers,
  maxSpeakers,
  setMaxSpeakers,
  knownSpeakers,
  setKnownSpeakers,
  redactPii,
  setRedactPii,
  autoTranscribe,
  setAutoTranscribe,
  onResetRecommended,
}: {
  speechModel: string
  setSpeechModel: (value: string) => void
  speakerLabels: boolean
  setSpeakerLabels: (value: boolean) => void
  languageDetection: boolean
  setLanguageDetection: (value: boolean) => void
  temperature: number[]
  setTemperature: (value: number[]) => void
  keyterms: string
  setKeyterms: (value: string) => void
  customPrompt: string
  setCustomPrompt: (value: string) => void
  speakersExpected: string
  setSpeakersExpected: (value: string) => void
  minSpeakers: string
  setMinSpeakers: (value: string) => void
  maxSpeakers: string
  setMaxSpeakers: (value: string) => void
  knownSpeakers: string
  setKnownSpeakers: (value: string) => void
  redactPii: boolean
  setRedactPii: (value: boolean) => void
  autoTranscribe: boolean
  setAutoTranscribe: (value: boolean) => void
  onResetRecommended: () => void
}) {
  return (
    <div className="mb-0">
      <Accordion type="single" collapsible className="library-panel-accordion w-full px-3 md:px-6">
        <AccordionItem value="settings" className="border-0">
          <AccordionTrigger className="py-4 text-sm font-semibold hover:no-underline md:py-5">
            <div className="flex items-center gap-3 text-left">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,color-mix(in_oklab,var(--color-brand)_16%,white),white)] text-brand shadow-inner">
                <Sparkles className="size-4" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Controls</p>
                <p className="text-sm font-semibold text-foreground">Transcription Settings</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-6">
            <p className="mb-4 text-xs text-muted-foreground">
              These options apply when you click <span className="font-medium text-foreground">Transcribe</span>{' '}
              on a file marked “Needs transcript”.
            </p>
            <div className="mb-5 flex flex-col gap-3 rounded-[1.35rem] border border-white/60 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--color-brand)_10%,white),color-mix(in_oklab,var(--color-background)_96%,white))] p-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">Recommended default workflow</p>
                <p className="text-xs text-muted-foreground">
                  Start with the best model, speaker labels on, and leave speaker tuning blank
                  unless you already know the roster or expected count.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={onResetRecommended}>
                Reset to recommended
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                  <Label>Speech Model</Label>
                  <Select value={speechModel} onValueChange={setSpeechModel}>
                    <SelectTrigger className="border-white/60 bg-background/80">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="best">Universal-3 Pro (Highest Accuracy)</SelectItem>
                      <SelectItem value="fast">Universal-2 (Fastest & 99 Languages)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Universal-3 Pro is best for complex legal terminology.
                  </p>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <Label>Speaker Labels (Diarization)</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically identify who is speaking.
                    </p>
                  </div>
                  <Switch checked={speakerLabels} onCheckedChange={setSpeakerLabels} />
                </div>

                {speakerLabels && (
                  <div className="flex flex-col gap-4 rounded-[1.25rem] border border-brand/20 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--color-brand)_10%,white),white)] p-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand">
                      <Sparkles className="size-3" />
                      Advanced Speaker Tuning
                    </div>
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      Optional. Leave these blank unless you need to force a specific number of
                      speakers or help the model map speakers to known names.
                    </p>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-2">
                        <Label className="text-[11px]">Expected Count</Label>
                        <Input
                          type="number"
                          placeholder="e.g. 2"
                          value={speakersExpected}
                          onChange={(e) => {
                            setSpeakersExpected(e.target.value)
                            if (e.target.value) {
                              setMinSpeakers('')
                              setMaxSpeakers('')
                            }
                          }}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label className="text-[11px]">Speaker Range</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            placeholder="Min"
                            value={minSpeakers}
                            onChange={(e) => {
                              setMinSpeakers(e.target.value)
                              if (e.target.value) setSpeakersExpected('')
                            }}
                            className="h-8 text-xs"
                          />
                          <Input
                            type="number"
                            placeholder="Max"
                            value={maxSpeakers}
                            onChange={(e) => {
                              setMaxSpeakers(e.target.value)
                              if (e.target.value) setSpeakersExpected('')
                            }}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label className="text-[11px]">Identified Names (Known Values)</Label>
                      <Input
                        placeholder="John Doe, Jane Smith..."
                        value={knownSpeakers}
                        onChange={(e) => setKnownSpeakers(e.target.value)}
                        className="h-8 text-xs"
                      />
                      <p className="text-[10px] text-muted-foreground leading-tight">
                        Replace &quot;Speaker A&quot; with these names using Speaker Identification.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <Label>Language Detection</Label>
                    <p className="text-xs text-muted-foreground">
                      Auto-detect the primary language spoken.
                    </p>
                  </div>
                  <Switch checked={languageDetection} onCheckedChange={setLanguageDetection} />
                </div>

                <div className="flex flex-col gap-4 pt-2">
                  <div className="flex items-center justify-between">
                    <Label>Temperature</Label>
                    <span className="font-mono text-xs text-brand">{temperature[0]}</span>
                  </div>
                  <Slider value={temperature} onValueChange={setTemperature} max={1} step={0.1} />
                  <p className="text-xs text-muted-foreground">
                    Lower values maximize determinism, higher explores more.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                  <Label>Boosted Vocabulary (Keyterms)</Label>
                  <Textarea
                    value={keyterms}
                    onChange={(e) => setKeyterms(e.target.value)}
                    className="min-h-[80px] resize-none border-dashed border-brand/25 bg-background/75 font-mono text-[11px]"
                    placeholder="Anktiva, Glicoside, Ramipril..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated list of names, brands, or jargon to boost accuracy.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <Label>System Prompt Configuration</Label>
                    <Badge variant="secondary" className="text-[10px] font-normal uppercase tracking-wider">
                      Experimental
                    </Badge>
                  </div>
                  <Textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    className="min-h-[260px] resize-none border-dashed border-brand/25 bg-background/75 font-mono text-[11px] leading-relaxed"
                    placeholder="Enter a custom prompt here..."
                  />
                  <p className="text-xs text-muted-foreground leading-snug">
                    Use authoritative language (Mandatory:, Non-negotiable:) to format transcript
                    style, tell it to preserve filler words, or apply the [unclear] tag to
                    unresolvable audio. Keep empty for default settings.
                  </p>
                </div>

                <div className="flex flex-col gap-4 rounded-[1.25rem] border border-blue-200/50 bg-blue-50/40 p-4 transition-colors dark:border-blue-500/20 dark:bg-blue-900/10">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                    <Sparkles className="size-3" />
                    Security & Privacy
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs font-medium">PII Redaction</Label>
                      <p className="text-[10px] text-muted-foreground leading-tight">
                        Identify and mask person names, SSNs, phone numbers, and addresses.
                      </p>
                    </div>
                    <Switch checked={redactPii} onCheckedChange={setRedactPii} />
                  </div>
                </div>

                <div className="flex flex-col gap-4 rounded-[1.25rem] border border-brand/20 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--color-brand)_10%,white),white)] p-4 transition-colors">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs font-medium">Auto-transcribe after upload</Label>
                      <p className="text-[10px] text-muted-foreground leading-tight">
                        Automatically start transcription using these settings when a new video
                        finishes uploading.
                      </p>
                    </div>
                    <Switch checked={autoTranscribe} onCheckedChange={setAutoTranscribe} />
                  </div>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
