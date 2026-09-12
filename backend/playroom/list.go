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

// List runs `acloud playroom list -o json` and decodes it. No operation id: it
// is polled, and a JSON blob in the console pane every few seconds is noise.
func List(ctx context.Context, input ListInput) ([]Listing, error) {
	result, err := cli.Run(ctx, buildListArguments(input), cli.Options{})
	if err != nil {
		return nil, err
	}
	var rows []Listing
	if err := json.Unmarshal([]byte(result.Stdout), &rows); err != nil {
		return nil, fmt.Errorf("parse playroom list output: %w", err)
	}
	return rows, nil
}

func buildListArguments(input ListInput) []string {
	return cli.NewCommandArguments("playroom", "list").
		Str("--playhouse", input.Playhouse).
		Add("-o", "json").
		Flag("--mine", input.Mine).
		Flag("--force-install", input.ForceInstall).
		Build()
}
