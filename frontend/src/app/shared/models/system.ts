export type Theme = 'dark' | 'light';
export type ThemePreference = Theme | 'system';
/** Easy is one screen with name, image and size; Advanced is the full step-by-step wizard. */
export type CreatePlayroomMode = 'easy' | 'advanced';

export type PlayroomView = 'grid' | 'list';

export type PreferredAction = 'connect' | 'open' | 'nothing';

export type DockBadge = 'failed' | 'running' | 'off';

export interface CacheState {
  playroomView: PlayroomView;
  groupByOwner: boolean;
  notifications: boolean;
  dockBadge: DockBadge;
  keepRunningInMenuBar: boolean;
  preferredAction: PreferredAction;
  pinnedRooms: Record<string, string[]>;
  lastPlayhouse: string;
  lastPlayroom: string;
  lastEditor: string;
  lastTerminal: string;
  lastTheme: ThemePreference;
  backgroundGrain: boolean;
  ameRobot: boolean;
  readVariablesFromLoginShell: boolean;
  createPlayroomMode: CreatePlayroomMode;
  /** Newest first, URLs only: offered as suggestions in the create drawer's git repositories. */
  recentGitRepositories: string[];
  /** Set once setup is finished; leaving it with "Set up later" does not set it. */
  setupCompleted: boolean;
}

export interface ToolStatus {
  Name: string;
  Command: string;
  State: string;
  Path: string;
  Message: string;
}

export interface ToastMessage {
  id: string;
  message: string;
  tone: 'ok' | 'busy' | 'warn' | 'bad' | 'idle';
}

/** A `local.HealthStatus`; the generated binding types it as a plain string. */
export type HealthStatus = 'passed' | 'warning' | 'failed' | 'unknown' | 'skipped';

/** A `local.HealthAction`: a fix the health check screen starts itself, or blank for none. */
export type HealthAction = '' | 'open-settings' | 'sign-in';

/** Whether the selected playhouse uses Tailscale, read from its rooms' reported hosts. */
export type TailscaleUse = 'used' | 'not-used' | 'not-reported';
