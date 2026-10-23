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
	// Via picks the connection path; blank uses the room's own exposure.
	Via          Exposure
	ForceInstall bool

	// Terminal picks the emulator to open. Not a CLI flag.
	Terminal string
}

// Connect opens the user's terminal running `acloud playroom connect`, which is
// an interactive SSH session and so needs a real TTY.
func Connect(input ConnectInput) error {
	if err := input.Via.Validate(); err != nil {
		return err
	}
	return terminal.Open(terminal.Emulator(input.Terminal), buildConnectArguments(input))
}

func buildConnectArguments(input ConnectInput) []string {
	return cli.NewCommandArguments("playroom", "connect").Positional(input.Name).
		Str("--playhouse", input.Playhouse).
		Str("--user", input.User).
		// forward-agent can default to true, so presence alone cannot express off.
		Explicit("--forward-agent", input.ForwardAgent).
		Str("--via", string(input.Via)).
		Flag("--force-install", input.ForceInstall).
		Build()
}
