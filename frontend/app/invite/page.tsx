import type { Metadata } from 'next'
import { InviteView } from '@/components/accounts/invite-view'

export const metadata: Metadata = { title: 'Accept an invitation · Aegis' }

export default function InvitePage() {
  return <InviteView />
}
