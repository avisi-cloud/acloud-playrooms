package playhouse

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/avisi-cloud/acloud-playrooms/backend/cli"
)

// PlayhouseEntry is a slim view of a playhouse cluster for the GUI. The field
// names match the JSON `playhouse list -o json` emits.
type PlayhouseEntry struct {
	Identity string
	Slug     string
	Status   string
	Region   string
	Version  string
}

// List runs `acloud playhouse list -o json` and decodes it, so the list comes
// from the CLI code path rather than a separate query.
func List(ctx context.Context) ([]PlayhouseEntry, error) {
	result, err := cli.Run(ctx, buildListArguments(), cli.Options{})
	if err != nil {
		return nil, err
	}
	var entries []PlayhouseEntry
	if err := json.Unmarshal([]byte(result.Stdout), &entries); err != nil {
		return nil, fmt.Errorf("parse playhouse list output: %w", err)
	}
	return entries, nil
}

func buildListArguments() []string {
	return cli.NewCommandArguments("playhouse", "list").Add("-o", "json").Build()
}
