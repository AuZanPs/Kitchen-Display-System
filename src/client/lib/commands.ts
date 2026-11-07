import { type CommandResult, commandResultSchema } from '../../shared/commands'
import type { Lang, Translate } from '../i18n'
import { type ApiResult, api } from './api'
import { uuid } from './uuid'

const ERROR_ID: Record<string, string> = {
  'Too many requests. Wait 15 minutes.':
    'Terlalu banyak permintaan. Tunggu 15 menit.',
  'Too many attempts. Wait 15 minutes.':
    'Terlalu banyak percobaan. Tunggu 15 menit.',
  'Too many attempts. Wait one hour.':
    'Terlalu banyak percobaan. Tunggu satu jam.',
  'Too many attempts. Wait one minute.':
    'Terlalu banyak percobaan. Tunggu satu menit.',
  'Too many attempts. Please wait.':
    'Terlalu banyak percobaan. Tunggu sebentar.',
  'This link has already been used or has expired.':
    'Tautan ini sudah dipakai atau sudah kedaluwarsa.',
  'Not configured yet.': 'Belum dikonfigurasi.',
  'Admin is not configured yet.': 'Admin belum dikonfigurasi.',
  'Sign in first.': 'Masuk terlebih dulu.',
  'Sign in as admin.': 'Masuk sebagai admin.',
  'Sign in as super admin.': 'Masuk sebagai super admin.',
  'This kitchen cannot be opened.': 'Dapur ini tidak bisa dibuka.',
  'One account can create 3 kitchens. Contact us if you need more.':
    'Satu akun bisa membuat 3 dapur. Hubungi kami kalau perlu lebih.',
  'This address is already taken by another kitchen.':
    'Alamat ini sudah dipakai dapur lain.',
  'This address is already in use.': 'Alamat ini sudah dipakai.',
  'Only the owner can manage admins.':
    'Hanya pemilik yang bisa mengatur admin.',
  'This is the owner email.': 'Ini email pemilik.',
  'At most 3 additional admins.': 'Paling banyak 3 admin tambahan.',
  'At most 10 staff members on the Free plan.':
    'Paling banyak 10 staf di paket Gratis.',
  'Wrong password.': 'Kata sandi salah.',
  'Wrong name or PIN.': 'Nama atau PIN salah.',
  'This kitchen was not found.': 'Dapur ini tidak ditemukan.',
  'This kitchen is currently disabled.': 'Dapur ini sedang dinonaktifkan.',
  'A field is missing or too long.':
    'Ada kolom yang kosong atau terlalu panjang.',
  'Not found.': 'Tidak ditemukan.',
  'Order not found.': 'Pesanan tidak ditemukan.',
  'Menu item not found.': 'Menu tidak ditemukan.',
  'Table not found.': 'Meja tidak ditemukan.',
  'Staff member not found.': 'Staf tidak ditemukan.',
  'Order is still in progress. Cancel it from Overview first.':
    'Pesanan masih berjalan. Batalkan dulu dari Ringkasan.',
  'This item has already been ordered, so it can only be hidden.':
    'Menu ini sudah pernah dipesan, jadi hanya bisa disembunyikan.',
  'Active orders remain. Finish them first or force close.':
    'Masih ada pesanan aktif. Selesaikan dulu atau tutup paksa.',
  'Only new orders can be accepted.': 'Hanya pesanan baru yang bisa diterima.',
  'A cancellation was requested.': 'Pembatalan sudah diminta.',
  'Please confirm the allergy first.': 'Konfirmasi alergi terlebih dulu.',
  'No pending changes.': 'Tidak ada perubahan tertunda.',
  'Accept the order first.': 'Terima pesanan terlebih dulu.',
  'Acknowledge changes first.': 'Konfirmasi perubahan terlebih dulu.',
  'Order is not ready yet.': 'Pesanan belum siap.',
  'Order is already closed.': 'Pesanan sudah selesai.',
  'Cancellation was already requested.': 'Pembatalan sudah diminta.',
  'No cancellation was requested.': 'Tidak ada permintaan pembatalan.',
  'Order is already at that table.': 'Pesanan sudah di meja tersebut.',
  'Service day is closed.': 'Hari layanan sudah ditutup.',
  'This role cannot do that.': 'Peran ini tidak bisa melakukan itu.',
  'This role cannot control the TV.': 'Peran ini tidak bisa mengatur TV.',
  'Managers only.': 'Khusus admin.',
  'This request was already sent with different contents.':
    'Permintaan ini sudah dikirim dengan isi berbeda.',
}

/** Translates server error messages when the UI is in Indonesian. */
export function localizeError(message: string, lang: Lang): string {
  if (lang === 'en') return message
  const mapped = ERROR_ID[message]
  if (mapped) return mapped
  return message
    .replace(/^(.+) is sold out\.$/, '$1 habis.')
    .replace(
      /^Maximum (\d+) lines per order\.$/,
      'Maksimal $1 baris per pesanan.',
    )
}

/** Order commands always target one version; a fresh operationId per tap. */
export function sendCommand(
  orderId: string,
  body: { type: string; expectedVersion: number } & Record<string, unknown>,
): Promise<ApiResult<CommandResult>> {
  return api(`/api/orders/${orderId}/commands`, commandResultSchema, {
    body: { operationId: uuid(), ...body },
  })
}

/** The words a person sees when a request fails. */
export function failureText(
  result: Extract<ApiResult<unknown>, { ok: false }>,
  t: Translate,
) {
  if (result.status === 0) return t('networkError')
  if (result.code === 'stale_version') return t('staleVersion')
  if (result.code === 'service_closed') return t('serviceClosedSend')
  if (result.code === 'pin_required') return t('pinRequired')
  const lang: Lang = t('table') === 'Meja' ? 'id' : 'en'
  return t('rejected', { message: localizeError(result.message, lang) })
}
