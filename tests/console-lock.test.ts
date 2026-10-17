import { exports } from 'cloudflare:workers'
import { expect, it } from 'vitest'
import { freshIp } from './helpers'

const CONSOLE = 'https://console.layardapur.web.id'

function login(password: string) {
  return exports.default.fetch(`${CONSOLE}/api/super/login`, {
    method: 'POST',
    headers: {
      origin: CONSOLE,
      'content-type': 'application/json',
      ...freshIp(),
    },
    body: JSON.stringify({ password }),
  })
}

// Own file: the lock is console-wide and would block the other console tests.
it('locks the console when guesses come from many addresses', async () => {
  for (let i = 0; i < 30; i++) await login('nope')
  expect((await login('test-super-password')).status).toBe(429)
})
