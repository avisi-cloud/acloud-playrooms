//go:build gui

package gui

import (
	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/avisi-cloud/acloud-playrooms/backend/cli"
)

// Everything the app does runs through the acloud binary, so when it cannot be
// found there is nothing to show and nothing to click. These bindings let the
// user point the app at acloud themselves instead of reinstalling and hoping,
// which matters most for a direct download: an app opened from Finder does not
// inherit the shell's PATH and so misses Homebrew's prefix entirely.

// GetAcloudBinaryStatus describes the binary the app will run, why, and what to
// do when there is none.
func (app *App) GetAcloudBinaryStatus() cli.BinaryStatus {
	return cli.DescribeBinary()
}

// SetAcloudBinary remembers a path for this and later launches, returning the
// resulting status so the caller can render the outcome without a second call.
// A path that does not run is rejected rather than saved.
func (app *App) SetAcloudBinary(path string) (cli.BinaryStatus, error) {
	if err := cli.SaveConfiguredBinary(path); err != nil {
		return cli.DescribeBinary(), err
	}
	return cli.DescribeBinary(), nil
}

// ClearAcloudBinary forgets the saved path and searches again, for when acloud
// has since been installed normally.
func (app *App) ClearAcloudBinary() (cli.BinaryStatus, error) {
	if err := cli.ClearConfiguredBinary(); err != nil {
		return cli.DescribeBinary(), err
	}
	return cli.DescribeBinary(), nil
}

// BrowseForAcloudBinary opens a native file picker and returns the chosen path,
// or "" when the user cancelled. Typing an absolute path into a text field is a
// poor way to find a binary in a hidden directory, and /usr/local/bin and
// /opt/homebrew/bin are both hidden in the Finder's default view.
func (app *App) BrowseForAcloudBinary() (string, error) {
	dialog := application.Get().Dialog.OpenFile().
		SetTitle("Choose the acloud binary").
		CanChooseFiles(true).
		CanChooseDirectories(false).
		ShowHiddenFiles(true).
		ResolvesAliases(true)
	if directory := cli.SuggestedBrowseDirectory(); directory != "" {
		dialog = dialog.SetDirectory(directory)
	}
	return dialog.PromptForSingleSelection()
}
