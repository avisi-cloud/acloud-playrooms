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
    storage: '',
    capabilities: '',
    changeReadOnly: false,
    readOnly: true,
    changePorts: false,
    clearPorts: false,
    ports: [''],
    changeCapAdd: false,
    clearCapAdd: false,
    capAdd: [''],
    changeWorkspaceNamespace: false,
    workspaceNamespace: true,
    acknowledgeWorkspaceNamespaceRemoval: false,
    moveToTailscale: false,
    changeNodePortSSH: false,
    nodePortSSH: true,
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

  // The backend only sends --nodeport-ssh when the change toggle is on.
  it('carries the NodePort SSH change and its value', () => {
    expect(updateInputFor(form()).ChangeNodePortSSH).toBe(false);
    const input = updateInputFor(form({ changeNodePortSSH: true, nodePortSSH: false }));
    expect(input.ChangeNodePortSSH).toBe(true);
    expect(input.NodePortSSH).toBe(false);
  });

  it('passes none through for an unset request and limit', () => {
    const input = updateInputFor(
      form({ cpuReq: 'none', cpuLim: 'none', memReq: 'none', memLim: 'none' }),
    );
    expect(input.CPURequest).toBe('none');
    expect(input.CPULimit).toBe('none');
    expect(input.MemoryRequest).toBe('none');
    expect(input.MemoryLimit).toBe('none');
  });

  it('passes the new storage size and capability profile through', () => {
    const input = updateInputFor(form({ storage: '40Gi', capabilities: 'standard' }));
    expect(input.Storage).toBe('40Gi');
    expect(input.Capabilities).toBe('standard');
  });

  it('sends the added capabilities without blank rows', () => {
    const input = updateInputFor(form({ changeCapAdd: true, capAdd: ['NET_ADMIN', ''] }));
    expect(input.ChangeCapAdd).toBe(true);
    expect(input.CapAdd).toEqual(['NET_ADMIN']);
  });

  // An empty list is what the backend turns into `--cap-add none`.
  it('sends an empty list when every added capability is removed', () => {
    const input = updateInputFor(
      form({ changeCapAdd: true, clearCapAdd: true, capAdd: ['NET_ADMIN'] }),
    );
    expect(input.CapAdd).toEqual([]);
  });

  it('passes the namespace toggle and whether it was touched', () => {
    const input = updateInputFor(
      form({ changeWorkspaceNamespace: true, workspaceNamespace: false }),
    );
    expect(input.ChangeWorkspaceNamespace).toBe(true);
    expect(input.WorkspaceNamespace).toBe(false);
  });
});
