import type { Table } from '../../shared/menu'

/** Big table buttons for a picker dialog; the current table is filled in. */
export function TableGrid({
  tables,
  isCurrent,
  onPick,
}: {
  tables: Table[] | null
  isCurrent: (table: Table) => boolean
  onPick: (table: Table) => void
}) {
  return (
    <ul className="grid grid-cols-3 gap-3 pb-2 sm:grid-cols-4">
      {tables?.map((table) => {
        const current = isCurrent(table)
        return (
          <li key={table.id}>
            <button
              type="button"
              aria-pressed={current}
              onClick={() => onPick(table)}
              className={`state grid min-h-20 w-full place-items-center rounded-md text-lg font-medium transition-[background-color,scale] duration-150 active:scale-[0.97] ${current ? 'bg-ink text-surface' : '[--bg:var(--color-tonal)]'}`}
            >
              {table.label}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
