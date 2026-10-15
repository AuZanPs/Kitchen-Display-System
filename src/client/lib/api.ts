import type { z } from 'zod'
import { apiErrorSchema, type ErrorCode } from '../../shared/order'

export type ApiResult<T> =
  | { ok: true; data: T }
  /** status 0 means the request never reached the server. */
  | { ok: false; status: number; code: ErrorCode | 'network'; message: string }

/**
 * Fetches JSON from the Worker and checks it against `schema`. Never throws:
 * every failure comes back as `{ ok: false }` so screens can show it.
 */
export async function api<T>(
  path: string,
  schema: z.ZodType<T>,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<ApiResult<T>> {
  let res: Response
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers:
        init.body === undefined
          ? undefined
          : { 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
    })
  } catch (err) {
    return {
      ok: false,
      status: 0,
      code: 'network',
      message: err instanceof Error ? err.message : 'Network error',
    }
  }
  const json: unknown =
    res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) {
    const error = apiErrorSchema.safeParse(json)
    return error.success
      ? { ok: false, status: res.status, ...error.data.error }
      : {
          ok: false,
          status: res.status,
          code: 'network',
          message: res.statusText,
        }
  }
  const data = schema.safeParse(json)
  return data.success
    ? { ok: true, data: data.data }
    : {
        ok: false,
        status: res.status,
        code: 'invalid_input',
        message: 'Unexpected server response',
      }
}
