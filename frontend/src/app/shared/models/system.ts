export type Theme = 'dark' | 'light';
/** Easy is one screen with name, image and size; Advanced is the full step-by-step wizard. */
export type CreatePlayroomMode = 'easy' | 'advanced';

export interface CacheState {
  lastPlayhouse: string;
  lastPlayroom: string;
  lastEditor: string;
  lastTerminal: string;
  lastTheme: Theme;
  createPlayroomMode: CreatePlayroomMode;
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
