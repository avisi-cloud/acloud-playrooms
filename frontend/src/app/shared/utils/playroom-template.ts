import type { CreateForm } from '../models';
import type { PlayroomTemplate, PlayroomTemplateFile } from '../models/playroom-template';
import { blankCreateForm } from './forms';

export function templateFromCreateForm(name: string, form: CreateForm): PlayroomTemplate {
  const {
    name: roomName,
    playhouse,
    sshKey,
    acknowledgePrivileged,
    ...options
  } = structuredClone(form);
  void roomName;
  void playhouse;
  void sshKey;
  void acknowledgePrivileged;
  options.env = [
    ...new Set(options.env.map((entry) => entry.split('=')[0].trim()).filter(Boolean)),
  ];
  for (const key of ['git', 'copy', 'ports', 'capAdd'] as const)
    options[key] = options[key].map((entry) => entry.trim()).filter(Boolean);
  return { name: name.trim(), options };
}

export function createFormFromTemplate(template: PlayroomTemplate, form: CreateForm): CreateForm {
  const applied = { ...form, ...structuredClone(template.options), acknowledgePrivileged: false };
  for (const key of ['env', 'git', 'copy', 'ports', 'capAdd'] as const)
    if (!applied[key].length) applied[key] = [''];
  return applied;
}

export function validatePlayroomTemplates(templates: PlayroomTemplate[]): void {
  const names = new Set<string>();
  for (const template of templates) {
    if (!template.name?.trim() || template.name !== template.name.trim())
      throw new Error('Template name must not be blank or have surrounding spaces.');
    if (names.has(template.name))
      throw new Error(`Template "${template.name}" already exists; rename it before importing.`);
    names.add(template.name);
    if (template.options.env.some((key) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)))
      throw new Error('Environment entries must be keys, never values.');
    if (!['', 'tailscale', 'nodeport', 'portforward'].includes(template.options.exposure))
      throw new Error('Unknown template exposure.');
    if (!['', 'minimal', 'standard'].includes(template.options.capabilities))
      throw new Error('Unknown template capabilities.');
    if (template.options.exposure === 'nodeport' && template.options.nodePortSSH)
      throw new Error('NodePort SSH cannot be combined with NodePort exposure.');
  }
}

export function decodePlayroomTemplates(content: string): PlayroomTemplate[] {
  const file: unknown = JSON.parse(content);
  const options = templateFromCreateForm('Validation', blankCreateForm('')).options;
  function validateObject(value: unknown, expected: object, location: string): void {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error(`Invalid ${location}.`);
    const object = value as Record<string, unknown>;
    for (const key of Object.keys(object))
      if (!Object.hasOwn(expected, key)) throw new Error(`Unknown field ${location}.${key}.`);
    for (const [key, sample] of Object.entries(expected)) {
      const entry = object[key];
      if (Array.isArray(sample)) {
        if (!Array.isArray(entry) || entry.some((item) => typeof item !== 'string'))
          throw new Error(`Invalid ${location}.${key}.`);
      } else if (typeof entry !== typeof sample) throw new Error(`Invalid ${location}.${key}.`);
    }
  }
  if (!file || typeof file !== 'object' || Array.isArray(file))
    throw new Error('Invalid template file.');
  const parsed = file as PlayroomTemplateFile;
  if (Object.keys(parsed).some((key) => !['version', 'templates'].includes(key)))
    throw new Error('Unknown template file field.');
  if (parsed.version !== 1) throw new Error('Unsupported template version; expected version 1.');
  if (!Array.isArray(parsed.templates))
    throw new Error('Template file must contain a templates array.');
  for (const template of parsed.templates) {
    validateObject(template, { name: '', options: {} }, 'template');
    validateObject(template.options, options, 'options');
  }
  validatePlayroomTemplates(parsed.templates);
  return parsed.templates;
}
