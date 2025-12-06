// astro-coda-loader/src/coda-loader.ts
import type { Loader, LoaderContext } from "astro/loaders";
import { AstroError } from "astro/errors";
import { z } from "astro/zod";
import {
  type CodaLoaderOptions,
  type QueryFilter,
  type CodaResponse,
  type CodaColumnsResponse,
  type CodaRow,
  type CodaColumn,
  type RawValue,
  type CodaRowReference
} from "./types";
import { codaFormatToZodType, createBaseRowSchema } from "./schema-utils";
import { cleanValues, isRawRowReference } from "./normalize-utils";

/**
 * カラム情報のキャッシュ
 */
let columnsCache: Record<string, CodaColumn> = {};

// ルックアップレファレンスキャッシュ（行単位）
interface LookupCache {
  [key: string]: CodaRow | null; // tableId:rowId -> 行データ
}

// テーブル全体のキャッシュ（テーブル単位）
interface TableCache {
  [tableId: string]: Map<string, CodaRow>; // tableId -> (rowId -> 行データ)
}

/**
 * 行参照が循環参照になっていないかチェックするための処理済みセット
 */
interface ProcessingContext {
  processedRefs: Set<string>;
  cache: LookupCache;
  tableCache: TableCache;
  requestCount: number;
}

/**
 * 単一の参照の展開を行う（テーブルキャッシュ対応版）
 */
async function expandSingleReference(
  reference: CodaRowReference,
  docId: string,
  token: string,
  context: ProcessingContext,
  currentDepth: number,
  maxDepth: number,
  logger: any
): Promise<CodaRowReference | null> {
  const refKey = `${reference.tableId}:${reference.rowId}`;

  // 循環参照チェック
  if (context.processedRefs.has(refKey)) {
    return null; // 循環参照は拡張せず、nullを返す
  }

  let referencedRow: CodaRow | null = null;

  // 1. まずテーブルキャッシュから取得を試みる
  if (context.tableCache[reference.tableId]) {
    referencedRow = context.tableCache[reference.tableId].get(reference.rowId) || null;
    if (referencedRow) {
      logger.debug(`Found row ${refKey} in table cache`);
    }
  }

  // 2. テーブルキャッシュになければ、行キャッシュを確認
  if (!referencedRow && context.cache[refKey] !== undefined) {
    referencedRow = context.cache[refKey];
  }

  // 3. どちらのキャッシュにもない場合、テーブル全体を取得してキャッシュ
  if (!referencedRow && context.cache[refKey] === undefined) {
    try {
      // テーブル全体を取得
      if (!context.tableCache[reference.tableId]) {
        context.requestCount++;
        context.tableCache[reference.tableId] = await fetchTableData(
          docId,
          reference.tableId,
          token,
          logger
        );
      }

      // テーブルキャッシュから該当行を取得
      referencedRow = context.tableCache[reference.tableId].get(reference.rowId) || null;

      // 行キャッシュにも保存（後方互換性のため）
      context.cache[refKey] = referencedRow;
    } catch (error) {
      // 取得に失敗した場合はnullをキャッシュ
      logger.warn(`Failed to fetch table ${reference.tableId}: ${error instanceof Error ? error.message : String(error)}`);
      context.cache[refKey] = null;
      return null;
    }
  }

  // 参照先が見つからなかった場合
  if (referencedRow === null) {
    logger.debug(`Row ${refKey} not found`);
    return null;
  }

  // 参照先を処理済みとしてマーク
  context.processedRefs.add(refKey);

  // 参照先の行に対してルックアップを再帰的に展開
  const deeperExpandedRow = await expandRowLookups(
    referencedRow,
    docId,
    token,
    context,
    currentDepth + 1,
    maxDepth,
    logger
  );

  // 元の参照に展開データを追加
  const expandedRef = {
    ...reference,
    values: {
      id: deeperExpandedRow.id,
      values: deeperExpandedRow.values
    }
  };

  // Debug logging
  logger.debug(`Expanded ref: ${reference.rowId} at depth ${currentDepth}`);

  return expandedRef;
}

/**
 * 特定のCoda行からルックアップ参照を展開する
 */
async function expandRowLookups(
  row: CodaRow,
  docId: string,
  token: string,
  context: ProcessingContext,
  currentDepth: number = 0,
  maxDepth: number = 1,
  logger: any
): Promise<CodaRow> {
  // 展開しない条件
  if (maxDepth <= 0 || currentDepth >= maxDepth) {
    return row;
  }

  // 結果用に値をコピー
  const expandedValues = { ...row.values };

  // 各値をチェックして展開
  for (const [key, value] of Object.entries(row.values)) {
    // 単一のルックアップ参照の場合 - 先に処理
    if (isRawRowReference(value)) {
      // 参照を展開
      const expandedRef = await expandSingleReference(
        value,
        docId,
        token,
        context,
        currentDepth,
        maxDepth,
        logger
      );
      
      // 展開できた場合のみ値を更新
      if (expandedRef) {
        expandedValues[key] = expandedRef;
      }
    }
    // 配列の場合（複数のルックアップ参照）
    else if (Array.isArray(value)) {
      const expandedItems = [];
      let hasExpanded = false;

      for (const item of value) {
        // RowReference でなければそのまま追加して次へ
        if (!isRawRowReference(item)) {
          expandedItems.push(item);
          continue;
        }
        
        // 参照を展開
        const expandedRef = await expandSingleReference(
          item,
          docId,
          token,
          context,
          currentDepth,
          maxDepth,
          logger
        );
        
        // 展開できなかった場合は元の参照を保持
        if (!expandedRef) {
          expandedItems.push(item);
          continue;
        }
        
        // 展開できた場合
        expandedItems.push(expandedRef);
        hasExpanded = true;
      }

      // 少なくとも1つ展開されていたら、更新された配列を設定
      if (hasExpanded) {
        expandedValues[key] = expandedItems;
      }
    }
  }

  return {
    ...row,
    values: expandedValues
  };
}

/**
 * 特定の行データを取得する（旧方式：後方互換性のために残す）
 */
async function fetchRowData(
  docId: string,
  tableId: string,
  rowId: string,
  token: string
): Promise<CodaRow> {
  const url = `https://coda.io/apis/v1/docs/${docId}/tables/${encodeURIComponent(tableId)}/rows/${rowId}?valueFormat=rich`;

  // タイムアウト用のコントローラーを作成
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒タイムアウト

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch row: ${response.status} ${response.statusText}`);
    }

    return await response.json() as CodaRow;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timed out`);
    }
    throw error;
  }
}

/**
 * テーブル全体のデータを取得する（新方式：一括取得）
 */
async function fetchTableData(
  docId: string,
  tableId: string,
  token: string,
  logger: any
): Promise<Map<string, CodaRow>> {
  const baseUrl = `https://coda.io/apis/v1/docs/${docId}/tables/${encodeURIComponent(tableId)}/rows`;
  const queryParams = new URLSearchParams();
  queryParams.append("valueFormat", "rich");
  queryParams.append("limit", "500"); // 1リクエストあたりの最大取得数

  const rowsMap = new Map<string, CodaRow>();
  let pageToken: string | undefined = undefined;
  let pageCount = 0;

  do {
    if (pageToken) {
      queryParams.set("pageToken", pageToken);
    }

    const url = `${baseUrl}?${queryParams.toString()}`;

    // タイムアウト用のコントローラーを作成
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒タイムアウト

    try {
      pageCount++;
      logger.debug(`Fetching table ${tableId} page ${pageCount}...`);

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to fetch table data: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as CodaResponse;

      // 行データをMapに格納
      for (const row of data.items) {
        rowsMap.set(row.id, row);
      }

      pageToken = data.nextPageToken;

      logger.debug(`Fetched ${data.items.length} rows from table ${tableId} (total: ${rowsMap.size})`);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timed out while fetching table ${tableId}`);
      }
      throw error;
    }
  } while (pageToken);

  logger.info(`Loaded table ${tableId}: ${rowsMap.size} rows`);
  return rowsMap;
}

/**
 * 複数の行に対してルックアップを展開する（テーブルキャッシュ対応版）
 */
async function expandLookups(
  rows: CodaRow[],
  docId: string,
  token: string,
  maxDepth: number,
  logger: any
): Promise<CodaRow[]> {
  if (maxDepth <= 0) {
    return rows; // 展開しない
  }

  logger.info(`Expanding lookups to depth ${maxDepth} for ${rows.length} rows...`);

  const context: ProcessingContext = {
    processedRefs: new Set<string>(),
    cache: {},
    tableCache: {}, // テーブルキャッシュを初期化
    requestCount: 0
  };

  const expandedRows: CodaRow[] = [];
  const startTime = Date.now();

  // 進捗状況表示のための変数
  const totalRows = rows.length;
  let completedRows = 0;
  let lastProgressLog = Date.now();
  const progressInterval = 5000; // 進捗を表示する間隔（ミリ秒）

  for (const row of rows) {
    // 各行に対する処理済み参照をリセット（行をまたぐ循環参照は許可）
    context.processedRefs.clear();

    try {
      // ルックアップを展開
      const expandedRow = await expandRowLookups(row, docId, token, context, 0, maxDepth, logger);

      // if (logger) {
      //   logger.info(`Expanded row ${row.id} structure: ${JSON.stringify(expandedRow, null, 2)}`);
      // }

      expandedRows.push(expandedRow);
    } catch (error) {
      // エラーの場合は元の行を追加して処理を続行
      logger.warn(`Error expanding row ${row.id}: ${error instanceof Error ? error.message : String(error)}`);
      expandedRows.push(row);
    }

    // 進捗状況の更新とログ
    completedRows++;
    const now = Date.now();
    if (now - lastProgressLog > progressInterval || completedRows === totalRows) {
      const elapsedSeconds = Math.round((now - startTime) / 1000);
      const progressPercent = Math.round((completedRows / totalRows) * 100);

      // テーブルキャッシュの統計情報
      const cachedTableCount = Object.keys(context.tableCache).length;
      const cachedRowCount = Object.values(context.tableCache).reduce(
        (sum, table) => sum + table.size,
        0
      );

      logger.info(
        `Lookup expansion progress: ${completedRows}/${totalRows} rows (${progressPercent}%) - ` +
        `${elapsedSeconds}s elapsed - ` +
        `API Requests: ${context.requestCount} - ` +
        `Cached: ${cachedTableCount} tables (${cachedRowCount} rows)`
      );
      lastProgressLog = now;
    }
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  const cachedTableCount = Object.keys(context.tableCache).length;
  const cachedRowCount = Object.values(context.tableCache).reduce(
    (sum, table) => sum + table.size,
    0
  );

  logger.info(
    `Lookup expansion completed in ${totalTime}s - ` +
    `Total API Requests: ${context.requestCount} - ` +
    `Cached ${cachedTableCount} tables (${cachedRowCount} total rows)`
  );

  // Debug: サンプル行構造を出力
  if (expandedRows.length > 0) {
    logger.debug(`Sample expanded row structure: ${JSON.stringify(expandedRows[0], null, 2)}`);
  }

  return expandedRows;
}

/**
 * 特定の型のカラムの値をオブジェクトに正規化
 */
function normalizeEmptyToObject(
  values: Record<string, RawValue>, 
  columnTypes: Record<string, string>
): Record<string, RawValue> {
  const result: Record<string, RawValue> = { ...values };
  
  for (const [key, value] of Object.entries(values)) {
    const columnType = columnTypes[key];
    
    // リンク型のカラムをWebPageオブジェクトに変換（空でなくても変換）
    if (columnType === "link") {
      // 空の場合は空のWebPageオブジェクト
      if (value === null || value === undefined || value === "") {
        result[key] = {
          "@context": "http://schema.org/",
          "@type": "WebPage",
          "url": ""
        };
      } 
      // 文字列の場合はURLとしてWebPageオブジェクトに変換
      else if (typeof value === "string") {
        result[key] = {
          "@context": "http://schema.org/",
          "@type": "WebPage",
          "url": value
        };
      }
      // 既にWebPageオブジェクトの場合はそのまま
    }

    // 数値タイプのカラムを常に number に正規化
    else if (columnType === "number" || columnType === "slider" || columnType === "currency") {
      // 既に数値の場合はそのまま
      if (typeof value === 'number') {
        // 処理なし
      }
      // 文字列の場合は数値に変換
      else if (typeof value === 'string') {
        const num = Number(value);
        result[key] = isNaN(num) ? 0 : num; // NaN の場合は 0 に
      }
      // null/undefined の場合は 0 に
      else if (value === null || value === undefined) {
        result[key] = 0;
      }
      // その他の場合も 0（念のため）
      else {
        result[key] = 0;
      }
    }

    // 真偽値タイプのカラムを正規化
    else if (columnType === "boolean" || columnType === "checkbox") {
      // 既に真偽値の場合はそのまま
      if (typeof value === 'boolean') {
        // 処理なし
      }
      // 文字列の場合は真偽値に変換
      else if (typeof value === 'string') {
        if (value.toLowerCase() === 'true') {
          result[key] = true;
        } else if (value.toLowerCase() === 'false') {
          result[key] = false;
        } else {
          // 'true'/'false'以外の文字列は null に
          result[key] = null;
        }
      }
      // null/undefined はそのまま保持
      else if (value === null || value === undefined) {
        result[key] = null;
      }
      // その他の値は null に
      else {
        result[key] = null;
      }
    }
    
    // 人物型のカラムをPersonオブジェクトに変換（空でなくても変換）
    else if (columnType === "person") {
      // 空の場合は空のPersonオブジェクト
      if (value === null || value === undefined || value === "") {
        result[key] = {
          "@context": "http://schema.org/",
          "@type": "Person",
          "name": ""
        };
      }
      // 文字列の場合は名前としてPersonオブジェクトに変換
      else if (typeof value === "string") {
        result[key] = {
          "@context": "http://schema.org/",
          "@type": "Person",
          "name": value
        };
      }
      // 既にPersonオブジェクトの場合はそのまま
    }

    // image型のカラムを常に配列に正規化
    else if (columnType === "image") {
      // 既に配列の場合はそのまま
      if (Array.isArray(value)) {
        // 処理なし
      } 
      // 空文字の場合は空配列
      else if (value === null || value === undefined || value === "") {
        result[key] = [];
      }
      // 単一のImageObjectの場合は配列に変換
      else if (value && typeof value === 'object' && '@type' in value && value['@type'] === 'ImageObject') {
        result[key] = [value];
      }
      // その他の場合も空配列（念のため）
      else {
        result[key] = [];
      }
    }
    
    // lookup型のカラムを常に配列に正規化
    else if (columnType === "lookup") {
      // 既に配列の場合はそのまま
      if (Array.isArray(value)) {
        // 処理なし
      } 
      // 空/null/undefinedの場合は空配列
      else if (value === null || value === undefined || value === "") {
        result[key] = [];
      }
      // 単一のRowReferenceの場合は配列に変換
      else if (
        value && 
        typeof value === 'object' && 
        '@type' in value && 
        value['@type'] === 'StructuredValue' &&
        'additionalType' in value &&
        value['additionalType'] === 'row'
      ) {
        result[key] = [value];
      }
      // その他の場合も空配列（念のため）
      else {
        result[key] = [];
      }
    }
  }
  
  return result;
}

/**
 * Codaのカラム情報を取得
 */
async function fetchColumnData(
  docId: string, 
  tableIdOrName: string, 
  token: string
): Promise<CodaColumnsResponse> {
  const url = `https://coda.io/apis/v1/docs/${docId}/tables/${encodeURIComponent(tableIdOrName)}/columns`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  
  if (!response.ok) {
    throw new AstroError(
      `Failed to fetch table columns from Coda: ${response.status} ${response.statusText}`,
    );
  }
  
  return await response.json() as CodaColumnsResponse;
}

/**
 * Loads data from a Coda.io table.
 */
export function codaLoader({
  token = import.meta.env.CODA_API_TOKEN || import.meta.env.PUBLIC_CODA_API_TOKEN,
  docId = import.meta.env.CODA_DOC_ID || import.meta.env.PUBLIC_CODA_DOC_ID,
  tableIdOrName = import.meta.env.CODA_TABLE_ID || import.meta.env.PUBLIC_CODA_TABLE_ID,
  query,
  sortBy,
  limit,
  cleanStrings = true,
  maxLookupDepth = 0 // デフォルトでは展開しない
}: CodaLoaderOptions): Loader {
  if (!token) {
    throw new AstroError(
      "Missing Coda API token. Set it in the CODA_API_TOKEN or PUBLIC_CODA_API_TOKEN environment variable or pass it as an option.",
    );
  }
  
  if (!docId) {
    throw new AstroError(
      "Missing Coda doc ID. Set it in the CODA_DOC_ID or PUBLIC_CODA_DOC_ID environment variable or pass it as an option.",
    );
  }
  
  if (!tableIdOrName) {
    throw new AstroError(
      "Missing Coda table ID or name. Set it in the CODA_TABLE_ID or PUBLIC_CODA_TABLE_ID environment variable or pass it as an option.",
    );
  }

  // カラム型情報のキャッシュ
  let columnTypesCache: Record<string, string> = {};
  let columnsDataCache: CodaColumnsResponse | null = null;

  return {
    name: "coda-loader",
    load: async ({ logger, parseData, store }: LoaderContext) => {
      logger.info(`Loading data from Coda table "${tableIdOrName}"`);
      
      // カラム情報を取得（まだ取得していない場合）
      if (Object.keys(columnTypesCache).length === 0) {
        try {
          const columnsData = await fetchColumnData(docId, tableIdOrName, token);
          columnsDataCache = columnsData;
          
          // カラム型情報をキャッシュ
          for (const column of columnsData.items) {
            columnTypesCache[column.id] = column.format.type;
            columnsCache[column.id] = column;
          }
        } catch (error) {
          logger.warn(`Could not fetch column data: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      // Construct the API URL
      const baseUrl = `https://coda.io/apis/v1/docs/${docId}/tables/${encodeURIComponent(tableIdOrName)}/rows`;

      // Helper function to fetch and process rows for a single query
      const fetchAndProcessRows = async (queryString?: string) => {
        // Add query parameters
        const queryParams = new URLSearchParams();

        // Always add valueFormat=rich to get enhanced data including images
        queryParams.append("valueFormat", "rich");

        if (queryString) queryParams.append("query", queryString);
        if (sortBy) queryParams.append("sortBy", sortBy);
        if (limit) queryParams.append("limit", limit.toString());

        const url = `${baseUrl}?${queryParams.toString()}`;

        // Fetch data from Coda.io API
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new AstroError(
            `Failed to fetch data from Coda: ${response.status} ${response.statusText}. ${JSON.stringify(errorData)}`,
          );
        }

        const data = await response.json() as CodaResponse;

        // ルックアップの展開を行う（maxLookupDepth > 0 の場合のみ）
        let processedRows: CodaRow[];

        if (maxLookupDepth > 0) {
          try {
            processedRows = await expandLookups(data.items, docId, token, maxLookupDepth, logger);
          } catch (error) {
            logger.warn(`Error during lookup expansion, continuing with unexpanded data`);
            processedRows = data.items;
          }
        } else {
          processedRows = data.items;
        }

        return processedRows;
      };

      try {
        // Convert query to array of query strings
        let queries: (string | undefined)[];

        if (!query) {
          // No query specified
          queries = [undefined];
        } else if (typeof query === 'string') {
          // Single string query
          queries = [query];
        } else {
          // QueryFilter object - convert to multiple query strings
          const { column, values } = query;

          // Handle column names with spaces (need quotes)
          const columnPart = column.includes(' ') ? `"${column}"` : column;

          queries = values.map(value => {
            // JSON.stringify handles strings, numbers, booleans correctly
            return `${columnPart}:${JSON.stringify(value)}`;
          });
        }

        let totalRowsProcessed = 0;

        for (const q of queries) {
          const processedRows = await fetchAndProcessRows(q);

          // Process rows and add to store
          for (const row of processedRows) {
            const id = row.id;

            // 空の値を対応するオブジェクトに変換
            const normalizedValues = normalizeEmptyToObject(row.values, columnTypesCache);

            // 文字列のクリーニング（バッククォート除去など）
            const cleanedValues = cleanStrings ? cleanValues(normalizedValues) : normalizedValues;

            // 処理済みの行データを作成
            let rowData: CodaRow = {
              ...row,
              values: cleanedValues
            };

            // Convert to Record<string, unknown> for parseData compatibility
            const dataForParsing: Record<string, unknown> = {
              id: rowData.id,
              type: rowData.type,
              name: rowData.name,
              index: rowData.index,
              createdAt: rowData.createdAt,
              updatedAt: rowData.updatedAt,
              browserLink: rowData.browserLink,
              href: rowData.href,
              values: rowData.values
            };

            const parsedData = await parseData({ id, data: dataForParsing });
            store.set({ id, data: parsedData });
            totalRowsProcessed++;
          }
        }

        logger.info(`Loaded ${totalRowsProcessed} records from "${tableIdOrName}" (${queries.length} ${queries.length === 1 ? 'query' : 'queries'})`);
      } catch (error: unknown) {
        if (error instanceof AstroError) {
          throw error;
        }
        
        throw new AstroError(
          `Error loading data from Coda: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    
    // Auto-generate schema from the Coda table structure
    schema: async () => {
      try {
        // カラム情報をまだ取得していない場合は取得
        if (!columnsDataCache) {
          columnsDataCache = await fetchColumnData(docId, tableIdOrName, token);
          // カラム型情報をキャッシュ
          for (const column of columnsDataCache.items) {
            columnTypesCache[column.id] = column.format.type;
            columnsCache[column.id] = column;
          }
        }
        
        // Build the values schema based on column types
        const valuesSchema: Record<string, z.ZodTypeAny> = {};
        
        for (const column of columnsDataCache.items) {
          const columnId = column.id;
          const columnName = column.name;
          
          // Add to values schema with column name information
          valuesSchema[columnId] = codaFormatToZodType(
            column.format, 
            columnName,
            column.formula
          );
        }
        
        // Build the base schema for row metadata and add the values schema
        const baseSchema = createBaseRowSchema();
        // Use passthrough to allow additional properties that might not be in the schema
        const schema = baseSchema.extend({
          values: z.object(valuesSchema).passthrough()
        });
        
        return schema;
      } catch (error: unknown) {
        // If schema auto-generation fails, return a generic schema
        console.warn(`Could not auto-generate schema: ${error instanceof Error ? error.message : String(error)}`);
        const baseSchema = createBaseRowSchema();
        return baseSchema.extend({
          values: z.record(z.any())
        });
      }
    },
  };
}