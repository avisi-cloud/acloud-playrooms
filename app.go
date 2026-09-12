//go:build gui

package gui

import (
	"context"
	"runtime"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/avisi-cloud/acloud-playrooms/backend/auth"
	"github.com/avisi-cloud/acloud-playrooms/backend/cli"
	"github.com/avisi-cloud/acloud-playrooms/backend/local"
	"github.com/avisi-cloud/acloud-playrooms/backend/terminal"
)

// App exposes backend operations to the frontend through Wails bindings.
type App struct {
	applicationContext context.Context
}

// ServiceStartup connects command events. The standalone app reads acloud state
// through the installed CLI and local config files instead of importing acloud.
func (app *App) ServiceStartup(applicationContext context.Context, _ application.ServiceOptions) error {
	app.applicationContext = applicationContext
	cli.SetEmitter(emitCommandEventToFrontend)
	return nil
}

// CancelOperation reports whether a running command was found and cancelled.
func (app *App) CancelOperation(operationID string) bool {
	return cli.Cancel(operationID)
}

// Reads time out; state-changing commands can run until cancelled or shutdown.
const readOperationTimeout = 30 * time.Second

func (app *App) createReadContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(app.commandContext(), readOperationTimeout)
}

// commandContext follows application shutdown, with a fallback before startup.
func (app *App) commandContext() context.Context {
	if app.applicationContext == nil {
		return context.Background()
	}
	return app.applicationContext
}

func (app *App) GetAcloudVersion() string {
	return local.AcloudVersion()
}

// GetAcloudCompatibility reports whether the installed acloud is newer than the
// one this GUI was verified against, so the sidebar can say so.
func (app *App) GetAcloudCompatibility() local.AcloudCompatibility {
	return local.DescribeAcloudCompatibility()
}

// IsLoggedIn checks the credentials stored in the CLI configuration.
func (app *App) IsLoggedIn() bool {
	return local.IsLoggedIn()
}

func (app *App) GetCachedPlayhouse() string {
	return local.CachedPlayhouse()
}

func (app *App) GetCurrentUserEmail() (string, error) {
	return local.CurrentUser()
}

func (app *App) GetToolStatuses() []local.ToolStatus {
	return local.ToolStatuses()
}

// GetOperatingSystem lets the frontend account for native window controls.
func (app *App) GetOperatingSystem() string {
	return runtime.GOOS
}

// SetWindowTheme remembers the theme and matches the native window background.
func (app *App) SetWindowTheme(theme string) {
	local.SetCachedTheme(theme)
	wailsApplication := application.Get()
	if wailsApplication == nil {
		return
	}
	window := wailsApplication.Window.Current()
	if window == nil {
		return
	}
	window.SetBackgroundColour(windowBackgroundColour(theme))
}

// windowBackgroundColour matches the frontend's --win theme token.
func windowBackgroundColour(theme string) application.RGBA {
	if theme == "light" {
		return application.NewRGBA(245, 247, 250, 255) // #f5f7fa
	}
	return application.NewRGBA(0, 27, 37, 255) // #001b25
}

// LoginWithTerminal starts interactive CLI login; the frontend polls IsLoggedIn.
func (app *App) LoginWithTerminal(terminalName string) error {
	return auth.Login(terminal.Emulator(terminalName))
}

func (app *App) Logout(operationID string) error {
	return auth.Logout(app.commandContext(), operationID)
}

func (app *App) ListPlayroomImages() []local.ImageEntry {
	return local.ListImages()
}
