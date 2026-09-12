package clitest

import (
	"strings"
	"testing"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
)

// alwaysSkipped are flags every cobra command has that no caller ever sends.
var alwaysSkipped = map[string]bool{"help": true}

// AssertFlagParity checks the GUI's arguments against the flags the real
// command accepts, in both directions.
func AssertFlagParity(t *testing.T, command *cobra.Command, arguments []string, skip map[string]string) {
	t.Helper()

	path := strings.TrimPrefix(command.CommandPath(), "acloud ")
	declared := declaredFlags(command)
	sent := sentFlags(t, command, arguments)

	for name := range declared {
		if alwaysSkipped[name] || sent[name] {
			continue
		}
		if reason, ok := skip[name]; ok {
			t.Logf("--%s is not sent by the GUI: %s", name, reason)
			continue
		}
		t.Errorf("`acloud %s` accepts --%s but the GUI never sends it.\n"+
			"Either add it to the input struct and the arguments builder, or list it in the test's skip map with a reason.",
			path, name)
	}

	for name := range sent {
		if !declared[name] {
			t.Errorf("the GUI sends --%s to `acloud %s`, which does not accept it", name, path)
		}
	}
}

// FindCommand resolves a subcommand path against a root command.
func FindCommand(t *testing.T, root *cobra.Command, path ...string) *cobra.Command {
	t.Helper()
	command, _, err := root.Find(path)
	if err != nil {
		t.Fatalf("Find(%q): %v", path, err)
	}
	if command == root {
		t.Fatalf("Find(%q) returned the root command; %q is not a subcommand", path, strings.Join(path, " "))
	}
	return command
}

// declaredFlags collects the long name of every flag the command accepts,
// including persistent ones it inherits (notably --playhouse).
func declaredFlags(command *cobra.Command) map[string]bool {
	names := map[string]bool{}
	collect := func(set *pflag.FlagSet) {
		set.VisitAll(func(flag *pflag.Flag) { names[flag.Name] = true })
	}
	collect(command.Flags())
	collect(command.LocalFlags())
	collect(command.InheritedFlags())
	return names
}

// sentFlags extracts the flags the arguments carry, normalising shorthands to their
// long names so `-o json` counts as --output.
func sentFlags(t *testing.T, command *cobra.Command, arguments []string) map[string]bool {
	t.Helper()

	names := map[string]bool{}
	for _, argument := range arguments {
		// Everything past `--` belongs to the process being run inside the
		// playroom, not to acloud.
		if argument == "--" {
			break
		}
		switch {
		case strings.HasPrefix(argument, "--"):
			name, _, _ := strings.Cut(strings.TrimPrefix(argument, "--"), "=")
			names[name] = true
		case len(argument) == 2 && strings.HasPrefix(argument, "-"):
			shorthand := strings.TrimPrefix(argument, "-")
			flag := command.Flags().ShorthandLookup(shorthand)
			if flag == nil {
				flag = command.InheritedFlags().ShorthandLookup(shorthand)
			}
			if flag == nil {
				t.Errorf("the GUI sends -%s, which is not a shorthand this command knows", shorthand)
				continue
			}
			names[flag.Name] = true
		}
	}
	return names
}
