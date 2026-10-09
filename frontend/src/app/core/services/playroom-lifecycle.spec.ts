import { updateInputFor } from './playroom-lifecycle';
import { UpdateForm } from '../../shared/models';

function form(overrides: Partial<UpdateForm> = {}): UpdateForm {
  return {
    name: 'demo',
    playhouse: 'ph',
    image: '',
    cpuReq: '',
    cpuLim: '',
    memReq: '',
    memLim: '',
    changeReadOnly: false,
    readOnly: true,
    changePorts: false,
    clearPorts: false,
    ports: [''],
    moveToTailscale: false,
    noWait: false,
    waitTimeout: '5m',
    ...overrides,
  };
}

describe('updateInputFor', () => {
  // An empty exposure keeps the playroom's current one, so the toggle being off
  // must send nothing rather than a value.
  it('sends no exposure when the tailnet toggle is off', () => {
    expect(updateInputFor(form()).Exposure).toBe('');
  });

  // tailscale is the only target `playroom update` accepts; the others require
  // recreating the playroom, so the UI never offers them.
  it('sends tailscale when the tailnet toggle is on', () => {
    expect(updateInputFor(form({ moveToTailscale: true })).Exposure).toBe('tailscale');
  });

  it('passes none through for an unset request and limit', () => {
    const input = updateInputFor(
      form({ cpuReq: 'none', cpuLim: 'none', memReq: 'none', memLim: 'none' }),
    );
    expect(input.CPURequest).toBe('none');
    expect(input.CPULimit).toBe('none');
    expect(input.MemRequest).toBe('none');
    expect(input.MemLimit).toBe('none');
  });
});
