package playroom

import (
	"context"
	"errors"

	"github.com/avisi-cloud/acloud-playrooms/backend/cli"
)

// CreateInput is what the GUI sends for `acloud playroom create`. A blank or
// false field is omitted, except ReadOnly, Privileged and WorkspaceNamespace;
// see the builder.
type CreateInput struct {
	Name          string
	Playhouse     string
	Image         string
	Storage       string
	CPURequest    string
	CPULimit      string
	MemoryRequest string
	MemoryLimit   string
	SSHKey        string
	EnvVars       []string
	GitRepos      []string
	Copies        []string
	Ports         []string
	ProxyGroup    string
	Exposure      Exposure
	// NodePortSSH adds SSH on a NodePort next to the room's own path; acloud refuses it on a nodeport room.
	NodePortSSH  bool
	Capabilities Capabilities
	// CapAdd adds Linux capabilities on top of the Capabilities profile, e.g. NET_ADMIN.
	CapAdd             []string
	Ephemeral          bool
	ReadOnly           bool
	Privileged         bool
	WorkspaceNamespace bool
	NoWait             bool
	WaitTimeout        string
	ForceInstall       bool
}

// Create runs `acloud playroom create`, streaming its progress to the UI.
func Create(ctx context.Context, operationID string, input CreateInput) error {
	if err := validateCreateInput(input); err != nil {
		return err
	}
	_, err := cli.Run(ctx, buildCreateArguments(input), cli.Options{OperationID: operationID})
	return err
}

// validateCreateInput refuses a value acloud would reject, before anything runs.
func validateCreateInput(input CreateInput) error {
	return errors.Join(input.Exposure.Validate(), input.Capabilities.Validate())
}

// buildCreateArguments serializes a GUI input into the arguments for
// `acloud playroom create`. Pure serialization — no defaults, no behaviour.
func buildCreateArguments(input CreateInput) []string {
	return cli.NewCommandArguments("playroom", "create").Positional(input.Name).
		Str("--playhouse", input.Playhouse).
		Str("--image", input.Image).
		Str("--storage", input.Storage).
		Str("--cpu-request", input.CPURequest).
		Str("--cpu-limit", input.CPULimit).
		Str("--memory-request", input.MemoryRequest).
		Str("--memory-limit", input.MemoryLimit).
		Str("--ssh-key", input.SSHKey).
		Repeat("--env", input.EnvVars).
		Repeat("--git", input.GitRepos).
		Repeat("--copy", input.Copies).
		Repeat("--port", input.Ports).
		Str("--proxy-group", input.ProxyGroup).
		Str("--exposure", string(input.Exposure)).
		Flag("--nodeport-ssh", input.NodePortSSH).
		Str("--capabilities", string(input.Capabilities)).
		Repeat("--cap-add", input.CapAdd).
		Str("--wait-timeout", input.WaitTimeout).
		Flag("--ephemeral", input.Ephemeral).
		// These can default to true, so a missing flag would mean "whatever is
		// configured" where the GUI shows a definite on/off toggle.
		Explicit("--read-only", input.ReadOnly).
		Explicit("--privileged", input.Privileged).
		Explicit("--workspace-namespace", input.WorkspaceNamespace).
		Flag("--no-wait", input.NoWait).
		Flag("--force-install", input.ForceInstall).
		Build()
}
