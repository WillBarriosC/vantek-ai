/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
  readonly TURNSTILE_SECRET_KEY?: string;
  readonly APP_SCRIPT_URL?: string;
  readonly APP_SCRIPT_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
