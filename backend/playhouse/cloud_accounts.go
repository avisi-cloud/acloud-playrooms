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

// ListCloudAccounts runs `acloud cloud-accounts get -o json` and decodes it.
func ListCloudAccounts(ctx context.Context) ([]CloudAccountEntry, error) {
	result, err := cli.Run(ctx, []string{"cloud-accounts", "get", "-o", "json"}, cli.Options{})
	if err != nil {
		return nil, err
	}
	var entries []CloudAccountEntry
	if err := json.Unmarshal([]byte(result.Stdout), &entries); err != nil {
		return nil, fmt.Errorf("parse cloud-accounts output: %w", err)
	}
	return entries, nil
}
