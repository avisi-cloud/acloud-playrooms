//go:build gui

package gui

import (
	"errors"
	"testing"

	"github.com/wailsapp/wails/v3/pkg/services/notifications"
)

type fakeDesktopNotifier struct {
	allowed  bool
	grant    bool
	requests int
	sent     []notifications.NotificationOptions
	failure  error
}

func (n *fakeDesktopNotifier) CheckNotificationAuthorization() (bool, error) {
	return n.allowed, n.failure
}
func (n *fakeDesktopNotifier) RequestNotificationAuthorization() (bool, error) {
	n.requests++
	n.allowed = n.grant
	return n.allowed, nil
}
func (n *fakeDesktopNotifier) SendNotification(options notifications.NotificationOptions) error {
	n.sent = append(n.sent, options)
	return nil
}

type fakeDesktopDock struct {
	badge   string
	failure error
}

func (d *fakeDesktopDock) SetBadge(label string) error { d.badge = label; return d.failure }
func (d *fakeDesktopDock) RemoveBadge() error          { d.badge = ""; return d.failure }

func TestDesktopNotificationPermissionIsLazyAndAskedOnce(t *testing.T) {
	for _, grant := range []bool{true, false} {
		t.Run(map[bool]string{true: "granted", false: "denied"}[grant], func(t *testing.T) {
			notifier := &fakeDesktopNotifier{grant: grant}
			app := &App{notifications: notifier}
			if notifier.requests != 0 {
				t.Fatal("permission was requested before sending")
			}
			for range 2 {
				err := app.SendDesktopNotification("demo is ready", "target")
				if (err == nil) != grant {
					t.Fatalf("grant=%v: %v", grant, err)
				}
			}
			if notifier.requests != 1 {
				t.Fatalf("requested permission %d times", notifier.requests)
			}
			if grant && (len(notifier.sent) != 2 || notifier.sent[0].ID != "target" || notifier.sent[0].Title != "demo is ready") {
				t.Fatalf("notifications: %+v", notifier.sent)
			}
		})
	}
}

func TestDesktopNotificationAuthorizationErrorsAreReturned(t *testing.T) {
	failure := errors.New("authorization unavailable")
	app := &App{notifications: &fakeDesktopNotifier{failure: failure}}
	if !errors.Is(app.SendDesktopNotification("demo", "target"), failure) {
		t.Fatal("authorization error was lost")
	}
}

func TestDockBadgeSetsAndClearsTheCount(t *testing.T) {
	dock := &fakeDesktopDock{}
	app := &App{dock: dock}
	if err := app.SetDockBadge(3); err != nil || dock.badge != "3" {
		t.Fatalf("badge=%q error=%v", dock.badge, err)
	}
	if err := app.SetDockBadge(0); err != nil || dock.badge != "" {
		t.Fatalf("badge=%q error=%v", dock.badge, err)
	}
	if err := app.SetDockBadge(-1); err == nil {
		t.Fatal("accepted a negative count")
	}
	dock.failure = errors.New("badge unavailable")
	if err := app.SetDockBadge(1); !errors.Is(err, dock.failure) {
		t.Fatal("badge error was lost")
	}
}
