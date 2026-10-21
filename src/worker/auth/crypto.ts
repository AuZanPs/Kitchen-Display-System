const encoder = new TextEncoder()

// About 7 ms per hash: the Workers Free plan allows 10 ms CPU per request.
// PINs are protected by lockouts and rate limits, not by hash cost.
export const PBKDF2_ITERATIONS = 20_000

export function toHex(bytes: ArrayBuffer | Uint8Array) {
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
}

export function randomHex(byteLength: number) {
  return toHex(crypto.getRandomValues(new Uint8Array(byteLength)))
}

export async function sha256Hex(text: string) {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(text)))
}

/** Constant-time comparison of two strings of equal length. */
export function safeEqual(a: string, b: string) {
  const left = encoder.encode(a)
  const right = encoder.encode(b)
  if (left.byteLength !== right.byteLength) return false
  return crypto.subtle.timingSafeEqual(left, right)
}

/** Six random digits without modulo bias. */
export function randomCode() {
  const limit = 4_294_000_000 // largest multiple of 1e6 below 2^32
  for (;;) {
    const [value = limit] = crypto.getRandomValues(new Uint32Array(1))
    if (value < limit) return String(value % 1_000_000).padStart(6, '0')
  }
}

export async function pbkdf2Hex(secret: string, saltHex: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const salt = new Uint8Array(
    saltHex.match(/../g)?.map((pair) => Number.parseInt(pair, 16)) ?? [],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  )
  return toHex(bits)
}

/** A fresh salt and the PBKDF2 hash of `secret` with it. */
export async function hashSecret(secret: string) {
  const salt = randomHex(16)
  return { salt, hash: await pbkdf2Hex(secret, salt) }
}

export async function secretMatches(
  candidate: string,
  salt: string,
  hash: string,
) {
  return safeEqual(hash, await pbkdf2Hex(candidate, salt))
}

/** Constant-time check of two secrets of any length, by their digests. */
export async function sameSecret(a: string, b: string) {
  const [left, right] = await Promise.all([sha256Hex(a), sha256Hex(b)])
  return safeEqual(left, right)
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

export async function hmacHex(secret: string, message: string) {
  const key = await hmacKey(secret)
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)))
}
