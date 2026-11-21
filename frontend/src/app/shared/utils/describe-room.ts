import { Playroom } from '../models';
import { hasTailnetHost, statusLabel } from './playroom-display';
import { renderPortForwards } from './playroom-mappers';

export interface RoomVersions {
  app: string;
  acloud: string;
}

export function describeRoomAsText(room: Playroom, versions: RoomVersions): string {
  const reported = (value: string) => value || 'Not reported';
  return [
    `Name: ${reported(room.name)}`,
    `Playhouse: ${reported(room.playhouse)}`,
    `Image: ${reported(room.image)}`,
    `Size: CPU reserved ${reported(room.cpuReq)}, limit ${reported(room.cpuLim)}; memory reserved ${reported(room.memReq)}, limit ${reported(room.memLim)}`,
    `Storage: ${reported(room.disk)} (${reported(room.diskType)})`,
    `Exposure: ${hasTailnetHost(room) ? 'tailscale' : 'Not reported'}`,
    `Ports: ${room.portForwards === undefined ? reported(room.ports) : renderPortForwards(room.portForwards) || 'None'}`,
    `Status: ${statusLabel(room)}`,
    `App version: ${reported(versions.app)}`,
    `Acloud version: ${reported(versions.acloud)}`,
  ].join('\n');
}
