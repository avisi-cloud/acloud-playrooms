package playhouse

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/avisi-cloud/acloud-playrooms/backend/cli"
)

// CloudAccountEntry is a cloud account from `cloud-accounts get -o json`.
// Identity is the value --cloud-account expects; the rest is for display.
type CloudAccountEntry struct {
	Identity    string
	DisplayName string
	Provider    string
	Regions     string
}

// cliCloudAccountEntry is one row of `acloud cloud-accounts get -o json`, which
// uses snake_case keys. It is converted to CloudAccountEntry so the frontend
// keeps its own key names.
type cliCloudAccountEntry struct {
	Identity    string `json:"identity"`
	DisplayName string `json:"display_name"`
	Provider    string `json:"provider"`
	Regions     string `json:"regions"`
}

// ListCloudAccounts runs `acloud cloud-accounts get -o json` and decodes it.
func ListCloudAccounts(ctx context.Context) ([]CloudAccountEntry, error) {
	result, err := cli.Run(ctx, []string{"cloud-accounts", "get", "-o", "json"}, cli.Options{})
	if err != nil {
		return nil, err
	}
	var rows []cliCloudAccountEntry
	if err := json.Unmarshal([]byte(result.Stdout), &rows); err != nil {
		return nil, fmt.Errorf("parse cloud-accounts output: %w", err)
	}
	entries := make([]CloudAccountEntry, 0, len(rows))
	for _, row := range rows {
		entries = append(entries, CloudAccountEntry(row))
	}
	return entries, nil
}
