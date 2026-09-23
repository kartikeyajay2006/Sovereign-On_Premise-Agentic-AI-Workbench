import type { Metadata } from 'next'
import { SignInView } from '@/components/sign-in/sign-in-view'

export const metadata: Metadata = { title: 'Sign in · Aegis' }

/**
 * Where this server forwards /api, read exactly as the rewrite in
 * next.config.mjs reads it, so the failure path can name the address a
 * person would go and start. The browser only ever talks to /api on this
 * origin and cannot see it for itself. It is configuration, and the page
 * presents it as the address the sign-in is forwarded to, never as a
 * reading of anything.
 */
function apiTarget(): string {
  const target = process.env.WORKBENCH_API_URL ?? 'http://127.0.0.1:8000'
  try {
    return new URL(target).host
  } catch {
    return target
  }
}

export default function SignInPage() {
  return <SignInView api={apiTarget()} />
}
