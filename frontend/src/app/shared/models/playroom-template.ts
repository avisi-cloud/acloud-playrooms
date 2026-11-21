import type { CreateForm } from './playroom';

export type PlayroomTemplateOptions = Omit<
  CreateForm,
  'name' | 'playhouse' | 'sshKey' | 'acknowledgePrivileged'
>;

export interface PlayroomTemplate {
  name: string;
  options: PlayroomTemplateOptions;
}

export interface PlayroomTemplateFile {
  version: 1;
  templates: PlayroomTemplate[];
}
