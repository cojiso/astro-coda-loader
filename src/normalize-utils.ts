import { RawValue, CodaImage, CodaWebPage, CodaRowReference, CodaPerson } from './types';

/**
 * Type guards for raw Coda types to use in application code
 */
/**
 * Type guard for CodaImage objects
 */
export function isRawImage(value: RawValue): value is CodaImage {
  return value != null && 
    typeof value === 'object' && 
    '@type' in value &&
    value["@type"] === "ImageObject";
}

/**
 * Type guard for CodaWebPage objects
 */
export function isRawWebPage(value: RawValue): value is CodaWebPage {
  return value != null && 
    typeof value === 'object' && 
    '@type' in value &&
    value["@type"] === "WebPage";
}

/**
 * Type guard for CodaRowReference objects
 */
export function isRawRowReference(value: RawValue): value is CodaRowReference {
  return value != null && 
    typeof value === 'object' && 
    '@type' in value &&
    value["@type"] === "StructuredValue" &&
    'additionalType' in value &&
    value.additionalType === "row";
}

/**
 * Type guard for CodaPerson objects
 */
export function isRawPerson(value: RawValue): value is CodaPerson {
  return value != null && 
    typeof value === 'object' && 
    '@type' in value &&
    value["@type"] === "Person";
}

/**
 * Removes backticks from a string value
 */
export function cleanString(value: string): string {
  // Remove triple backticks if present
  const match = value.match(/^```(.*)```$/s);
  if (match) {
    return match[1];
  }
  return value;
}

/**
 * Cleans string values in a Coda response while preserving the original structure
 */
export function cleanValues(values: Record<string, RawValue>): Record<string, RawValue> {
  const result: Record<string, RawValue> = {};
  
  for (const [key, value] of Object.entries(values)) {
    result[key] = cleanValue(value);
  }
  
  return result;
}

/**
 * Clean a single value if it's a string, or recursively clean arrays and objects
 */
function cleanValue(value: RawValue): RawValue {
  // Handle null and undefined
  if (value === null || value === undefined) {
    return null;
  }
  
  // Clean string values
  if (typeof value === 'string') {
    return cleanString(value);
  }
  
  // Keep primitive values as is
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  
  // Handle arrays recursively
  if (Array.isArray(value)) {
    return value.map(item => cleanValue(item));
  }
  
  // Handle objects recursively, but keep the original structure
  if (typeof value === 'object') {
    const result: Record<string, RawValue> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = cleanValue(v);
    }
    return result;
  }
  
  // Fallback for any other type
  return value;
}

/**
 * Helper functions to get values by type - these preserve the original structure
 * but provide typed access to common properties
 */
export function getImageUrl(value: RawValue): string | null {
  // 空文字列またはnullの場合
  if (value === null || value === undefined || value === '') {
    return null;
  }
  
  // 配列の場合は最初の要素を使用
  if (Array.isArray(value) && value.length > 0) {
    return getImageUrl(value[0]);
  }
  
  // 標準的なImageObjectの場合
  if (isRawImage(value)) {
    return value.url;
  }
  
  // どのパターンにも一致しない場合
  return null;
}

export function getLinkUrl(value: RawValue): string | null {
  if (isRawWebPage(value)) {
    return value.url;
  }
  return null;
}

export function getPersonName(value: RawValue): string | null {
  if (isRawPerson(value)) {
    return value.name;
  }
  return null;
}

export function getReferenceName(value: RawValue): string | null {
  if (isRawRowReference(value)) {
    return value.name;
  }
  return null;
}