/**
 * retry.js — Exponential back-off retry helper
 *
 * Usage:
 *   const result = await withRetry(() => axios.post(...), { label: 'Chargily checkout' });
 *
 * By default retries up to 3 times with delays of 1s → 2s → 4s.
 * Only retries on transient errors (network errors, 5xx responses, 429 rate-limits).
 * Throws immediately on 4xx client errors (bad request, auth failure, etc.) since
 * retrying those would never succeed.
 */

/**
 * Determine whether an error is worth retrying.
 * @param {Error} error
 * @returns {boolean}
 */
function isRetryable(error) {
    // Network-level errors (no response received at all)
    if (!error.response) return true;

    const status = error.response.status;

    // 429 Too Many Requests — always retry
    if (status === 429) return true;

    // 5xx Server Errors — transient, worth retrying
    if (status >= 500) return true;

    // 4xx Client Errors — our fault, retrying won't help
    return false;
}

/**
 * Run `fn` with automatic retries and exponential back-off.
 *
 * @param {() => Promise<any>} fn         Async function to call.
 * @param {object}             [options]
 * @param {string}             [options.label='operation']  Label used in log messages.
 * @param {number}             [options.maxRetries=3]       Max number of retry attempts.
 * @param {number}             [options.baseDelayMs=1000]   Initial delay in milliseconds.
 * @param {number}             [options.maxDelayMs=30000]   Cap on delay growth.
 * @returns {Promise<any>}
 */
async function withRetry(fn, { label = 'operation', maxRetries = 3, baseDelayMs = 1000, maxDelayMs = 30000 } = {}) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            const isLastAttempt = attempt === maxRetries;

            if (isLastAttempt || !isRetryable(error)) {
                // Either we've exhausted retries or it's a non-retryable error — give up
                const status = error.response ? error.response.status : 'no-response';
                console.error(`❌ [retry:${label}] Failed after ${attempt + 1} attempt(s). Status: ${status}. Error: ${error.message}`);
                throw error;
            }

            // Exponential back-off: 1s, 2s, 4s, … capped at maxDelayMs
            const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
            const status = error.response ? error.response.status : 'no-response';
            console.warn(`⚠️ [retry:${label}] Attempt ${attempt + 1} failed (status: ${status}). Retrying in ${delay}ms…`);
            await new Promise(r => setTimeout(r, delay));
        }
    }

    throw lastError;
}

module.exports = { withRetry };
