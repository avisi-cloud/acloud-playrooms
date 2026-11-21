export type Theme = 'dark' | 'light';
export type ThemePreference = Theme | 'system';
/** Easy is one screen with name, image and size; Advanced is the full step-by-step wizard. */
export type CreatePlayroomMode = 'easy' | 'advanced';

export type PreferredAction = 'connect' | 'open' | 'nothing';

export type DockBadge = 'failed' | 'running' | 'off';

export interface CacheState {
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
