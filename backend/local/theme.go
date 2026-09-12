package local

import (
	"os"
	"path/filepath"
	"strings"
)

// The theme the GUI last rendered, remembered on disk: Go has to pick the
// native window background before any JavaScript runs. Not in ~/.acloud.yaml.

const (
	themeDark  = "dark"
	themeLight = "light"
)

// themePath returns the file the GUI theme is remembered in, or "" when the
// platform gives us nowhere to put it.
func themePath() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		return ""
	}
	return filepath.Join(dir, "acloud", "gui-theme")
}

// CachedTheme returns the theme the GUI last rendered, defaulting to dark —
// which is also the frontend's default when it has no cache of its own.
func CachedTheme() string {
	path := themePath()
	if path == "" {
		return themeDark
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return themeDark
	}
	if strings.TrimSpace(string(raw)) == themeLight {
		return themeLight
	}
	return themeDark
}

// SetCachedTheme records the theme for the next launch. Failures are ignored;
// the worst case is one launch on the wrong background.
func SetCachedTheme(theme string) {
	if theme != themeLight {
		theme = themeDark
	}
	path := themePath()
	if path == "" {
		return
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return
	}
	_ = os.WriteFile(path, []byte(theme+"\n"), 0o644)
}
