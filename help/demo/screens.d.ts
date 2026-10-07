declare module "virtual:screens" {
  /** "/screens/06.webp" → data:-URI. Genereras av scripts/build-demo.mjs. */
  const screens: Record<string, string>;
  export default screens;
}
