import { redirect } from 'next/navigation'

/**
 * An alias, as the console's docstring already claimed this was.
 *
 * It listed past runs on a screen nothing linked to. The thread's own rail
 * now does that beside the answers, which is where you want it: picking a
 * past run should not mean leaving the room.
 */
export default function TasksPage() {
  redirect('/console')
}
