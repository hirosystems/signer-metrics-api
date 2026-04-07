import { sleep } from '../../src/helpers.ts';
import * as events from 'node:events';
import { describe, test } from 'node:test';
import * as assert from 'node:assert';

describe('Helper tests', () => {
  test('sleep function should not cause memory leak by accumulating abort listeners on abort', async () => {
    const controller = new AbortController();
    const { signal } = controller;

    const countListeners = () => events.getEventListeners(signal, 'abort').length;

    // Ensure the initial listener count is zero
    assert.equal(countListeners(), 0);

    // Run enough iterations to detect a pattern
    for (let i = 0; i < 100; i++) {
      try {
        const sleepPromise = sleep(1000, signal);
        controller.abort(); // Abort immediately
        await sleepPromise;
      } catch (err) {
        assert.match((err as Error).toString(), /aborted/i);
      }

      // Assert that listener count does not increase
      assert.ok(countListeners() <= 1); // 1 listener may temporarily be added and removed
    }

    // Final check to confirm listeners are cleaned up
    assert.equal(countListeners(), 0);
  });

  test('sleep function should not cause memory leak by accumulating abort listeners on successful completion', async () => {
    const controller = new AbortController();
    const { signal } = controller;

    const countListeners = () => events.getEventListeners(signal, 'abort').length;

    // Ensure the initial listener count is zero
    assert.equal(countListeners(), 0);

    // Run enough iterations to detect a pattern
    for (let i = 0; i < 100; i++) {
      await sleep(2, signal); // Complete sleep without abort

      // Assert that listener count does not increase
      assert.equal(countListeners(), 0); // No listeners should remain after successful sleep completion
    }

    // Final check to confirm listeners are cleaned up
    assert.equal(countListeners(), 0);
  });
});
