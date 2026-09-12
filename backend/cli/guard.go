package cli

import "errors"

// playhouseCommandNames mirrors PlayhouseCmd's aliases, duplicated rather than
// imported so the runner never depends on the commands it runs.
var playhouseCommandNames = map[string]bool{
	"playhouse":  true,
	"playhouses": true,
	"ph":         true,
	"house":      true,
}

// rejectArgumentsTheGUIMustNeverRun refuses the two argument lists that are never legitimate:
// an empty one, and `playhouse interface` behind any alias.
func rejectArgumentsTheGUIMustNeverRun(arguments []string) error {
	if len(arguments) == 0 {
		return errors.New("refusing to run acloud with no command")
	}
	if isInterfaceCommand(arguments) {
		return errors.New("refusing to run `playhouse interface`: it would launch a second GUI from inside the GUI")
	}
	return nil
}

// isInterfaceCommand spots `playhouse interface` behind any alias — the one
// command that would make the GUI open a second GUI.
func isInterfaceCommand(arguments []string) bool {
	if len(arguments) < 2 {
		return false
	}
	return playhouseCommandNames[arguments[0]] && arguments[1] == "interface"
}
