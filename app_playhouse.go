//go:build gui

package gui

import (
	"github.com/avisi-cloud/acloud-playrooms/backend/playhouse"
)

func (app *App) ListPlayhouses() ([]playhouse.PlayhouseEntry, error) {
	operationContext, cancel := app.createReadContext()
	defer cancel()
	return playhouse.List(operationContext)
}

func (app *App) CreatePlayhouse(operationID string, input playhouse.CreateInput) error {
	return playhouse.Create(app.commandContext(), operationID, input)
}

func (app *App) DeletePlayhouse(operationID string, input playhouse.DeleteInput) error {
	return playhouse.Delete(app.commandContext(), operationID, input)
}

// UpdatePlayhouse converges an existing playhouse. There is no
// `playhouse update`; see backend/playhouse/update.go for why this is a
// `playhouse create` re-run and which settings it can actually change.
func (app *App) UpdatePlayhouse(operationID string, input playhouse.UpdateInput) error {
	return playhouse.Update(app.commandContext(), operationID, input)
}

func (app *App) ListCloudAccounts() ([]playhouse.CloudAccountEntry, error) {
	operationContext, cancel := app.createReadContext()
	defer cancel()
	return playhouse.ListCloudAccounts(operationContext)
}

func (app *App) ListEnvironments() ([]playhouse.EnvironmentEntry, error) {
	operationContext, cancel := app.createReadContext()
	defer cancel()
	return playhouse.ListEnvironments(operationContext)
}

func (app *App) PreviewCreatePlayhouse(input playhouse.CreateInput) []string {
	return playhouse.PreviewCreate(input)
}

func (app *App) PreviewDeletePlayhouse(input playhouse.DeleteInput) []string {
	return playhouse.PreviewDelete(input)
}

func (app *App) PreviewUpdatePlayhouse(input playhouse.UpdateInput) []string {
	return playhouse.PreviewUpdate(input)
}
