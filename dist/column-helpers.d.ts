import type { CodaColumn } from "./types";
/**
 * Generate TypeScript code with JSDoc comments for each column
 * This can be used to create a helper file with column definitions
 */
export declare function generateColumnHelpers(columns: CodaColumn[]): string;
