package tools

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
)

type T3CodePathStatus struct {
	Path           string
	Source         BinarySource
	Found          bool
	Version        string
	Message        string
	ConfiguredPath string
	IsApplication  bool
}

var t3CodeApplications = []string{
	"/Applications/T3 Code (Beta).app",
	"/Applications/T3 Code.app",
	"/Applications/T3 Code (Alpha).app",
}

var t3CodeCommandDirectories = []string{"/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin"}
var t3CodeVersionPattern = regexp.MustCompile(`^v?[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$`)

func t3CodeStorePath() string {
	directory, err := os.UserConfigDir()
	if err != nil {
		return ""
	}
	return filepath.Join(directory, "acloud", "gui-t3-code-path")
}

func resolveT3CodePath() T3CodePathStatus {
	status := T3CodePathStatus{Source: SourceNone}
	store := t3CodeStorePath()
	if store == "" {
		status.Message = "Cannot locate the app configuration directory for T3 Code."
		return status
	}
	configured, err := os.ReadFile(store)
	if err == nil {
		status.Path = strings.TrimSpace(string(configured))
		status.ConfiguredPath = status.Path
		status.Source = SourceConfigured
		if status.Path == "" {
			status.Message = "The saved T3 Code path is empty; choose a path or find it automatically."
		}
		return status
	}
	if !errors.Is(err, os.ErrNotExist) {
		status.Source = SourceConfigured
		status.Message = fmt.Sprintf("Could not read the saved T3 Code path: %v", err)
		return status
	}
	applications := append([]string(nil), t3CodeApplications...)
	if homeDirectory, err := os.UserHomeDir(); err == nil {
		for _, application := range t3CodeApplications {
			applications = append(applications, filepath.Join(homeDirectory, "Applications", filepath.Base(application)))
		}
	}
	for _, application := range applications {
		if info, err := os.Stat(application); err == nil && info.IsDir() {
			status.Path, status.Source = application, SourceKnownLocation
			return status
		}
	}
	if command, err := exec.LookPath("t3"); err == nil {
		status.Path, status.Source = command, SourcePath
		return status
	}
	directories := append([]string(nil), t3CodeCommandDirectories...)
	if homeDirectory, err := os.UserHomeDir(); err == nil {
		directories = append(directories, filepath.Join(homeDirectory, ".local", "bin"))
	}
	for _, directory := range directories {
		command := filepath.Join(directory, "t3")
		if info, err := os.Stat(command); err == nil && !info.IsDir() && info.Mode().Perm()&0o111 != 0 {
			status.Path, status.Source = command, SourceKnownLocation
			return status
		}
	}
	status.Message = "T3 Code is optional. Choose its app or t3 command path if you want to remember it."
	return status
}

// App metadata is checked without launching the desktop application.
func checkT3CodePath(status T3CodePathStatus) T3CodePathStatus {
	if status.Path == "" {
		return status
	}
	info, err := os.Stat(status.Path)
	if err != nil {
		status.Message = fmt.Sprintf("Cannot use %s: %v", status.Path, err)
		return status
	}
	if info.IsDir() {
		if runtime.GOOS != "darwin" || !strings.EqualFold(filepath.Ext(status.Path), ".app") {
			status.Message = "Choose the T3 Code .app or the executable t3 command, not a folder."
			return status
		}
		return checkT3CodeApplication(status)
	}
	resolvedPath, err := filepath.EvalSymlinks(status.Path)
	if err != nil {
		status.Message = fmt.Sprintf("Cannot resolve the T3 Code path: %v", err)
		return status
	}
	if strings.Contains(filepath.ToSlash(resolvedPath), ".app/Contents/MacOS/") {
		status.Message = "Choose the T3 Code .app itself, not its internal desktop executable."
		return status
	}
	if info.Mode().Perm()&0o111 == 0 {
		status.Message = "This file is not executable; choose the T3 Code app or t3 command."
		return status
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	output, err := exec.CommandContext(ctx, status.Path, "--version").CombinedOutput()
	if err != nil {
		status.Message = fmt.Sprintf("T3 Code could not report its version: %v", err)
		return status
	}
	version := strings.TrimSpace(string(output))
	for _, prefix := range []string{"t3 ", "t3code ", "t3-code ", "T3 Code "} {
		version = strings.TrimPrefix(version, prefix)
	}
	if !t3CodeVersionPattern.MatchString(version) {
		status.Message = "This executable did not report a T3 Code version."
		return status
	}
	status.Found, status.Version = true, strings.TrimPrefix(version, "v")
	status.Message = "Found the T3 Code command. It is not used by this app yet."
	return status
}

func checkT3CodeApplication(status T3CodePathStatus) T3CodePathStatus {
	metadataPath := filepath.Join(status.Path, "Contents", "Info.plist")
	var metadata struct {
		identifier string
		executable string
		version    string
	}
	for _, field := range []struct {
		key         string
		destination *string
	}{
		{"CFBundleIdentifier", &metadata.identifier},
		{"CFBundleExecutable", &metadata.executable},
		{"CFBundleShortVersionString", &metadata.version},
	} {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		output, err := exec.CommandContext(ctx, "/usr/libexec/PlistBuddy", "-c", "Print :"+field.key, metadataPath).CombinedOutput()
		cancel()
		if err != nil {
			status.Message = "Cannot read the T3 Code app metadata; choose a complete application."
			return status
		}
		*field.destination = strings.TrimSpace(string(output))
	}
	if metadata.identifier != "com.t3tools.t3code" {
		status.Message = "This application is not T3 Code."
		return status
	}
	if metadata.executable == "" || filepath.Base(metadata.executable) != metadata.executable {
		status.Message = "The T3 Code app has an invalid executable name."
		return status
	}
	executable := filepath.Join(status.Path, "Contents", "MacOS", metadata.executable)
	info, err := os.Stat(executable)
	if err != nil || info.IsDir() || info.Mode().Perm()&0o111 == 0 {
		status.Message = "The T3 Code app executable is missing or cannot run."
		return status
	}
	if !t3CodeVersionPattern.MatchString(metadata.version) {
		status.Message = "The T3 Code app did not report a readable version."
		return status
	}
	status.Found, status.IsApplication, status.Version = true, true, metadata.version
	status.Message = "Found the T3 Code app. It is not launched by this app yet."
	return status
}

func DescribeT3CodePath() T3CodePathStatus {
	return checkT3CodePath(resolveT3CodePath())
}

func SaveT3CodePath(applicationPath string) error {
	applicationPath = strings.TrimSpace(applicationPath)
	if applicationPath == "" || strings.ContainsAny(applicationPath, "\r\n") {
		return errors.New("enter the full path to the T3 Code app or t3 command")
	}
	if strings.HasPrefix(applicationPath, "~/") {
		homeDirectory, err := os.UserHomeDir()
		if err != nil {
			return fmt.Errorf("expand the T3 Code path: %w", err)
		}
		applicationPath = filepath.Join(homeDirectory, strings.TrimPrefix(applicationPath, "~/"))
	}
	absolutePath, err := filepath.Abs(applicationPath)
	if err != nil {
		return fmt.Errorf("resolve the T3 Code path: %w", err)
	}
	status := checkT3CodePath(T3CodePathStatus{Path: absolutePath})
	if !status.Found {
		return errors.New(status.Message)
	}
	store := t3CodeStorePath()
	if store == "" {
		return errors.New("cannot remember the T3 Code path without an app configuration directory")
	}
	if err := os.MkdirAll(filepath.Dir(store), 0o700); err != nil {
		return fmt.Errorf("prepare the T3 Code preference directory: %w", err)
	}
	return writeToolFile(store, absolutePath+"\n", 0o600)
}

func ClearT3CodePath() error {
	store := t3CodeStorePath()
	if store == "" {
		return errors.New("cannot locate the app configuration directory")
	}
	if err := os.Remove(store); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func SuggestedT3CodeBrowseDirectory() string {
	if status := resolveT3CodePath(); status.Path != "" {
		return filepath.Dir(status.Path)
	}
	return ""
}
