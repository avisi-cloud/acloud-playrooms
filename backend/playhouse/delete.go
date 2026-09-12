package playhouse

import (
	"context"

	"github.com/avisi-cloud/acloud-playrooms/backend/cli"
)

// DeleteInput is what the GUI sends for `acloud playhouse delete`.
type DeleteInput struct {
	Name        string
	Force       bool
	NoWait      bool
	WaitTimeout string
}

// Delete runs `acloud playhouse delete`. The GUI has already taken a typed
// confirmation, so --yes skips the prompt; the command still checks the rest.
func Delete(ctx context.Context, operationID string, input DeleteInput) error {
	_, err := cli.Run(ctx, buildDeleteArguments(input), cli.Options{OperationID: operationID})
	return err
}

// buildDeleteArguments serializes a GUI input into the arguments for
// `acloud playhouse delete`. Pure serialization — no defaults, no behaviour.
func buildDeleteArguments(input DeleteInput) []string {
	return cli.NewCommandArguments("playhouse", "delete").Positional(input.Name).
		Add("--yes").
		Str("--wait-timeout", input.WaitTimeout).
		Flag("--force", input.Force).
		Flag("--no-wait", input.NoWait).
		Build()
}
