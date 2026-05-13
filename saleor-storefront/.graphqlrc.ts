/**
 * GraphQL Code Generator Configuration
 *
 * This config generates TypeScript types from GraphQL queries/mutations.
 *
 * ## Usage
 * Run `pnpm run generate` after modifying any `.graphql` file in `src/graphql/`.
 *
 * ## What it does
 * 1. Loads the Saleor GraphQL schema (see schema resolution below)
 * 2. Reads all `.graphql` files from `src/graphql/`
 * 3. Generates typed documents in `src/gql/`
 *
 * ## Important Notes
 * - The `src/gql/` directory is AUTO-GENERATED - do not edit manually
 * - The checkout module has its own types in `src/checkout/graphql/index.ts`
 * - Always run `pnpm run generate` after changing GraphQL queries
 */
import { loadEnvConfig } from "@next/env";
import type { CodegenConfig } from "@graphql-codegen/cli";

loadEnvConfig(process.cwd());

function resolveCodegenSchemaUrl(): string {
	if (process.env.GITHUB_ACTION === "generate-schema-from-file") {
		return "schema.graphql";
	}
	const explicit = process.env.GRAPHQL_CODEGEN_SCHEMA_URL?.trim();
	if (explicit) return explicit;
	/** Server-reachable URL (e.g. `http://api:8000/graphql/` in Docker Compose) — not for the browser. */
	const server = process.env.SALEOR_API_SERVER_URL?.trim();
	if (server) return server;
	const publicUrl = process.env.NEXT_PUBLIC_SALEOR_API_URL?.trim();
	if (publicUrl) return publicUrl;
	return "";
}

const schemaUrl = resolveCodegenSchemaUrl();

if (!schemaUrl) {
	console.error(
		"GraphQL codegen: set NEXT_PUBLIC_SALEOR_API_URL, or SALEOR_API_SERVER_URL / GRAPHQL_CODEGEN_SCHEMA_URL (Docker: use the Saleor hostname the Node process can reach, e.g. http://api:8000/graphql/).",
	);
	process.exit(1);
}

const config: CodegenConfig = {
	overwrite: true,
	schema: schemaUrl,
	// Storefront GraphQL queries - add new queries here
	documents: "src/graphql/**/*.graphql",
	generates: {
		// Output directory for generated types (DO NOT EDIT MANUALLY)
		"src/gql/": {
			preset: "client",
			plugins: [],
			config: {
				documentMode: "string",
				useTypeImports: true,
				strictScalars: true,
				scalars: {
					Date: "string",
					DateTime: "string",
					Day: "number",
					Decimal: "number",
					GenericScalar: "unknown",
					JSON: "unknown",
					JSONString: "string",
					Metadata: "Record<string, string>",
					Hour: "number",
					Minute: "number",
					PositiveInt: "number",
					PositiveDecimal: "number",
					UUID: "string",
					Upload: "unknown",
					WeightScalar: "unknown",
					_Any: "unknown",
				},
			},
			presetConfig: {
				fragmentMasking: false,
			},
		},
	},
};

export default config;
