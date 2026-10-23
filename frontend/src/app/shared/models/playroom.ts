import { CAPABILITIES, EXPOSURES } from '../data/images';
import { STATUS } from '../data/status';

export type StatusKey = keyof typeof STATUS;
/** An `--exposure` value; blank leaves the flag off. */
export type Exposure = (typeof EXPOSURES)[number]['id'];
/** A `--capabilities` profile; blank leaves the flag off. */
export type Capabilities = (typeof CAPABILITIES)[number]['id'] | '';
export type ConnectTab = 'connect' | 'open';

/**
 * Mirrors the Go ImageEntry. Name is the alias sent as `--image`; Reference is
 * the full registry path it expands to.
 */
export interface ImageEntry {
  Name: string;
  Reference: string;
  Description: string;
  IsDefault: boolean;
  RequiresPrivileged: boolean;
}

export interface Playroom {
  name: string;
  owner: string;
  status: StatusKey;
  rawStatus: string;
  ageMin: number;
  disk: string;
  diskType: string;
  host: string;
  image: string;
  cpuReq: string;
  cpuLim: string;
  memReq: string;
  memLim: string;
  ports: string;
  system: string;
  capabilityProfile: string;
  capabilityAdditions: string[];
  /** Rendered by an older acloud; `playroom update` rolls out the new template. */
  outdated: boolean;
  playhouse: string;
  ephemeral: boolean;
  env: string[];
  git: string[];
  copy: string[];
}

export interface CreateForm {
  name: string;
  playhouse: string;
  image: string;
  storage: string;
  cpuReq: string;
  cpuLim: string;
  memReq: string;
  memLim: string;
  sshKey: string;
  env: string[];
  git: string[];
  copy: string[];
  ports: string[];
  proxyGroup: string;
  exposure: Exposure;
  capabilities: Capabilities;
  /** `--cap-add`: Linux capabilities on top of the profile. */
  capAdd: string[];
  ephemeral: boolean;
  readOnly: boolean;
  /** `--privileged`: all Linux capabilities and host device access. */
  privileged: boolean;
  /** `--workspace-namespace`: a namespace of its own, with a kubeconfig. */
  workspaceNamespace: boolean;
  /**
   * Not a flag — the acknowledgement the GUI requires before it will send
   * `--privileged`. It never reaches the command line.
   */
  acknowledgePrivileged: boolean;
  noWait: boolean;
  waitTimeout: string;
  forceInstall: boolean;
}

/** The CPU and memory a playroom asks for; a size sets all four at once. */
export type PlayroomResources = Pick<CreateForm, 'cpuReq' | 'cpuLim' | 'memReq' | 'memLim'>;
export type PlayroomSizePreset = 'small' | 'medium' | 'large';
/** Your defaults, a preset, or custom when the four values match neither. */
export type PlayroomSize = 'defaults' | PlayroomSizePreset | 'custom';

export interface UpdateForm {
  name: string;
  playhouse: string;
  image: string;
  cpuReq: string;
  cpuLim: string;
  memReq: string;
  memLim: string;
  /** Grows the volume; blank keeps the current size. */
  storage: string;
  /** Blank keeps the current profile. */
  capabilities: Capabilities;
  changeReadOnly: boolean;
  readOnly: boolean;
  changePorts: boolean;
  clearPorts: boolean;
  ports: string[];
  changeCapAdd: boolean;
  clearCapAdd: boolean;
  capAdd: string[];
  changeWorkspaceNamespace: boolean;
  workspaceNamespace: boolean;
  /** Not a flag: the acknowledgement needed before `--workspace-namespace=false`. */
  acknowledgeWorkspaceNamespaceRemoval: boolean;
  /** Moves a nodeport or portforward room onto the tailnet; see the drawer. */
  moveToTailscale: boolean;
  noWait: boolean;
  waitTimeout: string;
}

export interface ListingDto {
  Name?: string;
  Owner?: string;
  Status?: string;
  Image?: string;
  SSHHost?: string;
  CreatedAt?: string | Date | null;
  CPURequest?: string;
  CPULimit?: string;
  MemRequest?: string;
  MemLimit?: string;
  DiskSize?: string;
  DiskType?: string;
  System?: string;
  CapabilityProfile?: string;
  CapabilityAdditions?: string[] | null;
  Outdated?: boolean;
  Ports?: PortForwardDto[] | null;
}

export interface PortForwardDto {
  Port: number;
  TargetPort: number;
}
