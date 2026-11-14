import type { PredictionRecord } from './types';

type AiProvenanceFields = Pick<
  PredictionRecord,
  'authorSource' | 'externalFixtureId' | 'agentReport'
>;

/**
 * A legacy AI_AUTOPILOT label alone does not prove the prediction passed through
 * the current bookmaker-line and AI-role pipeline. Require its persisted evidence.
 */
export function hasAiCommitteeProvenance(record: AiProvenanceFields): boolean {
  return (
    record.authorSource === 'AI_AUTOPILOT' &&
    Boolean(record.externalFixtureId?.trim()) &&
    Boolean(record.agentReport?.trim())
  );
}
