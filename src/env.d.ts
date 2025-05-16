/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly CODA_API_TOKEN?: string;
  readonly PUBLIC_CODA_API_TOKEN?: string;
  readonly CODA_DOC_ID?: string;
  readonly PUBLIC_CODA_DOC_ID?: string;
  readonly CODA_TABLE_ID?: string;
  readonly PUBLIC_CODA_TABLE_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}