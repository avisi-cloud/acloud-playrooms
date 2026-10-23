export interface PlayhouseEntry {
  Identity: string;
  Slug: string;
  Status: string;
  Region: string;
  Version: string;
  /** Null when the playhouse carries no layout stamp or it could not be read. */
  LayoutVersion: number | null;
  /** A `LayoutStatus`; the generated binding types it as a plain string. */
  LayoutStatus: string;
}

/** How a playhouse's layout compares with the one the installed acloud ships. */
export type LayoutStatus = 'current' | 'outdated' | 'newer' | 'unknown';

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
  RegionSlugs: string[];
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
