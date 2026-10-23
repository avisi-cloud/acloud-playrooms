//go:build gui

package gui

import (
	"github.com/avisi-cloud/acloud-playrooms/backend/tools"
	"github.com/wailsapp/wails/v3/pkg/application"
)

func (app *App) GetTailscaleBinaryStatus() tools.TailscaleBinaryStatus {
	return tools.DescribeTailscaleBinary()
}

func (app *App) SetTailscaleBinary(path string) error {
	return tools.SaveTailscaleBinary(path)
}

func (app *App) ClearTailscaleBinary() error {
	return tools.ClearTailscaleBinary()
}

func (app *App) BrowseForTailscaleBinary() (string, error) {
	dialog := application.Get().Dialog.OpenFile().SetTitle("Choose the Tailscale binary").
		CanChooseFiles(true).CanChooseDirectories(false).ShowHiddenFiles(true).ResolvesAliases(true)
	if directory := tools.SuggestedTailscaleBrowseDirectory(); directory != "" {
		dialog = dialog.SetDirectory(directory)
	}
	return dialog.PromptForSingleSelection()
}
