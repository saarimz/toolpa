export function allowPlaygroundTarget(target: string, pageUrl: string): boolean {
  if (target.startsWith('blob:') || target.startsWith('data:')) return true;
  let url: URL;
  try {
    url = new URL(target, pageUrl);
  } catch {
    return false;
  }
  const page = new URL(pageUrl);
  if (url.origin !== page.origin) return false;
  if (url.pathname.startsWith('/api/')) return url.pathname === '/api/agent';
  return true;
}
