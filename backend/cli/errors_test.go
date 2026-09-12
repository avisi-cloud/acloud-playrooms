package cli

import "testing"

// The GUI splits a failure into the problem and what to do about it, which only
// works if the whole message arrives in the order the command printed it.
func TestExplanationKeepsTheWholeMessageTheCLIEndedOn(t *testing.T) {
	cases := []struct {
		name   string
		stderr string
		want   string
	}{
		{
			name:   "drops progress output and cobra's prefix",
			stderr: "resolving playhouse\nchecking owner\nError: playroom \"ai-buddy\" is owned by jasper@avisi.nl, not you (sem@avisi.nl); pass --force to act on it anyway\n",
			want:   "playroom \"ai-buddy\" is owned by jasper@avisi.nl, not you (sem@avisi.nl); pass --force to act on it anyway",
		},
		{
			name:   "keeps the continuation a multi-line failure printed after itself",
			stderr: "Error: cluster did not start within timeout\n\nThis is always safe to re-run to resume where it left off:\n  acloud playhouse create demo\n",
			want:   "cluster did not start within timeout\n\nThis is always safe to re-run to resume where it left off:\n  acloud playhouse create demo",
		},
		{
			name:   "falls back to the tail when nothing marks the failure",
			stderr: "first\nsecond\nthird\nfourth\n",
			want:   "second\nthird\nfourth",
		},
		{
			name:   "reports nothing when the command said nothing",
			stderr: "\n  \n",
			want:   "",
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			if got := explanationFrom(testCase.stderr, 3); got != testCase.want {
				t.Errorf("explanationFrom() = %q, want %q", got, testCase.want)
			}
		})
	}
}
