import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export interface Config {
  port: number;
  dataDir: string;
  uploadDir: string;
  seedMediaDir: string;
  webDir: string;
  adminToken: string;
  adminTokenGenerated: boolean;
  allowedOrigins: string[];
  anthropicKey?: string;
  anthropicModel: string;
  ticketWebhook?: string;
  production: boolean;
  /** Antal liknande frågor innan "återkommande problem" flaggas. */
  recurringThreshold: number;
  /** Andel "Nej" (och minsta antal visningar) innan en guide flaggas som dålig. */
  badGuideRate: number;
  badGuideMinViews: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === "production";
  let adminToken = env.ADMIN_TOKEN ?? "";
  let generated = false;
  if (!adminToken) {
    if (production) throw new Error("ADMIN_TOKEN måste sättas i produktion");
    adminToken = env.NODE_ENV === "test" ? "test-token" : "admin"; // enkel dev-token, skrivs ut vid start
    generated = true;
  }
  const dataDir = resolve(env.DATA_DIR ?? join(root, "data"));
  return {
    port: Number(env.PORT ?? 8787),
    dataDir,
    uploadDir: join(dataDir, "uploads"),
    seedMediaDir: join(root, "seed", "media"),
    webDir: resolve(env.WEB_DIR ?? join(root, "..", "web", "dist")),
    adminToken: adminToken || randomBytes(16).toString("hex"),
    adminTokenGenerated: generated,
    allowedOrigins: (env.ALLOWED_ORIGINS ?? "*").split(",").map((s) => s.trim()).filter(Boolean),
    anthropicKey: env.ANTHROPIC_API_KEY || undefined,
    anthropicModel: env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
    ticketWebhook: env.TICKET_WEBHOOK_URL || undefined,
    production,
    recurringThreshold: Number(env.RECURRING_THRESHOLD ?? 5),
    badGuideRate: Number(env.BAD_GUIDE_RATE ?? 0.4),
    badGuideMinViews: Number(env.BAD_GUIDE_MIN_VIEWS ?? 5),
  };
}
