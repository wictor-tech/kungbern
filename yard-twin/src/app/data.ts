import raw from "./demo/demo-dataset.json";
import type { Dataset } from "./types.ts";

/**
 * Demoläget laddar ENBART det inbyggda syntetiska datasetet. Det finns ingen kod i demobygget som
 * kan hämta kunddata (ingen fetch, ingen databasanslutning) – se test/isolation.test.ts.
 */
export const dataset: Dataset = raw as unknown as Dataset;
