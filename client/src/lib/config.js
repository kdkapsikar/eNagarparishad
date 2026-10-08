// Where the API lives. Empty (the default) = same origin as the web app, which is how `npm run dev`
// (Vite proxy) and the single-server production setup work. Set VITE_API_URL at build time when the
// web app is hosted separately from the API, e.g. VITE_API_URL=https://e-nagarparishad-api.onrender.com
export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

/** Router basename: "" normally, "/e-nagarparishad" when served from a GitHub Pages project site. */
export const BASENAME = import.meta.env.BASE_URL.replace(/\/+$/, '');

/** URL of a file in client/public, respecting the deploy base path. */
export const publicUrl = (file) => `${import.meta.env.BASE_URL}${file}`;
