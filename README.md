# Astro Coda.io Loader

This package provides a Coda.io loader for Astro. It allows you to load data from Coda.io tables and use it as content in your Astro project.

## Installation

```sh
npm install astro-coda-loader
```

## Prerequisites

You'll need a Coda.io API token to use this loader. You can create one in your [Coda account settings](https://coda.io/account).

## Setup

This package requires Astro 4.14.0 or later with the experimental content layer enabled, or Astro 5.0.0+.

If you're using Astro 4.x, enable the content layer in your `astro.config.mjs`:

```javascript
export default defineConfig({
  experimental: {
    contentLayer: true,
  },
});
```

## Usage

Create or update your content collection configuration:

```typescript
// src/content/config.ts
import { defineCollection } from "astro:content";
import { codaLoader } from "astro-coda-loader";

const projects = defineCollection({
  loader: codaLoader({
    docId: "YOUR_CODA_DOC_ID", // Found in the URL of your Coda doc
    tableIdOrName: "Projects", // Name or ID of your table
  }),
});

export const collections = { projects };
```

You can then use it like any other content collection in Astro:

```astro
---
import { getCollection } from "astro:content";

// Get all items from the collection
const projects = await getCollection("projects");
---

<ul>
  {projects.map((project) => (
    <li>
      <h2>{project.data.name}</h2>
      <p>Created: {new Date(project.data.createdAt).toLocaleDateString()}</p>
      
      {/* Access column values from the values object */}
      <p>Title: {project.data.values["c-someColumnId"]}</p>
      <p>Description: {project.data.values["c-anotherColumnId"]}</p>
    </li>
  ))}
</ul>
```

## Data Structure

Each entry in your collection will have the following structure:

```typescript
{
  id: string;       // The Coda row ID
  type: string;     // Usually "row"
  name: string;     // The row name (if available)
  index: number;    // The row index in the table
  createdAt: string; // ISO date string of when the row was created
  updatedAt: string; // ISO date string of when the row was last updated
  values: {
    // Column values by column ID
    "c-columnId1": value1,
    "c-columnId2": value2,
    // etc.
  }
}
```

## Options

The `codaLoader` function accepts the following options:

| Option | Type | Description | Default |
| ------ | ---- | ----------- | ------- |
| `token` | `string` | Your Coda API token | Value of `CODA_API_TOKEN` or `PUBLIC_CODA_API_TOKEN` environment variable |
| `docId` | `string` | The ID of your Coda document | Value of `CODA_DOC_ID` or `PUBLIC_CODA_DOC_ID` environment variable |
| `tableIdOrName` | `string` | The name or ID of the table to load from | Value of `CODA_TABLE_ID` or `PUBLIC_CODA_TABLE_ID` environment variable |
| `filter` | `string` | A formula to filter rows (optional) | - |
| `sortBy` | `object` | Sorting options with column and direction (optional) | - |
| `limit` | `number` | Maximum number of rows to fetch (optional) | - |
| `cleanStrings` | `boolean` | Whether to remove backticks from string values | `true` |

### Example with all options

```typescript
const tasks = defineCollection({
  loader: codaLoader({
    token: "your-api-token", // It's better to use environment variables instead
    docId: "YOUR_CODA_DOC_ID",
    tableIdOrName: "Tasks",
    filter: "Status = 'Active'",
    sortBy: {
      column: "DueDate",
      direction: "asc"
    },
    limit: 100,
    cleanStrings: true
  }),
});
```

## Working with Coda's Rich Data Types

Coda API returns complex data types in a Schema.org-compatible format. This loader preserves the original structure while providing helper functions to work with them safely.

### Common Data Types

#### Text, Numbers, and Booleans

Simple data types are returned as-is:

```typescript
const title = entry.data.values["c-title-column"]; // string
const count = entry.data.values["c-count-column"]; // number
const isActive = entry.data.values["c-active-column"]; // boolean
```

#### Images

Images are returned as Schema.org ImageObject:

```typescript
// Schema.org ImageObject
{
  "@context": "http://schema.org/",
  "@type": "ImageObject",
  "name": "image.jpeg",
  "height": 1600,
  "width": 2400,
  "url": "https://..."
}
```

#### Links

Links are returned as Schema.org WebPage:

```typescript
// Schema.org WebPage
{
  "@context": "http://schema.org/",
  "@type": "WebPage",
  "name": "My Link",
  "url": "https://example.com"
}
```

#### People

People are returned as Schema.org Person:

```typescript
// Schema.org Person
{
  "@context": "http://schema.org/",
  "@type": "Person",
  "name": "John Doe",
  "email": "john@example.com"
}
```

#### Row References

References to other rows:

```typescript
// Schema.org StructuredValue
{
  "@context": "http://schema.org/",
  "@type": "StructuredValue",
  "additionalType": "row",
  "name": "Referenced Row",
  "url": "https://coda.io/...",
  "tableId": "grid-abc123",
  "rowId": "i-xyz789",
  "tableUrl": "https://coda.io/..."
}
```

### Type Guards

To safely work with these complex types, the package provides type guards:

```typescript
import { isRawImage, isRawWebPage, isRawPerson, isRawRowReference } from "astro-coda-loader";

// Check if a value is an image
if (isRawImage(entry.data.values["c-image-column"])) {
  // TypeScript knows this is a CodaImage
  console.log(entry.data.values["c-image-column"].url);
}
```

### Helper Functions

The package also provides helper functions to extract common properties:

```typescript
import { getImageUrl, getLinkUrl, getPersonName, getReferenceName } from "astro-coda-loader";

// Get the URL from an image (returns null if not an image)
const imageUrl = getImageUrl(entry.data.values["c-image-column"]);

// Get the URL from a link (returns null if not a link)
const linkUrl = getLinkUrl(entry.data.values["c-link-column"]);

// Get the name from a person (returns null if not a person)
const personName = getPersonName(entry.data.values["c-person-column"]);

// Get the name from a row reference (returns null if not a reference)
const refName = getReferenceName(entry.data.values["c-reference-column"]);
```

These helper functions can be used with the null coalescing operator for default values:

```typescript
// Get link URL with a fallback
const reservationLink = getLinkUrl(entry.data.values["c-reservation-link"]) ?? "#reserve";
```

## Working with Column IDs

Coda API uses column IDs (like `c-NVZCPMJjHX`) in the `values` object, which can be difficult to work with. This package provides two features to make this easier:

### 1. Hover Documentation in VS Code

The auto-generated schema includes JSDoc comments with column names, so when you hover over a column ID in VS Code, you'll see the actual column name:

```typescript
// When you hover over "c-NVZCPMJjHX", VS Code will show:
// Column: タスク (text)
project.data.values["c-NVZCPMJjHX"]
```

### 2. Column Definition Generator

You can also generate a TypeScript definition file with constants for all column IDs:

```bash
# Generate column definitions
npx astro-coda-loader generate --token=YOUR_TOKEN --docId=YOUR_DOC_ID --table=YOUR_TABLE_ID
```

This creates a file at `./src/coda-columns.ts` with:

```typescript
/**
 * Type containing all column IDs with their descriptions
 */
export type ColumnId = 
  /** タスク (text) */
  | "c-NVZCPMJjHX"
  /** 担当者 (person) */
  | "c-ikQWI8z8y-";

/**
 * Object mapping column IDs to their names for better discoverability
 */
export const COLUMNS = {
  /** タスク (text) */
  タスク: "c-NVZCPMJjHX",
  /** 担当者 (person) */
  担当者: "c-ikQWI8z8y-",
} as const;
```

You can then use these constants in your code:

```typescript
import { COLUMNS } from "../src/coda-columns";

// Instead of:
project.data.values["c-NVZCPMJjHX"]

// You can use:
project.data.values[COLUMNS.タスク]
```

This makes your code more readable and provides auto-completion for column names.

## Custom Schema

The loader will automatically generate a schema based on the table's column structure. However, you can also define your own schema:

```typescript
import { z } from "astro:content";

const tasks = defineCollection({
  loader: codaLoader({
    docId: "YOUR_CODA_DOC_ID",
    tableIdOrName: "Tasks",
  }),
  schema: z.object({
    id: z.string(),
    type: z.string(),
    name: z.string().optional(),
    index: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
    values: z.record(z.any()), // Accept any values
  }),
});
```

### Extending the Auto-generated Schema

You can also extend the auto-generated schema to customize specific fields while keeping the rest:

```typescript
import { z } from "astro:content";

const tasks = defineCollection({
  loader: codaLoader({
    docId: "YOUR_CODA_DOC_ID",
    tableIdOrName: "Tasks",
  }),
  // Use schema function with image helper
  schema: ({ image }) => z.object({
    // Transform string dates to Date objects
    createdAt: z.string().transform(str => new Date(str)),
    updatedAt: z.string().transform(str => new Date(str)),
    
    // Customize values type for specific columns
    values: z.object({
      "c-status-column": z.enum(["Not Started", "In Progress", "Completed", "On Hold"]),
      "c-image-column": image().optional(), // Use Astro's image helper
    }).passthrough(), // Allow other properties from auto-generated schema
  }),
});
```

## Environment Variables

You can set the following environment variables instead of passing them directly:

```
# .env or .env.local
CODA_API_TOKEN=your-api-token
CODA_DOC_ID=your-doc-id
CODA_TABLE_ID=your-table-id

# For public variables (accessible in the browser)
PUBLIC_CODA_API_TOKEN=your-api-token
PUBLIC_CODA_DOC_ID=your-doc-id
PUBLIC_CODA_TABLE_ID=your-table-id
```

> **Note**: Be careful with using PUBLIC_* variables for API tokens, as they will be exposed to the client-side code.

## Example Component

Here's an example Astro component that displays a gallery of images from Coda:

```astro
---
import { getCollection } from "astro:content";
import { isRawImage } from "astro-coda-loader";

const projects = await getCollection("projects");
---

<div class="gallery">
  {projects.map(project => {
    const images = project.data.values["c-gallery"];
    
    if (Array.isArray(images)) {
      return (
        <div class="project">
          <h2>{project.data.name}</h2>
          <div class="images">
            {images.map(image => 
              isRawImage(image) && (
                <img 
                  src={image.url} 
                  alt={image.name} 
                  width={image.width} 
                  height={image.height} 
                />
              )
            )}
          </div>
        </div>
      );
    }
    return null;
  })}
</div>
```

## License

MIT