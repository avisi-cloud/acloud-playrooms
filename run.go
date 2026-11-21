//go:build gui

package gui

import (
	"embed"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"github.com/wailsapp/wails/v3/pkg/services/dock"
	"github.com/wailsapp/wails/v3/pkg/services/notifications"

	"github.com/avisi-cloud/acloud-playrooms/backend/local"
)

//go:embed all:frontend/dist
var assets embed.FS

// RunDesktopApplication blocks until the app exits and must run on the main goroutine.
func RunDesktopApplication(appVersion string) error {
	notificationService := notifications.New()
	dockService := dock.New()
	appService := &App{appVersion: appVersion, notifications: notificationService, dock: dockService}
	app := application.New(application.Options{
		Name:        "Acloud Playrooms",
		Description: "Acloud Playrooms",
		Services: []application.Service{
			application.NewService(notificationService),
			application.NewService(dockService),
			application.NewService(appService),
		},
		Assets: application.AssetOptions{
			Handler: serveAppIndexForAngularRoutes(application.BundledAssetFileServer(assets)),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	emitMenuAction := func(action menuAction) {
		app.Event.EmitEvent(&application.CustomEvent{Name: "menu:action", Data: string(action)})
	}
	app.Menu.Set(buildApplicationMenu(emitMenuAction))

	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
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

	showMainWindow := func() {
		window.Show()
		window.Restore()
		window.Focus()
	}
	delivery := &deepLinkDelivery{send: func(url string) {
		app.Event.Emit("deep-link:open", url)
	}}
	app.Event.On("deep-link:ready", func(_ *application.CustomEvent) {
		delivery.frontendReady()
	})
	app.Event.OnApplicationEvent(events.Common.ApplicationLaunchedWithUrl, func(event *application.ApplicationEvent) {
		showMainWindow()
		delivery.open(event.Context().URL())
	})
	appService.showMainWindow = showMainWindow
	// Hiding keeps the Angular app running, which pushes the room list to the menu bar.
	window.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		if appService.keepRunningInMenuBar.Load() {
			event.Cancel()
			window.Hide()
		}
	})
	appService.menuBar = startMenuBar(app, func(request menuBarRequest) {
		routeMenuBarRequest(request, menuBarHandlers{
			showWindow:     showMainWindow,
			emitMenuAction: emitMenuAction,
			quit:           app.Quit,
			sendToFrontend: func(request menuBarRequest) {
				app.Event.EmitEvent(&application.CustomEvent{Name: "menu-bar:action", Data: request})
			},
		})
	})

	notificationService.OnNotificationResponse(func(result notifications.NotificationResult) {
		if result.Error != nil || result.Response.ActionIdentifier != notifications.DefaultActionIdentifier {
			return
		}
		showMainWindow()
		app.Event.EmitEvent(&application.CustomEvent{Name: "notification:clicked", Data: result.Response.ID})
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
