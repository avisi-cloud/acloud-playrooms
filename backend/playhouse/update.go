package playhouse

import (
	"context"

	"github.com/avisi-cloud/acloud-playrooms/backend/cli"
)

// There is no `acloud playhouse update`. `playhouse create` is the update:
// re-running it with an existing name reports "already exists — updating it"
// and converges the playhouse — it backfills missing node pools, re-stamps the
// playroom pools, and re-runs the bootstrap.
//
// Most create flags do nothing on that path, so this input carries only the
// three that do. The node types and node count are preserved from the live
// pools by the converge, and the version, update channel and maintenance
// schedule are read only while provisioning a new cluster. Offering them would
// be offering settings that silently do not apply; the drawer says so instead.

// UpdateInput is what the GUI sends to converge an existing playhouse. A blank
// or zero field is omitted, which leaves that setting as it is.
type UpdateInput struct {
	Name string
	// Exposure re-bootstraps the playhouse's SSH connectivity. Switching to
	// tailscale on a playhouse that never had it also needs the credentials
	// below; they are stored in-cluster, so a later converge can omit them.
	Exposure                   string
	TailscaleOAuthClientID     string
	TailscaleOAuthClientSecret string
	// The ceilings are written to each pool's max-nodes annotation, which is
	// what a scale-up restores, rather than to the pool's MaxSize.
	MaxPlayroomNodes   int
	MaxPrivilegedNodes int
	WaitTimeout        string
}

// Update converges an existing playhouse, streaming progress to the UI.
func Update(ctx context.Context, operationID string, input UpdateInput) error {
	_, err := cli.Run(ctx, buildUpdateArguments(input), cli.Options{OperationID: operationID})
	return err
}

// buildUpdateArguments serializes a converge into the arguments for
// `acloud playhouse create`. Pure serialization — no defaults, no behaviour.
func buildUpdateArguments(input UpdateInput) []string {
	return cli.NewCommandArguments("playhouse", "create").Positional(input.Name).
		Str("--exposure", input.Exposure).
		Str("--tailscale-oauth-client-id", input.TailscaleOAuthClientID).
		Str("--tailscale-oauth-client-secret", input.TailscaleOAuthClientSecret).
		Int("--max-playroom-nodes", input.MaxPlayroomNodes).
		Int("--max-privileged-nodes", input.MaxPrivilegedNodes).
		Str("--wait-timeout", input.WaitTimeout).
		// Editing a playhouse must not also re-point the user's scope at it:
		// create sets the new playhouse as the default unless told not to, and
		// an edit of some other playhouse would quietly switch them over.
		Flag("--no-default", true).
		Add("--yes").
		Build()
}
