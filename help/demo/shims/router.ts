/** Enkel klientnavigering för demon (ersätter Next.js-routern). */
type Listener = (href: string) => void;
const listeners = new Set<Listener>();
let current = "/";

export function navigate(href: string) {
  current = href;
  listeners.forEach((l) => l(href));
  window.scrollTo({ top: 0 });
}
export function currentHref() {
  return current;
}
export function subscribe(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
