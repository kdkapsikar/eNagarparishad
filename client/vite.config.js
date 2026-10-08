import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Dev: the API runs on :3002; proxying keeps everything same-origin, so no CORS setup is needed.
const devApi = process.env.API_URL || 'http://localhost:3002';

/**
 * When the app is hosted apart from the API (GitHub Pages), the server cannot send security headers
 * for the page, so ship an equivalent Content-Security-Policy as a <meta> tag at build time.
 * (Same-origin builds get the real header from the Express server instead.)
 */
function contentSecurityPolicy(apiUrl) {
  return {
    name: 'enagar-csp-meta',
    transformIndexHtml() {
      if (!apiUrl) return [];
      const api = new URL(apiUrl).origin;
      const policy = [
        "default-src 'self'",
        "script-src 'self'",
        // fonts.googleapis.com serves the Mukta stylesheet (Devanagari + Latin in one typeface).
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        `connect-src 'self' ${api}`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ');
      return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }];
    },
  };
}

export default defineConfig(() => ({
  // GitHub Pages project sites live under /<repo>/. Set VITE_BASE=/e-nagarparishad/ at build time.
  base: process.env.VITE_BASE || '/',
  plugins: [react(), tailwindcss(), contentSecurityPolicy(process.env.VITE_API_URL)],
  server: {
    port: 5174,
    proxy: { '/api': devApi },
  },
}));
