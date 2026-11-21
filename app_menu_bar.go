//go:build gui

package gui

import "fmt"

type desktopMenuBar interface {
	ShowRooms(MenuBarRooms)
}

// SetMenuBarRooms shows the frontend's room list, so Go never reads the list a second time.
func (app *App) SetMenuBarRooms(rooms MenuBarRooms) error {
	if err := rooms.validate(); err != nil {
		return err
	}
	if app.menuBar == nil {
		return fmt.Errorf("the menu bar is unavailable")
	}
	app.menuBar.ShowRooms(rooms)
	return nil
}

// SetKeepRunningInMenuBar is pushed by the frontend, which saves the setting.
func (app *App) SetKeepRunningInMenuBar(keepRunning bool) {
	app.keepRunningInMenuBar.Store(keepRunning)
}

// ShowMainWindow brings the window back when a menu bar action needs the user's attention.
func (app *App) ShowMainWindow() error {
	if app.showMainWindow == nil {
		return fmt.Errorf("the main window is unavailable")
	}
	app.showMainWindow()
	return nil
}
