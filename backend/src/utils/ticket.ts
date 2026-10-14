import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TicketPayload {
  code: string;
  travelDateISO: string;
  guests: number;
}

// Set TICKET_SECRET in production — the 'dev-ticket-secret' fallback below is
// for local boot only and makes ticket signatures forgeable by anyone reading
// this source. (Deliberately NOT throwing here so a missing env never breaks
// boot; verifyTicket just yields invalid signatures against a wrong secret.)
function ticketSecret(): string {
  return process.env.TICKET_SECRET?.trim() || 'dev-ticket-secret';
}

function canonicalMessage(payload: TicketPayload): string {
  return `${payload.code}|${payload.travelDateISO}|${payload.guests}`;
}

export function signTicket(payload: TicketPayload): string {
  return createHmac('sha256', ticketSecret()).update(canonicalMessage(payload), 'utf8').digest('hex');
}

export function verifyTicket(code: string, travelDateISO: string, guests: number, sig: string): boolean {
  const expected = signTicket({ code, travelDateISO, guests });
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from((sig ?? '').trim(), 'utf8');
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export function buildTicketQuery(code: string, travelDateISO: string, guests: number): string {
  return `t=${encodeURIComponent(signTicket({ code, travelDateISO, guests }))}`;
}
