export interface PlayhouseEntry {
  Identity: string;
  Slug: string;
  Status: string;
  Region: string;
  Version: string;
}

export interface Playhouse {
  slug: string;
  ha: boolean;
  region: string;
}

/**
 * Mirrors the Go CloudAccountEntry. Identity is the value sent as
 * CreatePlayhouseInput.CloudAccount; the rest is for display.
 */
export interface CloudAccountEntry {
  Identity: string;
  DisplayName: string;
  Provider: string;
  Regions: string;
}

/**
 * Mirrors the Go EnvironmentEntry. Slug is the value sent as
 * CreatePlayhouseInput.Environment; the rest is for display.
 */
export interface EnvironmentEntry {
  Slug: string;
  Name: string;
  Description: string;
}
