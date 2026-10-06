export interface ApprovalExecutionContext {
  approvalId: string;
  approvedBy: string;
}

export function saoPauloToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function isRetroactiveDate(value: string | null | undefined, now = new Date()): boolean {
  return Boolean(value && value.slice(0, 10) < saoPauloToday(now));
}
