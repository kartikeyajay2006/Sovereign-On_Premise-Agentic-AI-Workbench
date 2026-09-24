import type { Metadata } from 'next'
import { SkillsView } from '@/features/skills/ui/skills-view'

export const metadata: Metadata = { title: 'Skills · Aegis' }

export default function SkillsPage() {
  return <SkillsView />
}
