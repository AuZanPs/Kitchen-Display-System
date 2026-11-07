import type { MenuItemInput, ModifierGroup } from './menu'

/** Ready menus for common kinds of kitchens; prices are typical, not advice. */
type TemplateItem = [
  category: string,
  name: string,
  priceIdr: number,
  groups?: ModifierGroup[],
]

const spiceEn: ModifierGroup = {
  id: 'spice',
  name: 'Spice level',
  required: true,
  multi: false,
  options: [
    { id: 'mild', name: 'Not spicy', priceDeltaIdr: 0 },
    { id: 'medium', name: 'Medium spicy', priceDeltaIdr: 0 },
    { id: 'extra', name: 'Extra spicy', priceDeltaIdr: 0 },
  ],
}
const tempEn: ModifierGroup = {
  id: 'temp',
  name: 'Temperature',
  required: true,
  multi: false,
  options: [
    { id: 'iced', name: 'Iced', priceDeltaIdr: 0 },
    { id: 'hot', name: 'Hot', priceDeltaIdr: 0 },
  ],
}
const sugarEn: ModifierGroup = {
  id: 'sugar',
  name: 'Sugar',
  required: false,
  multi: false,
  options: [
    { id: 'normal', name: 'Normal sugar', priceDeltaIdr: 0 },
    { id: 'less', name: 'Less sugar', priceDeltaIdr: 0 },
    { id: 'none', name: 'No sugar', priceDeltaIdr: 0 },
  ],
}
const riceEn: ModifierGroup = {
  id: 'rice',
  name: 'Rice',
  required: false,
  multi: false,
  options: [
    { id: 'white', name: 'Steamed rice', priceDeltaIdr: 5000 },
    { id: 'coconut', name: 'Coconut rice', priceDeltaIdr: 7000 },
    { id: 'none', name: 'No rice', priceDeltaIdr: 0 },
  ],
}
const extrasEn: ModifierGroup = {
  id: 'extras',
  name: 'Add-ons',
  required: false,
  multi: true,
  options: [
    { id: 'egg', name: 'Fried egg', priceDeltaIdr: 5000 },
    { id: 'crackers', name: 'Crackers', priceDeltaIdr: 3000 },
  ],
}
const coffeeEn: ModifierGroup = {
  id: 'shot',
  name: 'Add-ons',
  required: false,
  multi: true,
  options: [
    { id: 'shot', name: 'Extra shot', priceDeltaIdr: 6000 },
    { id: 'oat', name: 'Oat milk', priceDeltaIdr: 8000 },
  ],
}
const drinksEn: TemplateItem[] = [
  ['Drinks', 'Sweet Iced Tea', 6000, [sugarEn]],
  ['Drinks', 'Hot Tea', 5000, [sugarEn]],
  ['Drinks', 'Fresh Orange Juice', 10000, [tempEn, sugarEn]],
  ['Drinks', 'Mineral Water', 5000],
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
const drinksId: TemplateItem[] = [
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
    name: 'Restaurant',
    lead: 'Rice, mains, soups, sides, and drinks.',
    items: [
      ['Rice & mains', 'Special Fried Rice', 30000, [spiceEn, extrasEn]],
      ['Rice & mains', 'Fried Chicken Rice', 28000, [spiceEn]],
      ['Rice & mains', 'Grilled Chicken Rice', 30000, [spiceEn]],
      ['Rice & mains', 'Beef Rendang Rice', 35000],
      ['Rice & mains', 'Grilled Fish Rice', 38000, [spiceEn]],
      ['Soups & greens', 'Tamarind Vegetable Soup', 12000],
      ['Soups & greens', 'Stir-fried Morning Glory', 15000, [spiceEn]],
      ['Soups & greens', 'Oxtail Soup', 55000],
      ['Soups & greens', 'Chicken Soto Soup', 25000],
      ['Sides', 'Steamed Rice', 6000],
      ['Sides', 'Fried Tempeh', 5000],
      ['Sides', 'Fried Tofu', 5000],
      ['Sides', 'Chili Sambal', 4000],
      ...drinksEn,
    ],
  },
  {
    id: 'kedai-kopi',
    name: 'Coffee shop',
    lead: 'Espresso, non-coffee drinks, and snacks.',
    items: [
      ['Coffee', 'Palm Sugar Iced Latte', 22000, [sugarEn, coffeeEn]],
      ['Coffee', 'Americano', 20000, [tempEn, coffeeEn]],
      ['Coffee', 'Cafe Latte', 25000, [tempEn, sugarEn, coffeeEn]],
      ['Coffee', 'Cappuccino', 25000, [tempEn, sugarEn, coffeeEn]],
      ['Coffee', 'Black Brewed Coffee', 12000, [sugarEn]],
      ['Non-coffee', 'Matcha Latte', 26000, [tempEn, sugarEn]],
      ['Non-coffee', 'Chocolate', 24000, [tempEn, sugarEn]],
      ['Non-coffee', 'Pulled Milk Tea', 18000, [tempEn, sugarEn]],
      ['Non-coffee', 'Lemon Tea', 16000, [tempEn, sugarEn]],
      ['Snacks', 'French Fries', 20000],
      ['Snacks', 'Fried Banana', 18000],
      ['Snacks', 'Chocolate Cheese Toast', 22000],
      ['Snacks', 'Butter Croissant', 22000],
      ['Drinks', 'Mineral Water', 6000],
    ],
  },
  {
    id: 'mi-bakso',
    name: 'Noodles & meatballs',
    lead: 'Chicken noodles, meatball soup, and sides.',
    items: [
      ['Noodles', 'Chicken Noodles', 18000, [spiceEn]],
      ['Noodles', 'Chicken Noodles with Meatballs', 23000, [spiceEn]],
      ['Noodles', 'Chicken Noodles with Wontons', 23000, [spiceEn]],
      ['Noodles', 'Fried Noodles', 20000, [spiceEn, extrasEn]],
      ['Noodles', 'Stir-fried Flat Noodles', 22000, [spiceEn, extrasEn]],
      ['Meatballs', 'Tendon Meatball Soup', 22000],
      ['Meatballs', 'Egg-stuffed Meatball Soup', 24000],
      ['Meatballs', 'Mixed Meatball Soup', 25000],
      ['Meatballs', 'Wonton Meatball Soup', 22000],
      ['Sides', 'Fried Wontons', 8000],
      ['Sides', 'Braised Chicken Feet', 6000],
      ['Sides', 'Stuffed Tofu', 5000],
      ...drinksEn,
    ],
  },
  {
    id: 'ayam-penyet',
    name: 'Grilled chicken & rice',
    lead: 'Chicken, duck, and catfish with fresh sambal.',
    items: [
      ['Mains', 'Smashed Fried Chicken', 22000, [spiceEn, riceEn]],
      ['Mains', 'Crispy Chili Chicken', 20000, [spiceEn, riceEn]],
      ['Mains', 'Fried Duck', 32000, [spiceEn, riceEn]],
      ['Mains', 'Crispy Fried Catfish', 18000, [spiceEn, riceEn]],
      ['Mains', 'Spiced Chicken Giblets', 10000, [riceEn]],
      ['Mains', 'Smashed Fried Tempeh', 12000, [spiceEn, riceEn]],
      ['Sides', 'Steamed Rice', 5000],
      ['Sides', 'Omelette', 6000],
      ['Sides', 'Extra Sambal', 3000],
      ['Sides', 'Extra Fresh Greens', 4000],
      ...drinksEn,
    ],
  },
]

const MENU_TEMPLATES_ID: MenuTemplate[] = [
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
      ...drinksId,
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
      ...drinksId,
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
      ...drinksId,
    ],
  },
]

export function menuTemplates(lang: 'en' | 'id' = 'en'): MenuTemplate[] {
  return lang === 'id' ? MENU_TEMPLATES_ID : MENU_TEMPLATES
}

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
