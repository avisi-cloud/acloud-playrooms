//go:build gui

package gui

import (
	"github.com/avisi-cloud/acloud-playrooms/backend/tools"
	"github.com/wailsapp/wails/v3/pkg/application"
)

func (app *App) GetT3CodePathStatus() tools.T3CodePathStatus {
	return tools.DescribeT3CodePath()
}

func (app *App) SetT3CodePath(path string) error {
	return tools.SaveT3CodePath(path)
}

func (app *App) ClearT3CodePath() error {
	return tools.ClearT3CodePath()
}

func (app *App) BrowseForT3CodePath() (string, error) {
	dialog := application.Get().Dialog.OpenFile().SetTitle("Choose T3 Code").
		CanChooseFiles(true).CanChooseDirectories(false).ShowHiddenFiles(true).ResolvesAliases(true)
	if directory := tools.SuggestedT3CodeBrowseDirectory(); directory != "" {
		dialog = dialog.SetDirectory(directory)
	}
	return dialog.PromptForSingleSelection()
}
