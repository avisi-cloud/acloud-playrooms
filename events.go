//go:build gui

package gui

import (
	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/avisi-cloud/acloud-playrooms/backend/cli"
)

// emitCommandEventToFrontend forwards command events through Wails.
func emitCommandEventToFrontend(event cli.Event) {
	app := application.Get()
	if app == nil {
		return
	}
	app.Event.EmitEvent(&application.CustomEvent{
		Name: string(event.Type),
		Data: event,
	})
}
