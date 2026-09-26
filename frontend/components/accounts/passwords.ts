/**
 * The password rule the service enforces (backend/core/accounts.py
 * MIN_PASSWORD_LENGTH), checked here first only so a typo in the
 * confirmation is caught before a round trip. The service is still the one
 * that decides.
 */
export const MIN_PASSWORD_LENGTH = 8

export function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `The password needs at least ${MIN_PASSWORD_LENGTH} characters.`
  if (password !== confirm) return 'The two passwords do not match.'
  return null
}
