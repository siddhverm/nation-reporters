/** Hide secrets that arrive in query strings before they are written to logs or error bodies. */
export function redactUrl(url: string | null | undefined): string {
  return String(url ?? '').replace(
    /([?&](?:key|token|password|secret|access_token|refresh_token|authorization)=)[^&#]*/gi,
    '$1[redacted]',
  );
}
