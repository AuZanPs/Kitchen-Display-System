import { parseCsv } from '../../shared/menu-import'

/** Reads the first sheet of an .xlsx file, or a .csv file, into rows of text. */
export async function readMenuFile(file: File): Promise<string[][]> {
  // A menu sheet is a few kilobytes; anything this big is not one.
  if (file.size > 5 * 1024 * 1024) throw new Error('file too large')
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') {
    return parseCsv(await file.text())
  }
  const zip = await unzip(await file.arrayBuffer())
  const xml = async (path: string) => {
    const text = await zip(path)
    return text === null
      ? null
      : new DOMParser().parseFromString(text, 'application/xml')
  }
  const strings = [
    ...((await xml('xl/sharedStrings.xml'))?.getElementsByTagNameNS(
      '*',
      'si',
    ) ?? []),
  ].map(textOf)
  const sheet = await xml(await firstSheetPath(xml))
  if (!sheet) throw new Error('no sheet')

  const rows: string[][] = []
  for (const row of sheet.getElementsByTagNameNS('*', 'row')) {
    const cells: string[] = []
    for (const c of row.getElementsByTagNameNS('*', 'c')) {
      const column = columnIndex(c.getAttribute('r') ?? '')
      const type = c.getAttribute('t')
      const value = c.getElementsByTagNameNS('*', 'v')[0]?.textContent ?? ''
      cells[column < 0 ? cells.length : column] =
        type === 's'
          ? (strings[Number(value)] ?? '')
          : type === 'inlineStr'
            ? textOf(c)
            : value
    }
    rows.push(Array.from(cells, (cell) => cell ?? ''))
  }
  return rows
}

function textOf(node: Element) {
  return [...node.getElementsByTagNameNS('*', 't')]
    .map((t) => t.textContent ?? '')
    .join('')
}

// "B12" is column 1; a cell without a reference follows the one before it.
function columnIndex(ref: string) {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? ''
  let n = 0
  for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64
  return n - 1
}

async function firstSheetPath(
  xml: (path: string) => Promise<Document | null>,
): Promise<string> {
  const fallback = 'xl/worksheets/sheet1.xml'
  const book = await xml('xl/workbook.xml')
  const rels = await xml('xl/_rels/workbook.xml.rels')
  const relId = book
    ?.getElementsByTagNameNS('*', 'sheet')[0]
    ?.getAttributeNS(
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'id',
    )
  if (!rels || !relId) return fallback
  for (const rel of rels.getElementsByTagNameNS('*', 'Relationship')) {
    if (rel.getAttribute('Id') !== relId) continue
    const target = rel.getAttribute('Target') ?? ''
    return target.startsWith('/') ? target.slice(1) : `xl/${target}`
  }
  return fallback
}

/** A minimal zip reader: finds entries through the central directory. */
async function unzip(buffer: ArrayBuffer) {
  const view = new DataView(buffer)
  let end = buffer.byteLength - 22
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--
  if (end < 0) throw new Error('not a zip file')
  const count = view.getUint16(end + 10, true)
  const entries = new Map<
    string,
    { offset: number; size: number; unpacked: number; method: number }
  >()
  let at = view.getUint32(end + 16, true)
  const decoder = new TextDecoder()
  for (let i = 0; i < count && view.getUint32(at, true) === 0x02014b50; i++) {
    const nameLength = view.getUint16(at + 28, true)
    const name = decoder.decode(new Uint8Array(buffer, at + 46, nameLength))
    entries.set(name, {
      method: view.getUint16(at + 10, true),
      size: view.getUint32(at + 20, true),
      unpacked: view.getUint32(at + 24, true),
      offset: view.getUint32(at + 42, true),
    })
    at +=
      46 +
      nameLength +
      view.getUint16(at + 30, true) +
      view.getUint16(at + 32, true)
  }
  return async (path: string): Promise<string | null> => {
    const entry = entries.get(path)
    if (!entry) return null
    // A tiny file that inflates to gigabytes would freeze the tab.
    if (entry.unpacked > 20 * 1024 * 1024) throw new Error('entry too large')
    const local = entry.offset
    const start =
      local +
      30 +
      view.getUint16(local + 26, true) +
      view.getUint16(local + 28, true)
    const data = new Uint8Array(buffer, start, entry.size)
    if (entry.method === 0) return decoder.decode(data)
    if (entry.method !== 8) throw new Error('unsupported zip entry')
    const stream = new Blob([data])
      .stream()
      .pipeThrough(new DecompressionStream('deflate-raw'))
    return new Response(stream).text()
  }
}
