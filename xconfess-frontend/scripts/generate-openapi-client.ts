/**
 * OpenAPI Client Generation Script
 * 
 * This script generates typed API clients from the backend OpenAPI spec.
 * It creates type definitions and API method wrappers.
 * 
 * Usage:
 *   npx tsx scripts/generate-openapi-client.ts
 * 
 * Environment:
 *   OPENAPI_SPEC_URL - URL to fetch the OpenAPI spec from (default: http://localhost:4000/api)
 *   OUTPUT_DIR - Directory to output generated client (default: app/lib/api/generated)
 */

import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_SPEC_URL = process.env.OPENAPI_SPEC_URL || 'http://localhost:4000/api';
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(process.cwd(), 'app/lib/api/generated');

interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, Record<string, {
    operationId?: string;
    summary?: string;
    description?: string;
    parameters?: Array<{
      name: string;
      in: string;
      required?: boolean;
      schema?: Record<string, unknown>;
    }>;
    requestBody?: {
      content?: Record<string, { schema?: Record<string, unknown> }>;
    };
    responses?: Record<string, { description?: string }>;
  }>>;
  components?: {
    schemas?: Record<string, Record<string, unknown>>;
    securitySchemes?: Record<string, Record<string, unknown>>;
  };
  servers?: Array<{ url: string }>;
}

/**
 * Generate TypeScript types from OpenAPI schema
 */
function generateTypes(spec: OpenAPISpec): string {
  const schemas = spec.components?.schemas || {};
  let types = '// Auto-generated types from OpenAPI spec\n';
  types += '// Do not edit manually\n\n';

  for (const [name, schema] of Object.entries(schemas)) {
    types += generateInterface(name, schema as Record<string, unknown>);
    types += '\n';
  }

  return types;
}

/**
 * Generate a TypeScript interface from an OpenAPI schema
 */
function generateInterface(name: string, schema: Record<string, unknown>): string {
  let result = `export interface ${name} {\n`;
  
  if (schema.properties) {
    for (const [propName, propSchema] of Object.entries(schema.properties as Record<string, unknown>)) {
      const required = Array.isArray(schema.required) && schema.required.includes(propName);
      const type = mapSchemaToType(propSchema as Record<string, unknown>);
      result += `  ${propName}${required ? '' : '?'}: ${type};\n`;
    }
  }
  
  result += '}\n';
  return result;
}

/**
 * Map OpenAPI schema to TypeScript type
 */
function mapSchemaToType(schema: Record<string, unknown>): string {
  if (schema.$ref) {
    const refName = (schema.$ref as string).split('/').pop();
    return refName || 'unknown';
  }
  
  if (schema.type === 'string') {
    if (schema.format === 'date-time') return 'string';
    if (schema.format === 'date') return 'string';
    if (schema.enum && Array.isArray(schema.enum)) return schema.enum.map(e => `'${e}'`).join(' | ');
    return 'string';
  }
  
  if (schema.type === 'number' || schema.type === 'integer') {
    return 'number';
  }
  
  if (schema.type === 'boolean') {
    return 'boolean';
  }
  
  if (schema.type === 'array' && schema.items) {
    const itemType = mapSchemaToType(schema.items as Record<string, unknown>);
    return `${itemType}[]`;
  }
  
  if (schema.type === 'object' || schema.additionalProperties) {
    if (schema.additionalProperties) {
      const valueType = mapSchemaToType(schema.additionalProperties as Record<string, unknown>);
      return `Record<string, ${valueType}>`;
    }
    return 'Record<string, unknown>';
  }
  
  if (schema.oneOf || schema.anyOf) {
    const variants = (schema.oneOf || schema.anyOf) as Record<string, unknown>[];
    return variants.map(v => mapSchemaToType(v)).join(' | ');
  }
  
  return 'unknown';
}

/**
 * Generate API client methods from paths
 */
function generateClient(spec: OpenAPISpec): string {
  let client = '// Auto-generated API client from OpenAPI spec\n';
  client += '// Do not edit manually\n\n';
  client += "import client from './client';\n\n";
  
  const operationIds = new Set<string>();
  
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (method === 'parameters') continue;
      
      const operationId = operation.operationId || generateOperationId(path, method);
      if (operationIds.has(operationId)) continue;
      operationIds.add(operationId);
      
      client += generateMethod(path, method, operation, operationId);
    }
  }
  
  return client;
}

/**
 * Generate operationId if not provided
 */
function generateOperationId(path: string, method: string): string {
  const parts = path.split('/').filter(Boolean);
  return `${method}_${parts.join('_')}`;
}

/**
 * Generate a single API method
 */
function generateMethod(
  path: string,
  method: string,
  operation: Record<string, unknown>,
  operationId: string
): string {
  const params = (operation.parameters as Array<Record<string, unknown>>) || [];
  const pathParams = params.filter(p => p.in === 'path');
  const queryParams = params.filter(p => p.in === 'query');
  const hasBody = operation.requestBody;
  
  let methodSignature = `export async function ${operationId}(\n`;
  
  // Path parameters
  for (const param of pathParams) {
    const paramName = param.name as string;
    const required = param.required !== false;
    const type = param.schema ? mapSchemaToType(param.schema as Record<string, unknown>) : 'string';
    methodSignature += `  ${paramName}${required ? '' : '?'}: ${type},\n`;
  }
  
  // Query parameters
  if (queryParams.length > 0) {
    methodSignature += '  params?: {\n';
    for (const param of queryParams) {
      const paramName = param.name as string;
      const required = param.required !== false;
      const type = param.schema ? mapSchemaToType(param.schema as Record<string, unknown>) : 'string';
      methodSignature += `    ${paramName}${required ? '' : '?'}: ${type},\n`;
    }
    methodSignature += '  },\n';
  }
  
  // Request body
  if (hasBody) {
    const content = (hasBody as Record<string, unknown>).content as Record<string, { schema?: Record<string, unknown> }> | undefined;
    const bodySchema = content?.['application/json']?.schema;
    methodSignature += `  body?: ${bodySchema ? mapSchemaToType(bodySchema as Record<string, unknown>) : 'unknown'},\n`;
  }
  
  methodSignature += '): Promise<';
  methodSignature += 'unknown';
  methodSignature += '> => {\n';
  
  methodSignature += `  return client.${method}('${path}', {\n`;
  
  if (pathParams.length > 0) {
    methodSignature += '    params: {\n';
    for (const param of pathParams) {
      methodSignature += `      ${param.name},\n`;
    }
    methodSignature += '    },\n';
  }
  
  if (queryParams.length > 0) {
    methodSignature += '    params: params,\n';
  }
  
  if (hasBody) {
    methodSignature += '    json: body,\n';
  }
  
  methodSignature += '  });\n';
  methodSignature += '};\n\n';
  
  return methodSignature;
}

/**
 * Main function to generate the client
 */
async function main() {
  console.log('Generating OpenAPI client...');
  console.log(`Fetching spec from: ${DEFAULT_SPEC_URL}`);

  try {
    const response = await fetch(DEFAULT_SPEC_URL);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAPI spec: ${response.status} ${response.statusText}`);
    }
    
    const spec = await response.json() as OpenAPISpec;
    
    console.log(`Found spec: ${spec.info.title} v${spec.info.version}`);
    console.log(`Found ${Object.keys(spec.paths).length} paths`);
    
    // Create output directory
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    
    // Generate types
    const types = generateTypes(spec);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'types.ts'), types);
    console.log('Generated types.ts');
    
    // Generate client
    const clientCode = generateClient(spec);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'api.ts'), clientCode);
    console.log('Generated api.ts');
    
    // Generate index file
    const indexContent = `// Auto-generated index from OpenAPI spec
// Do not edit manually

export * from './types';
export * from './api';
`;
    fs.writeFileSync(path.join(OUTPUT_DIR, 'index.ts'), indexContent);
    console.log('Generated index.ts');
    
    console.log(`\nOpenAPI client generated successfully in ${OUTPUT_DIR}`);
    console.log('Remember to add the generated client to your API imports.');
    
  } catch (error) {
    console.error('Error generating OpenAPI client:', error);
    process.exit(1);
  }
}

main();
