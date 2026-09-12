package playroom

import (
	"slices"
	"strings"
	"testing"
)

// The argument builders are where a GUI bug turns into a wrong command, and
// they are pure functions, so they are cheap to pin down exactly.

func TestBuildCreateArguments(t *testing.T) {
	tests := []struct {
		name  string
		input CreateInput
		want  []string
	}{
		{
			name:  "an empty input forwards only what the command needs",
			input: CreateInput{Name: "demo", Playhouse: "ph"},
			// Everything unset is omitted so the command's own defaults apply;
			// only the two authoritative toggles are always spelled out.
			want: []string{
				"playroom", "create", "demo", "--playhouse", "ph",
				"--read-only=false", "--privileged=false",
			},
		},
		{
			name: "every field set",
			input: CreateInput{
				Name: "demo", Playhouse: "ph", Image: "opencode", Storage: "10Gi",
				CPURequest: "250m", CPULimit: "4", MemoryRequest: "2Gi", MemoryLimit: "4Gi",
				SSHKey: "/k.pub", EnvVars: []string{"A=B", "C=D"}, GitRepos: []string{"https://g"},
				Copies: []string{"src:dst"}, Ports: []string{"80", "443:8443"},
				ProxyGroup: "pg", Exposure: "nodeport", Ephemeral: true, ReadOnly: true,
				Privileged: true, NoWait: true, WaitTimeout: "5m", ForceInstall: true,
			},
			want: []string{
				"playroom", "create", "demo", "--playhouse", "ph",
				"--image", "opencode", "--storage", "10Gi",
				"--cpu-request", "250m", "--cpu-limit", "4",
				"--memory-request", "2Gi", "--memory-limit", "4Gi",
				"--ssh-key", "/k.pub",
				"--env", "A=B", "--env", "C=D",
				"--git", "https://g",
				"--copy", "src:dst",
				"--port", "80", "--port", "443:8443",
				"--proxy-group", "pg", "--exposure", "nodeport",
				"--wait-timeout", "5m", "--ephemeral",
				"--read-only=true", "--privileged=true",
				"--no-wait", "--force-install",
			},
		},
		{
			name:  "blank and whitespace-only values are not forwarded",
			input: CreateInput{Name: "demo", Playhouse: "ph", Image: "   ", EnvVars: []string{"", "  ", "A=B"}},
			want: []string{
				"playroom", "create", "demo", "--playhouse", "ph",
				"--env", "A=B", "--read-only=false", "--privileged=false",
			},
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			assertArguments(t, buildCreateArguments(testCase.input), testCase.want)
		})
	}
}

func TestBuildUpdateArguments(t *testing.T) {
	tests := []struct {
		name  string
		input UpdateInput
		want  []string
	}{
		{
			name:  "an empty update changes nothing",
			input: UpdateInput{Name: "demo", Playhouse: "ph"},
			// An untouched field must not appear at all.
			want: []string{"playroom", "update", "demo", "--playhouse", "ph"},
		},
		{
			name:  "read-only is only sent when the toggle was actually touched",
			input: UpdateInput{Name: "demo", Playhouse: "ph", ReadOnly: true},
			want:  []string{"playroom", "update", "demo", "--playhouse", "ph"},
		},
		{
			name:  "toggling read-only off sends it explicitly",
			input: UpdateInput{Name: "demo", Playhouse: "ph", ChangeReadOnly: true, ReadOnly: false},
			want:  []string{"playroom", "update", "demo", "--playhouse", "ph", "--read-only=false"},
		},
		{
			name:  "clearing every port sends the literal none",
			input: UpdateInput{Name: "demo", Playhouse: "ph", ChangePorts: true, Ports: nil},
			want:  []string{"playroom", "update", "demo", "--playhouse", "ph", "--port", "none"},
		},
		{
			name:  "a port list of only blanks also means none",
			input: UpdateInput{Name: "demo", Playhouse: "ph", ChangePorts: true, Ports: []string{"", "  "}},
			want:  []string{"playroom", "update", "demo", "--playhouse", "ph", "--port", "none"},
		},
		{
			name:  "replacing ports lists each one",
			input: UpdateInput{Name: "demo", Playhouse: "ph", ChangePorts: true, Ports: []string{"80", "443:8443"}},
			want:  []string{"playroom", "update", "demo", "--playhouse", "ph", "--port", "80", "--port", "443:8443"},
		},
		{
			name: "every field set",
			input: UpdateInput{
				Name: "demo", Playhouse: "ph", Image: "claude-code",
				CPURequest: "250m", CPULimit: "4", MemRequest: "2Gi", MemLimit: "4Gi",
				ChangeReadOnly: true, ReadOnly: true, ChangePorts: true, Ports: []string{"80"},
				Force: true, NoWait: true, WaitTimeout: "5m", ForceInstall: true,
			},
			want: []string{
				"playroom", "update", "demo", "--playhouse", "ph",
				"--image", "claude-code", "--cpu-request", "250m", "--cpu-limit", "4",
				"--memory-request", "2Gi", "--memory-limit", "4Gi",
				"--read-only=true", "--port", "80",
				"--wait-timeout", "5m", "--force", "--no-wait", "--force-install",
			},
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			assertArguments(t, buildUpdateArguments(testCase.input), testCase.want)
		})
	}
}

func TestBuildLifecycleArguments(t *testing.T) {
	t.Run("delete always skips the prompt", func(t *testing.T) {
		// Re-prompting into a pipe would hang forever.
		assertArguments(t, buildDeleteArguments(DeleteInput{Name: "demo", Playhouse: "ph"}),
			[]string{"playroom", "delete", "demo", "--playhouse", "ph", "--yes"})
	})

	t.Run("delete with every field set", func(t *testing.T) {
		assertArguments(t, buildDeleteArguments(DeleteInput{
			Name: "demo", Playhouse: "ph", Force: true, NoWait: true,
			WaitTimeout: "5m", ForceInstall: true,
		}), []string{
			"playroom", "delete", "demo", "--playhouse", "ph", "--yes",
			"--wait-timeout", "5m", "--force", "--no-wait", "--force-install",
		})
	})

	t.Run("start with every field set", func(t *testing.T) {
		assertArguments(t, buildStartArguments(StartInput{
			Name: "demo", Playhouse: "ph", Force: true, NoWait: true,
			WaitTimeout: "5m", ForceInstall: true,
		}), []string{
			"playroom", "start", "demo", "--playhouse", "ph",
			"--wait-timeout", "5m", "--force", "--no-wait", "--force-install",
		})
	})

	t.Run("stop with every field set", func(t *testing.T) {
		assertArguments(t, buildStopArguments(StopInput{
			Name: "demo", Playhouse: "ph", Force: true, ForceInstall: true,
		}), []string{"playroom", "stop", "demo", "--playhouse", "ph", "--force", "--force-install"})
	})
}

func TestBuildListArguments(t *testing.T) {
	t.Run("always asks for json", func(t *testing.T) {
		assertArguments(t, buildListArguments(ListInput{Playhouse: "ph"}),
			[]string{"playroom", "list", "--playhouse", "ph", "-o", "json"})
	})

	t.Run("mine filters server-side", func(t *testing.T) {
		assertArguments(t, buildListArguments(ListInput{Playhouse: "ph", Mine: true, ForceInstall: true}),
			[]string{"playroom", "list", "--playhouse", "ph", "-o", "json", "--mine", "--force-install"})
	})
}

func TestBuildOpenAndConnectArguments(t *testing.T) {
	t.Run("open with every field set", func(t *testing.T) {
		assertArguments(t, buildOpenArguments(OpenInput{Name: "demo", Playhouse: "ph", Editor: "vscode", Tunnel: true}),
			[]string{"playroom", "open", "demo", "--playhouse", "ph", "--editor", "vscode", "--tunnel"})
	})

	t.Run("connect always states forward-agent", func(t *testing.T) {
		// forward-agent can default to true, so an off toggle must be explicit.
		assertArguments(t, buildConnectArguments(ConnectInput{Name: "demo", Playhouse: "ph"}),
			[]string{"playroom", "connect", "demo", "--playhouse", "ph", "--forward-agent=false"})
	})

	t.Run("connect with every field set", func(t *testing.T) {
		assertArguments(t, buildConnectArguments(ConnectInput{
			Name: "demo", Playhouse: "ph", User: "playroom",
			ForwardAgent: true, Tunnel: true, ForceInstall: true, Terminal: "iterm",
		}), []string{
			"playroom", "connect", "demo", "--playhouse", "ph", "--user", "playroom",
			"--forward-agent=true", "--tunnel", "--force-install",
		})
	})

	t.Run("the chosen terminal is not a CLI flag", func(t *testing.T) {
		// acloud has no terminal flag and must never be handed one.
		got := buildConnectArguments(ConnectInput{Name: "demo", Playhouse: "ph", Terminal: "ghostty"})
		if slices.Contains(got, "ghostty") {
			t.Errorf("buildConnectArguments() = %q, must not leak the terminal choice into the command", got)
		}
	})
}

func TestPreviewMatchesWhatWouldRun(t *testing.T) {
	input := CreateInput{Name: "demo", Playhouse: "ph", Image: "opencode"}

	preview := PreviewCreate(input)
	executed := buildCreateArguments(input)

	if len(preview) != len(executed)+1 || preview[0] != "acloud" {
		t.Fatalf("PreviewCreate() = %q, want the arguments prefixed with acloud", preview)
	}
	if !slices.Equal(preview[1:], executed) {
		t.Errorf("preview arguments = %q, executed arguments = %q — these must never differ", preview[1:], executed)
	}
}

func assertArguments(t *testing.T, got, want []string) {
	t.Helper()
	if !slices.Equal(got, want) {
		t.Errorf("arguments mismatch\n got: %s\nwant: %s", strings.Join(got, " "), strings.Join(want, " "))
	}
}
