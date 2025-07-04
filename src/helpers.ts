import { addAbortListener } from 'node:events';
import { parseISO, sub, isValid, Duration } from 'date-fns';

export const isDevEnv = process.env.NODE_ENV === 'development';
export const isTestEnv = process.env.NODE_ENV === 'test';
export const isProdEnv =
  process.env.NODE_ENV === 'production' ||
  process.env.NODE_ENV === 'prod' ||
  !process.env.NODE_ENV ||
  (!isTestEnv && !isDevEnv);

/** Convert a unix timestamp in milliseconds to an ISO string */
export function unixTimeMillisecondsToISO(timestampMilliseconds: number): string {
  return new Date(timestampMilliseconds).toISOString();
}

/** Convert a unix timestamp in seconds to an ISO string */
export function unixTimeSecondsToISO(timestampSeconds: number): string {
  return unixTimeMillisecondsToISO(timestampSeconds * 1000);
}

/** Ensures a hex string has a `0x` prefix */
export function normalizeHexString(hexString: string): string {
  return hexString.startsWith('0x') ? hexString : '0x' + hexString;
}

// This is a workaround for Node.js versions that do not support Symbol.dispose
const DisposeSymbol: typeof Symbol.dispose = Symbol.dispose ?? Symbol.for('nodejs.dispose');

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason as Error);
      return;
    }
    const disposable = signal ? addAbortListener(signal, onAbort) : undefined;
    const timeout = setTimeout(() => {
      disposable?.[DisposeSymbol]();
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timeout);
      reject((signal?.reason as Error) ?? new Error('Aborted'));
    }
  });
}

/**
 * Helper function to parse relative or ISO time strings
 * @param timeStr - Examples: 'now', 'now-1d', 'now-3h', '2024-11-01T15:16:53.891Z'
 * @returns Date object or null if parsing failed
 */
export function parseTime(timeStr: string): Date | null {
  if (timeStr === 'now') {
    return new Date();
  }

  if (timeStr.startsWith('now-')) {
    const relativeMatch = /now-(\d+)(s|mo|m|h|d|w|y)/i.exec(timeStr);
    if (relativeMatch) {
      const [, amount, unit] = relativeMatch;
      const unitsMap: Record<string, keyof Duration> = {
        s: 'seconds',
        m: 'minutes',
        h: 'hours',
        d: 'days',
        w: 'weeks',
        mo: 'months',
        y: 'years',
      };
      if (unitsMap[unit]) {
        return sub(new Date(), { [unitsMap[unit]]: parseInt(amount) });
      }
    }
  } else {
    const date = parseISO(timeStr);
    if (isValid(date)) {
      return date;
    }
  }

  // Return null if parsing failed
  return null;
}

export type BlockIdParam =
  | { type: 'height'; height: number }
  | { type: 'hash'; hash: string }
  | { type: 'latest'; latest: true };
