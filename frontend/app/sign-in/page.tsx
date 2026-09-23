import type { Metadata } from 'next'
import { SignInView } from '@/components/sign-in/sign-in-view'

export const metadata: Metadata = { title: 'Sign in · Aegis' }

export default function SignInPage() {
  return <SignInView />
}
