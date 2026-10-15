/**
 * crypto.randomUUID only exists on https and localhost. Tablets reach a dev
 * server over plain http on the LAN, so build a v4 UUID from getRandomValues,
 * which works everywhere.
 */
export function uuid(
  secure = Reflect.get(globalThis, 'isSecureContext') === true,
): string {
  if (secure) {
    return crypto.randomUUID()
  }
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
