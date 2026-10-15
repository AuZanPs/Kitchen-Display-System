import type { BoardOrder } from '../../shared/board'
import type { Translate } from '../i18n'
import type { TicketLine } from '../ticket'

export function whereLabel(order: BoardOrder, t: Translate) {
  return order.takeaway ? t('takeaway') : (order.table ?? t('table'))
}

export function boardLines(order: BoardOrder): TicketLine[] {
  return order.lines.map((line) => ({ key: line.id, ...line }))
}
