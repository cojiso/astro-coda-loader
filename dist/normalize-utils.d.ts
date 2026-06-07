import { RawValue, CodaImage, CodaWebPage, CodaRowReference, CodaPerson } from './types';
/**
 * Type guards for raw Coda types to use in application code
 */
/**
 * Type guard for CodaImage objects
 */
export declare function isRawImage(value: RawValue): value is CodaImage;
/**
 * Type guard for CodaWebPage objects
 */
export declare function isRawWebPage(value: RawValue): value is CodaWebPage;
/**
 * Type guard for CodaRowReference objects
 */
export declare function isRawRowReference(value: RawValue): value is CodaRowReference;
/**
 * Type guard for CodaPerson objects
 */
export declare function isRawPerson(value: RawValue): value is CodaPerson;
/**
 * Removes backticks from a string value
 */
export declare function cleanString(value: string): string;
/**
 * Cleans string values in a Coda response while preserving the original structure
 */
export declare function cleanValues(values: Record<string, RawValue>): Record<string, RawValue>;
/**
 * Helper functions to get values by type - these preserve the original structure
 * but provide typed access to common properties
 */
export declare function getImageUrl(value: RawValue): string | null;
export declare function getLinkUrl(value: RawValue): string | null;
export declare function getPersonName(value: RawValue): string | null;
export declare function getReferenceName(value: RawValue): string | null;
