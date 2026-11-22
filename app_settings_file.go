//go:build gui

package gui

import (
	"fmt"
	"io"
	"os"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// maximumSettingsFileBytes is far above any real settings file, so a wrong file is refused before it is read whole.
const maximumSettingsFileBytes = 1 << 20

// ExportSettings saves the settings file the frontend built; it never contains credentials or environment values.
func (app *App) ExportSettings(content string) error {
	path, err := application.Get().Dialog.SaveFile().SetMessage("Export settings").SetFilename("acloud-playrooms-settings.json").AddFilter("JSON files", "*.json").PromptForSingleSelection()
	if err != nil {
		return err
	}
	return saveSettingsFile(path, content)
}

// ReadSettingsToImport returns the chosen file's text, or "" when the dialog was cancelled.
func (app *App) ReadSettingsToImport() (string, error) {
	path, err := application.Get().Dialog.OpenFile().SetTitle("Import settings").
		CanChooseFiles(true).CanChooseDirectories(false).AddFilter("JSON files", "*.json").PromptForSingleSelection()
	if err != nil || path == "" {
		return "", err
	}
	return readSettingsFile(path)
}

func saveSettingsFile(path, content string) error {
	if path == "" {
		return nil
	}
	return os.WriteFile(path, []byte(content), 0600)
}

func readSettingsFile(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	content, err := io.ReadAll(io.LimitReader(file, maximumSettingsFileBytes+1))
	if err != nil {
		return "", err
	}
	if len(content) > maximumSettingsFileBytes {
		return "", fmt.Errorf("this file is larger than 1 MB, so it is not a settings file from this app")
	}
	return string(content), nil
}
