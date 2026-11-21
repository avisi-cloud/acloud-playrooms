//go:build gui

package gui

import (
	"embed"

	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/avisi-cloud/acloud-playrooms/backend/local"
)

//go:embed all:frontend/dist
var assets embed.FS

// RunDesktopApplication blocks until the app exits and must run on the main goroutine.
func RunDesktopApplication(appVersion string) error {
	app := application.New(application.Options{
		Name:        "Acloud Playrooms",
		Description: "Acloud Playrooms",
		Services: []application.Service{
			application.NewService(&App{appVersion: appVersion}),
		},
		Assets: application.AssetOptions{
			Handler: serveAppIndexForAngularRoutes(application.BundledAssetFileServer(assets)),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	app.Menu.Set(buildApplicationMenu(func(action menuAction) {
		app.Event.EmitEvent(&application.CustomEvent{Name: "menu:action", Data: string(action)})
	}))

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "Acloud Playrooms",
		Width:            1280,
		Height:           800,
		MinWidth:         900,
		MinHeight:        650,
		BackgroundColour: windowBackgroundColour(local.CachedTheme()),
		Mac: application.MacWindow{
			TitleBar: application.MacTitleBar{
				AppearsTransparent: true,
				HideTitle:          true,
				Hide:               false,
				FullSizeContent:    true,
			},
		},
		URL: "/",
	})

	return app.Run()
}

type menuAction string

const (
	menuSettings      menuAction = "settings"
	menuNewPlayroom   menuAction = "new-playroom"
	menuRefresh       menuAction = "refresh"
	menuSearch        menuAction = "search"
	menuThemeLight    menuAction = "theme-light"
	menuThemeDark     menuAction = "theme-dark"
	menuThemeSystem   menuAction = "theme-system"
	menuPlayrooms     menuAction = "playrooms"
	menuPlayhouses    menuAction = "playhouses"
	menuDefaults      menuAction = "defaults"
	menuOverview      menuAction = "overview"
	menuDocumentation menuAction = "documentation"
	menuReportIssue   menuAction = "report-issue"
)

// buildApplicationMenu gives every app action the same frontend dispatch path.
func buildApplicationMenu(emit func(menuAction)) *application.Menu {
	menu := application.NewMenu()
	appMenu := menu.AddSubmenu("Acloud Playrooms")
	appMenu.AddRole(application.About)
	addMenuAction(appMenu, "Settings…", "Cmd+,", menuSettings, emit)
	appMenu.AddSeparator()
	appMenu.AddRole(application.Hide)
	appMenu.AddRole(application.HideOthers)
	appMenu.AddRole(application.UnHide)
	appMenu.AddSeparator()
	appMenu.AddRole(application.Quit)

	file := menu.AddSubmenu("File")
	addMenuAction(file, "New Playroom", "Cmd+N", menuNewPlayroom, emit)
	file.AddRole(application.CloseWindow)
	menu.AddRole(application.EditMenu)
	addViewMenu(menu, emit)
	goMenu := menu.AddSubmenu("Go")
	addMenuAction(goMenu, "Playrooms", "Cmd+1", menuPlayrooms, emit)
	addMenuAction(goMenu, "Playhouses", "Cmd+2", menuPlayhouses, emit)
	addMenuAction(goMenu, "Defaults", "", menuDefaults, emit)
	menu.AddRole(application.WindowMenu)
	help := menu.AddSubmenu("Help")
	addMenuAction(help, "Keyboard Shortcuts", "", menuOverview, emit)
	addMenuAction(help, "Documentation", "", menuDocumentation, emit)
	addMenuAction(help, "Report an issue", "", menuReportIssue, emit)
	return menu
}

func addMenuAction(menu *application.Menu, label, accelerator string, action menuAction, emit func(menuAction)) {
	item := menu.Add(label).OnClick(func(_ *application.Context) { emit(action) })
	if accelerator != "" {
		item.SetAccelerator(accelerator)
	}
}

func addViewMenu(menu *application.Menu, emit func(menuAction)) {
	view := menu.AddSubmenu("View")
	addMenuAction(view, "Refresh", "Cmd+R", menuRefresh, emit)
	addMenuAction(view, "Focus Search", "Cmd+F", menuSearch, emit)
	theme := view.AddSubmenu("Theme")
	addMenuAction(theme, "Light", "", menuThemeLight, emit)
	addMenuAction(theme, "Dark", "", menuThemeDark, emit)
	addMenuAction(theme, "System", "", menuThemeSystem, emit)
}
