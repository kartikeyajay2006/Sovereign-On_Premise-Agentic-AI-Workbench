/**
 * What runs on the host, as a slow strip of names.
 *
 * These are the components this workbench actually runs on -- the local
 * models installed on the demo host (GET /api/models lists them; a model
 * registered but not installed is left off), the service, the store and the
 * sandbox's containment -- not customers and not integrations. The strip is
 * two identical sets translated by half its width, so it loops without a
 * seam; it pauses under the pointer and stands still under reduced motion.
 */
const STACK: Array<{ name: string; role: string }> = [
  { name: 'Ollama', role: 'local inference' },
  { name: 'Qwen2.5 3B', role: 'default model' },
  { name: 'Qwen3 8B', role: 'reasoning' },
  { name: 'nomic-embed-text', role: 'retrieval' },
  { name: 'FastAPI', role: 'service' },
  { name: 'SQLite', role: 'store' },
  { name: 'Job Objects', role: 'sandbox limits' },
  { name: 'SHA-256 chain', role: 'audit' },
]

export function StackStrip({ label }: { label: string }) {
  const set = (hidden: boolean) => (
    <ul className="ae-strip-set m-0 list-none pl-0" aria-hidden={hidden || undefined}>
      {STACK.map((item) => (
        <li key={item.name} className="ae-strip-item">
          {item.name}
          <small>{item.role}</small>
        </li>
      ))}
    </ul>
  )
  return (
    <div className="flex flex-col items-center gap-5">
      <p className="ae-kicker m-0">{label}</p>
      <div className="ae-strip w-full">
        <div className="ae-strip-track">
          {set(false)}
          {set(true)}
        </div>
      </div>
    </div>
  )
}
