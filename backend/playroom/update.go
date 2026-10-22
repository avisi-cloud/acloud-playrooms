package playroom

import (
	"context"
	"errors"
	"strings"

	"github.com/avisi-cloud/acloud-playrooms/backend/cli"
)

// UpdateInput is what the GUI sends for `acloud playroom update`, where an
// omitted flag keeps the current value. Hence the Change* companions.
type UpdateInput struct {
	Name      string
	Playhouse string
	Image     string
	// The resource values accept `none`, which unsets that request or limit.
	// The command refuses a request of `none` while its limit stays a number,
	// since Kubernetes would then reserve the whole limit instead of nothing.
	CPURequest    string
	CPULimit      string
	MemoryRequest string
	MemoryLimit   string
	// Exposure moves a nodeport or portforward playroom onto the tailnet. The
	// command accepts only `tailscale` here, and changes the SSH Service alone,
	// so it applies without a restart.
	Exposure Exposure
	// Storage grows the persistent volume in place; volumes cannot shrink.
	Storage string
	// Capabilities switches the profile; explicit CapAdd additions survive the switch.
	Capabilities   Capabilities
	ChangeReadOnly bool
	ReadOnly       bool
	ChangePorts    bool
	Ports          []string
	// CapAdd replaces the whole set of additions, like Ports.
	ChangeCapAdd bool
	CapAdd       []string
	// Turning WorkspaceNamespace off deletes that namespace and everything in it.
	ChangeWorkspaceNamespace bool
	WorkspaceNamespace       bool
	Force                    bool
	NoWait                   bool
	WaitTimeout              string
	ForceInstall             bool
}

// Update runs `acloud playroom update`, streaming its progress to the UI.
func Update(ctx context.Context, operationID string, input UpdateInput) error {
	if err := validateUpdateInput(input); err != nil {
		return err
	}
	_, err := cli.Run(ctx, buildUpdateArguments(input), cli.Options{OperationID: operationID})
	return err
}

// validateUpdateInput refuses a value acloud would reject, before anything runs.
func validateUpdateInput(input UpdateInput) error {
	return errors.Join(input.Exposure.Validate(), input.Capabilities.Validate())
}

// buildUpdateArguments serializes a GUI update into the arguments for
// `acloud playroom update`. Pure serialization — no defaults, no behaviour.
func buildUpdateArguments(input UpdateInput) []string {
	arguments := cli.NewCommandArguments("playroom", "update").Positional(input.Name).
		Str("--playhouse", input.Playhouse).
		Str("--image", input.Image).
		Str("--cpu-request", input.CPURequest).
		Str("--cpu-limit", input.CPULimit).
		Str("--memory-request", input.MemoryRequest).
		Str("--memory-limit", input.MemoryLimit).
		Str("--exposure", string(input.Exposure)).
		Str("--storage", input.Storage).
		Str("--capabilities", string(input.Capabilities))

	// The command reads flag.Changed, so send it only when actually toggled.
	if input.ChangeReadOnly {
		arguments.Explicit("--read-only", input.ReadOnly)
	}
	if input.ChangePorts {
		arguments.Add(replacementArguments("--port", input.Ports)...)
	}
	if input.ChangeCapAdd {
		arguments.Add(replacementArguments("--cap-add", input.CapAdd)...)
	}
	if input.ChangeWorkspaceNamespace {
		arguments.Explicit("--workspace-namespace", input.WorkspaceNamespace)
	}

	return arguments.
		Str("--wait-timeout", input.WaitTimeout).
		Flag("--force", input.Force).
		Flag("--no-wait", input.NoWait).
		Flag("--force-install", input.ForceInstall).
		Build()
}

// replacementArguments renders a replacement for a repeatable flag such as
// --port or --cap-add. Each replaces the whole set, and the command spells
// "remove them all" as the literal value `none`.
func replacementArguments(flag string, values []string) []string {
	var arguments []string
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			arguments = append(arguments, flag, strings.TrimSpace(value))
		}
	}
	if len(arguments) == 0 {
		return []string{flag, "none"}
	}
	return arguments
}
