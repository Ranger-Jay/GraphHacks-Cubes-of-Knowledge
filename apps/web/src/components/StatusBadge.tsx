const TONE: Record<string, string> = {
  AVAILABLE: 'ok', ESTABLISHED: 'ok', VERIFIED: 'ok', ONLINE: 'ok',
  GAP: 'bad', MISSING: 'bad', UNAVAILABLE: 'down',
  STALE: 'warn', UNKNOWN: 'unknown', NOT_IMPLEMENTED: 'down', BOOTSTRAP: 'ok'
};
/** Text-first status badge: meaning never relies on color alone. */
export function StatusBadge({ value, label }: { value: string; label?: string }) {
  return <span className={`badge badge-${TONE[value] ?? 'unknown'}`} data-status={value}>{label ? `${label}: ` : ''}{value}</span>;
}
