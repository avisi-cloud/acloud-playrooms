package cli

import "strings"

// sensitiveFlagParts name the flags whose values must never be shown.
var sensitiveFlagParts = []string{"secret", "token", "password", "passwd"}

// redactArguments replaces the value of any credential-carrying flag with a
// placeholder.
func redactArguments(arguments []string) []string {
	redacted := make([]string, 0, len(arguments))
	for i := 0; i < len(arguments); i++ {
		argument := arguments[i]

		// --flag=value
		if name, value, found := strings.Cut(argument, "="); found && strings.HasPrefix(argument, "--") {
			if isSensitiveFlag(name) && value != "" {
				redacted = append(redacted, name+"="+redactedValue)
				continue
			}
			redacted = append(redacted, argument)
			continue
		}

		// --flag value
		if isSensitiveFlag(argument) && i+1 < len(arguments) {
			redacted = append(redacted, argument, redactedValue)
			i++
			continue
		}

		redacted = append(redacted, argument)
	}
	return redacted
}

const redactedValue = "<redacted>"

// RedactText blanks any credential that appears verbatim in free text, given
// the arguments it was passed on.
func RedactText(text string, arguments []string) string {
	return redactWith(text, sensitiveValues(arguments))
}

// redactWith is RedactText with the values already extracted, for the streaming
// path where one command produces thousands of lines.
func redactWith(text string, secrets []string) string {
	if text == "" || len(secrets) == 0 {
		return text
	}
	for _, secret := range secrets {
		text = strings.ReplaceAll(text, secret, redactedValue)
	}
	return text
}

// minRedactableValue is the shortest value worth blanking: anything shorter is
// more likely a substring of ordinary words.
const minRedactableValue = 8

// sensitiveValues collects the credential values carried by a command's arguments.
func sensitiveValues(arguments []string) []string {
	var values []string
	for i := 0; i < len(arguments); i++ {
		argument := arguments[i]

		if name, value, found := strings.Cut(argument, "="); found && strings.HasPrefix(argument, "--") {
			if isSensitiveFlag(name) && len(value) >= minRedactableValue {
				values = append(values, value)
			}
			continue
		}

		if isSensitiveFlag(argument) && i+1 < len(arguments) {
			if value := arguments[i+1]; len(value) >= minRedactableValue {
				values = append(values, value)
			}
			i++
		}
	}
	return values
}

func isSensitiveFlag(argument string) bool {
	if !strings.HasPrefix(argument, "-") {
		return false
	}
	name := strings.ToLower(strings.TrimLeft(argument, "-"))
	for _, part := range sensitiveFlagParts {
		if strings.Contains(name, part) {
			return true
		}
	}
	return false
}
