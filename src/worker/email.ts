/** The emailed sign-in link. Sent through Cloudflare Email Service (Workers Paid). */
export async function sendSignInLink(env: Env, to: string, link: string) {
  await env.EMAIL.send({
    from: { email: env.EMAIL_FROM, name: 'Layar Dapur' },
    to,
    subject: 'Sign in to Layar Dapur',
    text: `Open this link to sign in to Layar Dapur:\n\n${link}\n\nThis link is valid for 15 minutes and can only be used once. Ignore this email if you did not ask to sign in.`,
    html: `<p>Open this link to sign in to Layar Dapur:</p><p><a href="${link}">Sign in to Layar Dapur</a></p><p>This link is valid for 15 minutes and can only be used once. Ignore this email if you did not ask to sign in.</p>`,
  })
}
