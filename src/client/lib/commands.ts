import { type CommandResult, commandResultSchema } from '../../shared/commands'
import type { Translate } from '../i18n'
import { type ApiResult, api } from './api'
import { uuid } from './uuid'

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
  return t('rejected', { message: result.message })
}
