import { redirect } from 'next/navigation'

/**
 * An alias, as the console's docstring already claimed this was.
 *
 * It rendered a second, unreachable question surface -- 624 lines
 * duplicating the thread, absent from the navigation, reachable only by
 * typing the path. Two places to ask the same question is two places to fix
 * a bug in. The path still resolves so any bookmark survives.
 */
export default function AskPage() {
  redirect('/console')
}
