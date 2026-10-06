import { Deck } from '@deck.gl/core'
import type maplibregl from 'maplibre-gl'

export class DeckOverlay {
  deck: Deck | null = null
  private map: maplibregl.Map | null = null
  private container: HTMLDivElement | null = null
  private props: Record<string, any>

  constructor (props: Record<string, any>) { this.props = props }

  getDefaultPosition () { return 'top-left' }

  onAdd (map: maplibregl.Map) {
    this.map = map
    const el = document.createElement('div')
    Object.assign(el.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none' })
    this.container = el
    this.deck = new Deck({ ...this.props, parent: el, controller: false, viewState: this.viewState() } as any)
    map.on('resize', this.resize)
    map.on('render', this.sync)
    for (const t of ['mousemove', 'mouseout', 'click'] as const) map.on(t, this.pointer)
    this.resize()
    return el
  }

  onRemove () {
    const map = this.map
    if (!map) return
    map.off('resize', this.resize)
    map.off('render', this.sync)
    for (const t of ['mousemove', 'mouseout', 'click'] as const) map.off(t, this.pointer)
    this.deck?.finalize()
    this.deck = null
    this.map = null
  }

  setProps (props: Record<string, any>) {
    Object.assign(this.props, props)
    this.deck?.setProps(this.props)
  }

  private viewState () {
    const m = this.map!
    const { lng, lat } = m.getCenter()
    return {
      longitude: ((lng + 540) % 360) - 180, latitude: lat, zoom: m.getZoom(), bearing: m.getBearing(),
      pitch: m.getPitch(), padding: m.getPadding(), repeat: m.getRenderWorldCopies()
    }
  }

  private resize = () => {
    if (!this.map || !this.container) return
    const { clientWidth, clientHeight } = this.map.getContainer()
    Object.assign(this.container.style, { width: clientWidth + 'px', height: clientHeight + 'px' })
  }

  private sync = () => {
    if (!this.deck) return
    this.deck.setProps({ viewState: this.viewState() })
    if ((this.deck as any).isInitialized) this.deck.redraw()
  }

  private pointer = (e: any) => {
    const deck = this.deck as any
    if (!deck || !deck.isInitialized) return
    const ev = { type: e.type, offsetCenter: e.point, srcEvent: e }
    if (e.type === 'mousemove') deck._onPointerMove({ ...ev, type: 'pointermove' })
    else if (e.type === 'mouseout') deck._onPointerMove({ ...ev, type: 'pointerleave' })
    else if (e.type === 'click') deck._onEvent({ ...ev, tapCount: 1 })
  }
}
