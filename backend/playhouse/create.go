package playhouse

import (
	"context"
	"strings"

	"github.com/avisi-cloud/acloud-playrooms/backend/cli"
)

// CreateInput is what the GUI sends for `acloud playhouse create`. A blank or
// zero field is omitted, so the command's own default or inference applies.
type CreateInput struct {
	Name                        string
	CloudAccount                string
	Region                      string
	Environment                 string
	Version                     string
	UpdateChannel               string
	MaintenanceScheduleIdentity string
	NodeType                    string
	SystemNodeType              string
	PlayroomNodeType            string
	PrivilegedNodeType          string
	NodeCount                   int
	MaxPlayroomNodes            int
	MaxPrivilegedNodes          int
	Exposure                    string
	TailscaleOAuthClientID      string
	TailscaleOAuthClientSecret  string
	WaitTimeout                 string
	NoDefault                   bool
}

// Create runs `acloud playhouse create`, streaming its progress to the UI. The
// GUI has already confirmed, so --yes skips the prompt.
func Create(ctx context.Context, operationID string, input CreateInput) error {
	_, err := cli.Run(ctx, buildCreateArguments(input), cli.Options{OperationID: operationID})
	return err
}

// buildCreateArguments serializes a GUI input into the arguments for
// `acloud playhouse create`. Pure serialization — no defaults, no behaviour.
func buildCreateArguments(input CreateInput) []string {
	arguments := cli.NewCommandArguments("playhouse", "create").Positional(input.Name).
		Str("--cloud-account", input.CloudAccount).
		Str("--region", input.Region).
		Str("--environment", input.Environment).
		Str("--version", input.Version)

	// The command rejects a pinned --version together with --update-channel, so
	// an explicit version wins and the channel is dropped.
	if strings.TrimSpace(input.Version) == "" {
		arguments.Str("--update-channel", input.UpdateChannel)
	}

	return arguments.
		Str("--maintenance-schedule-identity", input.MaintenanceScheduleIdentity).
		Str("--node-type", input.NodeType).
		Str("--system-node-type", input.SystemNodeType).
		Str("--playroom-node-type", input.PlayroomNodeType).
		Str("--privileged-node-type", input.PrivilegedNodeType).
		Int("--node-count", input.NodeCount).
		Int("--max-playroom-nodes", input.MaxPlayroomNodes).
		Int("--max-privileged-nodes", input.MaxPrivilegedNodes).
		Str("--exposure", input.Exposure).
		Str("--tailscale-oauth-client-id", input.TailscaleOAuthClientID).
		Str("--tailscale-oauth-client-secret", input.TailscaleOAuthClientSecret).
		Str("--wait-timeout", input.WaitTimeout).
		Flag("--no-default", input.NoDefault).
		Add("--yes").
		Build()
}
