import type { CodaColumn } from "./types";

/**
 * Generate TypeScript code with JSDoc comments for each column
 * This can be used to create a helper file with column definitions
 */
export function generateColumnHelpers(columns: CodaColumn[]): string {
  const lines: string[] = [
    `/**`,
    ` * This file is auto-generated - DO NOT EDIT DIRECTLY`,
    ` * It contains helpers for Coda column IDs with descriptive comments`,
    ` */`,
    ``,
    `/**`,
    ` * Type containing all column IDs with their descriptions`,
    ` */`,
    `export type ColumnId = `,
  ];

  // Add union type with all column IDs
  columns.forEach((column, index) => {
    const isLast = index === columns.length - 1;
    const formatType = column.format.type + (column.format.isArray ? '[]' : '');
    
    lines.push(`  /** ${column.name} (${formatType}) */`);
    lines.push(`  | "${column.id}"${isLast ? ';' : ''}`);
  });

  lines.push(``);
  lines.push(`/**`);
  lines.push(` * Object mapping column IDs to their names for better discoverability`);
  lines.push(` */`);
  lines.push(`export const COLUMNS = {`);

  // Add constants for each column with JSDoc
  columns.forEach(column => {
    const formatType = column.format.type + (column.format.isArray ? '[]' : '');
    const safePropertyName = makeSafePropertyName(column.name);
    
    lines.push(`  /** ${column.name} (${formatType}) */`);
    lines.push(`  ${safePropertyName}: "${column.id}",`);
  });

  lines.push(`} as const;`);
  lines.push(``);

  return lines.join('\n');
}

/**
 * Helper to convert column name to a safe property name for use as object key
 * Handles special characters, emoji, etc. in column names
 */
function makeSafePropertyName(str: string): string {
  // Remove emoji and special characters
  const cleanStr = str
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[^\w\s.]/g, '')
    .trim();
    
  // Convert to camelCase
  return cleanStr
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => 
      index === 0 ? word.toLowerCase() : word.toUpperCase()
    )
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    // If the result is empty or starts with a number, prefix with '_'
    .replace(/^(?:[0-9]|$)/, '_$&');
}