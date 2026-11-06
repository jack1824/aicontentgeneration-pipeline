// SOCIALADZGEN STUDIO v2 API: Phase 0.1b skeleton. It proves that the API compiles and runs against the shared
// contracts package. The routes (docs/plan/03-contracts.md) and the framework (Fastify or Hono) arrive in 1.6.
// Rule kept from day one: the API never sends a money field to the web app.
import { CONTRACTS_VERSION, type ContractsVersion } from "@socialadz/contracts";

export const apiContractsVersion: ContractsVersion = CONTRACTS_VERSION;
