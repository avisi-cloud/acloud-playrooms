package playroom

import (
	"github.com/avisi-cloud/acloud-playrooms/backend/cli"
	"github.com/avisi-cloud/acloud-playrooms/backend/terminal"
)

// ConnectInput is what the GUI sends for `acloud playroom connect`.
type ConnectInput struct {
	Name         string
	Playhouse    string
	User         string
	ForwardAgent bool
	Tunnel       bool
	ForceInstall bool

	// Terminal picks the emulator to open. Not a CLI flag.
	Terminal string
}

// Connect opens the user's terminal running `acloud playroom connect`, which is
// an interactive SSH session and so needs a real TTY.
func Connect(input ConnectInput) error {
	return terminal.Open(terminal.Emulator(input.Terminal), buildConnectArguments(input))
}

func buildConnectArguments(input ConnectInput) []string {
	return cli.NewCommandArguments("playroom", "connect").Positional(input.Name).
		Str("--playhouse", input.Playhouse).
		Str("--user", input.User).
		// forward-agent can default to true, so presence alone cannot express off.
		Explicit("--forward-agent", input.ForwardAgent).
		Flag("--tunnel", input.Tunnel).
		Flag("--force-install", input.ForceInstall).
		Build()
}
