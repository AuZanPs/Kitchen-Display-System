import { Hono } from 'hono'
import { z } from 'zod'
import {
  deleteHistorySchema,
  exportQuerySchema,
  historyQuerySchema,
} from '../../shared/history'
import { menuItemInputSchema, tableInputSchema } from '../../shared/menu'
import { staffInputSchema } from '../../shared/staff'
import { toCsv } from '../history'
import {
  type AppEnv,
  adminCredentials,
  idParam,
  invalidInput,
  reply,
  requireAdmin,
  venueRoom,
} from './common'

/** The admin page's dapur: menu, tables, history, staff and the service day. */
export const manager = new Hono<AppEnv>()

// Menu and tables: changes bump menuVersion on the board so tablets refetch.
manager.get('/api/manager/menu', requireAdmin, async (c) =>
  reply(c, await venueRoom(c).adminMenu(await adminCredentials(c))),
)
manager.post(
  '/api/manager/menu',
  requireAdmin,
  invalidInput('json', menuItemInputSchema),
  async (c) =>
    reply(
      c,
      await venueRoom(c).saveMenuItem(
        await adminCredentials(c),
        null,
        c.req.valid('json'),
      ),
    ),
)
manager.put(
  '/api/manager/menu/:id',
  requireAdmin,
  invalidInput('param', idParam),
  invalidInput('json', menuItemInputSchema),
  async (c) =>
    reply(
      c,
      await venueRoom(c).saveMenuItem(
        await adminCredentials(c),
        c.req.valid('param').id,
        c.req.valid('json'),
      ),
    ),
)

manager.get('/api/manager/tables', requireAdmin, async (c) =>
  reply(c, await venueRoom(c).adminTables(await adminCredentials(c))),
)
manager.post(
  '/api/manager/tables',
  requireAdmin,
  invalidInput('json', tableInputSchema),
  async (c) =>
    reply(
      c,
      await venueRoom(c).saveTable(
        await adminCredentials(c),
        null,
        c.req.valid('json'),
      ),
    ),
)
manager.put(
  '/api/manager/tables/:id',
  requireAdmin,
  invalidInput('param', idParam),
  invalidInput('json', tableInputSchema),
  async (c) =>
    reply(
      c,
      await venueRoom(c).saveTable(
        await adminCredentials(c),
        c.req.valid('param').id,
        c.req.valid('json'),
      ),
    ),
)

manager.get(
  '/api/manager/history',
  requireAdmin,
  invalidInput('query', historyQuerySchema),
  async (c) =>
    reply(
      c,
      await venueRoom(c).history(
        await adminCredentials(c),
        c.req.valid('query').day,
      ),
    ),
)

manager.post(
  '/api/manager/history/delete',
  requireAdmin,
  invalidInput('json', deleteHistorySchema),
  async (c) =>
    reply(
      c,
      await venueRoom(c).deleteHistory(
        await adminCredentials(c),
        c.req.valid('json'),
      ),
    ),
)

manager.get(
  '/api/manager/export',
  requireAdmin,
  invalidInput('query', exportQuerySchema),
  async (c) => {
    const { from, to, format } = c.req.valid('query')
    const result = await venueRoom(c).exportRows(
      await adminCredentials(c),
      from,
      to,
    )
    if (!result.ok) return reply(c, result)
    const file = `kds-${from}_${to}.${format}`
    c.header('Content-Disposition', `attachment; filename="${file}"`)
    if (format === 'json') return c.json(result.body.rows)
    c.header('Content-Type', 'text/csv; charset=utf-8')
    return c.body(toCsv(result.body.rows))
  },
)

manager.get('/api/manager/staff', requireAdmin, async (c) =>
  reply(c, await venueRoom(c).adminStaff(await adminCredentials(c))),
)
manager.post(
  '/api/manager/staff',
  requireAdmin,
  invalidInput('json', staffInputSchema),
  async (c) =>
    reply(
      c,
      await venueRoom(c).saveStaff(
        await adminCredentials(c),
        null,
        c.req.valid('json'),
      ),
    ),
)
manager.put(
  '/api/manager/staff/:id',
  requireAdmin,
  invalidInput('param', idParam),
  invalidInput('json', staffInputSchema),
  async (c) =>
    reply(
      c,
      await venueRoom(c).saveStaff(
        await adminCredentials(c),
        c.req.valid('param').id,
        c.req.valid('json'),
      ),
    ),
)

manager.post('/api/manager/service-day/open', requireAdmin, async (c) =>
  reply(c, await venueRoom(c).openServiceDay(await adminCredentials(c))),
)

manager.post(
  '/api/manager/service-day/close',
  requireAdmin,
  invalidInput('json', z.object({ force: z.boolean().default(false) })),
  async (c) =>
    reply(
      c,
      await venueRoom(c).closeServiceDay(
        await adminCredentials(c),
        c.req.valid('json').force,
      ),
    ),
)
