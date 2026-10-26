import { describe, expect, it } from 'vitest';
import { FEEDBACK_TEST_FALLBACK_ERROR, feedbackTestErrorMessage } from './model';

describe('feedback test failures', () => {
  it('keeps the bridge reason and drops the IPC prefix', () => {
    const reason = 'Haptics test could not start while switching controller modes. Wait for the controller to reconnect, then try again.';
    expect(feedbackTestErrorMessage(new Error(`Error invoking remote method 'bridge:testHaptics': Error: ${reason}`))).toBe(reason);
    expect(feedbackTestErrorMessage(new Error(`Error invoking remote method 'bridge:testHaptics': ${reason}`))).toBe(reason);
    expect(feedbackTestErrorMessage(reason)).toBe(reason);
  });

  it('falls back to a retry message without a reason', () => {
    expect(feedbackTestErrorMessage(new Error(''))).toBe(FEEDBACK_TEST_FALLBACK_ERROR);
    expect(feedbackTestErrorMessage(undefined)).toBe(FEEDBACK_TEST_FALLBACK_ERROR);
  });
});
