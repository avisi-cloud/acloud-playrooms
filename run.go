//go:build gui

package gui

import (
	"embed"

	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/avisi-cloud/acloud-playrooms/backend/local"
)

//go:embed all:frontend/dist
var assets embed.FS

// The runtime icon, also used when launching without an app bundle.
//
//go:embed build/appicon.png
var appIcon []byte

// RunDesktopApplication blocks until the app exits and must run on the main goroutine.
func RunDesktopApplication() error {
	app := application.New(application.Options{
		Name:        "Acloud Playrooms",
		Description: "Acloud Playrooms",
		Icon:        appIcon,
		Services: []application.Service{
			application.NewService(&App{}),
		},
		Assets: application.AssetOptions{
			Handler: application.BundledAssetFileServer(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

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
