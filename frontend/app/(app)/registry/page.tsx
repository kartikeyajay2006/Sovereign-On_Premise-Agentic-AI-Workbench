import type { Metadata } from 'next'
import { RegistryView } from '@/components/registry/registry-view'

// The route kept its old name; the screen is called Knowledge everywhere a
// person reads it, so the tab title says Knowledge too.
export const metadata: Metadata = { title: 'Knowledge · Aegis' }

export default function RegistryPage() {
  return <RegistryView />
}
