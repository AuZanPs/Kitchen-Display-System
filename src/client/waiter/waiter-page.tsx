import { type SubmitEvent, useState } from 'react'
import { createOrderResultSchema } from '../../shared/order'

type SendState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'sent'; ticketNo: number; rev: number }
  | { status: 'failed'; message: string }

export function WaiterPage() {
  const [send, setSend] = useState<SendState>({ status: 'idle' })

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const tableId = new FormData(event.currentTarget).get('tableId')
    setSend({ status: 'sending' })
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          operationId: crypto.randomUUID(),
          destination: { type: 'table', tableId },
          lines: [
            {
              menuItemId: 'nasi-goreng-kampung',
              qty: 1,
              optionIds: ['tidak-pedas'],
              note: '',
              allergy: '',
            },
          ],
          orderNote: '',
        }),
      })
      if (!res.ok) {
        setSend({ status: 'failed', message: `Server said ${res.status}` })
        return
      }
      const body = createOrderResultSchema.parse(await res.json())
      setSend({ status: 'sent', ticketNo: body.ticketNo, rev: body.rev })
    } catch (err) {
      setSend({
        status: 'failed',
        message: err instanceof Error ? err.message : 'Network error',
      })
    }
  }

  return (
    <main className="waiter">
      <h1>Send a test order</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="table-id">Table id</label>
        <input id="table-id" name="tableId" defaultValue="t07" required />
        <button type="submit" disabled={send.status === 'sending'}>
          {send.status === 'sending' ? 'Sending…' : 'Send dummy order'}
        </button>
      </form>
      <p role="status">
        {send.status === 'sent' &&
          `Saved on server as #${send.ticketNo} (rev ${send.rev})`}
        {send.status === 'failed' && `Not sent: ${send.message}`}
      </p>
    </main>
  )
}
