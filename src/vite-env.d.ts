/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LICENSE_WORKER_URL?: string;
  readonly VITE_CREEM_CHECKOUT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
