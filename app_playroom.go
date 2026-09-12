//go:build gui

package gui

import "github.com/avisi-cloud/acloud-playrooms/backend/playroom"

func (app *App) ListPlayrooms(input playroom.ListInput) ([]playroom.Listing, error) {
	operationContext, cancel := app.createReadContext()
	defer cancel()
	return playroom.List(operationContext, input)
}

func (app *App) CreatePlayroom(operationID string, input playroom.CreateInput) error {
	return playroom.Create(app.commandContext(), operationID, input)
}

func (app *App) UpdatePlayroom(operationID string, input playroom.UpdateInput) error {
	return playroom.Update(app.commandContext(), operationID, input)
}

func (app *App) DeletePlayroom(operationID string, input playroom.DeleteInput) error {
	return playroom.Delete(app.commandContext(), operationID, input)
}

func (app *App) StartPlayroom(operationID string, input playroom.StartInput) error {
	return playroom.Start(app.commandContext(), operationID, input)
}

func (app *App) StopPlayroom(operationID string, input playroom.StopInput) error {
	return playroom.Stop(app.commandContext(), operationID, input)
}

func (app *App) OpenPlayroomInEditor(operationID string, input playroom.OpenInput) error {
	return playroom.Open(app.commandContext(), operationID, input)
}

// ConnectPlayroom opens an external terminal, so it has no cancellable operation.
func (app *App) ConnectPlayroom(input playroom.ConnectInput) error {
	return playroom.Connect(input)
}

func (app *App) GetPlayroomDefaults() ([]playroom.DefaultEntry, error) {
	operationContext, cancel := app.createReadContext()
	defer cancel()
	return playroom.Defaults(operationContext)
}

func (app *App) SetPlayroomDefault(operationID, key, value string) error {
	return playroom.SetDefault(app.commandContext(), operationID, key, value)
}

func (app *App) UnsetPlayroomDefault(operationID, key string) error {
	return playroom.UnsetDefault(app.commandContext(), operationID, key)
}

func (app *App) UnsetAllPlayroomDefaults(operationID string) error {
	return playroom.UnsetAllDefaults(app.commandContext(), operationID)
}

func (app *App) PreviewCreatePlayroom(input playroom.CreateInput) []string {
	return playroom.PreviewCreate(input)
}

func (app *App) PreviewUpdatePlayroom(input playroom.UpdateInput) []string {
	return playroom.PreviewUpdate(input)
}

func (app *App) PreviewDeletePlayroom(input playroom.DeleteInput) []string {
	return playroom.PreviewDelete(input)
}

func (app *App) PreviewOpenPlayroomInEditor(input playroom.OpenInput) []string {
	return playroom.PreviewOpen(input)
}

func (app *App) PreviewConnectPlayroom(input playroom.ConnectInput) []string {
	return playroom.PreviewConnect(input)
}
