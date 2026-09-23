/**
 * Recomputes the audit chain in the browser, independently of the server.
 *
 * GET /api/audit/chain already recomputes every hash, but it is the server
 * vouching for its own log. This module lets the reader's browser do the same
 * arithmetic over the raw export, so "the chain verifies" is something a
 * reviewer can watch happen rather than a verdict they are handed.
 *
 * It has to reproduce backend/core/audit.py exactly:
 *
 *   hash = SHA-256( prev_hash_utf8 || json.dumps(body, sort_keys=True,
 *                                                separators=(",", ":"),
 *                                                default=str) )
 *
 * where body is the stored record without its own "hash" key. Three details
 * of Python's json.dumps decide whether the bytes match, and JSON.stringify
 * gets all three wrong:
 *
 *   1. ensure_ascii is on by default, so every character outside printable
 *      ASCII is written as a lowercase \uXXXX escape. The log contains
 *      "—" today; JSON.stringify would emit the raw em dash.
 *   2. Floats are written with Python's repr. The log contains 1.0, which
 *      JSON.parse turns into the number 1 and JSON.stringify writes as "1".
 *      So numbers are never converted here: the parser keeps each number's
 *      source text, and the file was itself written by json.dumps, so that
 *      text is already exactly what Python would write again.
 *   3. Keys are sorted by code point at every depth.
 *
 * Dependency-free and alias-free on purpose, so the same file can be run
 * under Node against storage/logs/audit.jsonl to prove it agrees with the
 * backend before it ever runs in a browser.
 */

export const GENESIS_HASH = '0'.repeat(64)

/* ------------------------------------------------------------------------ */
/* A JSON value that remembers how its numbers were written.                */
/* ------------------------------------------------------------------------ */

export type JValue =
  | { t: 'object'; entries: [string, JValue][] }
  | { t: 'array'; items: JValue[] }
  | { t: 'string'; value: string }
  | { t: 'number'; raw: string }
  | { t: 'bool'; value: boolean }
  | { t: 'null' }

class ParseError extends Error {}

/**
 * A strict recursive-descent parser. It accepts what Python's json.loads
 * accepts, including the NaN and Infinity tokens json.dumps writes by
 * default, and rejects anything else so a damaged line is reported rather
 * than half-read.
 */
export function parseJson(text: string): JValue {
  let i = 0

  const ws = () => {
    while (i < text.length) {
      const c = text.charCodeAt(i)
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) i++
      else break
    }
  }

  const value = (): JValue => {
    ws()
    const c = text[i]
    if (c === '{') return object()
    if (c === '[') return array()
    if (c === '"') return { t: 'string', value: string() }
    if (text.startsWith('true', i)) {
      i += 4
      return { t: 'bool', value: true }
    }
    if (text.startsWith('false', i)) {
      i += 5
      return { t: 'bool', value: false }
    }
    if (text.startsWith('null', i)) {
      i += 4
      return { t: 'null' }
    }
    return number()
  }

  const object = (): JValue => {
    i++ // {
    const entries: [string, JValue][] = []
    ws()
    if (text[i] === '}') {
      i++
      return { t: 'object', entries }
    }
    for (;;) {
      ws()
      if (text[i] !== '"') throw new ParseError(`expected a key at ${i}`)
      const key = string()
      ws()
      if (text[i] !== ':') throw new ParseError(`expected ':' at ${i}`)
      i++
      entries.push([key, value()])
      ws()
      if (text[i] === ',') {
        i++
        continue
      }
      if (text[i] === '}') {
        i++
        return { t: 'object', entries }
      }
      throw new ParseError(`expected ',' or '}' at ${i}`)
    }
  }

  const array = (): JValue => {
    i++ // [
    const items: JValue[] = []
    ws()
    if (text[i] === ']') {
      i++
      return { t: 'array', items }
    }
    for (;;) {
      items.push(value())
      ws()
      if (text[i] === ',') {
        i++
        continue
      }
      if (text[i] === ']') {
        i++
        return { t: 'array', items }
      }
      throw new ParseError(`expected ',' or ']' at ${i}`)
    }
  }

  const string = (): string => {
    i++ // opening quote
    let out = ''
    for (;;) {
      if (i >= text.length) throw new ParseError('unterminated string')
      const c = text[i]
      if (c === '"') {
        i++
        return out
      }
      if (c !== '\\') {
        out += c
        i++
        continue
      }
      const e = text[i + 1]
      i += 2
      if (e === '"' || e === '\\' || e === '/') out += e
      else if (e === 'b') out += '\b'
      else if (e === 'f') out += '\f'
      else if (e === 'n') out += '\n'
      else if (e === 'r') out += '\r'
      else if (e === 't') out += '\t'
      else if (e === 'u') {
        const hex = text.slice(i, i + 4)
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new ParseError(`bad \\u escape at ${i}`)
        // One UTF-16 code unit per escape. Surrogate pairs therefore
        // reassemble on their own, and a lone surrogate survives intact,
        // which is what Python does too.
        out += String.fromCharCode(parseInt(hex, 16))
        i += 4
      } else throw new ParseError(`bad escape at ${i}`)
    }
  }

  const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y

  const number = (): JValue => {
    for (const special of ['NaN', 'Infinity', '-Infinity']) {
      if (text.startsWith(special, i)) {
        i += special.length
        return { t: 'number', raw: special }
      }
    }
    NUMBER.lastIndex = i
    const match = NUMBER.exec(text)
    if (!match || match[0].length === 0) throw new ParseError(`unexpected character at ${i}`)
    i += match[0].length
    return { t: 'number', raw: match[0] }
  }

  const result = value()
  ws()
  if (i !== text.length) throw new ParseError(`trailing characters at ${i}`)
  return result
}

/* ------------------------------------------------------------------------ */
/* Python's json.dumps(sort_keys=True, separators=(",", ":")).              */
/* ------------------------------------------------------------------------ */

const SHORT_ESCAPES: Record<string, string> = {
  '"': '\\"',
  '\\': '\\\\',
  '\b': '\\b',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
}

/**
 * encode_basestring_ascii. Printable ASCII (0x20 to 0x7e) passes through;
 * everything else, DEL included, becomes a lowercase four-digit escape per
 * UTF-16 code unit, which is how CPython splits astral characters too.
 */
export function pyAsciiString(s: string): string {
  let out = '"'
  for (let k = 0; k < s.length; k++) {
    const ch = s[k]
    const code = s.charCodeAt(k)
    const short = SHORT_ESCAPES[ch]
    if (short) out += short
    else if (code >= 0x20 && code <= 0x7e) out += ch
    else out += '\\u' + code.toString(16).padStart(4, '0')
  }
  return out + '"'
}

/** Python compares str keys by code point, not by UTF-16 code unit. */
function compareCodePoints(a: string, b: string): number {
  const ia = a[Symbol.iterator]()
  const ib = b[Symbol.iterator]()
  for (;;) {
    const x = ia.next()
    const y = ib.next()
    if (x.done && y.done) return 0
    if (x.done) return -1
    if (y.done) return 1
    const cx = x.value.codePointAt(0) as number
    const cy = y.value.codePointAt(0) as number
    if (cx !== cy) return cx - cy
  }
}

export function pyCanonical(v: JValue): string {
  switch (v.t) {
    case 'object': {
      // A repeated key keeps its last value, as a Python dict would.
      const merged = new Map<string, JValue>()
      for (const [key, value] of v.entries) merged.set(key, value)
      const keys = [...merged.keys()].sort(compareCodePoints)
      return (
        '{' +
        keys.map((key) => pyAsciiString(key) + ':' + pyCanonical(merged.get(key) as JValue)).join(',') +
        '}'
      )
    }
    case 'array':
      return '[' + v.items.map(pyCanonical).join(',') + ']'
    case 'string':
      return pyAsciiString(v.value)
    case 'number':
      return v.raw
    case 'bool':
      return v.value ? 'true' : 'false'
    case 'null':
      return 'null'
  }
}

/* ------------------------------------------------------------------------ */
/* SHA-256.                                                                  */
/* ------------------------------------------------------------------------ */

/*
 * The browser's own implementation is used wherever it exists. It is only
 * exposed on a secure origin, though, and http://<lan-address>:3000 is not
 * one, so a plain implementation of FIPS 180-4 sits behind it. Both are
 * checked against the stored hashes in the log, not merely against each other.
 */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

export function sha256HexFallback(bytes: Uint8Array): string {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const bitLength = bytes.length * 8
  const padded = new Uint8Array((((bytes.length + 9 + 63) >> 6) << 6))
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  // Messages here are a few kilobytes, so the high word of the length is 0.
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000))
  view.setUint32(padded.length - 4, bitLength >>> 0)

  const w = new Uint32Array(64)
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(offset + t * 4)
    for (let t = 16; t < 64; t++) {
      const a = w[t - 15]
      const b = w[t - 2]
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3)
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10)
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0
    }
    let a = h[0]
    let b = h[1]
    let c = h[2]
    let d = h[3]
    let e = h[4]
    let f = h[5]
    let g = h[6]
    let hh = h[7]
    for (let t = 0; t < 64; t++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
      const ch = (e & f) ^ (~e & g)
      const t1 = (hh + S1 + ch + K[t] + w[t]) >>> 0
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) >>> 0
      hh = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }
    h[0] = (h[0] + a) >>> 0
    h[1] = (h[1] + b) >>> 0
    h[2] = (h[2] + c) >>> 0
    h[3] = (h[3] + d) >>> 0
    h[4] = (h[4] + e) >>> 0
    h[5] = (h[5] + f) >>> 0
    h[6] = (h[6] + g) >>> 0
    h[7] = (h[7] + hh) >>> 0
  }
  let hex = ''
  for (let k = 0; k < 8; k++) hex += h[k].toString(16).padStart(8, '0')
  return hex
}

type Subtle = { digest: (algorithm: string, data: Uint8Array) => Promise<ArrayBuffer> }

function subtleCrypto(): Subtle | null {
  const c = (globalThis as { crypto?: { subtle?: Subtle } }).crypto
  return c && c.subtle && typeof c.subtle.digest === 'function' ? c.subtle : null
}

/** Which implementation computed the hashes, so the page can say so. */
export function hashEngine(): 'webcrypto' | 'fallback' {
  return subtleCrypto() ? 'webcrypto' : 'fallback'
}

const encoder = new TextEncoder()

export async function sha256Hex(message: string): Promise<string> {
  const bytes = encoder.encode(message)
  const subtle = subtleCrypto()
  if (!subtle) return sha256HexFallback(bytes)
  const digest = new Uint8Array(await subtle.digest('SHA-256', bytes))
  let hex = ''
  for (let k = 0; k < digest.length; k++) hex += digest[k].toString(16).padStart(2, '0')
  return hex
}

/* ------------------------------------------------------------------------ */
/* The log.                                                                  */
/* ------------------------------------------------------------------------ */

export interface ChainRecord {
  /** Position in the file, from 0. */
  index: number
  sequence: number | null
  /** The record as stored, numbers and all. */
  body: JValue & { t: 'object' }
  /** The stored "hash", if it is a string. */
  hash: string | null
  /** The stored "prev_hash", if it is a string. */
  prevHash: string | null
  category: string | null
  action: string | null
  actor: string | null
  at: string | null
}

function field(record: JValue & { t: 'object' }, key: string): JValue | undefined {
  let found: JValue | undefined
  for (const [k, v] of record.entries) if (k === key) found = v
  return found
}

function asString(v: JValue | undefined): string | null {
  return v && v.t === 'string' ? v.value : null
}

/**
 * Split the export into records exactly as AuditLog._iter_raw does: blank
 * lines are ignored and a line that does not parse is skipped. The skipped
 * count is reported, because a line the server silently drops is still
 * something a reader should be told about.
 */
export function parseExport(text: string): { records: ChainRecord[]; skipped: number } {
  const records: ChainRecord[] = []
  let skipped = 0
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    let parsed: JValue
    try {
      parsed = parseJson(line)
    } catch {
      skipped++
      continue
    }
    if (parsed.t !== 'object') {
      skipped++
      continue
    }
    const sequenceValue = field(parsed, 'sequence')
    const sequence =
      sequenceValue && sequenceValue.t === 'number' && /^-?\d+$/.test(sequenceValue.raw)
        ? Number(sequenceValue.raw)
        : null
    records.push({
      index: records.length,
      sequence,
      body: parsed,
      hash: asString(field(parsed, 'hash')),
      prevHash: asString(field(parsed, 'prev_hash')),
      category: asString(field(parsed, 'category')),
      action: asString(field(parsed, 'action')),
      actor: asString(field(parsed, 'actor')),
      at: asString(field(parsed, 'at')),
    })
  }
  return { records, skipped }
}

/** The canonical body that was hashed: the record without its own hash. */
export function canonicalBody(record: ChainRecord): string {
  return pyCanonical({
    t: 'object',
    entries: record.body.entries.filter(([key]) => key !== 'hash'),
  })
}

export type RecordVerdict =
  | { ok: true }
  | {
      ok: false
      /**
       * link:   its prev_hash is not the stored hash of the record before it,
       *         so something between the two was removed, inserted or altered.
       * digest: its own content no longer produces its own stored hash, so
       *         this record was changed after it was written.
       */
      reasons: ('link' | 'digest')[]
      expectedPrev: string
      recomputed: string
    }

/**
 * Check one record against the stored hash of the one before it.
 *
 * The server stops at the first divergence. This reports each record on its
 * own, and hashes a record against the prev_hash it claims rather than the one
 * it should have, which is what separates "this record was edited" from "a
 * record before this one went missing". Either way the record fails, so the
 * first failure found here is the same sequence the server reports.
 */
export async function verifyRecord(record: ChainRecord, previousHash: string): Promise<RecordVerdict> {
  const linkOk = record.prevHash !== null && record.prevHash === previousHash
  const claimedPrev = record.prevHash ?? ''
  const recomputed = await sha256Hex(claimedPrev + canonicalBody(record))
  const digestOk = record.hash !== null && recomputed === record.hash
  if (linkOk && digestOk) return { ok: true }
  const reasons: ('link' | 'digest')[] = []
  if (!linkOk) reasons.push('link')
  if (!digestOk) reasons.push('digest')
  return { ok: false, reasons, expectedPrev: previousHash, recomputed }
}

/**
 * What the next record must commit to. Python carries str(stored_hash), so a
 * record with no string hash hands its successor a value nothing can match.
 */
export function carriedHash(record: ChainRecord): string {
  return record.hash ?? '\u0000missing'
}
