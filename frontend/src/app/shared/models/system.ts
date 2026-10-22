export type Theme = 'dark' | 'light';

export interface CacheState {
  lastPlayhouse: string;
  lastPlayroom: string;
  lastEditor: string;
  lastTerminal: string;
  lastTheme: Theme;
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
