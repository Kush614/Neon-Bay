/** Model access for agents (SPEC.md section 12). Implementations must never be called from tests. */
export interface LlmClient {
  /** Human-readable name of the model or harness, recorded in the ledger. */
  readonly harness: string;
  /** Send the persona prompt and the serialized observation; return the raw model reply. */
  decide(system: string, observation: string): Promise<string>;
}
