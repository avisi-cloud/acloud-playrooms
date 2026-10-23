package local

import (
	"fmt"
	"strconv"
	"strings"
)

// VerifiedAgainstAcloudVersion records the CLI contract last checked against the screens.
const VerifiedAgainstAcloudVersion = "0.39.0"

// MinimumAcloudVersion is the oldest acloud that has every command these
// screens run: 0.39.0 added the IP allowlist, NodePort SSH and --via, and
// 0.38.0 `playhouse update`, while create stopped updating an existing playhouse.
const MinimumAcloudVersion = "0.39.0"

// AcloudCompatibility says whether the acloud the GUI is running inside is
// older than it needs, or newer than the one the GUI was verified against.
type AcloudCompatibility struct {
	// RunningVersion is the acloud build this GUI is part of, empty in a
	// development build.
	RunningVersion string
	// VerifiedVersion is VerifiedAgainstAcloudVersion, so the frontend keeps no
	// copy of its own.
	VerifiedVersion string
	// MinimumVersion is MinimumAcloudVersion, for the same reason.
	MinimumVersion                    string
	RunningVersionIsNewerThanVerified bool
	// RunningVersionIsOlderThanMinimum means some commands will fail; its
	// explanation wins over the newer-than-verified one.
	RunningVersionIsOlderThanMinimum bool
	// Explanation is a ready-to-show sentence, empty when there is nothing to say.
	Explanation string
}

// DescribeAcloudCompatibility compares the running acloud against the versions
// this GUI needs and was verified against, staying quiet when it is in between.
func DescribeAcloudCompatibility() AcloudCompatibility {
	return describeAcloudCompatibility(AcloudVersion())
}

func describeAcloudCompatibility(running string) AcloudCompatibility {
	compatibility := AcloudCompatibility{
		RunningVersion:                    running,
		VerifiedVersion:                   VerifiedAgainstAcloudVersion,
		MinimumVersion:                    MinimumAcloudVersion,
		RunningVersionIsNewerThanVerified: isVersionNewerThan(running, VerifiedAgainstAcloudVersion),
		RunningVersionIsOlderThanMinimum:  isVersionNewerThan(MinimumAcloudVersion, running),
	}
	switch {
	case compatibility.RunningVersionIsOlderThanMinimum:
		compatibility.Explanation = fmt.Sprintf(
			"This interface needs acloud %s or later, and you are running %s. "+
				"Some screens run commands your acloud does not have yet. "+
				"Upgrade it with: brew upgrade --cask acloud",
			MinimumAcloudVersion, running)
	case compatibility.RunningVersionIsNewerThanVerified:
		compatibility.Explanation = fmt.Sprintf(
			"This interface was checked against acloud %s, and you are running %s. "+
				"Anything added to the CLI since then may be missing from these screens. "+
				"Commands themselves are unaffected — they run the real acloud.",
			VerifiedAgainstAcloudVersion, running)
	}
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
