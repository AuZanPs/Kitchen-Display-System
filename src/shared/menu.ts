import { z } from 'zod'

export const modifierOptionSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(60),
  priceDeltaIdr: z.number().int().min(0).max(10_000_000),
})

export const modifierGroupSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(60),
  required: z.boolean(),
  multi: z.boolean(),
  options: z.array(modifierOptionSchema).min(1).max(20),
})

export const modifierGroupsSchema = z.array(modifierGroupSchema).max(10)

export const menuItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  priceIdr: z.number().int(),
  category: z.string(),
  available: z.boolean(),
  modifierGroups: modifierGroupsSchema,
})

export const tableSchema = z.object({
  id: z.string(),
  label: z.string(),
})

export const menuSchema = z.object({ items: z.array(menuItemSchema) })
export const tablesSchema = z.object({ tables: z.array(tableSchema) })

// Option ids are matched across all groups of an item, so they must be unique per item.
function uniqueIds(groups: ModifierGroup[]) {
  const optionIds = groups.flatMap((g) => g.options.map((o) => o.id))
  return (
    new Set(groups.map((g) => g.id)).size === groups.length &&
    new Set(optionIds).size === optionIds.length
  )
}

/** What the admin sends to create or replace a menu item. */
export const menuItemInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  priceIdr: z.number().int().min(0).max(10_000_000),
  category: z.string().trim().min(1).max(30),
  sort: z.number().int().min(0).max(100_000),
  available: z.boolean(),
  hidden: z.boolean(),
  modifierGroups: modifierGroupsSchema.refine(uniqueIds, {
    message: 'Duplicate modifier id',
  }),
})

export const adminMenuItemSchema = menuItemInputSchema.extend({
  id: z.string(),
})
export const adminMenuSchema = z.object({ items: z.array(adminMenuItemSchema) })

export const tableInputSchema = z.object({
  label: z.string().trim().min(1).max(20),
  sort: z.number().int().min(0).max(100_000),
  active: z.boolean(),
})
export const adminTableSchema = tableInputSchema.extend({ id: z.string() })
export const adminTablesSchema = z.object({
  tables: z.array(adminTableSchema),
})

export type ModifierGroup = z.infer<typeof modifierGroupSchema>
export type MenuItem = z.infer<typeof menuItemSchema>
export type Table = z.infer<typeof tableSchema>
export type MenuItemInput = z.infer<typeof menuItemInputSchema>
export type AdminMenuItem = z.infer<typeof adminMenuItemSchema>
export type TableInput = z.infer<typeof tableInputSchema>
export type AdminTable = z.infer<typeof adminTableSchema>

export type ChosenOptions =
  | { ok: true; names: string[]; priceDeltaIdr: number }
  | { ok: false; message: string }

/** Checks the options chosen for one line against the item's modifier groups. */
export function chooseOptions(
  groups: ModifierGroup[],
  optionIds: string[],
): ChosenOptions {
  if (new Set(optionIds).size !== optionIds.length) {
    return { ok: false, message: 'Pilihan yang sama dipilih dua kali.' }
  }
  const names: string[] = []
  let priceDeltaIdr = 0
  let matched = 0
  for (const group of groups) {
    const picked = group.options.filter((o) => optionIds.includes(o.id))
    matched += picked.length
    if (group.required && picked.length === 0) {
      return { ok: false, message: `Pilih ${group.name}.` }
    }
    if (!group.multi && picked.length > 1) {
      return { ok: false, message: `Pilih satu ${group.name} saja.` }
    }
    for (const option of picked) {
      names.push(option.name)
      priceDeltaIdr += option.priceDeltaIdr
    }
  }
  if (matched !== optionIds.length) {
    return { ok: false, message: 'Pilihan tidak tersedia untuk menu ini.' }
  }
  return { ok: true, names, priceDeltaIdr }
}
