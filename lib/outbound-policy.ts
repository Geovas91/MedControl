/** Server callers supply only the real process environment. No recipient/data logging. */
export function appointmentOutboundPolicy(env: Record<string, string | undefined> = process.env): 'normal' | 'isolated' | 'blocked' {
  const mode = env.APPOINTMENT_OUTBOUND_MODE;
  if (mode !== undefined && mode !== 'normal' && mode !== 'isolated') return 'blocked';
  const staging = 'https://staging.clinicontrol.mx';
  if (env.APP_ENV === 'staging' || env.APP_BASE_URL?.includes('staging.clinicontrol.mx')) {
    if (env.APP_ENV !== 'staging' || env.APP_BASE_URL !== staging) return 'blocked';
    return mode === 'isolated' ? 'isolated' : mode === 'normal' ? 'normal' : 'blocked';
  }
  if (mode === 'isolated' || (env.APP_ENV !== undefined && !['production', 'development', 'test'].includes(env.APP_ENV))) return 'blocked';
  return 'normal';
}
