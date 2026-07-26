import type { HexclaveConfig } from "@hexclave/js";

/**
 * Hexclave project configuration.
 *
 * The RBAC permissions below back `skill.visibility`, which the schema has
 * carried since the first migration but nothing enforced. The README promises
 * company-wide, department-only and manager-approved skills; these grants are
 * what make that real rather than decorative.
 *
 * Nesting mirrors the trust order: a manager sees everything an employee can,
 * plus approved-only skills; an admin also sees experimental work.
 */
export const config: HexclaveConfig = {
  apps: {
    installed: {
      authentication: { enabled: true },
      teams: { enabled: true },
      rbac: { enabled: true },
      "api-keys": { enabled: true },
    },
  },
  rbac: {
    permissions: {
      skills_read: {
        description: "See company-wide and department skills",
        scope: "team",
      },
      skills_manager: {
        description: "See manager-approved skills",
        scope: "team",
        containedPermissionIds: {
          skills_read: true,
        },
      },
      skills_admin: {
        description: "See experimental skills and publish official ones",
        scope: "team",
        containedPermissionIds: {
          skills_manager: true,
        },
      },
    },
    defaultPermissions: {
      // Everyone who joins sees the ordinary catalogue; the restricted tiers are
      // granted deliberately, which is the entire point of having them.
      teamMember: {
        skills_read: true,
      },
      teamCreator: {
        skills_admin: true,
      },
    },
  },
};
