package cli

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"time"
)

// Finding acloud is its own problem, separate from running it. A GUI launched
// from Finder does not inherit the shell's PATH: macOS gives it
// /usr/bin:/bin:/usr/sbin:/sbin, which contains neither Homebrew prefix. So an
// acloud that works perfectly in a terminal is invisible to the app, and
// exec.LookPath alone leaves the user stuck with nothing to act on. Three
// answers, in this order: the ACLOUD_BINARY environment variable (how `make
// dev-local` points at a local build), a path the user saved in the app, and a
// search of PATH plus the handful of places installers actually use.

const (
	// BinarySourceEnvironment means ACLOUD_BINARY decided it. The app cannot
	// override this, so the UI says so rather than offering an edit that the
	// environment would keep winning.
	BinarySourceEnvironment = "environment"
	// BinarySourceConfigured means the user chose this path in the app.
	BinarySourceConfigured = "configured"
	// BinarySourcePath means it came from PATH, the normal case.
	BinarySourcePath = "path"
	// BinarySourceKnownLocation means PATH missed it and a known install
	// directory had it — the usual outcome when launched from Finder.
	BinarySourceKnownLocation = "known-location"
	// BinarySourceNone means nothing was found.
	BinarySourceNone = "none"
)

// binaryVerifyTimeout bounds `acloud version` when checking a candidate. It is
// a local process printing one line; anything slower is a wrong file.
const binaryVerifyTimeout = 5 * time.Second

// BinaryStatus is everything the settings screen needs to explain the current
// state and everything the error surfaces need to offer a way out.
type BinaryStatus struct {
	// Path is the binary that will be executed, empty when none was found.
	Path string
	// Source is one of the BinarySource constants.
	Source string
	// Found reports whether Path can be executed at all.
	Found bool
	// Version is what `acloud version` reported, empty when it did not run.
	Version string
	// Message is a ready-to-show sentence; empty when there is nothing to say.
	Message string
	// ConfiguredPath is the path saved in the app, kept even when it no longer
	// works so the settings field can show what to correct.
	ConfiguredPath string
	// EnvironmentOverride reports that ACLOUD_BINARY is set, which outranks
	// ConfiguredPath. The UI disables its field and explains why.
	EnvironmentOverride bool
}

// systemBinaryDirectories are the absolute directories acloud is installed
// into. Homebrew first: the cask is how the README tells people to install, and
// its prefix is exactly what a Finder-launched app is missing. A variable
// rather than a constant so a test can search a temporary directory instead of
// whatever this machine happens to have installed.
var systemBinaryDirectories = []string{
	"/opt/homebrew/bin", // Homebrew on Apple Silicon
	"/usr/local/bin",    // Homebrew on Intel, and manual installs
	"/opt/local/bin",    // MacPorts
}

// knownBinaryDirectories are the directories searched, in this order, when PATH
// does not have acloud.
func knownBinaryDirectories() []string {
	directories := slices.Clone(systemBinaryDirectories)
	if home, err := os.UserHomeDir(); err == nil {
		directories = append(directories,
			filepath.Join(home, ".local", "bin"),
			filepath.Join(home, "bin"),
			filepath.Join(home, "go", "bin"), // go install
		)
	}
	return directories
}

// binaryStorePath returns the file the chosen binary is remembered in, or ""
// when the platform gives us nowhere to put it. It sits beside the remembered
// theme rather than in ~/.acloud.yaml: this is the app's own setting, and
// writing it into the CLI's config would make the GUI edit a file the CLI owns.
func binaryStorePath() string {
	directory, err := os.UserConfigDir()
	if err != nil {
		return ""
	}
	return filepath.Join(directory, "acloud", "gui-acloud-binary")
}

// ConfiguredBinary returns the path the user saved in the app, or "" when they
// never saved one. The file is trusted no further than its existence: it is
// re-checked on every resolve, so a binary that moves or is deleted surfaces as
// a normal "not found" the user can correct.
func ConfiguredBinary() string {
	path := binaryStorePath()
	if path == "" {
		return ""
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(raw))
}

// SaveConfiguredBinary records a binary for this and every later launch, after
// checking it actually runs. Saving an unusable path would reproduce the state
// this setting exists to escape, so the check is part of saving rather than
// advice the caller may skip.
func SaveConfiguredBinary(path string) error {
	expanded, err := expandBinaryPath(path)
	if err != nil {
		return err
	}
	if _, err := VerifyBinary(expanded); err != nil {
		return err
	}
	store := binaryStorePath()
	if store == "" {
		return errors.New("this system has no configuration directory to remember the acloud path in")
	}
	if err := os.MkdirAll(filepath.Dir(store), 0o755); err != nil {
		return fmt.Errorf("create the configuration directory: %w", err)
	}
	if err := os.WriteFile(store, []byte(expanded+"\n"), 0o644); err != nil {
		return fmt.Errorf("remember the acloud path: %w", err)
	}
	defaultRunner.forgetResolvedBinary()
	return nil
}

// ClearConfiguredBinary forgets the saved path and goes back to searching, for
// the user who set one, then installed acloud properly.
func ClearConfiguredBinary() error {
	store := binaryStorePath()
	if store == "" {
		return nil
	}
	if err := os.Remove(store); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("forget the acloud path: %w", err)
	}
	defaultRunner.forgetResolvedBinary()
	return nil
}

// expandBinaryPath turns what someone typed into a path worth checking: ~ is
// expanded, because a text field invites it and exec would treat it literally.
func expandBinaryPath(path string) (string, error) {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return "", errors.New("enter the full path to the acloud binary")
	}
	if trimmed == "~" || strings.HasPrefix(trimmed, "~/") {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("expand %q: %w", trimmed, err)
		}
		trimmed = filepath.Join(home, strings.TrimPrefix(trimmed, "~"))
	}
	return trimmed, nil
}

// VerifyBinary reports the version of the acloud at this path, or why it cannot
// be used. The checks run in the order a user would hit them, so the message
// names the actual problem instead of a generic exec failure.
func VerifyBinary(path string) (string, error) {
	info, err := os.Stat(path)
	if errors.Is(err, os.ErrNotExist) {
		return "", fmt.Errorf("no file at %s", path)
	}
	if err != nil {
		return "", fmt.Errorf("check %s: %w", path, err)
	}
	if info.IsDir() {
		return "", fmt.Errorf("%s is a folder; pick the acloud binary inside it", path)
	}
	if info.Mode().Perm()&0o111 == 0 {
		return "", fmt.Errorf("%s is not executable; run chmod +x on it", path)
	}

	ctx, cancel := context.WithTimeout(context.Background(), binaryVerifyTimeout)
	defer cancel()
	output, err := exec.CommandContext(ctx, path, "version").CombinedOutput()
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return "", fmt.Errorf("%s did not answer `version` within %s; is it the acloud binary?", path, binaryVerifyTimeout)
	}
	if err != nil {
		if detail := firstLine(string(output)); detail != "" {
			return "", fmt.Errorf("%s could not run `version`: %s", path, detail)
		}
		return "", fmt.Errorf("%s could not run `version`: %w", path, err)
	}
	version := parseVersionLine(string(output))
	if version == "" {
		return "", fmt.Errorf("%s does not look like acloud; `version` printed no version", path)
	}
	return version, nil
}

// DescribeBinary resolves acloud and explains the outcome, for the settings
// screen and for the banner shown when commands cannot run.
func DescribeBinary() BinaryStatus {
	status := BinaryStatus{
		Source:              BinarySourceNone,
		ConfiguredPath:      ConfiguredBinary(),
		EnvironmentOverride: strings.TrimSpace(os.Getenv(acloudBinaryEnv)) != "",
	}

	path, source, err := resolveBinary()
	if err != nil {
		status.Message = err.Error()
		return status
	}
	status.Path = path
	status.Source = source
	status.Found = true

	version, err := VerifyBinary(path)
	if err != nil {
		// Found but unusable is its own state: the path is worth showing, and
		// the reason is what the user has to act on.
		status.Found = false
		status.Message = err.Error()
		return status
	}
	status.Version = version
	status.Message = describeBinarySource(path, source)
	return status
}

func describeBinarySource(path, source string) string {
	switch source {
	case BinarySourceEnvironment:
		return fmt.Sprintf("Using %s from the %s environment variable.", path, acloudBinaryEnv)
	case BinarySourceConfigured:
		return fmt.Sprintf("Using %s, the path set in this app.", path)
	case BinarySourceKnownLocation:
		return fmt.Sprintf("Found %s. It is not on this app's PATH, which is normal for an app opened from Finder.", path)
	default:
		return fmt.Sprintf("Found %s on PATH.", path)
	}
}

// resolveBinary finds acloud without caching, in the order described at the top
// of this file.
func resolveBinary() (path string, source string, err error) {
	if fromEnvironment := strings.TrimSpace(os.Getenv(acloudBinaryEnv)); fromEnvironment != "" {
		return fromEnvironment, BinarySourceEnvironment, nil
	}
	if configured := ConfiguredBinary(); configured != "" {
		return configured, BinarySourceConfigured, nil
	}
	if fromPath, lookupErr := exec.LookPath("acloud"); lookupErr == nil {
		return fromPath, BinarySourcePath, nil
	}
	for _, directory := range knownBinaryDirectories() {
		candidate := filepath.Join(directory, "acloud")
		if isExecutableFile(candidate) {
			return candidate, BinarySourceKnownLocation, nil
		}
	}
	return "", BinarySourceNone, errors.New(
		"cannot find the acloud command. Install it with `brew install --cask avisi-cloud/tools/acloud`, " +
			"or set the path to it in Settings.")
}

// SuggestedBrowseDirectory is where a file picker should open: the directory of
// whatever is configured or installed now, else the first known install
// directory that exists. Opening in the user's home would start them several
// levels from any plausible answer.
func SuggestedBrowseDirectory() string {
	if path, _, err := resolveBinary(); err == nil {
		if directory := filepath.Dir(path); isDirectory(directory) {
			return directory
		}
	}
	for _, directory := range knownBinaryDirectories() {
		if isDirectory(directory) {
			return directory
		}
	}
	return ""
}

func isDirectory(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func isExecutableFile(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir() && info.Mode().Perm()&0o111 != 0
}

// parseVersionLine pulls the version out of `acloud version` output, which
// prints a header and then `Version: 0.35.0, Commit: ...`. It scans for the
// first version-shaped word rather than keying on the `Version:` label, so a
// reworded header does not read as "this is not acloud".
func parseVersionLine(output string) string {
	for _, field := range strings.Fields(output) {
		candidate := strings.TrimPrefix(strings.Trim(field, ","), "v")
		if looksLikeVersionNumber(candidate) {
			return candidate
		}
	}
	return ""
}

// looksLikeVersionNumber accepts a dotted numeric version such as 0.35.0,
// including a suffix like 1.2.0-rc1, and nothing else.
func looksLikeVersionNumber(value string) bool {
	number, _, _ := strings.Cut(value, "-")
	parts := strings.Split(number, ".")
	if len(parts) < 2 {
		return false
	}
	for _, part := range parts {
		if part == "" || strings.IndexFunc(part, func(r rune) bool { return r < '0' || r > '9' }) >= 0 {
			return false
		}
	}
	return true
}

func firstLine(output string) string {
	line, _, _ := strings.Cut(strings.TrimSpace(output), "\n")
	return strings.TrimSpace(line)
}
