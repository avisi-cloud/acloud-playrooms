//go:build gui

package gui

import (
	"fmt"
	"strconv"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/services/notifications"
)

type desktopNotifier interface {
	RequestNotificationAuthorization() (bool, error)
	CheckNotificationAuthorization() (bool, error)
	SendNotification(notifications.NotificationOptions) error
}

type desktopDock interface {
	SetBadge(string) error
	RemoveBadge() error
}

// SendDesktopNotification asks permission only when a background task needs to notify.
func (app *App) SendDesktopNotification(title, target string) error {
	app.notificationLock.Lock()
	defer app.notificationLock.Unlock()
	if app.notifications == nil {
		return fmt.Errorf("desktop notifications are unavailable")
	}
	if desktopWindowIsFocused() {
		return nil
	}
	allowed, err := app.notifications.CheckNotificationAuthorization()
	if err != nil {
		return err
	}
	if !allowed && !app.notificationPermissionAsked {
		app.notificationPermissionAsked = true
		allowed, err = app.notifications.RequestNotificationAuthorization()
		if err != nil {
			return err
		}
	}
	if !allowed {
		return fmt.Errorf("desktop notifications are not allowed; enable them in macOS System Settings")
	}
	if desktopWindowIsFocused() {
		return nil
	}
	return app.notifications.SendNotification(notifications.NotificationOptions{ID: target, Title: title})
}

func desktopWindowIsFocused() bool {
	nativeApp := application.Get()
	if nativeApp == nil {
		return false
	}
	window := nativeApp.Window.Current()
	return window != nil && window.IsFocused()
}

// SetDockBadge clears the native badge when no rooms match the chosen count.
func (app *App) SetDockBadge(count int) error {
	if count < 0 {
		return fmt.Errorf("Dock badge count cannot be negative")
	}
	if app.dock == nil {
		return fmt.Errorf("Dock badge is unavailable")
	}
	if count == 0 {
		return app.dock.RemoveBadge()
	}
	return app.dock.SetBadge(strconv.Itoa(count))
}
