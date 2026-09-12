package cli

import (
	"slices"
	"strings"
	"testing"
)

// A credential typed into the playhouse form must never come back out on screen
// or in the clipboard.
func TestPreviewRedactsCredentials(t *testing.T) {
	tests := []struct {
		name      string
		arguments []string
		want      []string
	}{
		{
			name:      "the tailscale oauth secret is hidden",
			arguments: []string{"playhouse", "create", "demo", "--tailscale-oauth-client-secret", "tskey-abc123"},
			want:      []string{"acloud", "playhouse", "create", "demo", "--tailscale-oauth-client-secret", "<redacted>"},
		},
		{
			name:      "the client id is not a credential and stays visible",
			arguments: []string{"playhouse", "create", "demo", "--tailscale-oauth-client-id", "kAbC123"},
			want:      []string{"acloud", "playhouse", "create", "demo", "--tailscale-oauth-client-id", "kAbC123"},
		},
		{
			name:      "the --flag=value form is redacted too",
			arguments: []string{"playhouse", "create", "--tailscale-oauth-client-secret=tskey-abc123"},
			want:      []string{"acloud", "playhouse", "create", "--tailscale-oauth-client-secret=<redacted>"},
		},
		{
			name:      "matching is by name, so a future token flag is covered by default",
			arguments: []string{"auth", "login", "--personal-access-token", "pat-xyz"},
			want:      []string{"acloud", "auth", "login", "--personal-access-token", "<redacted>"},
		},
		{
			name:      "a value that merely looks like a flag name is untouched",
			arguments: []string{"playroom", "create", "demo", "--env", "MY_SECRET_NAME=whatever"},
			want:      []string{"acloud", "playroom", "create", "demo", "--env", "MY_SECRET_NAME=whatever"},
		},
		{
			name:      "a trailing credential flag with no value does not panic",
			arguments: []string{"playhouse", "create", "--tailscale-oauth-client-secret"},
			want:      []string{"acloud", "playhouse", "create", "--tailscale-oauth-client-secret"},
		},
		{
			name:      "ordinary commands are unchanged",
			arguments: []string{"playroom", "list", "--playhouse", "ph", "-o", "json"},
			want:      []string{"acloud", "playroom", "list", "--playhouse", "ph", "-o", "json"},
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			if got := Preview(testCase.arguments); !slices.Equal(got, testCase.want) {
				t.Errorf("Preview() = %q, want %q", got, testCase.want)
			}
		})
	}
}

// Redaction is for display only — the command that runs must keep the real
// value, or creating a playhouse would break.
func TestRedactionDoesNotTouchTheCallersArguments(t *testing.T) {
	arguments := []string{"playhouse", "create", "demo", "--tailscale-oauth-client-secret", "tskey-abc123"}
	original := slices.Clone(arguments)

	_ = Preview(arguments)
	_ = PreviewString(arguments)

	if !slices.Equal(arguments, original) {
		t.Errorf("arguments was mutated: %q, want %q", arguments, original)
	}
	if !slices.Contains(arguments, "tskey-abc123") {
		t.Error("the real secret was lost from the arguments that will be executed")
	}
}

func TestPreviewStringRedacts(t *testing.T) {
	got := PreviewString([]string{"playhouse", "create", "demo", "--tailscale-oauth-client-secret", "tskey-abc 123"})
	if strings.Contains(got, "tskey-abc 123") {
		t.Errorf("PreviewString() = %q, must not contain the secret", got)
	}
	if !strings.Contains(got, "<redacted>") {
		t.Errorf("PreviewString() = %q, want the redaction placeholder", got)
	}
}

func TestRedactTextBlanksCredentialsQuotedBackByTheCommand(t *testing.T) {
	// The case this exists for: cobra rejects a flag value and quotes it back,
	// so the secret reaches the user through stderr rather than through the arguments.
	arguments := []string{"playhouse", "create", "demo", "--tailscale-oauth-client-secret", "tskey-client-abc123def456"}

	tests := []struct {
		name string
		text string
		want string
	}{
		{
			name: "cobra parse failure quoting the value",
			text: `invalid argument "tskey-client-abc123def456" for "--tailscale-oauth-client-secret" flag`,
			want: `invalid argument "<redacted>" for "--tailscale-oauth-client-secret" flag`,
		},
		{
			name: "the command's own message",
			text: "authenticating with tskey-client-abc123def456 failed",
			want: "authenticating with <redacted> failed",
		},
		{
			name: "more than one occurrence",
			text: "tskey-client-abc123def456 rejected; retry with tskey-client-abc123def456",
			want: "<redacted> rejected; retry with <redacted>",
		},
		{
			name: "text with nothing sensitive in it is untouched",
			text: "playhouse \"demo\" already exists",
			want: "playhouse \"demo\" already exists",
		},
		{
			name: "empty stays empty",
			text: "",
			want: "",
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			if got := RedactText(testCase.text, arguments); got != testCase.want {
				t.Errorf("RedactText() = %q, want %q", got, testCase.want)
			}
		})
	}
}

func TestRedactTextLeavesNonCredentialFlagValuesAlone(t *testing.T) {
	arguments := []string{"playroom", "create", "demo", "--image", "opencode"}
	text := "image opencode could not be pulled"
	if got := RedactText(text, arguments); got != text {
		t.Errorf("RedactText() = %q, want it unchanged", got)
	}
}

func TestRedactTextSkipsShortValues(t *testing.T) {
	// A short secret would blank unrelated words and make the real error
	// unreadable, which is a bad trade when the point is explaining a failure.
	arguments := []string{"playhouse", "create", "--tailscale-oauth-client-secret", "abc"}
	text := "abc is not a valid credential"
	if got := RedactText(text, arguments); got != text {
		t.Errorf("RedactText() = %q, want it unchanged for a short value", got)
	}
}

func TestExitErrorRedactsTheCLIsOwnMessage(t *testing.T) {
	arguments := []string{"playhouse", "create", "demo", "--tailscale-oauth-client-secret", "tskey-client-abc123def456"}
	err := &ExitError{
		Arguments: arguments,
		ExitCode:  1,
		Stderr:    "Error: invalid argument \"tskey-client-abc123def456\" for \"--tailscale-oauth-client-secret\" flag\n",
	}
	got := err.Error()
	if strings.Contains(got, "tskey-client-abc123def456") {
		t.Fatalf("ExitError.Error() leaked the credential: %q", got)
	}
	if !strings.Contains(got, redactedValue) {
		t.Errorf("ExitError.Error() = %q, want it to contain %q", got, redactedValue)
	}
}
