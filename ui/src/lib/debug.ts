// Vite replaces these flags at build time. Production builds stay silent by
// default; a diagnostic image can opt in with VITE_DEBUG=true during the UI
// build without scattering unconditional console calls through the app.
const debugEnabled = import.meta.env.DEV || import.meta.env.VITE_DEBUG === 'true';

export const debugLog = (...args: unknown[]) => {
    if (debugEnabled) console.debug(...args);
};

export const debugWarn = (...args: unknown[]) => {
    if (debugEnabled) console.warn(...args);
};

export const debugError = (...args: unknown[]) => {
    if (debugEnabled) console.error(...args);
};
