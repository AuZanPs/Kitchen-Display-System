import type { MenuItemInput, ModifierGroup } from './menu'

/** Ready menus for common kinds of dapur; prices are typical, not advice. */
type TemplateItem = [
  category: string,
  name: string,
  priceIdr: number,
  groups?: ModifierGroup[],
]

const pedas: ModifierGroup = {
  id: 'pedas',
  name: 'Level pedas',
  required: true,
  multi: false,
  options: [
    { id: 'tidak', name: 'Tidak pedas', priceDeltaIdr: 0 },
    { id: 'sedang', name: 'Pedas sedang', priceDeltaIdr: 0 },
    { id: 'extra', name: 'Extra pedas', priceDeltaIdr: 0 },
  ],
}
const suhu: ModifierGroup = {
  id: 'suhu',
  name: 'Suhu',
  required: true,
  multi: false,
  options: [
    { id: 'dingin', name: 'Dingin', priceDeltaIdr: 0 },
    { id: 'panas', name: 'Panas', priceDeltaIdr: 0 },
  ],
}
const gula: ModifierGroup = {
  id: 'gula',
  name: 'Gula',
  required: false,
  multi: false,
  options: [
    { id: 'normal', name: 'Gula normal', priceDeltaIdr: 0 },
    { id: 'sedikit', name: 'Sedikit gula', priceDeltaIdr: 0 },
    { id: 'tanpa', name: 'Tanpa gula', priceDeltaIdr: 0 },
  ],
}
const nasi: ModifierGroup = {
  id: 'nasi',
  name: 'Nasi',
  required: false,
  multi: false,
  options: [
    { id: 'putih', name: 'Nasi putih', priceDeltaIdr: 5000 },
    { id: 'uduk', name: 'Nasi uduk', priceDeltaIdr: 7000 },
    { id: 'tanpa', name: 'Tanpa nasi', priceDeltaIdr: 0 },
  ],
}
const telur: ModifierGroup = {
  id: 'tambahan',
  name: 'Tambahan',
  required: false,
  multi: true,
  options: [
    { id: 'telur', name: 'Telur ceplok', priceDeltaIdr: 5000 },
    { id: 'kerupuk', name: 'Kerupuk', priceDeltaIdr: 3000 },
  ],
}
const kopi: ModifierGroup = {
  id: 'shot',
  name: 'Tambahan',
  required: false,
  multi: true,
  options: [
    { id: 'shot', name: 'Extra shot', priceDeltaIdr: 6000 },
    { id: 'oat', name: 'Susu oat', priceDeltaIdr: 8000 },
  ],
}
const drinks: TemplateItem[] = [
  ['Minuman', 'Es Teh Manis', 6000, [gula]],
  ['Minuman', 'Teh Hangat', 5000, [gula]],
  ['Minuman', 'Es Jeruk', 10000, [suhu, gula]],
  ['Minuman', 'Air Mineral', 5000],
]

export type MenuTemplate = {
  id: string
  name: string
  lead: string
  items: TemplateItem[]
}

export const MENU_TEMPLATES: MenuTemplate[] = [
  {
    id: 'rumah-makan',
    name: 'Rumah makan',
    lead: 'Nasi, lauk, sayur dan minuman.',
    items: [
      ['Nasi & lauk', 'Nasi Goreng Spesial', 30000, [pedas, telur]],
      ['Nasi & lauk', 'Nasi Ayam Goreng', 28000, [pedas]],
      ['Nasi & lauk', 'Nasi Ayam Bakar', 30000, [pedas]],
      ['Nasi & lauk', 'Nasi Rendang', 35000],
      ['Nasi & lauk', 'Nasi Ikan Bakar', 38000, [pedas]],
      ['Sayur & sup', 'Sayur Asem', 12000],
      ['Sayur & sup', 'Cah Kangkung', 15000, [pedas]],
      ['Sayur & sup', 'Sop Buntut', 55000],
      ['Sayur & sup', 'Soto Ayam', 25000],
      ['Tambahan', 'Nasi Putih', 6000],
      ['Tambahan', 'Tempe Goreng', 5000],
      ['Tambahan', 'Tahu Goreng', 5000],
      ['Tambahan', 'Sambal Terasi', 4000],
      ...drinks,
    ],
  },
  {
    id: 'kedai-kopi',
    name: 'Kedai kopi',
    lead: 'Kopi, non-kopi dan camilan.',
    items: [
      ['Kopi', 'Es Kopi Susu Gula Aren', 22000, [gula, kopi]],
      ['Kopi', 'Americano', 20000, [suhu, kopi]],
      ['Kopi', 'Cafe Latte', 25000, [suhu, gula, kopi]],
      ['Kopi', 'Cappuccino', 25000, [suhu, gula, kopi]],
      ['Kopi', 'Kopi Tubruk', 12000, [gula]],
      ['Non-kopi', 'Matcha Latte', 26000, [suhu, gula]],
      ['Non-kopi', 'Coklat', 24000, [suhu, gula]],
      ['Non-kopi', 'Teh Tarik', 18000, [suhu, gula]],
      ['Non-kopi', 'Lemon Tea', 16000, [suhu, gula]],
      ['Camilan', 'Kentang Goreng', 20000],
      ['Camilan', 'Pisang Goreng', 18000],
      ['Camilan', 'Roti Bakar Coklat Keju', 22000],
      ['Camilan', 'Croissant', 22000],
      ['Minuman', 'Air Mineral', 6000],
    ],
  },
  {
    id: 'mi-bakso',
    name: 'Mi & bakso',
    lead: 'Mi ayam, bakso dan teman makannya.',
    items: [
      ['Mi', 'Mi Ayam', 18000, [pedas]],
      ['Mi', 'Mi Ayam Bakso', 23000, [pedas]],
      ['Mi', 'Mi Ayam Pangsit', 23000, [pedas]],
      ['Mi', 'Mi Goreng', 20000, [pedas, telur]],
      ['Mi', 'Kwetiau Goreng', 22000, [pedas, telur]],
      ['Bakso', 'Bakso Urat', 22000],
      ['Bakso', 'Bakso Telur', 24000],
      ['Bakso', 'Bakso Campur', 25000],
      ['Bakso', 'Bakso Kuah Pangsit', 22000],
      ['Tambahan', 'Pangsit Goreng', 8000],
      ['Tambahan', 'Ceker', 6000],
      ['Tambahan', 'Tahu Bakso', 5000],
      ...drinks,
    ],
  },
  {
    id: 'ayam-penyet',
    name: 'Ayam & lalapan',
    lead: 'Ayam, bebek, lele dengan sambal.',
    items: [
      ['Lalapan', 'Ayam Penyet', 22000, [pedas, nasi]],
      ['Lalapan', 'Ayam Geprek', 20000, [pedas, nasi]],
      ['Lalapan', 'Bebek Goreng', 32000, [pedas, nasi]],
      ['Lalapan', 'Lele Goreng', 18000, [pedas, nasi]],
      ['Lalapan', 'Ati Ampela', 10000, [nasi]],
      ['Lalapan', 'Tempe Penyet', 12000, [pedas, nasi]],
      ['Tambahan', 'Nasi Putih', 5000],
      ['Tambahan', 'Telur Dadar', 6000],
      ['Tambahan', 'Sambal Extra', 3000],
      ['Tambahan', 'Lalapan Extra', 4000],
      ...drinks,
    ],
  },
]

/** A template as items the import call takes, numbered from `firstSort`. */
export function templateItems(
  template: MenuTemplate,
  firstSort: number,
): MenuItemInput[] {
  return template.items.map(([category, name, priceIdr, groups], i) => ({
    name,
    priceIdr,
    category,
    sort: firstSort + i,
    available: true,
    hidden: false,
    modifierGroups: groups ?? [],
  }))
}
