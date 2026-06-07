import type { Loader } from "astro/loaders";
import { type CodaLoaderOptions } from "./types";
/**
 * Loads data from a Coda.io table.
 */
export declare function codaLoader({ token, docId, tableIdOrName, query, sortBy, limit, cleanStrings, maxLookupDepth }: CodaLoaderOptions): Loader;
