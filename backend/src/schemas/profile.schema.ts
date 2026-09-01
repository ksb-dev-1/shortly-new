import { z } from "zod";

// Both fields are optional so a client can send just a name, just an image,
// or both. The controller rejects a request that carries neither.
export const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Name must be at least 3 characters")
    .max(50, "Name must be at most 50 characters")
    .optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/*
 * Deleting an account asks for the password again, for the same reason
 * changing one does: an unlocked laptop should not be enough. Only presence is
 * checked here — the controller compares it against the stored hash, which is
 * the only test that means anything.
 */
export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
