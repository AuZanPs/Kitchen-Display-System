import { z } from 'zod'

/** The address part before the base domain: `warungbudi` in warungbudi.layardapur.web.id. */
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/

/** Hosts the platform keeps for itself. */
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

/** Dapur limits; the console and the account page check the same numbers. */
export const VENUE_LIMITS = {
  name: 60,
  passwordMin: 8,
  /** Admins an owner may invite to one dapur, besides themselves. */
  invitedAdmins: 3,
} as const

/** The first dapur; its data lives in the room the pilot started with. */
export const FIRST_SLUG = 'dapurku'
const FIRST_ROOM = 'main'

/** A label that can address a dapur: the right shape and not reserved. */
export function isVenueSlug(label: string) {
  return SLUG_PATTERN.test(label) && !RESERVED_SLUGS.has(label)
}

export const venueSlugSchema = z
  .string()
  .regex(SLUG_PATTERN)
  .refine((slug) => !RESERVED_SLUGS.has(slug))

export const adminPasswordSchema = z
  .string()
  .min(VENUE_LIMITS.passwordMin)
  .max(200)

export const ownerEmailSchema = z
  .email()
  .max(200)
  .transform((e) => e.toLowerCase())

export const venueNameSchema = z.string().trim().min(1).max(VENUE_LIMITS.name)

export const venueCreateSchema = z.object({
  slug: venueSlugSchema,
  name: venueNameSchema,
  adminPassword: adminPasswordSchema,
  ownerEmail: ownerEmailSchema.optional(),
})

export const accountVenueSchema = z.object({
  slug: z.string(),
  name: z.string(),
  disabled: z.boolean(),
  role: z.enum(['owner', 'admin']),
  /** The owner's invited admins; empty for an invited admin. */
  admins: z.array(z.string()),
})
export type AccountVenue = z.infer<typeof accountVenueSchema>

/** The signed-in owner on the site and the dapur they can open. */
export const accountSchema = z.object({
  email: z.string(),
  venues: z.array(accountVenueSchema),
})

export const venueSchema = z.object({
  slug: z.string(),
  name: z.string(),
  createdAt: z.number(),
  disabled: z.boolean(),
  ownerEmail: z.string().nullable(),
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
  | { kind: 'site' }
  | { kind: 'venue'; slug: string; room: string }
  | { kind: 'console' }
  | { kind: 'unknown' }

/** Room name for a dapur; the first dapur keeps the pilot's room and data. */
export function roomFor(slug: string) {
  return slug === FIRST_SLUG ? FIRST_ROOM : `venue:${slug}`
}

/**
 * What a hostname is: the public site (bare domain), the console, or one
 * dapur. Hosts outside the base domain (workers.dev, a LAN address, tests)
 * reach the first dapur, so its older addresses keep working.
 */
export function placeFromHost(
  hostname: string,
  base: string | undefined,
): Place {
  const host = hostname.toLowerCase()
  if (base && (host === base || host === `www.${base}`)) return { kind: 'site' }
  if (!base || !host.endsWith(`.${base}`)) {
    return { kind: 'venue', slug: FIRST_SLUG, room: FIRST_ROOM }
  }
  const label = host.slice(0, -(base.length + 1))
  if (label === 'console') return { kind: 'console' }
  if (!isVenueSlug(label)) return { kind: 'unknown' }
  return { kind: 'venue', slug: label, room: roomFor(label) }
}
