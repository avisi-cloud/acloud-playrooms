//go:build gui

package gui

import (
	"os"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// ExportActivityLog saves only the redacted text retained by the activity log.
func (app *App) ExportActivityLog(content string) error {
	path, err := application.Get().Dialog.SaveFile().SetMessage("Export activity log").SetFilename("activity-log.txt").AddFilter("Text files", "*.txt").PromptForSingleSelection()
	if err != nil {
		return err
	}
	return saveActivityLog(path, content)
}

func saveActivityLog(path, content string) error {
	if path == "" {
		return nil
	}
	return os.WriteFile(path, []byte(content), 0600)
}
