package cli

import "strings"

// Preview turns a command's arguments into the command line a user would type.
func Preview(arguments []string) []string {
	preview := make([]string, 0, len(arguments)+1)
	preview = append(preview, "acloud")
	return append(preview, redactArguments(arguments)...)
}

// PreviewString renders Preview as a single copy-pasteable command line.
func PreviewString(arguments []string) string {
	return Quote(Preview(arguments))
}

// Quote joins already-complete command parts into one shell-safe command line,
// as the terminal hand-off needs before passing it to an emulator.
func Quote(parts []string) string {
	quoted := make([]string, len(parts))
	for i, part := range parts {
		quoted[i] = shellQuote(part)
	}
	return strings.Join(quoted, " ")
}

// shellQuote wraps a value in single quotes when it contains anything a shell
// would interpret. Plain values are left bare so the common case stays readable.
func shellQuote(value string) string {
	if value == "" {
		return "''"
	}
	if !strings.ContainsAny(value, " \t\n\"'\\$`&|;<>()*?[]{}~#!") {
		return value
	}
	return "'" + strings.ReplaceAll(value, "'", `'\''`) + "'"
}
