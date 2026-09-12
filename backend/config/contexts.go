package config

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/avisi-cloud/acloud-playrooms/backend/cli"
)

type ContextEntry struct {
	Name         string
	Organisation string
}

// ListContexts runs `acloud config get-contexts -o json`.
func ListContexts(ctx context.Context) ([]ContextEntry, error) {
	result, err := cli.Run(ctx, []string{"config", "get-contexts", "-o", "json"}, cli.Options{})
	if err != nil {
		return nil, err
	}
	var entries []ContextEntry
	if err := json.Unmarshal([]byte(result.Stdout), &entries); err != nil {
		return nil, fmt.Errorf("parse contexts output: %w", err)
	}
	return entries, nil
}

// CurrentContext runs `acloud config current-context`.
func CurrentContext(ctx context.Context) (string, error) {
	result, err := cli.Run(ctx, []string{"config", "current-context"}, cli.Options{})
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(result.Stdout), nil
}

// UseContext runs `acloud config use-context <name>`.
func UseContext(ctx context.Context, operationID, name string) error {
	_, err := cli.Run(ctx, buildUseContextArguments(name), cli.Options{OperationID: operationID})
	return err
}

func buildUseContextArguments(name string) []string {
	return cli.NewCommandArguments("config", "use-context").Positional(name).Build()
}
