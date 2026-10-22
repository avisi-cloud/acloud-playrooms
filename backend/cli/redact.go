package cli

import (
	"sort"
	"strings"
)

// sensitiveFlagParts name the flags whose values must never be shown.
var sensitiveFlagParts = []string{"secret", "token", "password", "passwd"}

// redactArguments replaces the value of any credential-carrying flag with a
// placeholder.
func redactArguments(arguments []string) []string {
	redacted := make([]string, 0, len(arguments))
	for i := 0; i < len(arguments); i++ {
		argument := arguments[i]
		if argument == "--env" && i+1 < len(arguments) {
			redacted = append(redacted, argument, redactEnvironmentAssignment(arguments[i+1]))
			i++
			continue
		}
		if assignment, found := strings.CutPrefix(argument, "--env="); found {
			redacted = append(redacted, "--env="+redactEnvironmentAssignment(assignment))
			continue
		}

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
const minRedactableValue = 8

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

// sensitiveValues collects the credential values carried by a command's arguments.
func sensitiveValues(arguments []string) []string {
	var values []string
	for i := 0; i < len(arguments); i++ {
		argument := arguments[i]
		if argument == "--env" && i+1 < len(arguments) {
			if name, value, found := strings.Cut(arguments[i+1], "="); found && isSensitiveEnvironmentName(name) && len(value) >= minRedactableValue {
				values = append(values, value)
			}
			i++
			continue
		}
		if assignment, found := strings.CutPrefix(argument, "--env="); found {
			if name, value, found := strings.Cut(assignment, "="); found && isSensitiveEnvironmentName(name) && len(value) >= minRedactableValue {
				values = append(values, value)
			}
			continue
		}

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
	// Redact longer values first so overlapping credentials cannot leave a suffix behind.
	sort.Slice(values, func(i, j int) bool { return len(values[i]) > len(values[j]) })
	return values
}

func redactEnvironmentAssignment(assignment string) string {
	name, value, found := strings.Cut(assignment, "=")
	if found && isSensitiveEnvironmentName(name) && value != "" {
		return name + "=" + redactedValue
	}
	return assignment
}

func isSensitiveFlag(argument string) bool {
	if !strings.HasPrefix(argument, "-") {
		return false
	}
	return isSensitiveName(strings.TrimLeft(argument, "-"))
}

func isSensitiveName(name string) bool {
	name = strings.ToLower(name)
	for _, part := range sensitiveFlagParts {
		if strings.Contains(name, part) {
			return true
		}
	}
	if strings.Contains(name, "api_key") || strings.Contains(name, "api-key") || strings.Contains(name, "private_key") {
		return true
	}
	return false
}

func isSensitiveEnvironmentName(name string) bool {
	normalized := strings.ToLower(strings.TrimSpace(name))
	if normalized == "secret" || normalized == "token" || normalized == "password" || normalized == "passwd" {
		return true
	}
	for _, suffix := range []string{"_secret", "_token", "_password", "_passwd", "_api_key", "_private_key"} {
		if strings.HasSuffix(normalized, suffix) {
			return true
		}
	}
	return false
}
