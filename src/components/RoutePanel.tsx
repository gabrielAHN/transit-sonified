import { useRef, useState } from 'react'
import { ChevronDown, Rows3, Shuffle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { GithubIcon } from '@/components/ui/github-icon'
import { cn } from '@/lib/utils'
import { RouteReel, type ReelHandle } from './RouteReel'
import type { Snapshot } from '@/engine/player'

type Props = { snap: Snapshot, onPick: (route: string, opts?: { random?: boolean }) => void, onAim: (route: string) => void, defaultOpen: boolean }

export function RoutePanel ({ snap, onPick, onAim, defaultOpen }: Props) {
  const reel = useRef<ReelHandle>(null)
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Card className="glass fixed top-4 left-4 z-20 w-60 gap-0 rounded-xl p-0 shadow-none max-md:top-[calc(62px+env(safe-area-inset-top))] max-md:left-2.5 max-md:w-[min(210px,calc(100vw-20px))]">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2.5 text-[13px] font-medium">
          <span className="flex items-center gap-2"><Rows3 className="size-3.5 text-muted-foreground" />Routes</span>
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', !open && '-rotate-90')} />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 px-2.5 pb-2.5">
          <div className="flex gap-1.5">
            <Button
              data-testid="route-all"
              variant="outline" size="sm"
              className={cn('h-7 flex-1 bg-transparent text-xs shadow-none dark:bg-transparent', snap.route === 'all' && 'border-primary/50 bg-primary/10 text-primary')}
              onClick={() => onPick('all')}
            >
              All
            </Button>
            <Button
              data-testid="route-random"
              variant="outline" size="sm"
              className="h-7 flex-1 bg-transparent text-xs shadow-none dark:bg-transparent"
              disabled={!snap.routes.length}
              onClick={() => reel.current?.random()}
            >
              <Shuffle className="size-3" />Random
            </Button>
          </div>
          <RouteReel ref={reel} routes={snap.routes} route={snap.route} fetching={snap.fetchingRoute} onPick={onPick} onAim={onAim} />
          <div className="grid gap-1.5 pt-1 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-2 max-md:hidden"><span className="size-2 rounded-full bg-primary" />Station, coloured by its line</div>
            <div className="flex items-center gap-2 max-md:hidden"><span className="h-2 w-4 rounded-sm bg-rush/40" />Rush hour on the timeline</div>
            <a
              data-testid="repo-link"
              href="https://github.com/gabrielAHN/transit-sonified"
              target="_blank"
              rel="noreferrer"
              className="flex w-fit items-center gap-2 rounded-sm transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <GithubIcon className="size-3.5" />Source on GitHub
            </a>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}
