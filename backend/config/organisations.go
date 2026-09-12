package config

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/avisi-cloud/acloud-playrooms/backend/cli"
)

type OrganisationEntry struct {
	Slug string
	Name string
}

// ListOrganisations runs `acloud config get-organisations -o json`.
func ListOrganisations(ctx context.Context) ([]OrganisationEntry, error) {
	result, err := cli.Run(ctx, []string{"config", "get-organisations", "-o", "json"}, cli.Options{})
	if err != nil {
		return nil, err
	}
	var entries []OrganisationEntry
	if err := json.Unmarshal([]byte(result.Stdout), &entries); err != nil {
		return nil, fmt.Errorf("parse organisations output: %w", err)
	}
	return entries, nil
}

// CurrentOrganisation runs `acloud config current-organisation`.
func CurrentOrganisation(ctx context.Context) (string, error) {
	result, err := cli.Run(ctx, []string{"config", "current-organisation"}, cli.Options{})
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(result.Stdout), nil
}

// UseOrganisation runs `acloud config use-organisation <slug>`.
func UseOrganisation(ctx context.Context, operationID, slug string) error {
	_, err := cli.Run(ctx, buildUseOrganisationArguments(slug), cli.Options{OperationID: operationID})
	return err
}

func buildUseOrganisationArguments(slug string) []string {
	return cli.NewCommandArguments("config", "use-organisation").Positional(slug).Build()
}
