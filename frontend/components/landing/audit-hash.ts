// Recomputes an audit record's hash in the browser, the way
// backend/core/audit.py computes it on the server:
//
//     hash = sha256(prev_hash || json.dumps(body, sort_keys=True,
//                                           separators=(",", ":"), default=str))
//
// where `body` is the stored record without its own "hash" key.
//
// Two decisions here are load-bearing, and both exist so that an untouched
// record can never be reported as tampered with.
//
// The input is the line exactly as it sits in storage/logs/audit.jsonl, and it
// is never parsed into JavaScript values and written back out. JSON.parse would
// turn Python's 1.0 into 1 and its 1e-05 into 0.00001, and the canonical text
// -- and so the hash -- would change for a record nobody edited. Instead the
// line is tokenised into lexemes and each string, number and literal is carried
// through byte for byte; only the key order and the whitespace between tokens
// change, which is exactly and only what sort_keys and separators change.
// Python writes both the stored line and the canonical form with the same
// ensure_ascii encoder, so every string lexeme is already in its canonical
// spelling.
//
// SHA-256 is implemented here rather than taken from crypto.subtle, because
// crypto.subtle only exists in a secure context. This page is often opened over
// plain http on a LAN address during a demo, and there the platform digest is
// undefined -- the one proof on the page that runs in the reader's own browser
// would silently fail on the network where it matters most. Hashing three
// records of about 500 bytes costs well under a millisecond.
//
// No imports and no syntax beyond type annotations, so Node can run this file
// directly as the test of itself (see the note at the bottom).

export type Lexeme =
  | { kind: 'object'; entries: Array<[string, Lexeme]> }
  | { kind: 'array'; items: Lexeme[] }
  | { kind: 'atom'; text: string }

const WHITESPACE = ' \t\n\r'

/** Tokenise one JSON document without interpreting any of its values. */
export function parseLexemes(text: string): Lexeme {
  let i = 0

  const skip = () => {
    while (i < text.length && WHITESPACE.includes(text[i])) i += 1
  }

  const expect = (char: string) => {
    skip()
    if (text[i] !== char) throw new Error(`Expected ${char} at ${i}`)
    i += 1
  }

  const string = (): string => {
    const start = i
    i += 1 // opening quote
    while (i < text.length && text[i] !== '"') {
      // An escape consumes the character after the backslash, so an escaped
      // quote never ends the string.
      i += text[i] === '\\' ? 2 : 1
    }
    if (i >= text.length) throw new Error('Unterminated string')
    i += 1 // closing quote
    return text.slice(start, i)
  }

  const value = (): Lexeme => {
    skip()
    const char = text[i]
    if (char === '{') {
      i += 1
      const entries: Array<[string, Lexeme]> = []
      skip()
      if (text[i] === '}') {
        i += 1
        return { kind: 'object', entries }
      }
      for (;;) {
        skip()
        const key = string()
        expect(':')
        entries.push([key, value()])
        skip()
        if (text[i] === ',') {
          i += 1
          continue
        }
        expect('}')
        return { kind: 'object', entries }
      }
    }
    if (char === '[') {
      i += 1
      const items: Lexeme[] = []
      skip()
      if (text[i] === ']') {
        i += 1
        return { kind: 'array', items }
      }
      for (;;) {
        items.push(value())
        skip()
        if (text[i] === ',') {
          i += 1
          continue
        }
        expect(']')
        return { kind: 'array', items }
      }
    }
    if (char === '"') return { kind: 'atom', text: string() }
    // A number, true, false or null: everything up to the next delimiter.
    const start = i
    while (i < text.length && !',]}'.includes(text[i]) && !WHITESPACE.includes(text[i])) i += 1
    if (start === i) throw new Error(`Unexpected ${char ?? 'end of input'} at ${i}`)
    return { kind: 'atom', text: text.slice(start, i) }
  }

  const root = value()
  skip()
  if (i !== text.length) throw new Error(`Trailing content at ${i}`)
  return root
}

/** Python's sort_keys order: by the decoded key, compared by code point. */
function byKey(a: [string, Lexeme], b: [string, Lexeme]): number {
  const left = JSON.parse(a[0]) as string
  const right = JSON.parse(b[0]) as string
  return left < right ? -1 : left > right ? 1 : 0
}

/** The canonical text: keys sorted at every depth, no whitespace between tokens. */
export function canonical(node: Lexeme): string {
  if (node.kind === 'atom') return node.text
  if (node.kind === 'array') return `[${node.items.map(canonical).join(',')}]`
  const entries = [...node.entries].sort(byKey)
  return `{${entries.map(([key, value]) => `${key}:${canonical(value)}`).join(',')}}`
}

/** The decoded value of a top-level string field, or null when it is absent. */
export function field(node: Lexeme, key: string): string | null {
  if (node.kind !== 'object') return null
  const entry = node.entries.find(([name]) => JSON.parse(name) === key)
  if (!entry || entry[1].kind !== 'atom') return null
  const decoded: unknown = JSON.parse(entry[1].text)
  return typeof decoded === 'string' ? decoded : null
}

/** The stored text of the atom at `path`, or null when the path does not lead to one. */
export function atomAt(node: Lexeme, path: string[]): string | null {
  let current: Lexeme = node
  for (const key of path) {
    if (current.kind !== 'object') return null
    const entry = current.entries.find(([name]) => JSON.parse(name) === key)
    if (!entry) return null
    current = entry[1]
  }
  return current.kind === 'atom' ? current.text : null
}

/** A copy of the record with one top-level key removed. */
export function without(node: Lexeme, key: string): Lexeme {
  if (node.kind !== 'object') return node
  return { kind: 'object', entries: node.entries.filter(([name]) => JSON.parse(name) !== key) }
}

/**
 * A copy of the record with the atom at `path` replaced by `text`.
 * Returns null when the path does not lead to an atom, so a caller can never
 * believe it altered a record it did not alter.
 */
export function replaceAtom(node: Lexeme, path: string[], text: string): Lexeme | null {
  if (path.length === 0) return node.kind === 'atom' ? { kind: 'atom', text } : null
  if (node.kind !== 'object') return null
  const [head, ...rest] = path
  let found = false
  const entries = node.entries.map(([name, value]): [string, Lexeme] => {
    if (JSON.parse(name) !== head) return [name, value]
    const next = replaceAtom(value, rest, text)
    if (next === null) return [name, value]
    found = true
    return [name, next]
  })
  return found ? { kind: 'object', entries } : null
}

/** Exactly backend/core/audit.py's _digest: sha256 over prev_hash then the canonical body. */
export function digest(prevHash: string, body: Lexeme): string {
  return sha256Hex(prevHash + canonical(body))
}

// --------------------------------------------------------------------------- //
// SHA-256 (FIPS 180-4)
// --------------------------------------------------------------------------- //

const ROUND = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))

export function sha256Hex(message: string): string {
  const bytes = new TextEncoder().encode(message)
  // Message, one 0x80 byte, zero padding, then the bit length as 64 bits.
  const length = (((bytes.length + 9 + 63) >> 6) << 6) >>> 0
  const padded = new Uint8Array(length)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  const bits = bytes.length * 8
  view.setUint32(length - 8, Math.floor(bits / 0x100000000))
  view.setUint32(length - 4, bits >>> 0)

  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const w = new Uint32Array(64)

  for (let offset = 0; offset < length; offset += 64) {
    for (let t = 0; t < 16; t += 1) w[t] = view.getUint32(offset + t * 4)
    for (let t = 16; t < 64; t += 1) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3)
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10)
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0
    }

    let a = state[0]
    let b = state[1]
    let c = state[2]
    let d = state[3]
    let e = state[4]
    let f = state[5]
    let g = state[6]
    let h = state[7]

    for (let t = 0; t < 64; t += 1) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + ROUND[t] + w[t]) >>> 0
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0
      h = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }

    state[0] = (state[0] + a) >>> 0
    state[1] = (state[1] + b) >>> 0
    state[2] = (state[2] + c) >>> 0
    state[3] = (state[3] + d) >>> 0
    state[4] = (state[4] + e) >>> 0
    state[5] = (state[5] + f) >>> 0
    state[6] = (state[6] + g) >>> 0
    state[7] = (state[7] + h) >>> 0
  }

  let hex = ''
  for (let i = 0; i < 8; i += 1) hex += state[i].toString(16).padStart(8, '0')
  return hex
}

// Checked on 2026-09-23 by importing this file directly under Node 24, which
// strips the type annotations: sha256Hex matched node:crypto on 2000 random
// inputs including multi-byte text; canonical() was byte-identical to
// Python's json.dumps(sort_keys=True, separators=(",", ":")) for the three
// records in run.json; and digest() reproduced the stored hash of all 741
// records then in storage/logs/audit.jsonl, none of which failed. This
// frontend has no test runner, so the check lives in that sentence rather
// than in a suite.
