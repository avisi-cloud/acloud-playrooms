export type Theme = 'dark' | 'light';
export type ThemePreference = Theme | 'system';
/** Easy is one screen with name, image and size; Advanced is the full step-by-step wizard. */
export type CreatePlayroomMode = 'easy' | 'advanced';

export interface CacheState {
  lastPlayhouse: string;
  lastPlayroom: string;
  lastEditor: string;
  lastTerminal: string;
  lastTheme: ThemePreference;
  backgroundGrain: boolean;
  ameRobot: boolean;
  createPlayroomMode: CreatePlayroomMode;
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
