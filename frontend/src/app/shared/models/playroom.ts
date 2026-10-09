import { STATUS } from '../data/status';

export type StatusKey = keyof typeof STATUS;
export type ConnectTab = 'connect' | 'open';

/**
 * Mirrors the Go ImageEntry. Name is the alias sent as `--image`; Reference is
 * the full registry path it expands to.
 */
export interface ImageEntry {
  Name: string;
  Reference: string;
  IsDefault: boolean;
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
  /** `--exposure`: how the room is reachable. Blank means the CLI's default. */
  exposure: string;
  ephemeral: boolean;
  readOnly: boolean;
  /** `--privileged`: all Linux capabilities and host device access. */
  privileged: boolean;
  /**
   * Not a flag — the acknowledgement the GUI requires before it will send
   * `--privileged`. It never reaches the command line.
   */
  acknowledgePrivileged: boolean;
  noWait: boolean;
  waitTimeout: string;
  forceInstall: boolean;
}

export interface UpdateForm {
  name: string;
  playhouse: string;
  image: string;
  cpuReq: string;
  cpuLim: string;
  memReq: string;
  memLim: string;
  changeReadOnly: boolean;
  readOnly: boolean;
  changePorts: boolean;
  clearPorts: boolean;
  ports: string[];
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
  Ports?: string;
}
