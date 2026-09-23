/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface WindowEventMap {
  /** Raised by the speech service when it had to drop emotion/emphasis tags. */
  'speechify-fallback-warning': CustomEvent<{ message: string }>;
}
