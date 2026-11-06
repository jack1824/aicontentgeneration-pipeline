// @socialadz/contracts: the only surface shared by the TypeScript app/API and the Python workers.
// Phase 0.1b skeleton. It proves the workspace link and the build order (contracts before api). The prompt-output
// schemas arrive in 0.4 and the core job and brief schemas in 1.1 (docs/plan/03-contracts.md).
// Step keys are computed only by the Python engine: the API sends inputs, never a hash.

export const CONTRACTS_VERSION = "0.0.0" as const;
export type ContractsVersion = typeof CONTRACTS_VERSION;
