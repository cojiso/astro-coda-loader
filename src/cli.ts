#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { generateColumnHelpers } from './column-helpers.js';

async function main() {
  // Get CLI arguments
  const args = process.argv.slice(2);
  
  // Check if this is the generate command
  if (args[0] !== 'generate') {
    showHelp();
    process.exit(1);
  }
  
  // Extract argument values using a more robust approach
  const getArgValue = (prefix: string): string | undefined => {
    const arg = args.find(a => a.startsWith(`--${prefix}=`));
    return arg ? arg.substring(prefix.length + 3) : undefined;
  };
  
  const token = getArgValue('token');
  const docId = getArgValue('docId');
  const table = getArgValue('table');
  const outputPath = getArgValue('output') || './src/coda-columns.ts';
  
  // Validate required arguments
  if (!token || !docId || !table) {
    showHelp();
    process.exit(1);
  }
  
  try {
    await generateDefinitions(token, docId, table, outputPath);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

function showHelp(): void {
  console.log(`
  Astro Coda Loader - Column Definition Generator
  
  Usage:
    npx astro-coda-loader generate --token=YOUR_TOKEN --docId=YOUR_DOC_ID --table=YOUR_TABLE_ID [--output=./src/coda-columns.ts]
  
  Options:
    --token    Coda API token
    --docId    Coda document ID
    --table    Table ID or name
    --output   Output file path (default: ./src/coda-columns.ts)
  `);
}

async function generateDefinitions(
  token: string, 
  docId: string, 
  table: string, 
  outputPath: string
): Promise<void> {
  console.log(`Fetching column data from Coda table...`);
  
  // Get columns from Coda API
  const url = `https://coda.io/apis/v1/docs/${docId}/tables/${encodeURIComponent(table)}/columns`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Failed to fetch columns: ${response.status} ${response.statusText}\n${JSON.stringify(errorData, null, 2)}`
    );
  }
  
  const columnsData = await response.json();
  
  if (!columnsData.items || !Array.isArray(columnsData.items)) {
    throw new Error('Invalid response format from Coda API');
  }
  
  // Generate column helpers
  const code = generateColumnHelpers(columnsData.items);
  
  // Write to output file
  const outputFilePath = path.resolve(process.cwd(), outputPath);
  
  try {
    await fs.mkdir(path.dirname(outputFilePath), { recursive: true });
    await fs.writeFile(outputFilePath, code, 'utf8');
    console.log(`Column definitions successfully written to ${outputFilePath}`);
  } catch (error) {
    throw new Error(`Failed to write output file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Run the main function
main().catch(error => {
  console.error(`Unhandled error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});