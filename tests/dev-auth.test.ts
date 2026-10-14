import { describe, expect, it } from 'vitest'
import { assertDevAuthAllowed } from '../src/worker/dev-auth'

describe('dev key guard', () => {
  it.each(['production', '', undefined, 'Production'])(
    'refuses to run when ENVIRONMENT is %j',
    (environment) => {
      expect(() => assertDevAuthAllowed(environment)).toThrow(
        /refused to start/,
      )
    },
  )

  it.each(['development', 'staging'])('allows %s', (environment) => {
    expect(() => assertDevAuthAllowed(environment)).not.toThrow()
  })
})
