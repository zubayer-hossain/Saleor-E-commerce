/**
 * GraphQL Code Generator Configuration for Checkout
 *
 * Run: pnpm generate:checkout
 */
import { loadEnvConfig } from "@next/env";
import type { CodegenConfig } from "@graphql-codegen/cli";

loadEnvConfig(process.cwd());

function resolveCodegenSchemaUrl(): string {
	const explicit = process.env.GRAPHQL_CODEGEN_SCHEMA_URL?.trim();
	if (explicit) return explicit;
	const server = process.env.SALEOR_API_SERVER_URL?.trim();
	if (server) return server;
	const publicUrl = process.env.NEXT_PUBLIC_SALEOR_API_URL?.trim();
	if (publicUrl) return publicUrl;
	return "";
}

const schemaUrl = resolveCodegenSchemaUrl();

if (!schemaUrl) {
	console.error(
		"Checkout GraphQL codegen: set NEXT_PUBLIC_SALEOR_API_URL or SALEOR_API_SERVER_URL / GRAPHQL_CODEGEN_SCHEMA_URL",
	);
	process.exit(1);
}

const config: CodegenConfig = {
	overwrite: true,
	schema: schemaUrl,
	documents: "src/checkout/graphql/**/*.graphql",
	generates: {
		"src/checkout/graphql/generated/index.ts": {
			plugins: ["typescript", "typescript-operations", "typescript-urql"],
			config: {
				useTypeImports: true,
				strictScalars: true,
				enumsAsTypes: true,
				scalars: {
					Date: "string",
					DateTime: "string",
					Day: "number",
					Decimal: "number",
					GenericScalar: "unknown",
					JSON: "any",
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
		},
	},
};

export default config;
