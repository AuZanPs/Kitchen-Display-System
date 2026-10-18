/**
 * One JSON line per event, so Workers Logs can filter by field. Never pass
 * passwords, PINs, tokens, cookies, emails or allergy text here.
 */
export function logEvent(
  level: 'info' | 'error',
  event: string,
  fields: Record<string, string | number | boolean | null> = {},
) {
  const line = JSON.stringify({ event, ...fields })
  if (level === 'error') console.error(line)
  else console.log(line)
}
