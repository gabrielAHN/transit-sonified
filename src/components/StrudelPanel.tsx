import { useEffect, useState } from 'react'
import { ExternalLink, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { CITIES, type CityId } from '@/lib/cities'
import { CITY_CODE, CitySound } from '@/engine/sound.js'

type Props = { city: CityId, open: boolean, onClose: () => void }

export function StrudelPanel ({ city, open, onClose }: Props) {
  const [voice, setVoice] = useState('')
  const [hit, setHit] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const code = CitySound.code(city)
    setVoice(code.voice)
    setHit(code.hit)
    setError(null)
  }, [city])

  if (!open) return null

  const defaults = (CITY_CODE as Record<CityId, { voice: string, hit: string }>)[city]
  const isDefault = voice === defaults.voice && hit === defaults.hit
  const run = async (next: { voice: string, hit: string }) => {
    setBusy(true)
    const err = await CitySound.setCode(city, next)
    setBusy(false)
    setError(err)
    if (!err) { setVoice(next.voice); setHit(next.hit) }
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run({ voice, hit }) }
    if (e.key === 'Escape') onClose()
  }

  return (
    <Card data-testid="strudel-panel" className="glass fixed top-[62px] right-4 z-20 w-[380px] gap-2.5 rounded-xl p-3 shadow-none max-lg:hidden">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-medium">Sound in Strudel · {CITIES[city].label}</div>
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="icon" className="size-7 text-muted-foreground">
            <a href="https://strudel.cc/workshop/getting-started/" target="_blank" rel="noreferrer" aria-label="Strudel docs"><ExternalLink className="size-3.5" /></a>
          </Button>
          <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" onClick={onClose} aria-label="Close">
            <X className="size-3.5" />
          </Button>
        </div>
      </div>
      <label className="grid gap-1 text-[11px] text-muted-foreground">
        Every departure
        <Textarea data-testid="strudel-voice" value={voice} onChange={(e) => setVoice(e.target.value)} onKeyDown={onKey} spellCheck={false} className="min-h-14 font-mono text-[11px] md:text-[11px]" />
      </label>
      <label className="grid gap-1 text-[11px] text-muted-foreground">
        A trip's first and last stop
        <Textarea data-testid="strudel-hit" value={hit} onChange={(e) => setHit(e.target.value)} onKeyDown={onKey} spellCheck={false} className="min-h-10 font-mono text-[11px] md:text-[11px]" />
      </label>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Each departure plays its stop's note with the sound and effects of this pattern. One cycle is one hour of the schedule, so <code className="font-mono">"&lt;gm_koto gm_orchestral_harp&gt;"</code> changes every hour.
      </p>
      {error && <p data-testid="strudel-error" className="font-mono text-[11px] text-destructive">{error}</p>}
      <div className="flex justify-end gap-1.5">
        <Button variant="outline" size="sm" className="h-7 bg-transparent text-xs shadow-none dark:bg-transparent" disabled={busy || isDefault} onClick={() => run(defaults)}>
          <RotateCcw className="size-3" />Reset
        </Button>
        <Button data-testid="strudel-apply" size="sm" className="h-7 text-xs" disabled={busy} onClick={() => run({ voice, hit })}>
          {busy ? 'Loading…' : 'Apply'}<span className="text-[10px] opacity-70">⌘↵</span>
        </Button>
      </div>
    </Card>
  )
}
