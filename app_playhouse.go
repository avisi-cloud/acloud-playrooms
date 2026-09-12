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
