// Preload for incident verification: never load .env; reject external fetches.
process.env.GEMINI_API_KEY = '';
delete process.env.SUPABASE_URL;
const originalFetch = global.fetch;
global.fetch = (input, ...args) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new Error('Offline test blocked external request: ' + url.origin);
  return originalFetch(input, ...args);
};
