import { blankCreateForm } from './forms';
import {
  createFormFromTemplate,
  decodePlayroomTemplates,
  templateFromCreateForm,
} from './playroom-template';

describe('Playroom templates', () => {
  it('keeps only environment keys and excludes identity, SSH keys and acknowledgement', () => {
    const form = {
      ...blankCreateForm('demo-house'),
      name: 'source',
      sshKey: '/private/key',
      env: ['TOKEN=secret', ' TOKEN ', 'EMPTY=', ''],
      acknowledgePrivileged: true,
    };
    const template = templateFromCreateForm(' Web ', form);
    expect(template.name).toBe('Web');
    expect(template.options.env).toEqual(['TOKEN', 'EMPTY']);
    const json = JSON.stringify(template);
    for (const value of ['secret', '/private/key', 'source', 'demo-house', 'acknowledgePrivileged'])
      expect(json).not.toContain(value);
    expect(form.env[0]).toBe('TOKEN=secret');
  });

  it('round trips all options and applies without carrying identity or acknowledging privileged mode', () => {
    const source = {
      ...blankCreateForm('old'),
      image: 'base',
      storage: '40Gi',
      cpuReq: '2',
      cpuLim: '4',
      memReq: '4Gi',
      memLim: '8Gi',
      env: ['TOKEN'],
      git: ['https://github.com/example/web.git'],
      copy: ['/tmp/demo'],
      ports: ['8080:80'],
      privileged: true,
      acknowledgePrivileged: true,
    };
    const template = templateFromCreateForm('Web', source);
    const parsed = decodePlayroomTemplates(JSON.stringify({ version: 1, templates: [template] }));
    expect(parsed).toEqual([template]);
    const target = { ...blankCreateForm('current'), name: 'new-room', sshKey: '/current/key' };
    const applied = createFormFromTemplate(parsed[0], target);
    expect(applied).toEqual({
      ...target,
      ...template.options,
      capAdd: [''],
      acknowledgePrivileged: false,
    });
    applied.env.push('OTHER');
    expect(template.options.env).toEqual(['TOKEN']);
  });

  it('refuses unknown fields, versions, values, duplicate names and incomplete options', () => {
    const template = templateFromCreateForm('Web', blankCreateForm(''));
    const file = { version: 1, templates: [template] };
    for (const invalid of [
      { ...file, version: 2 },
      { ...file, unknown: true },
      { ...file, templates: [{ ...template, unknown: true }] },
      { ...file, templates: [{ ...template, constructor: 'unknown' }] },
      {
        ...file,
        templates: [{ ...template, options: { ...template.options, env: ['TOKEN=secret'] } }],
      },
      {
        ...file,
        templates: [{ ...template, options: { ...template.options, exposure: 'public' } }],
      },
      {
        ...file,
        templates: [{ ...template, options: { ...template.options, privileged: 'yes' } }],
      },
      { ...file, templates: [template, template] },
      { ...file, templates: [{ name: 'Web', options: {} }] },
    ])
      expect(() => decodePlayroomTemplates(JSON.stringify(invalid))).toThrow();
  });
});
