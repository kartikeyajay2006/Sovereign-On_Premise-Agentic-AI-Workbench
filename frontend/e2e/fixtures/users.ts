import type { Session, User } from '@/lib/types'

/*
 * The seeded demo accounts, as GET /api/auth/directory lists them in demo
 * mode. Usernames, display names, roles and departments are the seed_users
 * block of policies/access-control.yaml; permissions are the role's own list
 * there with inheritance expanded.
 */

const OPERATOR = [
  'task.create',
  'task.read.own',
  'file.upload',
  'file.read.own',
  'knowledge.search',
  'deliverable.download.own',
  'audit.read.own',
]
const ENGINEER = [...OPERATOR, 'knowledge.ingest', 'task.read.department', 'deliverable.download.department', 'skill.create']
const REVIEWER = [...ENGINEER, 'approval.read', 'approval.decide', 'task.read.all', 'audit.read.all', 'deliverable.download.all']
const ADMINISTRATOR = [
  ...REVIEWER,
  'model.manage',
  'policy.read',
  'knowledge.manage',
  'system.manage',
  'skill.manage',
  'users.manage',
]

function user(
  id: string,
  username: string,
  display_name: string,
  role: string,
  department: string,
  permissions: string[],
): User {
  return {
    id,
    username,
    display_name,
    role,
    department,
    active: true,
    permissions,
    max_data_classification: role === 'operator' ? 'confidential' : 'restricted',
  }
}

export const ENGINEER_USER = user('u-engineer', 'engineer', 'Integrity Engineer', 'engineer', 'inspection', ENGINEER)
export const HEAD_OF_INSPECTION_USER = user(
  'u-head-of-inspection',
  'head_of_inspection',
  'Head of Inspection',
  'head_of_inspection',
  'inspection',
  REVIEWER,
)
export const ADMIN_USER = user('u-admin', 'admin', 'Platform Administrator', 'administrator', 'general', ADMINISTRATOR)

/** GET /api/auth/directory on a demo host. */
export const DEMO_DIRECTORY: User[] = [
  user('u-operator', 'operator', 'Plant Operator', 'operator', 'operations', OPERATOR),
  ENGINEER_USER,
  user('u-reviewer', 'reviewer', 'Approving Authority', 'reviewer', 'engineering', REVIEWER),
  HEAD_OF_INSPECTION_USER,
  user('u-plant-manager', 'plant_manager', 'Plant Manager', 'plant_manager', 'operations', REVIEWER),
  user('u-auditor', 'auditor', 'Internal Auditor', 'auditor', 'quality', ['audit.read.all']),
  ADMIN_USER,
]

/** POST /api/auth/login's answer for one account. */
export function sessionFor(account: User): Session {
  return {
    token: `e2e-token-${account.username}`,
    user: account,
    issued_at: '2026-09-24T01:00:00Z',
    expires_at: '2026-09-24T09:00:00Z',
  }
}
