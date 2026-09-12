package playroom

import (
	"context"

	"github.com/avisi-cloud/acloud-playrooms/backend/cli"
)

// CreateInput is what the GUI sends for `acloud playroom create`. A blank or
// false field is omitted, except ReadOnly and Privileged; see the builder.
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
	Exposure      string
	Ephemeral     bool
	ReadOnly      bool
	Privileged    bool
	NoWait        bool
	WaitTimeout   string
	ForceInstall  bool
}

// Create runs `acloud playroom create`, streaming its progress to the UI.
func Create(ctx context.Context, operationID string, input CreateInput) error {
	_, err := cli.Run(ctx, buildCreateArguments(input), cli.Options{OperationID: operationID})
	return err
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
		Str("--exposure", input.Exposure).
		Str("--wait-timeout", input.WaitTimeout).
		Flag("--ephemeral", input.Ephemeral).
		// Both can default to true, so a missing flag would mean "whatever is
		// configured" where the GUI shows a definite on/off toggle.
		Explicit("--read-only", input.ReadOnly).
		Explicit("--privileged", input.Privileged).
		Flag("--no-wait", input.NoWait).
		Flag("--force-install", input.ForceInstall).
		Build()
}
