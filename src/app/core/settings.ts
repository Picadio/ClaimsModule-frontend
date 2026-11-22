
export interface ClientSettings {
  apiOrigin?: string;
  demoHandlerId?: string;
}

declare global {
  interface Window { claimsSettings?: ClientSettings; }
}

export const settings = window.claimsSettings ?? {};
export const apiBase = readApiBase(settings.apiOrigin);

function readApiBase(configured: string | undefined): string {
  if (!configured) return '/api';
  const parsed = new URL(configured);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' ||
      parsed.search || parsed.hash) {
    throw new Error('The configured API must be an HTTPS origin.');
  }
  return parsed.origin + '/api';
}

export function isApiUrl(url: string): boolean {
  return url.startsWith(apiBase + '/');
}
