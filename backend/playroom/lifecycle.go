package playroom

import (
	"context"

	"github.com/avisi-cloud/acloud-playrooms/backend/cli"
)

// The three commands that change a playroom's run state. They share a shape, so
// they live together rather than in three near-identical files.

// DeleteInput is what the GUI sends for `acloud playroom delete`.
type DeleteInput struct {
	Name         string
	Playhouse    string
	Force        bool
	NoWait       bool
	WaitTimeout  string
	ForceInstall bool
}

// Delete runs `acloud playroom delete`. The GUI has already taken a typed
// confirmation, so --yes skips the prompt.
func Delete(ctx context.Context, operationID string, input DeleteInput) error {
	_, err := cli.Run(ctx, buildDeleteArguments(input), cli.Options{OperationID: operationID})
	return err
}

func buildDeleteArguments(input DeleteInput) []string {
	return cli.NewCommandArguments("playroom", "delete").Positional(input.Name).
		Str("--playhouse", input.Playhouse).
		Add("--yes").
		Str("--wait-timeout", input.WaitTimeout).
		Flag("--force", input.Force).
		Flag("--no-wait", input.NoWait).
		Flag("--force-install", input.ForceInstall).
		Build()
}

// StartInput is what the GUI sends for `acloud playroom start`.
type StartInput struct {
	Name         string
	Playhouse    string
	Force        bool
	NoWait       bool
	WaitTimeout  string
	ForceInstall bool
}

// Start runs `acloud playroom start`, bringing the node pool back up and
// running the privileged-capacity check.
func Start(ctx context.Context, operationID string, input StartInput) error {
	_, err := cli.Run(ctx, buildStartArguments(input), cli.Options{OperationID: operationID})
	return err
}

func buildStartArguments(input StartInput) []string {
	return cli.NewCommandArguments("playroom", "start").Positional(input.Name).
		Str("--playhouse", input.Playhouse).
		Str("--wait-timeout", input.WaitTimeout).
		Flag("--force", input.Force).
		Flag("--no-wait", input.NoWait).
		Flag("--force-install", input.ForceInstall).
		Build()
}

// StopInput is what the GUI sends for `acloud playroom stop`.
type StopInput struct {
	Name         string
	Playhouse    string
	Force        bool
	ForceInstall bool
}

// Stop runs `acloud playroom stop` (owner guard, scale to zero, idle node-pool
// scale-down, cache update).
func Stop(ctx context.Context, operationID string, input StopInput) error {
	_, err := cli.Run(ctx, buildStopArguments(input), cli.Options{OperationID: operationID})
	return err
}

func buildStopArguments(input StopInput) []string {
	return cli.NewCommandArguments("playroom", "stop").Positional(input.Name).
		Str("--playhouse", input.Playhouse).
		Flag("--force", input.Force).
		Flag("--force-install", input.ForceInstall).
		Build()
}
