/** The emailed sign-in link. Sent through Cloudflare Email Service (Workers Paid). */
export async function sendSignInLink(
  env: Env,
  to: string,
  link: string,
  lang: 'en' | 'id' = 'en',
) {
  const id = lang === 'id'
  await env.EMAIL.send({
    from: { email: env.EMAIL_FROM, name: 'Layar Dapur' },
    to,
    subject: id ? 'Masuk ke Layar Dapur' : 'Sign in to Layar Dapur',
    text: id
      ? `Buka tautan ini untuk masuk ke Layar Dapur:\n\n${link}\n\nTautan ini berlaku 15 menit dan hanya bisa dipakai sekali. Abaikan email ini jika Anda tidak meminta masuk.`
      : `Open this link to sign in to Layar Dapur:\n\n${link}\n\nThis link is valid for 15 minutes and can only be used once. Ignore this email if you did not ask to sign in.`,
    html: id
      ? `<p>Buka tautan ini untuk masuk ke Layar Dapur:</p><p><a href="${link}">Masuk ke Layar Dapur</a></p><p>Tautan ini berlaku 15 menit dan hanya bisa dipakai sekali. Abaikan email ini jika Anda tidak meminta masuk.</p>`
      : `<p>Open this link to sign in to Layar Dapur:</p><p><a href="${link}">Sign in to Layar Dapur</a></p><p>This link is valid for 15 minutes and can only be used once. Ignore this email if you did not ask to sign in.</p>`,
  })
}
