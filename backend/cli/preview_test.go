package cli

import (
	"slices"
	"testing"
)

func TestPreviewPrependsTheBinaryWithoutTouchingTheArguments(t *testing.T) {
	arguments := []string{"playroom", "create", "demo", "--playhouse", "playhouse-ame"}
	original := slices.Clone(arguments)

	got := Preview(arguments)

	want := append([]string{"acloud"}, original...)
	if !slices.Equal(got, want) {
		t.Errorf("Preview() = %q, want %q", got, want)
	}
	// Preview and Run share the caller's slice; Preview must not write into it.
	if !slices.Equal(arguments, original) {
		t.Errorf("Preview() mutated its argument: %q, want %q", arguments, original)
	}
}

func TestPreviewStringQuotesOnlyWhatNeedsIt(t *testing.T) {
	tests := []struct {
		name      string
		arguments []string
		want      string
	}{
		{
			name:      "plain values stay bare",
			arguments: []string{"playroom", "list", "--playhouse", "playhouse-ame"},
			want:      "acloud playroom list --playhouse playhouse-ame",
		},
		{
			name:      "values with spaces are quoted",
			arguments: []string{"playroom", "create", "demo", "--copy", "/my dir:/home"},
			want:      "acloud playroom create demo --copy '/my dir:/home'",
		},
		{
			name:      "embedded single quotes are escaped",
			arguments: []string{"playroom", "create", "--env", "MSG=it's"},
			want:      `acloud playroom create --env 'MSG=it'\''s'`,
		},
		{
			name:      "shell metacharacters are quoted",
			arguments: []string{"playroom", "create", "--env", "CMD=$(whoami)"},
			want:      "acloud playroom create --env 'CMD=$(whoami)'",
		},
		{
			name:      "empty values stay visible",
			arguments: []string{"playroom", "create", "--image", ""},
			want:      "acloud playroom create --image ''",
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			if got := PreviewString(testCase.arguments); got != testCase.want {
				t.Errorf("PreviewString() = %q, want %q", got, testCase.want)
			}
		})
	}
}
