/**
 * Onboarding da organização: um passo só (boas-vindas). Schemas da Server Action e do
 * blob `organizations.onboarding_state jsonb`.
 */
import { z } from "zod";

export const welcomeSchema = z.object({
  display_name: z.string().min(2).max(120),
  timezone: z.string().min(1).default("America/Sao_Paulo"),
  accepted_terms_at: z.string().datetime().optional(),
});
export type WelcomeInput = z.infer<typeof welcomeSchema>;

export const onboardingStateSchema = z.object({
  welcome: z
    .object({
      accepted_at: z.string(),
      timezone: z.string(),
      display_name: z.string(),
    })
    .optional(),
});
export type OnboardingState = z.infer<typeof onboardingStateSchema>;
