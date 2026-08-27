import { z } from "zod";

export enum Gender {
  MALE = "male",
  FEMALE = "female",
  OTHER = "other",
}

// ============================================================================
// AUTH VALIDATION SCHEMAS
// ============================================================================

/**
 * Login form validation schema
 */
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
  password: z
    .string()
    .min(1, "Password is required")
    .min(8, "Password must be at least 8 characters"),
});

export type LoginFormData = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
});

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

/**
 * Register form validation schema
 */
export const registerSchema = z.object({
  username: z
    .string()
    .min(1, "Username is required")
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username cannot exceed 30 characters")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username can only contain letters, numbers, and underscores"
    ),
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
  password: z
    .string()
    .min(1, "Password is required")
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password cannot exceed 72 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/,
      "Password must include uppercase, lowercase, number, and special character"
    ),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export type RegisterFormData = z.infer<typeof registerSchema>;

// ============================================================================
// CONFESSION FORM VALIDATION
// ============================================================================

export const confessionFormSchema = z.object({
  title: z
    .string()
    .max(200, "Title cannot exceed 200 characters")
    .optional()
    .or(z.literal("")),
  body: z
    .string()
    .min(10, "Confession must be at least 10 characters")
    .max(5000, "Confession cannot exceed 5000 characters"),
  gender: z.nativeEnum(Gender).optional(),
  enableStellarAnchor: z.boolean().optional().default(false),
});

export type ConfessionFormData = z.infer<typeof confessionFormSchema>;

// ============================================================================
// VALIDATION ERROR TYPES
// ============================================================================

export interface ValidationErrors {
  title?: string;
  body?: string;
  gender?: string;
  enableStellarAnchor?: string;
  email?: string;
  password?: string;
  username?: string;
  confirmPassword?: string;
}

// ============================================================================
// VALIDATION HELPER FUNCTIONS
// ============================================================================

/**
 * Validates login form data
 * @returns ValidationErrors object with field-specific errors
 */
export function validateLoginForm(
  data: Partial<LoginFormData>
): ValidationErrors {
  const errors: ValidationErrors = {};

  const result = loginSchema.safeParse(data);

  if (!result.success && result.error) {
    const zodError = result.error as z.ZodError;
    if (zodError.issues && Array.isArray(zodError.issues)) {
      zodError.issues.forEach((err) => {
        const field = err.path[0] as keyof ValidationErrors;
        if (field) {
          errors[field] = err.message;
        }
      });
    }
  }

  return errors;
}

export function validateForgotPasswordForm(
  data: Partial<ForgotPasswordFormData>
): ValidationErrors {
  const errors: ValidationErrors = {};

  const result = forgotPasswordSchema.safeParse(data);

  if (!result.success && result.error) {
    const zodError = result.error as z.ZodError;
    if (zodError.issues && Array.isArray(zodError.issues)) {
      zodError.issues.forEach((err) => {
        const field = err.path[0] as keyof ValidationErrors;
        if (field) {
          errors[field] = err.message;
        }
      });
    }
  }

  return errors;
}

export function parseForgotPasswordForm(data: unknown):
  | { success: true; data: ForgotPasswordFormData }
  | { success: false; errors: ValidationErrors } {
  const result = forgotPasswordSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: ValidationErrors = {};
  const zodError = result.error as z.ZodError;
  if (zodError.issues && Array.isArray(zodError.issues)) {
    zodError.issues.forEach((err) => {
      const field = err.path[0] as keyof ValidationErrors;
      if (field) {
        errors[field] = err.message;
      }
    });
  }

  return { success: false, errors };
}

/**
 * Validates register form data
 * @returns ValidationErrors object with field-specific errors
 */
export function validateRegisterForm(
  data: Partial<RegisterFormData>
): ValidationErrors {
  const errors: ValidationErrors = {};

  const result = registerSchema.safeParse(data);

  if (!result.success && result.error) {
    const zodError = result.error as z.ZodError;
    if (zodError.issues && Array.isArray(zodError.issues)) {
      zodError.issues.forEach((err) => {
        const field = err.path[0] as keyof ValidationErrors;
        if (field) {
          errors[field] = err.message;
        }
      });
    }
  }

  return errors;
}

/**
 * Validates confession form data
 * @returns ValidationErrors object with field-specific errors
 */
export function validateConfessionForm(
  data: Partial<ConfessionFormData>
): ValidationErrors {
  const errors: ValidationErrors = {};

  // Normalize data - ensure strings are strings, not undefined
  const normalizedData = {
    title: data.title ?? "",
    body: data.body ?? "",
    gender: data.gender,
    enableStellarAnchor: data.enableStellarAnchor ?? false,
  };

  // Use safeParse instead of parse to avoid try-catch
  const result = confessionFormSchema.safeParse(normalizedData);

  if (!result.success && result.error) {
    // ZodError uses 'issues' property, not 'errors'
    const zodError = result.error as z.ZodError;
    if (zodError.issues && Array.isArray(zodError.issues)) {
      zodError.issues.forEach((err) => {
        const field = err.path[0] as keyof ValidationErrors;
        if (field) {
          errors[field] = err.message;
        }
      });
    }
  }

  return errors;
}

// ============================================================================
// CLIENT-SIDE PARSING HELPERS
// ============================================================================

/**
 * Parse and validate login form with typed error messages
 * Returns the parsed data if valid, or null if invalid
 */
export function parseLoginForm(data: unknown): {
  success: true;
  data: LoginFormData;
} | {
  success: false;
  errors: ValidationErrors;
} {
  const result = loginSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: ValidationErrors = {};
  const zodError = result.error as z.ZodError;
  if (zodError.issues && Array.isArray(zodError.issues)) {
    zodError.issues.forEach((err) => {
      const field = err.path[0] as keyof ValidationErrors;
      if (field) {
        errors[field] = err.message;
      }
    });
  }

  return { success: false, errors };
}

/**
 * Parse and validate register form with typed error messages
 * Returns the parsed data if valid, or null if invalid
 */
export function parseRegisterForm(data: unknown): {
  success: true;
  data: RegisterFormData;
} | {
  success: false;
  errors: ValidationErrors;
} {
  const result = registerSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: ValidationErrors = {};
  const zodError = result.error as z.ZodError;
  if (zodError.issues && Array.isArray(zodError.issues)) {
    zodError.issues.forEach((err) => {
      const field = err.path[0] as keyof ValidationErrors;
      if (field) {
        errors[field] = err.message;
      }
    });
  }

  return { success: false, errors };
}

/**
 * Parse and validate confession form with typed error messages
 * Returns the parsed data if valid, or null if invalid
 */
export function parseConfessionForm(data: unknown): {
  success: true;
  data: ConfessionFormData;
} | {
  success: false;
  errors: ValidationErrors;
} {
  const result = confessionFormSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: ValidationErrors = {};
  const zodError = result.error as z.ZodError;
  if (zodError.issues && Array.isArray(zodError.issues)) {
    zodError.issues.forEach((err) => {
      const field = err.path[0] as keyof ValidationErrors;
      if (field) {
        errors[field] = err.message;
      }
    });
  }

  return { success: false, errors };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get character count warning level
 */
export function getCharacterCountWarning(
  current: number,
  max: number
): "none" | "warning" | "error" {
  const percentage = (current / max) * 100;
  if (percentage >= 100) return "error";
  if (percentage >= 90) return "warning";
  return "none";
}

/**
 * Check if validation errors object has any errors
 */
export function hasErrors(errors: ValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * Get the first error message from validation errors
 */
export function getFirstError(errors: ValidationErrors): string | undefined {
  const keys = Object.keys(errors) as (keyof ValidationErrors)[];
  if (keys.length > 0) {
    return errors[keys[0]];
  }
  return undefined;
}
