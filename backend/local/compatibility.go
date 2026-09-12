package local

import (
	"fmt"
	"strconv"
	"strings"
)

// VerifiedAgainstAcloudVersion is the acloud release whose flags and defaults
// someone last checked the screens against by hand. Raise it when you re-check.
const VerifiedAgainstAcloudVersion = "0.28.0"

// AcloudCompatibility says whether the acloud the GUI is running inside is
// newer than the one the GUI was verified against.
type AcloudCompatibility struct {
	// RunningVersion is the acloud build this GUI is part of, empty in a
	// development build.
	RunningVersion string
	// VerifiedVersion is VerifiedAgainstAcloudVersion, so the frontend keeps no
	// copy of its own.
	VerifiedVersion string
	// RunningVersionIsNewerThanVerified is the only field the UI acts on.
	RunningVersionIsNewerThanVerified bool
	// Explanation is a ready-to-show sentence, empty when there is nothing to say.
	Explanation string
}

// DescribeAcloudCompatibility compares the running acloud against the version
// this GUI was verified against, staying quiet unless the running one is newer.
func DescribeAcloudCompatibility() AcloudCompatibility {
	running := AcloudVersion()
	compatibility := AcloudCompatibility{
		RunningVersion:  running,
		VerifiedVersion: VerifiedAgainstAcloudVersion,
	}
	if !isVersionNewerThan(running, VerifiedAgainstAcloudVersion) {
		return compatibility
	}
	compatibility.RunningVersionIsNewerThanVerified = true
	compatibility.Explanation = fmt.Sprintf(
		"This interface was checked against acloud %s, and you are running %s. "+
			"Anything added to the CLI since then may be missing from these screens. "+
			"Commands themselves are unaffected — they run the real acloud.",
		VerifiedAgainstAcloudVersion, running)
	return compatibility
}

// isVersionNewerThan reports whether candidate is a strictly later release than
// reference. An unreadable version counts as not newer, so it never warns.
func isVersionNewerThan(candidate, reference string) bool {
	candidateNumbers, candidateReadable := releaseNumbers(candidate)
	referenceNumbers, referenceReadable := releaseNumbers(reference)
	if !candidateReadable || !referenceReadable {
		return false
	}
	for position := range candidateNumbers {
		if candidateNumbers[position] != referenceNumbers[position] {
			return candidateNumbers[position] > referenceNumbers[position]
		}
	}
	return false
}

// releaseNumbers splits "1.2.3" into its three numbers, reporting whether it
// could be read. A leading "v" is accepted; "-rc1" and "+dev" are dropped.
func releaseNumbers(version string) ([3]int, bool) {
	var numbers [3]int
	cleaned := strings.TrimPrefix(strings.TrimSpace(version), "v")
	if cleaned == "" {
		return numbers, false
	}
	cleaned, _, _ = strings.Cut(cleaned, "-")
	cleaned, _, _ = strings.Cut(cleaned, "+")

	parts := strings.Split(cleaned, ".")
	if len(parts) != len(numbers) {
		return numbers, false
	}
	for position, part := range parts {
		number, err := strconv.Atoi(part)
		if err != nil || number < 0 {
			return numbers, false
		}
		numbers[position] = number
	}
	return numbers, true
}
