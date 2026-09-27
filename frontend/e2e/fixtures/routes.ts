import type { RouteTable } from '../support/api'
import { sse } from '../support/api'
import { ADMIN_USER, DEMO_DIRECTORY } from './users'
import { ALL_TASKS, summaryOf } from './tasks'
import {
  ACCESS_REQUESTS,
  ACCOUNTS,
  AUDIT_CHAIN,
  AUDIT_RECORDS,
  DIRECTORY_STATUS,
  HARNESS_CATALOG,
  HARNESS_RUNS,
  HEALTH,
  INVITES,
  MODELS,
  POLICY_CHOICES,
  PUBLIC_STATUS,
  SKILLS,
  SOVEREIGNTY,
} from './screens'

/**
 * What every test starts from: signed in as the platform administrator, who
 * may open every screen, on a demo host with the fixtures' runs recorded.
 * A test replaces entries with api.set().
 */
export function defaultRoutes(): RouteTable {
  const table: RouteTable = {
    'GET /api/status': PUBLIC_STATUS,
    'GET /api/setup/status': { needs_setup: false },
    'GET /api/auth/session': { authenticated: true, user: ADMIN_USER },
    'GET /api/auth/directory': DEMO_DIRECTORY,
    'POST /api/auth/logout': { ok: true },
    'GET /api/sovereignty': SOVEREIGNTY,
    'GET /api/health': HEALTH,
    'GET /api/models': MODELS,
    'GET /api/skills': SKILLS,
    'GET /api/harnesses': HARNESS_CATALOG,
    'GET /api/harness-runs': HARNESS_RUNS,
    'GET /api/tasks': ALL_TASKS.map(summaryOf),
    'GET /api/approvals': ALL_TASKS.filter((t) => t.status === 'awaiting_approval'),
    'GET /api/events': sse(),
    'GET /api/audit/chain': AUDIT_CHAIN,
    'GET /api/audit': AUDIT_RECORDS,
    'GET /api/admin/access-requests': ACCESS_REQUESTS,
    'GET /api/admin/invites': INVITES,
    'GET /api/admin/users': ACCOUNTS,
    'GET /api/admin/directory': DIRECTORY_STATUS,
    'GET /api/policies': POLICY_CHOICES,
  }
  for (const task of ALL_TASKS) table[`GET /api/tasks/${task.id}`] = task
  return table
}
