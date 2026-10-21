/** The emailed sign-in link. Sent through Cloudflare Email Service (Workers Paid). */
export async function sendSignInLink(env: Env, to: string, link: string) {
  await env.EMAIL.send({
    from: { email: env.EMAIL_FROM, name: 'Layar Dapur' },
    to,
    subject: 'Masuk ke Layar Dapur',
    text: `Buka tautan ini untuk masuk ke Layar Dapur:\n\n${link}\n\nTautan berlaku 15 menit dan hanya bisa dipakai sekali. Abaikan email ini kalau kamu tidak meminta masuk.`,
    html: `<p>Buka tautan ini untuk masuk ke Layar Dapur:</p><p><a href="${link}">Masuk ke Layar Dapur</a></p><p>Tautan berlaku 15 menit dan hanya bisa dipakai sekali. Abaikan email ini kalau kamu tidak meminta masuk.</p>`,
  })
}
