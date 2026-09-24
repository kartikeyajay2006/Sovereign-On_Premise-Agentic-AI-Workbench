import { SandboxConsole } from '@/features/sandbox/ui/sandbox-console'

/**
 * The interactive containment console, at /sandbox.
 *
 * It is the security demo surface: submit a real payload, watch the sandbox on
 * this host contain it, and read only what was measured. The route is thin -
 * the feature owns its data, types and UI under frontend/features/sandbox.
 */
export default function SandboxPage() {
  return <SandboxConsole />
}
