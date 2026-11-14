import type { AiAutopilotMode } from './types';

/** An explicit draft-only request overrides the configured full-autopilot mode. */
export function shouldPublishImmediately(
  mode: AiAutopilotMode,
  forcePublish?: boolean,
): boolean {
  if (forcePublish === false) return false;
  return forcePublish === true || mode === 'FULL_AUTOPILOT';
}
