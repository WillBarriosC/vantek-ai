import { defineMiddleware } from "astro:middleware";

const ALLOWED_PATHS = new Set<string>([
  "/",
  "/404",
  "/privacy",
  "/terms",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap-index.xml",
  "/sitemap.xml",
]);

const ALLOWED_PREFIXES = ["/_astro/", "/images/", "/fonts/", "/api/"];

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  if (
    ALLOWED_PATHS.has(pathname) ||
    ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    return next();
  }
  return context.redirect("/404", 302);
});
