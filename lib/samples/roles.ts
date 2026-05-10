import { z } from "zod";

export const SampleRoleSchema = z.enum([
  "break",
  "loop",
  "oneshot",
  "melodic",
  "pad",
  "fx",
]);

export type SampleRole = z.infer<typeof SampleRoleSchema>;
