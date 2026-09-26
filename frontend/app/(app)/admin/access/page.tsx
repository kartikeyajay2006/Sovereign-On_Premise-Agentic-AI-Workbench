import type { Metadata } from 'next'
import { AdminAccessView } from '@/components/accounts/admin-access-view'

export const metadata: Metadata = { title: 'People · Aegis' }

export default function AdminAccessPage() {
  return <AdminAccessView />
}
