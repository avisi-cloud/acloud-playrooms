package cli

import (
	"slices"
	"testing"
)

// CommandArguments is the piece every command builder leans on, so its edge cases are
// pinned here rather than rediscovered once per command.
func TestCommandArguments(t *testing.T) {
	tests := []struct {
		name  string
		build func() []string
		want  []string
	}{
		{
			name:  "the command path is the starting point",
			build: func() []string { return NewCommandArguments("playroom", "create").Build() },
			want:  []string{"playroom", "create"},
		},
		{
			name: "Str omits blank and whitespace-only values",
			build: func() []string {
				return NewCommandArguments("c").Str("--a", "").Str("--b", "   ").Str("--c", "v").Build()
			},
			want: []string{"c", "--c", "v"},
		},
		{
			name:  "Str trims what it forwards",
			build: func() []string { return NewCommandArguments("c").Str("--a", "  v  ").Build() },
			want:  []string{"c", "--a", "v"},
		},
		{
			name: "Repeat emits the flag once per value and skips blanks",
			build: func() []string {
				return NewCommandArguments("c").Repeat("--env", []string{"A=B", "", "  ", "C=D"}).Build()
			},
			want: []string{"c", "--env", "A=B", "--env", "C=D"},
		},
		{
			name:  "Repeat over an empty slice emits nothing",
			build: func() []string { return NewCommandArguments("c").Repeat("--env", nil).Build() },
			want:  []string{"c"},
		},
		{
			name: "Int omits zero and negatives so the command's default applies",
			build: func() []string {
				return NewCommandArguments("c").Int("--a", 0).Int("--b", -1).Int("--c", 3).Build()
			},
			want: []string{"c", "--c", "3"},
		},
		{
			name:  "Flag is presence-only",
			build: func() []string { return NewCommandArguments("c").Flag("--a", false).Flag("--b", true).Build() },
			want:  []string{"c", "--b"},
		},
		{
			name:  "Explicit always states the value",
			build: func() []string { return NewCommandArguments("c").Explicit("--a", false).Explicit("--b", true).Build() },
			want:  []string{"c", "--a=false", "--b=true"},
		},
		{
			name:  "Positional keeps its slot even when blank",
			build: func() []string { return NewCommandArguments("c").Positional("").Str("--a", "v").Build() },
			want:  []string{"c", "", "--a", "v"},
		},
		{
			name:  "Positional trims",
			build: func() []string { return NewCommandArguments("c").Positional("  demo  ").Build() },
			want:  []string{"c", "demo"},
		},
		{
			name:  "OptionalPositional disappears when blank",
			build: func() []string { return NewCommandArguments("c").OptionalPositional("  ").Str("--a", "v").Build() },
			want:  []string{"c", "--a", "v"},
		},
		{
			name:  "OptionalPositional is kept when present",
			build: func() []string { return NewCommandArguments("c").OptionalPositional("/work").Build() },
			want:  []string{"c", "/work"},
		},
		{
			name:  "Add appends verbatim, including values that look like flags",
			build: func() []string { return NewCommandArguments("c").Add("--", "--help").Build() },
			want:  []string{"c", "--", "--help"},
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			if got := testCase.build(); !slices.Equal(got, testCase.want) {
				t.Errorf("arguments = %q, want %q", got, testCase.want)
			}
		})
	}
}

// Two builders must not share backing memory, or one command could overwrite
// another's arguments.
func TestCommandArgumentsDoNotShareState(t *testing.T) {
	command := []string{"playroom", "create"}

	first := NewCommandArguments(command...).Str("--image", "opencode").Build()
	second := NewCommandArguments(command...).Str("--image", "claude-code").Build()

	if slices.Equal(first, second) {
		t.Fatalf("both builders produced %q", first)
	}
	if !slices.Equal(command, []string{"playroom", "create"}) {
		t.Errorf("NewCommandArguments mutated the caller's slice: %q", command)
	}
}
