import type { Metadata } from 'next'
import { SetupView } from '@/components/accounts/setup-view'

export const metadata: Metadata = { title: 'Owner setup · Aegis' }

export default function SetupPage() {
  return <SetupView />
}
