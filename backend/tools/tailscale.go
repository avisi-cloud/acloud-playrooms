package tools

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type BinarySource string

const (
	SourceConfigured    BinarySource = "configured"
	SourcePath          BinarySource = "path"
	SourceKnownLocation BinarySource = "known-location"
	SourceNone          BinarySource = "none"
)

type TailscaleBinaryStatus struct {
	Path           string
	Source         BinarySource
	Found          bool
	Version        string
	Message        string
	ConfiguredPath string
}

var tailscaleDirectories = []string{"/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin"}

const tailscaleCheckTimeout = 2 * time.Second

func tailscaleStorePath() string {
	directory, err := os.UserConfigDir()
	if err != nil {
		return ""
	}
	return filepath.Join(directory, "acloud", "gui-tailscale-binary")
}

func tailscaleLauncherDirectory() string {
	return filepath.Join(filepath.Dir(tailscaleStorePath()), "gui-tools")
}

func resolveTailscaleBinary() TailscaleBinaryStatus {
	status := TailscaleBinaryStatus{Source: SourceNone}
	store := tailscaleStorePath()
	if store == "" {
		status.Message = "Cannot locate the app configuration directory for Tailscale."
		return status
	}
	configured, err := os.ReadFile(store)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		status.Source = SourceConfigured
		status.Message = fmt.Sprintf("Could not read the saved Tailscale path: %v", err)
		return status
	}
	if err == nil {
		status.Source = SourceConfigured
		status.ConfiguredPath = strings.TrimSpace(string(configured))
		status.Path = status.ConfiguredPath
		if status.Path == "" {
			status.Message = "The saved Tailscale path is empty; choose a path or find it automatically."
		}
		return status
	}
	if found, lookupErr := exec.LookPath("tailscale"); lookupErr == nil {
		status.Path, status.Source = found, SourcePath
		return status
	}
	for _, directory := range tailscaleDirectories {
		candidate := filepath.Join(directory, "tailscale")
		info, statErr := os.Stat(candidate)
		if statErr == nil && !info.IsDir() && info.Mode().Perm()&0o111 != 0 {
			status.Path, status.Source = candidate, SourceKnownLocation
			return status
		}
	}
	status.Message = "Cannot find the Tailscale command. Choose its path or install the Tailscale CLI."
	return status
}

func checkTailscaleBinary(status TailscaleBinaryStatus) TailscaleBinaryStatus {
	if status.Path == "" {
		return status
	}
	info, err := os.Stat(status.Path)
	if err != nil {
		status.Message = fmt.Sprintf("Cannot use %s: %v", status.Path, err)
		return status
	}
	if info.IsDir() || info.Mode().Perm()&0o111 == 0 {
		status.Message = fmt.Sprintf("%s is not an executable file; choose the Tailscale binary.", status.Path)
		return status
	}
	ctx, cancel := context.WithTimeout(context.Background(), tailscaleCheckTimeout)
	defer cancel()
	output, err := exec.CommandContext(ctx, status.Path, "version").CombinedOutput()
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		status.Message = "The Tailscale version check timed out."
		return status
	}
	if err != nil {
		status.Message = fmt.Sprintf("Tailscale could not run version: %s (%v)", strings.TrimSpace(string(output)), err)
		return status
	}
	versionFields := strings.Fields(string(output))
	if len(versionFields) == 0 || !isTailscaleVersion(versionFields[0]) {
		status.Message = "This executable did not report a Tailscale version."
		return status
	}
	status.Found = true
	status.Version = strings.TrimPrefix(versionFields[0], "v")
	status.Message = "Using Tailscale at " + status.Path
	return status
}

func isTailscaleVersion(version string) bool {
	version, _, _ = strings.Cut(strings.TrimPrefix(version, "v"), "-")
	parts := strings.Split(version, ".")
	if len(parts) != 3 {
		return false
	}
	for _, part := range parts {
		if part == "" || strings.IndexFunc(part, func(character rune) bool { return character < '0' || character > '9' }) >= 0 {
			return false
		}
	}
	return true
}

func DescribeTailscaleBinary() TailscaleBinaryStatus {
	status := checkTailscaleBinary(resolveTailscaleBinary())
	if status.Found && status.Source == SourceConfigured {
		if err := ValidateTailscaleCommandEnvironment(); err != nil {
			status.Found = false
			status.Message = err.Error()
		}
	}
	return status
}

func SaveTailscaleBinary(binaryPath string) error {
	binaryPath = strings.TrimSpace(binaryPath)
	if binaryPath == "" || strings.ContainsAny(binaryPath, "\r\n") {
		return errors.New("enter the full path to the Tailscale binary")
	}
	if strings.HasPrefix(binaryPath, "~/") {
		homeDirectory, err := os.UserHomeDir()
		if err != nil {
			return fmt.Errorf("expand the Tailscale path: %w", err)
		}
		binaryPath = filepath.Join(homeDirectory, strings.TrimPrefix(binaryPath, "~/"))
	}
	absolutePath, err := filepath.Abs(binaryPath)
	if err != nil {
		return fmt.Errorf("resolve the Tailscale path: %w", err)
	}
	status := checkTailscaleBinary(TailscaleBinaryStatus{Path: absolutePath})
	if !status.Found {
		return errors.New(status.Message)
	}
	store := tailscaleStorePath()
	if store == "" {
		return errors.New("cannot remember the Tailscale path without an app configuration directory")
	}
	if err := os.MkdirAll(tailscaleLauncherDirectory(), 0o700); err != nil {
		return fmt.Errorf("prepare the Tailscale command directory: %w", err)
	}
	// The launcher preserves the chosen executable even when its filename is not tailscale.
	script := "#!/bin/sh\nIFS= read -r tailscale_binary < " + quoteShellArgument(store) + " || { printf '%s\\n' 'Cannot read the saved Tailscale path.' >&2; exit 127; }\nexec \"$tailscale_binary\" \"$@\"\n"
	if err := writeToolFile(filepath.Join(tailscaleLauncherDirectory(), "tailscale"), script, 0o700); err != nil {
		return err
	}
	return writeToolFile(store, absolutePath+"\n", 0o600)
}

func writeToolFile(destination, contents string, permissions os.FileMode) error {
	file, err := os.CreateTemp(filepath.Dir(destination), ".tool-path-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if _, err := file.WriteString(contents); err != nil {
		file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	if err := os.Chmod(file.Name(), permissions); err != nil {
		return err
	}
	return os.Rename(file.Name(), destination)
}

func ClearTailscaleBinary() error {
	store := tailscaleStorePath()
	if store == "" {
		return errors.New("cannot locate the app configuration directory")
	}
	if err := os.Remove(store); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func ValidateTailscaleCommandEnvironment() error {
	if tailscaleStorePath() == "" {
		return errors.New("cannot locate the app configuration directory for Tailscale")
	}
	status := resolveTailscaleBinary()
	if status.Source != SourceConfigured {
		return nil
	}
	if status.ConfiguredPath == "" {
		return errors.New(status.Message)
	}
	launcher := filepath.Join(tailscaleLauncherDirectory(), "tailscale")
	info, err := os.Stat(launcher)
	if err != nil || info.IsDir() || info.Mode().Perm()&0o111 == 0 {
		return errors.New("the saved Tailscale launcher is unavailable; save the Tailscale path again in Settings")
	}
	return nil
}

func TailscaleCommandDirectory() string {
	status := resolveTailscaleBinary()
	if status.Source == SourceConfigured {
		return tailscaleLauncherDirectory()
	}
	if status.Path != "" {
		return filepath.Dir(status.Path)
	}
	return ""
}

func ConfigureCommandEnvironment(command *exec.Cmd) error {
	if err := ValidateTailscaleCommandEnvironment(); err != nil {
		return err
	}
	directory := TailscaleCommandDirectory()
	if directory == "" {
		return nil
	}
	environment := command.Environ()
	for index, entry := range environment {
		if searchPath, found := strings.CutPrefix(entry, "PATH="); found {
			environment[index] = "PATH=" + directory + string(os.PathListSeparator) + searchPath
			command.Env = environment
			return nil
		}
	}
	command.Env = append(environment, "PATH="+directory)
	return nil
}

func TerminalCommand(line string) string {
	if directory := TailscaleCommandDirectory(); directory != "" {
		return "env PATH=" + quoteShellArgument(directory) + ":\"$PATH\" " + line
	}
	return line
}

func SuggestedTailscaleBrowseDirectory() string {
	if status := resolveTailscaleBinary(); status.Path != "" {
		return filepath.Dir(status.Path)
	}
	for _, directory := range tailscaleDirectories {
		if info, err := os.Stat(directory); err == nil && info.IsDir() {
			return directory
		}
	}
	return ""
}

func quoteShellArgument(argument string) string {
	return "'" + strings.ReplaceAll(argument, "'", "'\\''") + "'"
}
