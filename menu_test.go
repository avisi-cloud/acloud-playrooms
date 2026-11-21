//go:build gui

package gui

import (
	"github.com/wailsapp/wails/v3/pkg/application"
	"testing"
)

func TestViewMenuRefreshesDataInsteadOfReloadingWebview(t *testing.T) {
	menu := application.NewMenu()
	addViewMenu(menu, func(menuAction) {})
	defer menu.Destroy()
	for _, label := range []string{"Refresh", "Focus Search", "Theme", "Light", "Dark", "System"} {
		if menu.FindByLabel(label) == nil {
			t.Errorf("missing menu item %q", label)
		}
	}
	if menu.FindByLabel("Refresh").GetAccelerator() != "Cmd+R" {
		t.Fatal("Refresh must override the native reload accelerator")
	}
	if menu.FindByRole(application.Reload) != nil {
		t.Fatal("View must not reload the webview")
	}
}
