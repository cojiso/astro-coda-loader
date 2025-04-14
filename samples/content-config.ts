// src/content/config.ts
import { defineCollection } from 'astro:content';
import { codaLoader } from 'astro-coda-loader';

const docId = import.meta.env.PUBLIC_CODA_DOC_ID;
const tableId = import.meta.env.PUBLIC_CODA_TABLE_ID;
const apiToken = import.meta.env.PUBLIC_CODA_API_TOKEN;

const hubs = defineCollection({
  loader: codaLoader({
    token: apiToken,
    docId: docId,
    tableIdOrName: tableId,
    // Adding error handling options
    onNormalizeError: 'warn', // 'warn', 'error', or 'ignore'
  }),
  // Using the auto-generated schema
});

export const collections = { hubs };