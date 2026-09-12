package playhouse

import (
	"slices"
	"strings"
	"testing"
)

func TestBuildCreateArguments(t *testing.T) {
	tests := []struct {
		name  string
		input CreateInput
		want  []string
	}{
		{
			name:  "an empty input lets the command infer everything it can",
			input: CreateInput{Name: "playhouse-demo"},
			// The command infers these when the organisation offers one of each.
			want: []string{"playhouse", "create", "playhouse-demo", "--yes"},
		},
		{
			name: "every field set",
			input: CreateInput{
				Name: "playhouse-demo", CloudAccount: "acc", Region: "eu-west-1",
				Environment: "env", MaintenanceScheduleIdentity: "sched",
				NodeType: "n1", SystemNodeType: "n2", PlayroomNodeType: "n3",
				PrivilegedNodeType: "n4", NodeCount: 1, MaxPlayroomNodes: 3,
				MaxPrivilegedNodes: 2, Exposure: "tailscale",
				TailscaleOAuthClientID: "id", TailscaleOAuthClientSecret: "secret",
				WaitTimeout: "20m", NoDefault: true, UpdateChannel: "stable",
			},
			want: []string{
				"playhouse", "create", "playhouse-demo",
				"--cloud-account", "acc", "--region", "eu-west-1", "--environment", "env",
				"--update-channel", "stable",
				"--maintenance-schedule-identity", "sched",
				"--node-type", "n1", "--system-node-type", "n2",
				"--playroom-node-type", "n3", "--privileged-node-type", "n4",
				"--node-count", "1", "--max-playroom-nodes", "3", "--max-privileged-nodes", "2",
				"--exposure", "tailscale",
				"--tailscale-oauth-client-id", "id", "--tailscale-oauth-client-secret", "secret",
				"--wait-timeout", "20m", "--no-default", "--yes",
			},
		},
		{
			name:  "a pinned version drops the update channel",
			input: CreateInput{Name: "playhouse-demo", Version: "1.2.3", UpdateChannel: "stable"},
			// The command rejects both at once, so an explicit version wins.
			want: []string{"playhouse", "create", "playhouse-demo", "--version", "1.2.3", "--yes"},
		},
		{
			name:  "without a version the update channel is forwarded",
			input: CreateInput{Name: "playhouse-demo", UpdateChannel: "stable"},
			want:  []string{"playhouse", "create", "playhouse-demo", "--update-channel", "stable", "--yes"},
		},
		{
			name:  "zero node counts are left to the command",
			input: CreateInput{Name: "playhouse-demo", NodeCount: 0, MaxPlayroomNodes: 0, MaxPrivilegedNodes: 0},
			want:  []string{"playhouse", "create", "playhouse-demo", "--yes"},
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			assertArguments(t, buildCreateArguments(testCase.input), testCase.want)
		})
	}
}

func TestBuildDeleteArguments(t *testing.T) {
	t.Run("always skips the prompt", func(t *testing.T) {
		// The GUI has already required the name to be typed in full.
		assertArguments(t, buildDeleteArguments(DeleteInput{Name: "playhouse-demo"}),
			[]string{"playhouse", "delete", "playhouse-demo", "--yes"})
	})

	t.Run("every field set", func(t *testing.T) {
		assertArguments(t, buildDeleteArguments(DeleteInput{
			Name: "playhouse-demo", Force: true, NoWait: true, WaitTimeout: "5m",
		}), []string{
			"playhouse", "delete", "playhouse-demo", "--yes",
			"--wait-timeout", "5m", "--force", "--no-wait",
		})
	})
}

func TestBuildListArguments(t *testing.T) {
	assertArguments(t, buildListArguments(), []string{"playhouse", "list", "-o", "json"})
}

func assertArguments(t *testing.T, got, want []string) {
	t.Helper()
	if !slices.Equal(got, want) {
		t.Fatalf("arguments = %s, want %s", strings.Join(got, " "), strings.Join(want, " "))
	}
}
