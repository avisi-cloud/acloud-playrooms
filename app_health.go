//go:build gui

package gui

import "github.com/avisi-cloud/acloud-playrooms/backend/local"

// CheckHealth runs the health check screen's read-only checks.
func (app *App) CheckHealth(input local.HealthCheckInput) []local.HealthCheck {
	return local.CheckHealth(app.commandContext(), input)
}
