package local

import "testing"

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

// An unstamped build is the normal case in development and must not warn.
func TestCompatibilityStaysQuietForAnUnstampedBuild(t *testing.T) {
	compatibility := DescribeAcloudCompatibility()
	if compatibility.RunningVersion != "" {
		t.Skipf("this build reports acloud %q, so there is nothing to assert",
			compatibility.RunningVersion)
	}
	if compatibility.RunningVersionIsNewerThanVerified || compatibility.Explanation != "" {
		t.Fatalf("an unstamped build warned: %+v", compatibility)
	}
}
