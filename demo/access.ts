import type { Person, Skill } from './types'

/** Roles that count as management for `managers`-scoped skills. */
const managerTitles = /(lead|manager|head|director|counsel|staff)/i

export function accessLabel(skill: Skill): string {
  switch (skill.access.scope) {
    case 'company':
      return 'Company-wide'
    case 'department':
      return `${skill.access.department} only`
    case 'managers':
      return 'Managers only'
    case 'board':
      return 'Board only'
  }
}

export function sourceLabel(skill: Skill): string {
  return skill.source.kind === 'public' ? 'Public' : 'Internal'
}

export function sourceDetail(skill: Skill): string {
  return skill.source.kind === 'public'
    ? `Adopted from ${skill.source.origin}`
    : `Built in-house by ${skill.source.team}`
}

/** Governance gate: can this person install and run the skill? */
export function hasAccess(skill: Skill, person: Person | undefined): boolean {
  if (!person) return false
  switch (skill.access.scope) {
    case 'company':
      return true
    case 'department':
      return person.department === skill.access.department
    case 'managers':
      return managerTitles.test(person.role)
    case 'board':
      return false
  }
}

export function accessReason(skill: Skill): string {
  switch (skill.access.scope) {
    case 'company':
      return 'Available to everyone'
    case 'department':
      return `Restricted to ${skill.access.department}. Request access from the owner.`
    case 'managers':
      return 'Restricted to managers and leads. Request access from the owner.'
    case 'board':
      return 'Board-level skill. Access is granted by an admin only.'
  }
}
