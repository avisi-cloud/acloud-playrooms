package playroom

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/avisi-cloud/acloud-playrooms/backend/cli"
)

// DefaultEntry describes one playroom default for the GUI's settings screen.
// The field names match the JSON `playroom config view -o json` emits.
type DefaultEntry struct {
	Key     string
	Value   string
	Source  string // "config" | "cache" | "built-in"
	Builtin string
}

// Defaults runs `acloud playroom config view -o json` and decodes it, so the
// precedence rules behind each value stay the CLI's.
func Defaults(ctx context.Context) ([]DefaultEntry, error) {
	result, err := cli.Run(ctx, []string{"playroom", "config", "view", "-o", "json"}, cli.Options{})
	if err != nil {
		return nil, err
	}
	var entries []DefaultEntry
	if err := json.Unmarshal([]byte(result.Stdout), &entries); err != nil {
		return nil, fmt.Errorf("parse playroom config output: %w", err)
	}
	return entries, nil
}

// The three config writes take an operation id like every other mutation: they
// change ~/.acloud.yaml, which the user's terminal reads too.

// SetDefault runs `acloud playroom config set <key> <value>`, leaving key
// validation and persistence to the command.
func SetDefault(ctx context.Context, operationID, key, value string) error {
	_, err := cli.Run(ctx, buildSetDefaultArguments(key, value), cli.Options{OperationID: operationID})
	return err
}

func buildSetDefaultArguments(key, value string) []string {
	return cli.NewCommandArguments("playroom", "config", "set").Positional(key).Positional(value).Build()
}

// UnsetDefault runs `acloud playroom config unset <key>`, reverting it to the
// built-in value.
func UnsetDefault(ctx context.Context, operationID, key string) error {
	_, err := cli.Run(ctx, buildUnsetDefaultArguments(key), cli.Options{OperationID: operationID})
	return err
}

func buildUnsetDefaultArguments(key string) []string {
	return cli.NewCommandArguments("playroom", "config", "unset").Positional(key).Build()
}

// UnsetAllDefaults runs `acloud playroom config unset --all`. The command
// rejects a key alongside --all, so none is passed.
func UnsetAllDefaults(ctx context.Context, operationID string) error {
	_, err := cli.Run(ctx, buildUnsetAllDefaultsArguments(), cli.Options{OperationID: operationID})
	return err
}

func buildUnsetAllDefaultsArguments() []string {
	return cli.NewCommandArguments("playroom", "config", "unset").Add("--all").Build()
}
