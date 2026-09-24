/**
 * The signature motions, as components.
 *
 * Each one is named for the thing the system does, not for how it looks,
 * and each has exactly one kind of event that may drive it. The direction
 * they implement is docs/design/DIRECTION.md; the classes they set, and
 * the reduced-motion contract that governs all of them, are the SIGNATURE
 * MOTIONS section of app/globals.css.
 *
 *   Appear       a block arriving, on mount            spatial tier
 *   Append       a record joining the chain            standard + afterglow
 *   Sweep        a check, as far as it has got         standard, per count
 *   Release      the checked answer, once              spatial + bloom
 *   Refused      a denial settling                     hold (480ms) + rim
 *   Seal         a hash committing                     seal (640ms)
 *   TraceTarget  a citation landing on its source      land (900ms)
 *   Light        a state reached, a state that holds   afterglow
 *   MeasuredNumber  a reading changing, by roll        standard
 *   Spectrum     many records, coloured by outcome     afterglow tick
 *   RouteStage   one screen to the next                standard
 *
 * None of them loops, none of them runs on an idle page, and none of them
 * starts content transparent. Only light fades.
 */

export { Appear, type AppearProps, type MotionTag } from './appear'
export { Append, AppendScope, type AppendProps, type AppendTone } from './append'
export { Disclose } from './disclose'
export { Light, Release, type LightProps, type LightTone } from './light'
export { MeasuredNumber, type MeasuredNumberProps } from './measured-number'
export { prefersReducedMotion, useDocumentVisible, useReducedMotion } from './preferences'
export { DimScope, Refused } from './refuse'
export { RouteStage } from './route-stage'
export { useSecondClock } from './second-clock'
export { Seal } from './seal'
export { Spectrum, summarise, type SpectrumCell, type SpectrumState } from './spectrum'
export { Sweep } from './sweep'
export { TraceScope, TraceTarget, type TraceTargetProps } from './trace'
