package local

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/avisi-cloud/acloud-playrooms/backend/cli"
)

const latestReleaseAPI = "https://api.github.com/repos/avisi-cloud/acloud-playrooms/releases/latest"

// UpdateStatus contains only versions reported as newer by their release source.
type UpdateStatus struct {
	AppVersion    string
	AcloudVersion string
}

type updateCache struct {
	AppCheckedAt  time.Time
	BrewCheckedAt time.Time
	AppVersion    string
	AcloudVersion string
}

type updateChecker struct {
	mutex  sync.Mutex
	cache  updateCache
	loaded bool
	path   string
	client *http.Client
	now    func() time.Time
	brew   func(context.Context) string
}

var updates = updateChecker{
	client: &http.Client{Timeout: 5 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }},
	now:    time.Now,
	brew:   checkHomebrewUpdate,
}

// CheckUpdates caches attempts, including failures, so offline launches stay quiet for a day.
func CheckUpdates(ctx context.Context, appVersion string, checkApp bool) UpdateStatus {
	updates.mutex.Lock()
	defer updates.mutex.Unlock()
	if !updates.loaded {
		directory, err := os.UserCacheDir()
		if err != nil {
			log.Print("Version check cache unavailable; using session cache")
		} else {
			updates.path = filepath.Join(directory, "acloud-playrooms", "updates.json")
		}
	}
	return updates.check(ctx, appVersion, checkApp)
}

func (checker *updateChecker) check(ctx context.Context, appVersion string, checkApp bool) UpdateStatus {
	if !checker.loaded {
		checker.loaded = true
		raw, err := os.ReadFile(checker.path)
		if err == nil {
			if err := json.Unmarshal(raw, &checker.cache); err != nil {
				log.Print("Version check cache unreadable; checking releases again")
			}
		} else if !os.IsNotExist(err) {
			log.Print("Version check cache unavailable; using session cache")
		}
	}
	now := checker.now()
	changed := false
	if checkApp && (checker.cache.AppCheckedAt.IsZero() || now.Sub(checker.cache.AppCheckedAt) >= 24*time.Hour) {
		checker.cache.AppCheckedAt = now
		checker.cache.AppVersion = checker.latestRelease(ctx)
		changed = true
	}
	if checker.cache.BrewCheckedAt.IsZero() || now.Sub(checker.cache.BrewCheckedAt) >= 24*time.Hour {
		checker.cache.BrewCheckedAt = now
		checker.cache.AcloudVersion = checker.brew(ctx)
		changed = true
	}
	if changed && checker.path != "" {
		raw, err := json.Marshal(checker.cache)
		if err == nil {
			err = os.MkdirAll(filepath.Dir(checker.path), 0o700)
		}
		if err == nil {
			err = os.WriteFile(checker.path, raw, 0o600)
		}
		if err != nil {
			log.Print("Version check cache could not be saved; using session cache")
		}
	}
	status := UpdateStatus{AcloudVersion: checker.cache.AcloudVersion}
	if checkApp && isUpdateVersionNewer(checker.cache.AppVersion, appVersion) {
		status.AppVersion = checker.cache.AppVersion
	}
	return status
}

func (checker *updateChecker) latestRelease(ctx context.Context) string {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, latestReleaseAPI, nil)
	if err != nil {
		return ""
	}
	request.Header.Set("User-Agent", "desktop-version-check")
	request.Header.Set("Accept", "application/vnd.github+json")
	response, err := checker.client.Do(request)
	if err != nil {
		log.Print("App version check failed; waiting a day before retrying")
		return ""
	}
	defer response.Body.Close()
	var release struct {
		TagName    string `json:"tag_name"`
		Draft      bool   `json:"draft"`
		Prerelease bool   `json:"prerelease"`
	}
	if response.StatusCode != http.StatusOK {
		log.Print("App version check failed; waiting a day before retrying")
		return ""
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&release); err != nil || release.Draft || release.Prerelease || !isUpdateVersionReadable(release.TagName) {
		log.Print("App release was not readable; waiting a day before retrying")
		return ""
	}
	return strings.TrimPrefix(release.TagName, "v")
}

func checkHomebrewUpdate(ctx context.Context) string {
	binary := cli.DescribeBinary()
	if !binary.Found {
		return ""
	}
	resolved, err := filepath.EvalSymlinks(binary.Path)
	if err != nil || !strings.Contains(filepath.ToSlash(resolved), "/Caskroom/acloud/") {
		return ""
	}
	brew, err := exec.LookPath("brew")
	if err != nil {
		for _, candidate := range []string{"/opt/homebrew/bin/brew", "/usr/local/bin/brew"} {
			if info, err := os.Stat(candidate); err == nil && !info.IsDir() && info.Mode()&0o111 != 0 {
				brew = candidate
				break
			}
		}
	}
	if brew == "" {
		return ""
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, brew, "outdated", "--cask", "--json=v2", "avisi-cloud/tools/acloud")
	command.Env = append(os.Environ(), "HOMEBREW_NO_AUTO_UPDATE=1", "HOMEBREW_NO_ANALYTICS=1")
	output, err := command.Output()
	if err != nil {
		log.Print("Homebrew version check failed; waiting a day before retrying")
		return ""
	}
	return parseHomebrewUpdate(output)
}

func parseHomebrewUpdate(output []byte) string {
	var outdated struct {
		Casks []struct {
			Name              string   `json:"name"`
			FullToken         string   `json:"full_token"`
			InstalledVersions []string `json:"installed_versions"`
			CurrentVersion    string   `json:"current_version"`
		} `json:"casks"`
	}
	if err := json.Unmarshal(output, &outdated); err != nil {
		log.Print("Homebrew update output was not readable")
		return ""
	}
	for _, cask := range outdated.Casks {
		if cask.FullToken != "avisi-cloud/tools/acloud" && cask.Name != "acloud" {
			continue
		}
		for _, installed := range cask.InstalledVersions {
			if isUpdateVersionNewer(cask.CurrentVersion, installed) {
				return strings.TrimPrefix(cask.CurrentVersion, "v")
			}
		}
	}
	return ""
}

var updateVersionPattern = regexp.MustCompile(`^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$`)

func isUpdateVersionReadable(version string) bool {
	if !updateVersionPattern.MatchString(version) {
		return false
	}
	release, metadata, hasMetadata := strings.Cut(version, "+")
	if hasMetadata {
		for _, identifier := range strings.Split(metadata, ".") {
			if identifier == "" {
				return false
			}
		}
	}
	_, prerelease, hasPrerelease := strings.Cut(release, "-")
	if hasPrerelease {
		for _, identifier := range strings.Split(prerelease, ".") {
			if identifier == "" {
				return false
			}
			if strings.Trim(identifier, "0123456789") == "" && len(identifier) > 1 && identifier[0] == '0' {
				return false
			}
		}
	}
	return true
}

func isUpdateVersionNewer(candidate, current string) bool {
	if !isUpdateVersionReadable(candidate) || !isUpdateVersionReadable(current) {
		return false
	}
	candidateNumbers, candidateOK := releaseNumbers(candidate)
	currentNumbers, currentOK := releaseNumbers(current)
	if !candidateOK || !currentOK {
		return false
	}
	for index := range candidateNumbers {
		if candidateNumbers[index] != currentNumbers[index] {
			return candidateNumbers[index] > currentNumbers[index]
		}
	}
	candidate, _, _ = strings.Cut(candidate, "+")
	current, _, _ = strings.Cut(current, "+")
	_, candidatePre, _ := strings.Cut(candidate, "-")
	_, currentPre, _ := strings.Cut(current, "-")
	if candidatePre == currentPre {
		return false
	}
	if candidatePre == "" {
		return true
	}
	if currentPre == "" {
		return false
	}
	candidateParts, currentParts := strings.Split(candidatePre, "."), strings.Split(currentPre, ".")
	for index := 0; index < len(candidateParts) && index < len(currentParts); index++ {
		left, right := candidateParts[index], currentParts[index]
		if left == right {
			continue
		}
		leftNumeric := strings.Trim(left, "0123456789") == ""
		rightNumeric := strings.Trim(right, "0123456789") == ""
		if leftNumeric && rightNumeric && len(left) != len(right) {
			return len(left) > len(right)
		}
		if leftNumeric != rightNumeric {
			return rightNumeric
		}
		return left > right
	}
	return len(candidateParts) > len(currentParts)
}
