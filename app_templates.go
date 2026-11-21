//go:build gui

package gui

import (
	"os"
	"sync"

	"github.com/avisi-cloud/acloud-playrooms/backend/local"
	"github.com/wailsapp/wails/v3/pkg/application"
)

var playroomTemplatesLock sync.Mutex

func (app *App) GetPlayroomTemplates() ([]local.PlayroomTemplate, error) {
	playroomTemplatesLock.Lock()
	defer playroomTemplatesLock.Unlock()
	path, err := local.PlayroomTemplatesPath()
	if err != nil {
		return nil, err
	}
	return local.ReadPlayroomTemplates(path)
}

func (app *App) SavePlayroomTemplates(templates []local.PlayroomTemplate) error {
	playroomTemplatesLock.Lock()
	defer playroomTemplatesLock.Unlock()
	path, err := local.PlayroomTemplatesPath()
	if err != nil {
		return err
	}
	return local.WritePlayroomTemplates(path, templates)
}

func (app *App) ExportPlayroomTemplate(template local.PlayroomTemplate) error {
	content, err := local.EncodePlayroomTemplates([]local.PlayroomTemplate{template})
	if err != nil {
		return err
	}
	path, err := application.Get().Dialog.SaveFile().SetMessage("Export playroom template").SetFilename("playroom-template.json").AddFilter("JSON files", "*.json").PromptForSingleSelection()
	if err != nil || path == "" {
		return err
	}
	return os.WriteFile(path, content, 0600)
}

func (app *App) ImportPlayroomTemplates() ([]local.PlayroomTemplate, error) {
	path, err := application.Get().Dialog.OpenFile().SetTitle("Import playroom templates").AddFilter("JSON files", "*.json").PromptForSingleSelection()
	if err != nil {
		return nil, err
	}
	if path == "" {
		return []local.PlayroomTemplate{}, nil
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return local.DecodePlayroomTemplates(content)
}
