//go:build gui

package gui

import "github.com/avisi-cloud/acloud-playrooms/backend/local"

func (app *App) CheckUpdates(checkApp bool) local.UpdateStatus {
	return local.CheckUpdates(app.commandContext(), app.appVersion, checkApp)
}
