package playroom

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/avisi-cloud/acloud-playrooms/backend/cli"
)

// ListInput is what the GUI sends for `acloud playroom list`.
type ListInput struct {
	Playhouse    string
	Mine         bool
	ForceInstall bool
}

// Listing describes a single playroom as emitted by `acloud playroom list -o json`.
type Listing struct {
	Name       string    `json:"Name"`
	Owner      string    `json:"Owner"`
	Status     string    `json:"Status"`
	Image      string    `json:"Image"`
	SSHHost    string    `json:"SSHHost"`
	CreatedAt  time.Time `json:"CreatedAt"`
	CPURequest string    `json:"CPURequest"`
	MemRequest string    `json:"MemRequest"`
	CPULimit   string    `json:"CPULimit"`
	MemLimit   string    `json:"MemLimit"`
	DiskSize   string    `json:"DiskSize"`
	DiskType   string    `json:"DiskType"`
	System     string    `json:"System"`
	Ports      string    `json:"Ports"`
}

// cliListing is one row of `acloud playroom list -o json`, which uses snake_case
// keys. It is converted to Listing so the frontend keeps its own key names.
type cliListing struct {
	Name       string    `json:"name"`
	Owner      string    `json:"owner"`
	Status     string    `json:"status"`
	Image      string    `json:"image"`
	SSHHost    string    `json:"ssh_host"`
	CreatedAt  time.Time `json:"created_at"`
	CPURequest string    `json:"cpu_request"`
	MemRequest string    `json:"mem_request"`
	CPULimit   string    `json:"cpu_limit"`
	MemLimit   string    `json:"mem_limit"`
	DiskSize   string    `json:"disk_size"`
	DiskType   string    `json:"disk_type"`
	System     string    `json:"system"`
	Ports      string    `json:"ports"`
}

// List runs `acloud playroom list -o json` and decodes it. No operation id: it
// is polled, and a JSON blob in the console pane every few seconds is noise.
func List(ctx context.Context, input ListInput) ([]Listing, error) {
	result, err := cli.Run(ctx, buildListArguments(input), cli.Options{})
	if err != nil {
		return nil, err
	}
	var rows []cliListing
	if err := json.Unmarshal([]byte(result.Stdout), &rows); err != nil {
		return nil, fmt.Errorf("parse playroom list output: %w", err)
	}
	listings := make([]Listing, 0, len(rows))
	for _, row := range rows {
		listings = append(listings, Listing(row))
	}
	return listings, nil
}

func buildListArguments(input ListInput) []string {
	return cli.NewCommandArguments("playroom", "list").
		Str("--playhouse", input.Playhouse).
		Add("-o", "json").
		Flag("--mine", input.Mine).
		Flag("--force-install", input.ForceInstall).
		Build()
}
