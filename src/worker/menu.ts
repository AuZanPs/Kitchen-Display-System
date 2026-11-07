import { eq } from 'drizzle-orm'
import {
  type AdminMenuItem,
  type AdminTable,
  type MenuItem,
  type MenuItemInput,
  type MenuPatch,
  modifierGroupsSchema,
  type Table,
  type TableInput,
} from '../shared/menu'
import type { MenuImport } from '../shared/menu-import'
import { bumpRev, type Db, getMeta, schema, setMeta } from './db'

type MenuRow = typeof schema.menuItems.$inferSelect

export function toAdminItem(row: MenuRow): AdminMenuItem {
  return {
    id: row.id,
    name: row.name,
    priceIdr: row.priceIdr,
    category: row.category,
    sort: row.sort,
    available: row.available,
    hidden: row.hidden,
    modifierGroups: modifierGroupsSchema.parse(
      JSON.parse(row.modifierGroupsJson),
    ),
  }
}

/** Tablets refetch the menu and tables when this moves (it rides on the board). */
function menuChanged(db: Db) {
  const version = Number(getMeta(db, 'menu_version') ?? 0) + 1
  setMeta(db, 'menu_version', String(version))
  bumpRev(db)
}

/** The menu tablets show: hidden items left out. */
export function visibleMenu(db: Db): MenuItem[] {
  return db
    .select()
    .from(schema.menuItems)
    .where(eq(schema.menuItems.hidden, false))
    .orderBy(schema.menuItems.sort, schema.menuItems.name)
    .all()
    .map((item) => ({
      id: item.id,
      name: item.name,
      priceIdr: item.priceIdr,
      category: item.category,
      available: item.available,
      modifierGroups: modifierGroupsSchema.parse(
        JSON.parse(item.modifierGroupsJson),
      ),
    }))
}

export function adminMenu(db: Db): AdminMenuItem[] {
  return db
    .select()
    .from(schema.menuItems)
    .orderBy(schema.menuItems.sort, schema.menuItems.name)
    .all()
    .map(toAdminItem)
}

/** Creates the item when `id` is null; returns null when `id` does not exist. */
export function saveMenuItem(
  db: Db,
  id: string | null,
  input: MenuItemInput,
  now: number,
): AdminMenuItem | null {
  const { modifierGroups, ...fields } = input
  const values = {
    ...fields,
    modifierGroupsJson: JSON.stringify(modifierGroups),
    updatedAt: now,
  }
  let itemId = id
  if (itemId === null) {
    itemId = crypto.randomUUID()
    db.insert(schema.menuItems)
      .values({ id: itemId, ...values })
      .run()
  } else {
    const found = db
      .select({ id: schema.menuItems.id })
      .from(schema.menuItems)
      .where(eq(schema.menuItems.id, itemId))
      .get()
    if (!found) return null
    db.update(schema.menuItems)
      .set(values)
      .where(eq(schema.menuItems.id, itemId))
      .run()
  }
  menuChanged(db)
  return { id: itemId, ...input }
}

/**
 * Adds many items in one go. Rows whose name and category already exist are
 * skipped, so importing the same file twice adds nothing.
 */
export function importMenu(db: Db, input: MenuImport, now: number) {
  const key = (name: string, category: string) =>
    `${category.toLowerCase()}\n${name.toLowerCase()}`
  const existing = db
    .select({
      id: schema.menuItems.id,
      name: schema.menuItems.name,
      category: schema.menuItems.category,
      hidden: schema.menuItems.hidden,
    })
    .from(schema.menuItems)
    .all()
  const seen = new Set(existing.map((r) => key(r.name, r.category)))
  let hidden = 0
  if (input.hideCurrent) {
    for (const row of existing.filter((r) => !r.hidden)) {
      db.update(schema.menuItems)
        .set({ hidden: true, updatedAt: now })
        .where(eq(schema.menuItems.id, row.id))
        .run()
      hidden++
    }
  }
  let added = 0
  for (const { modifierGroups, ...fields } of input.items) {
    const k = key(fields.name, fields.category)
    if (seen.has(k)) continue
    seen.add(k)
    db.insert(schema.menuItems)
      .values({
        id: crypto.randomUUID(),
        ...fields,
        modifierGroupsJson: JSON.stringify(modifierGroups),
        updatedAt: now,
      })
      .run()
    added++
  }
  if (added > 0 || hidden > 0) menuChanged(db)
  return { added, skipped: input.items.length - added, hidden }
}

/** Changes many items at once: sold out, hidden, order or category. */
export function patchMenu(db: Db, changes: MenuPatch['changes'], now: number) {
  let updated = 0
  for (const { id, ...set } of changes) {
    const rows = db
      .update(schema.menuItems)
      .set({ ...set, updatedAt: now })
      .where(eq(schema.menuItems.id, id))
      .returning({ id: schema.menuItems.id })
      .all()
    updated += rows.length
  }
  if (updated > 0) menuChanged(db)
  return updated
}

/**
 * Removes an item nobody ever ordered. An ordered item stays (old tickets and
 * history point at it) and can only be hidden.
 */
export function deleteMenuItem(db: Db, id: string) {
  const found = db
    .select({ id: schema.menuItems.id })
    .from(schema.menuItems)
    .where(eq(schema.menuItems.id, id))
    .get()
  if (!found) return 'missing'
  const ordered = db
    .select({ id: schema.orderLines.id })
    .from(schema.orderLines)
    .where(eq(schema.orderLines.menuItemId, id))
    .limit(1)
    .get()
  if (ordered) return 'ordered'
  db.delete(schema.menuItems).where(eq(schema.menuItems.id, id)).run()
  menuChanged(db)
  return 'deleted'
}

/** The tables tablets can pick: inactive ones left out. */
export function activeTables(db: Db): Table[] {
  return db
    .select({ id: schema.tables.id, label: schema.tables.label })
    .from(schema.tables)
    .where(eq(schema.tables.active, true))
    .orderBy(schema.tables.sort, schema.tables.label)
    .all()
}

export function adminTables(db: Db): AdminTable[] {
  return db
    .select()
    .from(schema.tables)
    .orderBy(schema.tables.sort, schema.tables.label)
    .all()
}

/** Creates the table when `id` is null; returns null when `id` does not exist. */
export function saveTable(
  db: Db,
  id: string | null,
  input: TableInput,
): AdminTable | null {
  let tableId = id
  if (tableId === null) {
    tableId = crypto.randomUUID()
    db.insert(schema.tables)
      .values({ id: tableId, ...input })
      .run()
  } else {
    const found = db
      .select({ id: schema.tables.id })
      .from(schema.tables)
      .where(eq(schema.tables.id, tableId))
      .get()
    if (!found) return null
    db.update(schema.tables)
      .set(input)
      .where(eq(schema.tables.id, tableId))
      .run()
  }
  menuChanged(db)
  return { id: tableId, ...input }
}
