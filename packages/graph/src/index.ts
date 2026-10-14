// Graph lane adapter over the official FalkorDB client. No simulated graph implementation.
export { GraphClient, GraphUnavailableError, configFromEnv } from './client.js';
export type { GraphConfig, Params, ParamValue } from './client.js';
export { QUERIES } from './queries.js';
export type { QueryName } from './queries.js';
export { analyzeRelease, graphHealth, unavailable } from './analysis.js';
export type { GraphHealth } from './analysis.js';
export { seedGraph, locateExcerpt, SEED_VERSION } from './seed.js';
export type { SeedResult } from './seed.js';
export { evidenceKeyFromEnv, bindingSig, revisionNumber } from './evidence-key.js';
export type { BindingClaim, BindingKind } from './evidence-key.js';
export { witnessedWrite, recoverWitness, revokeEvidence, checkWitness, witnessedSnapshot, readChain, evidenceState, readEvidenceSnapshot, bindingKey, ledgerFromEnv, WitnessError } from './state-ledger.js';
export type { LedgerConfig, LedgerRecord, ChainState, WitnessCheck } from './state-ledger.js';
export { runTool, TOOL_DEFINITIONS } from './agent-tools.js';
export type { ToolName, ToolContext, ToolResult, ToolStatus } from './agent-tools.js';
export type { AnalyzeOptions } from './analysis.js';
export { saveHandoff, getHandoff, handoffInbox, approvableStep } from './handoff.js';
export type { HandoffContext, SaveHandoffInput, HandoffOutcome } from './handoff.js';
