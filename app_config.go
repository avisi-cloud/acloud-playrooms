//go:build gui

package gui

import (
	"github.com/avisi-cloud/acloud-playrooms/backend/config"
)

// Scope switches update the shared CLI configuration; the frontend then reloads.

func (app *App) ListOrganisations() ([]config.OrganisationEntry, error) {
	operationContext, cancel := app.createReadContext()
	defer cancel()
	return config.ListOrganisations(operationContext)
}

func (app *App) GetCurrentOrganisation() (string, error) {
	operationContext, cancel := app.createReadContext()
	defer cancel()
	return config.CurrentOrganisation(operationContext)
}

func (app *App) SwitchOrganisation(operationID, slug string) error {
	return config.UseOrganisation(app.commandContext(), operationID, slug)
}

func (app *App) ListContexts() ([]config.ContextEntry, error) {
	operationContext, cancel := app.createReadContext()
	defer cancel()
	return config.ListContexts(operationContext)
}

func (app *App) GetCurrentContext() (string, error) {
	operationContext, cancel := app.createReadContext()
	defer cancel()
	return config.CurrentContext(operationContext)
}

func (app *App) SwitchContext(operationID, name string) error {
	return config.UseContext(app.commandContext(), operationID, name)
}
