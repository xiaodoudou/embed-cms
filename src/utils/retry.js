/**
 * A request that never reached the server (connection reset, dropped packet) is worth another try: nothing was asked
 * of the server, so asking again is safe. An answer from the server, even an error one, is final.
 */

/** fetch() rejects with a TypeError when the connection fails; an HTTP error is a Response, a JSON error is an object */
export function isNetworkError (error) {
  return error instanceof TypeError
}

/**
 * Runs `action`; when it fails with a network error, waits and tries again (up to `attempts` runs in total).
 * @param {Function} action async function to run
 * @param {{attempts?: number, delayMs?: number, sleep?: Function}} [options] `sleep` is there for the tests
 */
export async function retryOnNetworkError (action, { attempts = 3, delayMs = 400, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await action()
    } catch (error) {
      lastError = error
      if (!isNetworkError(error) || attempt === attempts) {
        throw error
      }
      await sleep(delayMs * attempt)
    }
  }
  throw lastError
}
