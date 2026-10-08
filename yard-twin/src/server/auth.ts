/**
 * Rollstyrning. Nycklar läses ALDRIG från koden – de kommer från miljövariabeln YT_API_KEYS
 * (JSON) eller injiceras i tester.
 *
 * Roller:
 *  - admin:    alla tenants och sajter (intern)
 *  - analyst:  intern analytiker, listade tenants
 *  - sales:    säljare – ENDAST demoläge, aldrig kunddata
 *  - customer: kundanvändare – endast sin egen tenant och listade sajter
 */
export type Role = "admin" | "analyst" | "sales" | "customer";

export interface Principal {
  userId: string;
  role: Role;
  /** Tenants användaren får läsa. "*" = alla (endast admin). Tom för sales. */
  tenants: string[] | "*";
  /** Sajter per tenant användaren får köra mot. "*" = alla sajter i tillåtna tenants. */
  sites: Record<string, string[] | "*"> | "*";
}

export interface KeyEntry extends Principal {
  /** SHA-256 av nyckeln (hex). Klartextnycklar lagras inte. */
  keyHash: string;
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class Authenticator {
  private readonly byHash: Map<string, Principal>;
  constructor(entries: KeyEntry[]) {
    this.byHash = new Map(entries.map((e) => [e.keyHash, { userId: e.userId, role: e.role, tenants: e.tenants, sites: e.sites }]));
  }

  static fromEnv(env: Record<string, string | undefined>): Authenticator {
    const raw = env.YT_API_KEYS;
    if (!raw) return new Authenticator([]);
    return new Authenticator(JSON.parse(raw) as KeyEntry[]);
  }

  async authenticate(authorization: string | undefined): Promise<Principal | null> {
    const m = /^Bearer\s+(.+)$/.exec(authorization ?? "");
    if (!m) return null;
    return this.byHash.get(await sha256Hex(m[1].trim())) ?? null;
  }
}

export function canAccessTenant(p: Principal, tenantId: string): boolean {
  if (p.role === "sales") return false;
  if (p.role === "admin") return true;
  return p.tenants !== "*" && p.tenants.includes(tenantId);
}

export function canAccessSite(p: Principal, tenantId: string, siteId: string): boolean {
  if (!canAccessTenant(p, tenantId)) return false;
  if (p.role === "admin" || p.sites === "*") return true;
  const s = p.sites[tenantId];
  return s === "*" || (Array.isArray(s) && s.includes(siteId));
}
