package local

import (
	"strings"
	"testing"
)

func TestIsVersionNewerThan(t *testing.T) {
	for _, test := range []struct {
		name, candidate, reference string
		expected                   bool
	}{
		{"a later patch is newer", "0.28.1", "0.28.0", true},
		{"a later minor is newer", "0.29.0", "0.28.9", true},
		{"a later major is newer", "1.0.0", "0.99.99", true},
		{"the same version is not newer", "0.28.0", "0.28.0", false},
		{"an earlier version is not newer", "0.27.9", "0.28.0", false},
		{"a tag prefix is accepted", "v0.29.0", "0.28.0", true},
		{"surrounding space is accepted", " 0.29.0 ", "0.28.0", true},
		{"a pre-release of the verified version is not newer", "0.28.0-rc1", "0.28.0", false},
		{"a development build says nothing", "0.29.0+dev", "0.28.0", true},
		{"an empty version says nothing", "", "0.28.0", false},
		{"an unreadable version says nothing", "dirty", "0.28.0", false},
		{"a two-part version says nothing", "0.29", "0.28.0", false},
		{"a non-numeric part says nothing", "0.x.0", "0.28.0", false},
	} {
		t.Run(test.name, func(t *testing.T) {
			if actual := isVersionNewerThan(test.candidate, test.reference); actual != test.expected {
				t.Fatalf("isVersionNewerThan(%q, %q) = %v, want %v",
					test.candidate, test.reference, actual, test.expected)
			}
		})
	}
}

// A typo in this constant would silently disable the warning for every user.
func TestVerifiedAgainstAcloudVersionIsReadable(t *testing.T) {
	if _, readable := releaseNumbers(VerifiedAgainstAcloudVersion); !readable {
		t.Fatalf("VerifiedAgainstAcloudVersion = %q, which is not a readable version",
			VerifiedAgainstAcloudVersion)
	}
}

// A typo here would silently disable the too-old notice for every user.
func TestMinimumAcloudVersionIsReadable(t *testing.T) {
	if _, readable := releaseNumbers(MinimumAcloudVersion); !readable {
		t.Fatalf("MinimumAcloudVersion = %q, which is not a readable version", MinimumAcloudVersion)
	}
}

func TestDescribeAcloudCompatibility(t *testing.T) {
	for _, test := range []struct {
		name, running   string
		older, newer    bool
		explanationNeed string
	}{
		{"an acloud from before playhouse update is too old", "0.37.0", true, false, "needs acloud " + MinimumAcloudVersion},
		{"an acloud from before NodePort SSH is too old", "0.38.0", true, false, "needs acloud " + MinimumAcloudVersion},
		{"acloud 0.39 is supported without a warning", "0.39.0", false, false, ""},
		{"the next acloud release still warns softly", "0.40.0", false, true, "checked against acloud " + VerifiedAgainstAcloudVersion},
		{"a newer acloud than verified warns softly", "99.0.0", false, true, "checked against acloud " + VerifiedAgainstAcloudVersion},
		{"an unreadable version stays quiet", "dirty", false, false, ""},
		{"no version stays quiet", "", false, false, ""},
	} {
		t.Run(test.name, func(t *testing.T) {
			compatibility := describeAcloudCompatibility(test.running)
			if compatibility.RunningVersionIsOlderThanMinimum != test.older {
				t.Errorf("older than minimum = %v, want %v", compatibility.RunningVersionIsOlderThanMinimum, test.older)
			}
			if compatibility.RunningVersionIsNewerThanVerified != test.newer {
				t.Errorf("newer than verified = %v, want %v", compatibility.RunningVersionIsNewerThanVerified, test.newer)
			}
			if !strings.Contains(compatibility.Explanation, test.explanationNeed) {
				t.Errorf("explanation = %q, want it to contain %q", compatibility.Explanation, test.explanationNeed)
			}
			if test.explanationNeed == "" && compatibility.Explanation != "" {
				t.Errorf("explanation = %q, want none", compatibility.Explanation)
			}
		})
	}
}

// The minimum supported release must also have been verified.
func TestTheMinimumVersionIsSupportedWithoutAWarning(t *testing.T) {
	compatibility := describeAcloudCompatibility(MinimumAcloudVersion)
	if compatibility.RunningVersionIsOlderThanMinimum || compatibility.RunningVersionIsNewerThanVerified || compatibility.Explanation != "" {
		t.Fatalf("the minimum supported acloud release warned: %+v", compatibility)
	}
}

// An unstamped build is the normal case in development and must not warn.
func TestCompatibilityStaysQuietForAnUnstampedBuild(t *testing.T) {
	compatibility := DescribeAcloudCompatibility()
	if compatibility.RunningVersion != "" {
		t.Skipf("this build reports acloud %q, so there is nothing to assert",
			compatibility.RunningVersion)
	}
	if compatibility.RunningVersionIsNewerThanVerified || compatibility.RunningVersionIsOlderThanMinimum || compatibility.Explanation != "" {
		t.Fatalf("an unstamped build warned: %+v", compatibility)
	}
}
