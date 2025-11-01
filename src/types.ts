// astro-coda-loader/src/types.ts

/**
 * Query filter for OR conditions on a single column
 */
export interface QueryFilter {
  /** Column ID or name to filter on */
  column: string;
  /** Array of values to match (OR condition) */
  values: (string | number | boolean)[];
}

export interface CodaLoaderOptions {
  /** The Coda API token. Defaults to CODA_API_TOKEN env var or PUBLIC_CODA_API_TOKEN */
  token?: string;
  /** The doc ID. Defaults to CODA_DOC_ID env var or PUBLIC_CODA_DOC_ID */
  docId?: string;
  /** The table ID or name. Defaults to CODA_TABLE_ID env var or PUBLIC_CODA_TABLE_ID */
  tableIdOrName?: string;
  /**
   * Optional query to filter rows.
   * - String: Single filter query like 'c-status:"Active"'
   * - Object: OR conditions for a single column like { column: 'c-status', values: ['Active', 'In Progress'] }
   */
  query?: string | QueryFilter;
  /** Optional sort order: "createdAt", "natural", or "updatedAt" */
  sortBy?: "createdAt" | "natural" | "updatedAt";
  /** Maximum number of rows to fetch */
  limit?: number;
  /** Whether to clean string values (remove backticks). Default: true */
  cleanStrings?: boolean;
  /**
   * ルックアップを展開する最大深度。
   * 0: 展開しない (デフォルト)
   * 1以上: 指定された深さまで展開する
   */
  maxLookupDepth?: number;
}

export interface CodaResponse {
  items: CodaRow[];
  nextPageToken?: string;
  nextPageLink?: string;
  href?: string;
  nextSyncToken?: string;
}

/**
 * Raw SchemaOrg formatted objects from Coda
 */

// Base type for all SchemaOrg objects
export interface SchemaOrgObject {
  "@context": "http://schema.org/";
  "@type": string;
}

// Image objects returned by Coda
export interface CodaImage extends SchemaOrgObject {
  "@type": "ImageObject";
  name: string;
  height?: number;
  width?: number;
  url: string;
  status?: string;
}

// Web page links returned by Coda
export interface CodaWebPage extends SchemaOrgObject {
  "@type": "WebPage";
  name?: string;
  url: string;
}

// Row references returned by Coda
export interface CodaRowReference extends SchemaOrgObject {
  "@type": "StructuredValue";
  additionalType: "row";
  name: string;
  url: string;
  tableId: string;
  rowId: string;
  tableUrl: string;
}

// isRawRowReference のチェックが必要
export function isRowReference(value: any): value is CodaRowReference {
  return (
    value != null &&
    typeof value === 'object' &&
    '@type' in value &&
    value['@type'] === 'StructuredValue' &&
    'additionalType' in value &&
    value.additionalType === 'row'
  );
}

// 展開されたRowReferenceの型
export interface ExpandedCodaRowReference extends CodaRowReference {
  values: {
    id: string;
    values: Record<string, RawValue>;
  };
}

// isExpandedRowReference のチェック関数を追加
export function isExpandedRowReference(value: any): value is ExpandedCodaRowReference {
  return (
    isRowReference(value) &&
    'values' in value &&
    value.values !== null &&
    typeof value.values === 'object'
  );
}

// Person types returned by Coda
export interface CodaPerson extends SchemaOrgObject {
  "@type": "Person";
  name: string;
  email?: string;
  url?: string;
}

// 基本的な値の型
type BasicValue = 
  | string 
  | number 
  | boolean 
  | null;

// SchemaOrgオブジェクトの型
type SchemaValue = 
  | CodaImage
  | CodaWebPage
  | CodaRowReference
  | CodaPerson
  | SchemaOrgObject;

// Any raw value returned by Coda
export type RawValue = 
  | BasicValue
  | SchemaValue
  | Array<RawValue>
  | { [key: string]: RawValue }; // オブジェクト型を追加

// The raw row structure returned from Coda
export interface CodaRow {
  id: string;
  type: string;
  href: string;
  name?: string;
  index: number;
  createdAt: string;
  updatedAt: string;
  browserLink: string;
  values: Record<string, RawValue>;
}

export interface CodaColumnFormat {
  type: string;
  isArray?: boolean;
  format?: string;
  display?: string;
  table?: {
    id: string;
    type: string;
    tableType: string;
    href: string;
    browserLink: string;
    name: string;
  };
}

export interface CodaColumn {
  id: string;
  type: string;
  name: string;
  href: string;
  display?: boolean;
  calculated?: boolean;
  formula?: string;
  format: CodaColumnFormat;
}

export interface CodaColumnsResponse {
  items: CodaColumn[];
  href?: string;
}