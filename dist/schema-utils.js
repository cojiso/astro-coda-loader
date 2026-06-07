// astro-coda-loader/src/schema-utils.ts
import { z } from "astro/zod";
/**
 * Maps a Coda column format to a Zod type
 * @param format The Coda column format
 * @param columnName The name of the column (for documentation)
 */
export function codaFormatToZodType(format, columnName, formula) {
    // SchemaOrgオブジェクトの基本スキーマ
    const schemaOrgBase = z.object({
        '@context': z.string(),
        '@type': z.string()
    });
    // WebPageスキーマ
    const webPageSchema = schemaOrgBase.extend({
        name: z.string().optional(),
        url: z.string()
    });
    // ImageObjectスキーマ
    const imageObjectSchema = schemaOrgBase.extend({
        name: z.string(),
        height: z.union([z.string(), z.number()]).optional(),
        width: z.union([z.string(), z.number()]).optional(),
        url: z.string(),
        status: z.string().optional()
    });
    // 展開されたデータのスキーマを定義
    const expandedDataSchema = z.object({
        id: z.string(),
        name: z.string().optional(),
        values: z.record(z.any()) // どんな値も受け入れる
    });
    // RowReferenceスキーマ（StructuredValue）
    const rowReferenceSchema = schemaOrgBase.extend({
        additionalType: z.string(),
        name: z.string(),
        url: z.string(),
        tableId: z.string(),
        rowId: z.string(),
        tableUrl: z.string(),
        values: expandedDataSchema.optional()
    });
    // Personスキーマ
    const personSchema = schemaOrgBase.extend({
        name: z.string(),
        email: z.string().optional(),
        url: z.string().optional()
    });
    // Hyperlink関数を使用した計算列の特別処理
    if (formula && formula.includes("Hyperlink(")) {
        return z.union([
            z.string(), // 空文字列用
            webPageSchema
        ]).describe(`Column: ${columnName} (link generated from formula)`);
    }
    let zodType;
    switch (format.type) {
        case "number":
        case "slider":
        case "currency":
            zodType = z.number();
            break;
        case "boolean":
        case "checkbox":
            // 真偽値または null
            zodType = z.boolean().nullable();
            break;
        case "text":
            // テキストフィールドは純粋な文字列のみ
            zodType = z.string();
            break;
        case "date":
        case "datetime":
        case "time":
            // 日付/時間は文字列として扱う
            zodType = z.string();
            break;
        case "select":
            // 選択肢は文字列、options があれば enum で定義
            if (format.options && format.options.length > 0) {
                const optionNames = format.options.map(opt => opt.name);
                // z.enum requires at least one option
                zodType = z.enum(optionNames);
            }
            else {
                // options がない場合は通常の文字列
                zodType = z.string();
            }
            // isArray: true の場合は配列化（空配列も自動的に許可される）
            // 空文字列は normalizeEmptyToObject で空配列に正規化される
            if (format.isArray) {
                zodType = z.array(zodType);
            }
            break;
        case "image":
            // 画像は常に配列として扱う
            zodType = z.array(imageObjectSchema);
            break;
        case "link":
            // リンクはWebPageオブジェクトとして扱う
            zodType = webPageSchema;
            break;
        case "person":
            // 人物はPersonオブジェクトとして扱う
            zodType = personSchema;
            break;
        case "lookup":
            // 参照は常に配列として扱う
            zodType = z.array(rowReferenceSchema.extend({
                expandedData: expandedDataSchema.optional()
            }));
            break;
        default:
            // 不明な型
            zodType = z.any();
    }
    // Handle arrays - image, lookup, select はすでに処理済み
    if (format.isArray
        && format.type !== "image"
        && format.type !== "lookup"
        && format.type !== "select") {
        // その他の型で isArray: true の場合（空配列も自動的に許可される）
        zodType = z.array(zodType);
    }
    // Add JSDoc description with column name for better hover experience
    return zodType.describe(`Column: ${columnName} (${format.type}${format.isArray ? '[]' : ''})`);
}
/**
 * Creates a base schema for Coda row data
 */
export function createBaseRowSchema() {
    return z.object({
        id: z.string(),
        type: z.string(),
        name: z.string().optional(),
        index: z.number(),
        createdAt: z.string(),
        updatedAt: z.string(),
        browserLink: z.string(),
        href: z.string(),
    });
}
