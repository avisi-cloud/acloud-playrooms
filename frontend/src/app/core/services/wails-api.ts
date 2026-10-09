import type { ListingDto } from '../../shared/models';

// Generated models keep frontend inputs aligned with the Go service.
import * as app from '../../../../bindings/github.com/avisi-cloud/acloud-playrooms/app.js';
import * as playhouseModels from '../../../../bindings/github.com/avisi-cloud/acloud-playrooms/backend/playhouse/models.js';
import * as playroomModels from '../../../../bindings/github.com/avisi-cloud/acloud-playrooms/backend/playroom/models.js';
import * as localModels from '../../../../bindings/github.com/avisi-cloud/acloud-playrooms/backend/local/models.js';
import * as configModels from '../../../../bindings/github.com/avisi-cloud/acloud-playrooms/backend/config/models.js';
import * as cliModels from '../../../../bindings/github.com/avisi-cloud/acloud-playrooms/backend/cli/models.js';

export type PlayroomCreateInput = playroomModels.CreateInput;
export type PlayroomUpdateInput = playroomModels.UpdateInput;
export type PlayroomDeleteInput = playroomModels.DeleteInput;
export type PlayroomStartInput = playroomModels.StartInput;
export type PlayroomStopInput = playroomModels.StopInput;
export type PlayroomOpenInput = playroomModels.OpenInput;
export type PlayroomConnectInput = playroomModels.ConnectInput;
export type PlayroomListInput = playroomModels.ListInput;
export type PlayroomDefaultEntry = playroomModels.DefaultEntry;
export type PlayhouseCreateInput = playhouseModels.CreateInput;
export type PlayhouseDeleteInput = playhouseModels.DeleteInput;
export type PlayhouseUpdateInput = playhouseModels.UpdateInput;
export type PlayhouseEntry = playhouseModels.PlayhouseEntry;
export type CloudAccountEntry = playhouseModels.CloudAccountEntry;
export type EnvironmentEntry = playhouseModels.EnvironmentEntry;
export type OrganisationEntry = configModels.OrganisationEntry;
export type ContextEntry = configModels.ContextEntry;
export type ImageEntry = localModels.ImageEntry;
export type ToolStatus = localModels.ToolStatus;
export type AcloudCompatibility = localModels.AcloudCompatibility;
export type AcloudBinaryStatus = cliModels.BinaryStatus;

/** Identifies a command for output streaming and cancellation. */
export function newOperationId(): string {
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const playroomInput = playroomModels;
const playhouseInput = playhouseModels;

export const wailsApi = {
  // Session
  getAcloudVersion: (): Promise<string> => app.GetAcloudVersion(),
  isLoggedIn: (): Promise<boolean> => app.IsLoggedIn(),
  getCachedPlayhouse: (): Promise<string> => app.GetCachedPlayhouse(),
  getCurrentUserEmail: (): Promise<string> => app.GetCurrentUserEmail(),
  getToolStatuses: (): Promise<ToolStatus[]> => app.GetToolStatuses(),
  /** Whether the running acloud is newer than the one this GUI was verified against. */
  getAcloudCompatibility: (): Promise<AcloudCompatibility> => app.GetAcloudCompatibility(),

  // The acloud binary itself. Nothing else works until this resolves, so these
  // stay callable when every other read is failing.
  /** Which acloud the app will run, where it came from, and what to fix. */
  getAcloudBinaryStatus: (): Promise<AcloudBinaryStatus> => app.GetAcloudBinaryStatus(),
  /** Remembers a path for later launches; rejects one that does not run. */
  setAcloudBinary: (path: string): Promise<AcloudBinaryStatus> => app.SetAcloudBinary(path),
  /** Forgets the saved path and searches again. */
  clearAcloudBinary: (): Promise<AcloudBinaryStatus> => app.ClearAcloudBinary(),
  /** Native file picker; resolves to '' when cancelled. */
  browseForAcloudBinary: (): Promise<string> => app.BrowseForAcloudBinary(),

  // Window
  getOperatingSystem: (): Promise<string> => app.GetOperatingSystem(),
  setWindowTheme: (theme: string): Promise<void> => app.SetWindowTheme(theme),

  // Auth
  /** Opens a terminal running the interactive login; poll isLoggedIn after. */
  loginWithTerminal: (terminal: string): Promise<void> => app.LoginWithTerminal(terminal),
  logout: (operationID: string): Promise<void> => app.Logout(operationID),

  // Operations
  cancelOperation: (operationID: string): Promise<boolean> => app.CancelOperation(operationID),

  // Scope switches update the shared CLI configuration.
  listOrganisations: (): Promise<OrganisationEntry[]> => app.ListOrganisations(),
  getCurrentOrganisation: (): Promise<string> => app.GetCurrentOrganisation(),
  switchOrganisation: (operationID: string, slug: string): Promise<void> =>
    app.SwitchOrganisation(operationID, slug),
  listContexts: (): Promise<ContextEntry[]> => app.ListContexts(),
  getCurrentContext: (): Promise<string> => app.GetCurrentContext(),
  switchContext: (operationID: string, name: string): Promise<void> =>
    app.SwitchContext(operationID, name),

  // Images
  listPlayroomImages: (): Promise<ImageEntry[]> => app.ListPlayroomImages(),

  // Playhouse
  listPlayhouses: (): Promise<PlayhouseEntry[]> => app.ListPlayhouses(),
  listCloudAccounts: (): Promise<CloudAccountEntry[]> => app.ListCloudAccounts(),
  listEnvironments: (): Promise<EnvironmentEntry[]> => app.ListEnvironments(),
  createPlayhouse: (operationID: string, input: Partial<PlayhouseCreateInput>): Promise<void> =>
    app.CreatePlayhouse(operationID, new playhouseInput.CreateInput(input)),
  deletePlayhouse: (operationID: string, input: Partial<PlayhouseDeleteInput>): Promise<void> =>
    app.DeletePlayhouse(operationID, new playhouseInput.DeleteInput(input)),
  /** Converges an existing playhouse; `playhouse create` is the update command. */
  updatePlayhouse: (operationID: string, input: Partial<PlayhouseUpdateInput>): Promise<void> =>
    app.UpdatePlayhouse(operationID, new playhouseInput.UpdateInput(input)),

  // Playroom
  listPlayrooms: (input: Partial<PlayroomListInput>): Promise<ListingDto[]> =>
    app.ListPlayrooms(new playroomInput.ListInput(input)),
  createPlayroom: (operationID: string, input: Partial<PlayroomCreateInput>): Promise<void> =>
    app.CreatePlayroom(operationID, new playroomInput.CreateInput(input)),
  updatePlayroom: (operationID: string, input: Partial<PlayroomUpdateInput>): Promise<void> =>
    app.UpdatePlayroom(operationID, new playroomInput.UpdateInput(input)),
  deletePlayroom: (operationID: string, input: Partial<PlayroomDeleteInput>): Promise<void> =>
    app.DeletePlayroom(operationID, new playroomInput.DeleteInput(input)),
  startPlayroom: (operationID: string, input: Partial<PlayroomStartInput>): Promise<void> =>
    app.StartPlayroom(operationID, new playroomInput.StartInput(input)),
  stopPlayroom: (operationID: string, input: Partial<PlayroomStopInput>): Promise<void> =>
    app.StopPlayroom(operationID, new playroomInput.StopInput(input)),
  openPlayroomInEditor: (operationID: string, input: Partial<PlayroomOpenInput>): Promise<void> =>
    app.OpenPlayroomInEditor(operationID, new playroomInput.OpenInput(input)),
  /** Hands the SSH session to the user's terminal; needs a real TTY. */
  connectPlayroom: (input: Partial<PlayroomConnectInput>): Promise<void> =>
    app.ConnectPlayroom(new playroomInput.ConnectInput(input)),

  // Playroom defaults
  getPlayroomDefaults: (): Promise<PlayroomDefaultEntry[]> => app.GetPlayroomDefaults(),
  setPlayroomDefault: (operationID: string, key: string, value: string): Promise<void> =>
    app.SetPlayroomDefault(operationID, key, value),
  unsetPlayroomDefault: (operationID: string, key: string): Promise<void> =>
    app.UnsetPlayroomDefault(operationID, key),
  unsetAllPlayroomDefaults: (operationID: string): Promise<void> =>
    app.UnsetAllPlayroomDefaults(operationID),

  // Previews use the same arguments as command execution.
  previewCreatePlayroom: (input: Partial<PlayroomCreateInput>): Promise<string[]> =>
    app.PreviewCreatePlayroom(new playroomInput.CreateInput(input)),
  previewUpdatePlayroom: (input: Partial<PlayroomUpdateInput>): Promise<string[]> =>
    app.PreviewUpdatePlayroom(new playroomInput.UpdateInput(input)),
  previewDeletePlayroom: (input: Partial<PlayroomDeleteInput>): Promise<string[]> =>
    app.PreviewDeletePlayroom(new playroomInput.DeleteInput(input)),
  previewOpenPlayroomInEditor: (input: Partial<PlayroomOpenInput>): Promise<string[]> =>
    app.PreviewOpenPlayroomInEditor(new playroomInput.OpenInput(input)),
  previewConnectPlayroom: (input: Partial<PlayroomConnectInput>): Promise<string[]> =>
    app.PreviewConnectPlayroom(new playroomInput.ConnectInput(input)),
  previewCreatePlayhouse: (input: Partial<PlayhouseCreateInput>): Promise<string[]> =>
    app.PreviewCreatePlayhouse(new playhouseInput.CreateInput(input)),
  previewDeletePlayhouse: (input: Partial<PlayhouseDeleteInput>): Promise<string[]> =>
    app.PreviewDeletePlayhouse(new playhouseInput.DeleteInput(input)),
  previewUpdatePlayhouse: (input: Partial<PlayhouseUpdateInput>): Promise<string[]> =>
    app.PreviewUpdatePlayhouse(new playhouseInput.UpdateInput(input)),
};
