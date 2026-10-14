export type Route = { name: 'home' } | { name: 'release'; releaseId: string } | { name: 'not_found'; path: string };
const RELEASE = /^#\/releases\/([A-Za-z0-9_.-]{1,64})\/?$/;
export function parseRoute(hash: string): Route {
  if (hash === '' || hash === '#' || hash === '#/') return { name: 'home' };
  const m = RELEASE.exec(hash);
  if (m && m[1]) return { name: 'release', releaseId: m[1] };
  return { name: 'not_found', path: hash };
}
