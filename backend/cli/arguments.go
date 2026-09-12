package cli

import (
	"strconv"
	"strings"
)

// CommandArguments accumulates the arguments for one acloud command, forwarding
// a field only when the GUI set it so the command applies its own defaults.
type CommandArguments struct {
	arguments []string
}

// NewCommandArguments starts a new argument list with the command path,
// e.g. NewCommandArguments("playroom", "create").
func NewCommandArguments(command ...string) *CommandArguments {
	return &CommandArguments{arguments: append([]string(nil), command...)}
}

// Add appends raw values verbatim.
func (commandArguments *CommandArguments) Add(values ...string) *CommandArguments {
	commandArguments.arguments = append(commandArguments.arguments, values...)
	return commandArguments
}

// Positional appends a required positional argument, trimmed. A blank one is
// still appended, so the command rejects it instead of the slots shifting.
func (commandArguments *CommandArguments) Positional(value string) *CommandArguments {
	commandArguments.arguments = append(commandArguments.arguments, strings.TrimSpace(value))
	return commandArguments
}

// OptionalPositional appends a positional argument only when it is not blank,
// letting the command apply its own default for it.
func (commandArguments *CommandArguments) OptionalPositional(value string) *CommandArguments {
	if trimmed := strings.TrimSpace(value); trimmed != "" {
		commandArguments.arguments = append(commandArguments.arguments, trimmed)
	}
	return commandArguments
}

// Str adds `--flag value` when the value is not blank.
func (commandArguments *CommandArguments) Str(flag, value string) *CommandArguments {
	if trimmed := strings.TrimSpace(value); trimmed != "" {
		commandArguments.arguments = append(commandArguments.arguments, flag, trimmed)
	}
	return commandArguments
}

// Repeat adds `--flag value` once per non-blank value, for repeatable flags
// such as --env, --git, --copy and --port.
func (commandArguments *CommandArguments) Repeat(flag string, values []string) *CommandArguments {
	for _, value := range values {
		commandArguments.Str(flag, value)
	}
	return commandArguments
}

// Int adds `--flag n` when n is positive. Zero means "not set by the GUI", so
// the command's own default applies.
func (commandArguments *CommandArguments) Int(flag string, value int) *CommandArguments {
	if value > 0 {
		commandArguments.arguments = append(commandArguments.arguments, flag, strconv.Itoa(value))
	}
	return commandArguments
}

// Flag adds a bare `--flag` when set, for presence-only booleans such as
// --ephemeral, --no-wait and --force.
func (commandArguments *CommandArguments) Flag(flag string, set bool) *CommandArguments {
	if set {
		commandArguments.arguments = append(commandArguments.arguments, flag)
	}
	return commandArguments
}

// Explicit adds `--flag=true` or `--flag=false`, for booleans where neither a
// bare flag nor omitting it can express what the user chose.
func (commandArguments *CommandArguments) Explicit(flag string, value bool) *CommandArguments {
	commandArguments.arguments = append(commandArguments.arguments, flag+"="+strconv.FormatBool(value))
	return commandArguments
}

// Build returns the finished arguments.
func (commandArguments *CommandArguments) Build() []string {
	return commandArguments.arguments
}
