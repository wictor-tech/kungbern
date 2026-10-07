import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Enkel admininloggning för MVP: ett delat lösenord (ADMIN_PASSWORD) och en signerad cookie.
 * Byts mot SSO/riktiga konton senare utan att resten av appen påverkas.
 */

const COOKIE = "lup_help_admin";
const MAX_AGE = 60 * 60 * 12;

function secret() {
  const s = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!s) throw new Error("ADMIN_PASSWORD saknas");
  return s;
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function adminConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD);
}

export function checkPassword(pw: string) {
  const expected = process.env.ADMIN_PASSWORD;
  return Boolean(expected) && safeEqual(pw, expected!);
}

export async function setAdminCookie(name: string) {
  const payload = `${Buffer.from(name || "admin").toString("base64url")}.${Date.now() + MAX_AGE * 1000}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearAdminCookie() {
  (await cookies()).delete(COOKIE);
}

/** Returnerar administratörens namn om inloggad, annars null. */
export async function getAdmin(): Promise<string | null> {
  if (!adminConfigured()) return null;
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [name, exp, sig] = raw.split(".");
  if (!name || !exp || !sig) return null;
  if (!safeEqual(sig, sign(`${name}.${exp}`))) return null;
  if (Number(exp) < Date.now()) return null;
  return Buffer.from(name, "base64url").toString() || "admin";
}
