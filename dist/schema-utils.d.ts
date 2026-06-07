import { z } from "astro/zod";
import type { CodaColumnFormat } from "./types";
/**
 * Maps a Coda column format to a Zod type
 * @param format The Coda column format
 * @param columnName The name of the column (for documentation)
 */
export declare function codaFormatToZodType(format: CodaColumnFormat, columnName: string, formula?: string | null): z.ZodTypeAny;
/**
 * Creates a base schema for Coda row data
 */
export declare function createBaseRowSchema(): z.ZodObject<{
    id: z.ZodString;
    type: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    index: z.ZodNumber;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    browserLink: z.ZodString;
    href: z.ZodString;
}, "strip", z.ZodTypeAny, {
    createdAt: string;
    updatedAt: string;
    type: string;
    id: string;
    index: number;
    browserLink: string;
    href: string;
    name?: string | undefined;
}, {
    createdAt: string;
    updatedAt: string;
    type: string;
    id: string;
    index: number;
    browserLink: string;
    href: string;
    name?: string | undefined;
}>;
