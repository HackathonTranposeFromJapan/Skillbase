import type { HexclaveConfig } from "@hexclave/js";

export const config: HexclaveConfig = {
  "apps": {
    "installed": {
      "authentication": {
        "enabled": true
      },
      "teams": {
        "enabled": true
      },
      "rbac": {
        "enabled": true
      },
      "api-keys": {
        "enabled": true
      }
    }
  }
};
