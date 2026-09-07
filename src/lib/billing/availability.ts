/**
 * Billing is deliberately opt-in while ForexTestLab is in pre-launch.
 * Set BILLING_ENABLED=true only when checkout has been approved for release.
 */
export function billingEnabled(): boolean {
  return process.env.BILLING_ENABLED === "true";
}
