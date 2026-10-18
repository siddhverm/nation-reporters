/** Contact address for copyright complaints; set COPYRIGHT_EMAIL in the web runtime env. */
export const COPYRIGHT_EMAIL_PLACEHOLDER = 'copyright@example.com';

export function resolveCopyrightEmail(env: Record<string, string | undefined> = process.env): string {
  return (env.COPYRIGHT_EMAIL ?? '').trim() || COPYRIGHT_EMAIL_PLACEHOLDER;
}
