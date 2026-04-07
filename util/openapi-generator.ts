import * as dotenv from 'dotenv';
import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Api } from '../src/api/init.js';
import FastifySwagger from '@fastify/swagger';
import { OpenApiSchemaOptions } from '../src/api/schemas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultParsed = dotenv.config({ path: path.join(__dirname, 'default.env') }).parsed;
dotenv.populate(process.env as Record<string, string>, defaultParsed as Record<string, string>);

/**
 * Generates `openapi.yaml` based on current Swagger definitions.
 */
async function generateOpenApiFiles() {
  const outputDir = path.resolve('./tmp');
  console.log(`Writing OpenAPI files to ${outputDir}...`);
  const yamlFile = path.resolve(outputDir, 'openapi.yaml');
  const jsonFile = path.resolve(outputDir, 'openapi.json');

  const fastify = Fastify({
    trustProxy: true,
    logger: true,
  }).withTypeProvider<TypeBoxTypeProvider>();

  await fastify.register(FastifySwagger, OpenApiSchemaOptions);
  await fastify.register(Api);
  await fastify.ready();

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(yamlFile, fastify.swagger({ yaml: true }));
  writeFileSync(jsonFile, JSON.stringify(fastify.swagger(), null, 2));

  await fastify.close();

  console.log(`OpenAPI yaml file written to ${yamlFile}`);
  console.log(`OpenAPI json file written to ${jsonFile}`);
}

void generateOpenApiFiles();
