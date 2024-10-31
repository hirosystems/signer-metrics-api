import { addAbortListener } from 'node:events';

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

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const disposable = signal ? addAbortListener(signal, onAbort) : undefined;
    const timeout = setTimeout(() => {
      disposable?.[Symbol.dispose ?? (Symbol.for('nodejs.dispose') as typeof Symbol.dispose)]();
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timeout);
      reject(signal?.reason);
    }
  });
}
