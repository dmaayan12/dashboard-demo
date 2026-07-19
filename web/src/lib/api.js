// Central place the hooks call through - every request goes to the demo Worker (a separate
// origin), with the entry-code header attached.
let currentEntryCode = null;

export function setEntryCode(code) {
  currentEntryCode = code;
}

export function clearEntryCode() {
  currentEntryCode = null;
}

export const WORKER_URL = 'https://dashboard-monday-demo.dmaayan12.workers.dev';

export const QUOTA_ERROR_MESSAGE = 'הגעתם למספר הפעמים המקסימלי שאפשר לפנות לשרת היום. זה מתאפס אוטומטית בסביבות 3 בלילה - נסו שוב אחרי השעה הזו.';

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${WORKER_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'X-Entry-Code': currentEntryCode || '',
    },
  });
  if (res.status === 401) {
    clearEntryCode();
    const err = new Error('קוד כניסה שגוי או פג תוקף');
    err.isAuthError = true;
    throw err;
  }
  if (res.status === 429) {
    const err = new Error(QUOTA_ERROR_MESSAGE);
    err.isQuotaError = true;
    throw err;
  }
  return res;
}

// Every error message this app deliberately throws is written in Hebrew (server-provided
// `body.error` strings and our own hardcoded fallbacks alike). A raw browser/network failure
// (no internet, DNS failure, CORS) never goes through that path - its message is plain English
// ("Failed to fetch" etc.) and would otherwise leak straight into the UI. Presence of a Hebrew
// character is a reliable signal for "this is one of ours" without having to tag every throw site.
const HEBREW_CHAR = /[֐-׿]/;
export function safeErrorMessage(err, fallback) {
  return err?.message && HEBREW_CHAR.test(err.message) ? err.message : fallback;
}
