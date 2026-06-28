/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LICENSE_WORKER_URL?: string;
  readonly VITE_CREEM_CHECKOUT_URL?: string;
  readonly VITE_CREEM_MONTHLY_CHECKOUT_URL?: string;
  readonly VITE_CREEM_ANNUAL_CHECKOUT_URL?: string;
  readonly VITE_SUPPORT_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
