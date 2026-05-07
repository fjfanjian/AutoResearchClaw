/**
 * Shared WebSocket URL builder.
 * Converts the current page protocol/host to the appropriate ws:// / wss:// URL.
 */
export function wsUrl(path: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const host = window.location.host
  return `${proto}://${host}${path}`
}
