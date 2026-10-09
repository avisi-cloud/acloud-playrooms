package playroom

import (
	"context"
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
	CPURequest string
	CPULimit   string
	MemRequest string
	MemLimit   string
	// Exposure moves a nodeport or portforward playroom onto the tailnet. The
	// command accepts only `tailscale` here, and changes the SSH Service alone,
	// so it applies without a restart.
	Exposure       string
	ChangeReadOnly bool
	ReadOnly       bool
	ChangePorts    bool
	Ports          []string
	Force          bool
	NoWait         bool
	WaitTimeout    string
	ForceInstall   bool
}

// Update runs `acloud playroom update`, streaming its progress to the UI.
func Update(ctx context.Context, operationID string, input UpdateInput) error {
	_, err := cli.Run(ctx, buildUpdateArguments(input), cli.Options{OperationID: operationID})
	return err
}

// buildUpdateArguments serializes a GUI update into the arguments for
// `acloud playroom update`. Pure serialization — no defaults, no behaviour.
func buildUpdateArguments(input UpdateInput) []string {
	arguments := cli.NewCommandArguments("playroom", "update").Positional(input.Name).
		Str("--playhouse", input.Playhouse).
		Str("--image", input.Image).
		Str("--cpu-request", input.CPURequest).
		Str("--cpu-limit", input.CPULimit).
		Str("--memory-request", input.MemRequest).
		Str("--memory-limit", input.MemLimit).
		Str("--exposure", input.Exposure)

	// The command reads flag.Changed, so send it only when actually toggled.
	if input.ChangeReadOnly {
		arguments.Explicit("--read-only", input.ReadOnly)
	}
	if input.ChangePorts {
		arguments.Add(portArguments(input.Ports)...)
	}

	return arguments.
		Str("--wait-timeout", input.WaitTimeout).
		Flag("--force", input.Force).
		Flag("--no-wait", input.NoWait).
		Flag("--force-install", input.ForceInstall).
		Build()
}

// portArguments renders a port replacement. --port replaces the whole set, and
// the command spells "remove every forward" as the literal value `none`.
func portArguments(ports []string) []string {
	var arguments []string
	for _, port := range ports {
		if strings.TrimSpace(port) != "" {
			arguments = append(arguments, "--port", strings.TrimSpace(port))
		}
	}
	if len(arguments) == 0 {
		return []string{"--port", "none"}
	}
	return arguments
}
