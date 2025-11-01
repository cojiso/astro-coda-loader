// src/index.ts
export { codaLoader } from './coda-loader';
export { 
  isRawImage, 
  isRawWebPage, 
  isRawRowReference, 
  isRawPerson,
  getImageUrl,
  getLinkUrl,
  getPersonName,
  getReferenceName,
  cleanString,
  cleanValues
} from './normalize-utils';
export type {
  CodaLoaderOptions,
  QueryFilter,
  CodaRow,
  RawValue,
  CodaImage,
  CodaWebPage,
  CodaRowReference,
  CodaPerson,
  SchemaOrgObject
} from './types';