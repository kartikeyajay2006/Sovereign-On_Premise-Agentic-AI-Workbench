import { ThreadView } from '@/features/thread/ui/thread-view'

/**
 * The authenticated thread, at /console.
 *
 * It used to serve `/`. `/` is now the public landing page: a judge types the
 * host and port, lands on `/`, and that has to be the front door. Sign-in and
 * the old `/workspace`, `/ask`, `/tasks` and `/history` aliases all point here.
 */
export default function ConsolePage() {
  return <ThreadView />
}
