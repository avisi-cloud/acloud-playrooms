package playhouse

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/avisi-cloud/acloud-playrooms/backend/cli"
)

// EnvironmentEntry is an AME environment from `environments get -o json`. Slug
// is the value sent as CreateInput.Environment; the rest is for display.
type EnvironmentEntry struct {
	Slug        string
	Name        string
	Description string
}

// ListEnvironments runs `acloud environments get -o json` and decodes it.
func ListEnvironments(ctx context.Context) ([]EnvironmentEntry, error) {
	result, err := cli.Run(ctx, []string{"environments", "get", "-o", "json"}, cli.Options{})
	if err != nil {
		return nil, err
	}
	var entries []EnvironmentEntry
	if err := json.Unmarshal([]byte(result.Stdout), &entries); err != nil {
		return nil, fmt.Errorf("parse environments output: %w", err)
	}
	return entries, nil
}
