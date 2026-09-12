package playroom

import (
	"context"

	"github.com/avisi-cloud/acloud-playrooms/backend/cli"
)

// OpenInput is what the GUI sends for `acloud playroom open`.
type OpenInput struct {
	Name      string
	Playhouse string
	Editor    string
	Tunnel    bool
}

// Open runs `acloud playroom open`, pre-answering its y/N prompt because the
// GUI already asked. That yes is unconditional, so a second prompt would pass.
func Open(ctx context.Context, operationID string, input OpenInput) error {
	_, err := cli.Run(ctx, buildOpenArguments(input), cli.Options{OperationID: operationID, Stdin: "y\n"})
	return err
}

func buildOpenArguments(input OpenInput) []string {
	return cli.NewCommandArguments("playroom", "open").Positional(input.Name).
		Str("--playhouse", input.Playhouse).
		Str("--editor", input.Editor).
		Flag("--tunnel", input.Tunnel).
		Build()
}
