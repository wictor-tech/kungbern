import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { FileStore } from "./store.js";
import { createApp } from "./app.js";

const cfg = loadConfig();
const store = new FileStore(cfg);
const { app, provider } = createApp(cfg, store);

serve({ fetch: app.fetch, port: cfg.port }, (info) => {
  console.log(`LUP Hjälp API på http://localhost:${info.port}  (AI: ${provider.name})`);
  if (cfg.adminTokenGenerated) console.log(`Admin-token (dev): "${cfg.adminToken}" – sätt ADMIN_TOKEN i produktion`);
  if (provider.name === "local") console.log("Ingen ANTHROPIC_API_KEY – lokal sökning används (AI-utkast/översättning avstängt).");
});
const shutdown = () => { store.flush(); process.exit(0); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
