import { z } from "zod";

const usedTokens = new Set<string>();

export const leadFormSchema = z.object({
  name: z.string().trim().min(2).max(120),
  empresa: z.string().trim().min(2).max(120),
  cargo: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  telefono: z.string().trim().min(7).max(20),
  interest: z.enum(["0-20", "21-50", "51-100", "+100"]),
  message: z.string().trim().min(10).max(2500),
  privacy: z.string().refine((value) => value === "on"),
  website: z.string().max(0),
  formToken: z.string().min(8),
  turnstileToken: z.string().min(10),
});

export function createLeadFormToken() {
  return crypto.randomUUID();
}

export function consumeLeadFormToken(token: string) {
  if (usedTokens.has(token)) {
    return false;
  }

  usedTokens.add(token);
  return true;
}
