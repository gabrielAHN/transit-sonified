import { getSampleBuffer, getSound, getSuperdoughAudioController, initAudio, registerSynthSounds, samples, setAudioContext, setLogger, setMaxPolyphony, superdough } from 'superdough'
import { getFontBufferSource, registerSoundfonts } from '@strudel/soundfonts'
import * as strudel from '@strudel/core'
import { miniAllStrings } from '@strudel/mini'

miniAllStrings()
registerSynthSounds()
registerSoundfonts()

const scope = { ...strudel }

export function compile (src) {
  const out = new Function('scope', 'with (scope) { return (' + src + '\n) }')(scope)
  const pat = strudel.reify(out)
  if (!pat || typeof pat.queryArc !== 'function') throw new Error('the code must return a Strudel pattern')
  pat.queryArc(0, 1)
  return pat
}

export const getSoundIndex = strudel.getSoundIndex

export { getFontBufferSource, getSampleBuffer, getSound, getSuperdoughAudioController, initAudio, samples, setAudioContext, setLogger, setMaxPolyphony, superdough }
