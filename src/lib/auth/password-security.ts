export const MIN_PASSWORD_LENGTH = 12;

export interface PasswordRequirement {
  key: "length" | "uppercase" | "lowercase" | "number" | "symbol";
  label: string;
  met: boolean;
}

export function passwordRequirements(password: string): PasswordRequirement[] {
  return [
    {
      key: "length",
      label: `At least ${MIN_PASSWORD_LENGTH} characters`,
      met: password.length >= MIN_PASSWORD_LENGTH,
    },
    { key: "uppercase", label: "One uppercase letter", met: /[A-Z]/.test(password) },
    { key: "lowercase", label: "One lowercase letter", met: /[a-z]/.test(password) },
    { key: "number", label: "One number", met: /\d/.test(password) },
    {
      key: "symbol",
      label: "One special character",
      met: /[^A-Za-z0-9]/.test(password),
    },
  ];
}

export function isStrongPassword(password: string): boolean {
  return passwordRequirements(password).every((requirement) => requirement.met);
}
