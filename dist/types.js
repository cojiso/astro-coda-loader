// astro-coda-loader/src/types.ts
// isRawRowReference のチェックが必要
export function isRowReference(value) {
    return (value != null &&
        typeof value === 'object' &&
        '@type' in value &&
        value['@type'] === 'StructuredValue' &&
        'additionalType' in value &&
        value.additionalType === 'row');
}
// isExpandedRowReference のチェック関数を追加
export function isExpandedRowReference(value) {
    return (isRowReference(value) &&
        'values' in value &&
        value.values !== null &&
        typeof value.values === 'object');
}
