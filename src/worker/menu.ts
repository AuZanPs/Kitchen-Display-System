import { eq } from 'drizzle-orm'
import {
  type AdminMenuItem,
  type AdminTable,
  type MenuItem,
  type MenuItemInput,
  modifierGroupsSchema,
  type Table,
  type TableInput,
} from '../shared/menu'
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
