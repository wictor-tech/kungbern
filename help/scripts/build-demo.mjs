/**
 * Bygger en fristående klickbar demo (en HTML-fil) av användardelen:
 * samma komponenter, sökning och guider, men allt körs i webbläsaren.
 *   node scripts/build-demo.mjs <ut.html>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.argv[2] ?? path.join(root, ".data/demo/index.html"));
const r = (p) => path.join(root, p);

// Skärmbilderna från appen som data-URI:er (alla publicerade guider använder dem).
const screens = {};
for (const dir of ["screens/app"]) {
  for (const f of fs.readdirSync(r(`public/${dir}`)).filter((f) => f.endsWith(".webp"))) {
    screens[`/${dir}/${f}`] = `data:image/webp;base64,${fs.readFileSync(r(`public/${dir}/${f}`)).toString("base64")}`;
  }
}

const shimPlugin = {
  name: "demo-shims",
  setup(b) {
    b.onResolve({ filter: /^virtual:screens$/ }, () => ({ path: "screens", namespace: "virtual" }));
    b.onLoad({ filter: /.*/, namespace: "virtual" }, () => ({ contents: `export default ${JSON.stringify(screens)};`, loader: "js" }));
    b.onResolve({ filter: /^react$/ }, () => ({ path: r("demo/shims/react.ts") }));
    b.onResolve({ filter: /^react-dom\/client$/ }, () => ({ path: "react-dom-client", namespace: "global" }));
    b.onLoad({ filter: /.*/, namespace: "global" }, () => ({
      contents: "export const createRoot = (...a) => window.ReactDOM.createRoot(...a);",
      loader: "js",
    }));
    b.onResolve({ filter: /^next\/link$/ }, () => ({ path: r("demo/shims/next-link.tsx") }));
    b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: r("demo/shims/next-navigation.ts") }));
    // Komponenternas API-anrop byts mot demo-klienten.
    b.onResolve({ filter: /^\.\/client$/ }, (a) => (a.importer.includes(`${path.sep}components${path.sep}`) ? { path: r("demo/client.ts") } : undefined));
  },
};

const js = await esbuild.build({
  entryPoints: [r("demo/main.tsx")],
  bundle: true,
  write: false,
  format: "iife",
  minify: true,
  target: "es2020",
  jsx: "transform",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  banner: { js: "var React=window.React;" },
  alias: { "@": r("src") },
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [shimPlugin],
  logLevel: "warning",
});

const cssIn = fs.readFileSync(r("src/app/globals.css"), "utf8") + `\n@source "../../demo";\n`;
const css = await postcss([tailwind({ base: root, optimize: { minify: true } })]).process(cssIn, { from: r("src/app/globals.css") });

// Typsnitten bäddas in, eftersom demon är en enda fil.
let cssOut = css.css;
for (const f of fs.readdirSync(r("public/fonts"))) {
  const data = `data:font/woff2;base64,${fs.readFileSync(r(`public/fonts/${f}`)).toString("base64")}`;
  cssOut = cssOut.split(`/fonts/${f}`).join(data);
}

const html = `<title>LUP Hjälp</title>
<meta name="description" content="Klickbar demo av LUP Hjälp">
<style>${cssOut}</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>${js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")}</script>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`${out} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
