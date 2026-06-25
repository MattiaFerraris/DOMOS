/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the DOMOS backend REST API (override per-environment). */
  readonly VITE_API_BASE?: string;
}
