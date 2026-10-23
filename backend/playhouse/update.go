package playhouse

import (
	"context"

	"github.com/avisi-cloud/acloud-playrooms/backend/cli"
)

// UpdateInput is what the GUI sends for `acloud playhouse update`. A blank or
// zero field is omitted, which keeps the playhouse's current value.
//
// The update's node-type flags and --node-count are left out: they only size a
// node pool that has to be added, and acloud picks the same defaults as create.
type UpdateInput struct {
	Name          string
	UpdateChannel string
	// Exposure re-bootstraps the playhouse's SSH connectivity. Switching to
	// tailscale on a playhouse that never had it also needs the credentials
	// below; they are stored in-cluster, so a later update can omit them.
	Exposure string
	// IP allowlist edits, applied in this order; without a terminal acloud never offers the current IP.
	ResetAllowlist             bool
	RemoveIPs                  []string
	AllowIPs                   []string
	AllowCurrentIP             bool
	TailscaleOAuthClientID     string
	TailscaleOAuthClientSecret string
	MaxPlayroomNodes           int
	MaxPrivilegedNodes         int
	WaitTimeout                string
}

// Update runs `acloud playhouse update`, streaming its progress to the UI.
func Update(ctx context.Context, operationID string, input UpdateInput) error {
	_, err := cli.Run(ctx, buildUpdateArguments(input), cli.Options{OperationID: operationID})
	return err
}

// buildUpdateArguments has no --yes: update never prompts without a terminal, and has no such flag.
func buildUpdateArguments(input UpdateInput) []string {
	return cli.NewCommandArguments("playhouse", "update").Positional(input.Name).
		Str("--update-channel", input.UpdateChannel).
		Str("--exposure", input.Exposure).
		Flag("--reset-allowlist", input.ResetAllowlist).
		Repeat("--remove-ip", input.RemoveIPs).
		Repeat("--allow-ip", input.AllowIPs).
		Flag("--allow-current-ip", input.AllowCurrentIP).
		Str("--tailscale-oauth-client-id", input.TailscaleOAuthClientID).
		Str("--tailscale-oauth-client-secret", input.TailscaleOAuthClientSecret).
		Int("--max-playroom-nodes", input.MaxPlayroomNodes).
		Int("--max-privileged-nodes", input.MaxPrivilegedNodes).
		Str("--wait-timeout", input.WaitTimeout).
		Build()
}
