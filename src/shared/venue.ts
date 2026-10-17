import { z } from 'zod'

/** The address part before the base domain: `warungbudi` in warungbudi.layardapur.web.id. */
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/

/** Hosts the platform keeps for itself; `main` is the original dapur on the bare domain. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'app',
  'console',
  'main',
  'mail',
  'static',
  'www',
])

export const MAIN_SLUG = 'main'

export const venueSlugSchema = z
  .string()
  .regex(SLUG_PATTERN)
  .refine((slug) => !RESERVED_SLUGS.has(slug))

export const adminPasswordSchema = z.string().min(8).max(200)

export const venueCreateSchema = z.object({
  slug: venueSlugSchema,
  name: z.string().trim().min(1).max(60),
  adminPassword: adminPasswordSchema,
})
export type VenueCreate = z.infer<typeof venueCreateSchema>

export const venueSchema = z.object({
  slug: z.string(),
  name: z.string(),
  createdAt: z.number(),
  disabled: z.boolean(),
})
export type Venue = z.infer<typeof venueSchema>

export const venueListSchema = z.object({ venues: z.array(venueSchema) })

/** Turns a dapur name into an address suggestion: "Warung Bu Sri" -> "warung-bu-sri". */
export function suggestSlug(name: string) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/, '')
}

export type Place =
  | { kind: 'venue'; slug: string; room: string }
  | { kind: 'console' }
  | { kind: 'unknown' }

/** Room name for a dapur; the original dapur keeps its old room. */
export function roomFor(slug: string) {
  return slug === MAIN_SLUG ? MAIN_SLUG : `venue:${slug}`
}

/**
 * Which dapur (or the console) a hostname belongs to. Hosts outside the base
 * domain (workers.dev, localhost, tests) stay on the original dapur.
 */
export function placeFromHost(
  hostname: string,
  base: string | undefined,
): Place {
  const host = hostname.toLowerCase()
  const main: Place = { kind: 'venue', slug: MAIN_SLUG, room: MAIN_SLUG }
  if (!base || host === base || host === `www.${base}`) return main
  if (!host.endsWith(`.${base}`)) return main
  const label = host.slice(0, -(base.length + 1))
  if (label === 'console') return { kind: 'console' }
  if (!SLUG_PATTERN.test(label) || RESERVED_SLUGS.has(label)) {
    return { kind: 'unknown' }
  }
  return { kind: 'venue', slug: label, room: roomFor(label) }
}
