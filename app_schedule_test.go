//go:build gui

package gui

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/avisi-cloud/acloud-playrooms/backend/cli"
	"github.com/avisi-cloud/acloud-playrooms/backend/local"
	"github.com/wailsapp/wails/v3/pkg/services/notifications"
)

func scheduleTestApp(t *testing.T) *App {
	t.Helper()
	directory := t.TempDir()
	t.Setenv("HOME", directory)
	t.Setenv("XDG_CONFIG_HOME", directory)
	config := filepath.Join(directory, "config.yaml")
	if err := os.WriteFile(config, []byte("current-context: development\ncontexts:\n - name: development\n   context: {user: demo-user}\nusers:\n - name: demo-user\n   user: {}\n"), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("ACLOUDCONFIG", config)
	command := filepath.Join(directory, "acloud")
	script := `#!/bin/sh
case "$1 $2" in
 'config current-context') echo development ;;
 'config current-organisation') echo platform ;;
 'playroom list') echo '[{"Name":"demo","Owner":"demo-user","Status":"Ready"},{"Name":"other","Owner":"other-user","Status":"Ready"},{"Name":"stopped","Owner":"demo-user","Status":"Stopped"},{"Name":"unknown","Owner":"demo-user","Status":"Hibernating"}]' ;;
 'playroom stop') echo "$*" >> "$SCHEDULE_STOP_LOG" ;;
 'version ') echo 'Version: 0.40.0' ;;
 *) exit 2 ;;
esac
`
	if err := os.WriteFile(command, []byte(script), 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("ACLOUD_BINARY", command)
	t.Setenv("SCHEDULE_STOP_LOG", filepath.Join(directory, "stops"))
	if err := cli.ClearConfiguredBinary(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = cli.ClearConfiguredBinary() })
	return &App{}
}
func TestSchedulePreferencesAndOptOutPersistLocally(t *testing.T) {
	app := scheduleTestApp(t)
	settings, err := app.GetScheduleSettings()
	if err != nil || settings.Enabled || settings.IdleHours != 4 {
		t.Fatalf("defaults=%+v error=%v", settings, err)
	}
	settings.Enabled = true
	settings.Time = "21:30"
	if err = app.SetScheduleSettings(settings); err != nil {
		t.Fatal(err)
	}
	if err = app.SetRoomKeepRunning("playhouse-platform-dev", "demo", true); err != nil {
		t.Fatal(err)
	}
	reopened := &App{}
	saved, err := reopened.GetScheduleSettings()
	if err != nil || saved != settings {
		t.Fatalf("saved=%+v error=%v", saved, err)
	}
	kept, err := reopened.GetRoomKeepRunning("playhouse-platform-dev", "demo")
	if err != nil || !kept {
		t.Fatalf("keep=%v error=%v", kept, err)
	}
	if kept, _ = reopened.GetRoomKeepRunning("playhouse-platform-shared", "demo"); kept {
		t.Fatal("opt-out leaked across playhouses")
	}
	if err = reopened.SetRoomKeepRunning("playhouse-platform-dev", "demo", false); err != nil {
		t.Fatal(err)
	}
	kept, _ = reopened.GetRoomKeepRunning("playhouse-platform-dev", "demo")
	if kept {
		t.Fatal("opt-out not removed")
	}
}
func TestScheduledStopRechecksOwnershipAndUsesExistingCommandPath(t *testing.T) {
	app := scheduleTestApp(t)
	if err := app.SetSchedulePlayhouse("playhouse-platform-dev"); err != nil {
		t.Fatal(err)
	}
	rooms, err := app.scheduleRooms("playhouse-platform-dev")
	if err != nil || len(rooms) != 1 {
		t.Fatalf("rooms=%+v error=%v", rooms, err)
	}
	targets := append(rooms, local.ScheduleRoom{Key: "stale scope", Name: "demo", Playhouse: "playhouse-platform-dev"}, local.ScheduleRoom{Key: "other", Name: "other", Playhouse: "playhouse-platform-dev"})
	app.stopScheduledRooms(targets, true)
	data, err := os.ReadFile(os.Getenv("SCHEDULE_STOP_LOG"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Count(string(data), "playroom stop") != 1 || !strings.Contains(string(data), "--playhouse playhouse-platform-dev") {
		t.Fatalf("commands: %s", data)
	}
	if err = app.SetRoomKeepRunning("playhouse-platform-dev", "demo", true); err != nil {
		t.Fatal(err)
	}
	app.stopScheduledRooms(rooms, true)
	data, _ = os.ReadFile(os.Getenv("SCHEDULE_STOP_LOG"))
	if strings.Count(string(data), "playroom stop") != 1 {
		t.Fatal("ignored opt-out")
	}
}

type scheduleTestNotifier struct {
	fakeDesktopNotifier
	categories []notifications.NotificationCategory
}

func (notifier *scheduleTestNotifier) RegisterNotificationCategory(category notifications.NotificationCategory) error {
	notifier.categories = append(notifier.categories, category)
	return nil
}
func (notifier *scheduleTestNotifier) SendNotificationWithActions(options notifications.NotificationOptions) error {
	return notifier.SendNotification(options)
}
func TestScheduleNotificationsHaveNativeActions(t *testing.T) {
	notifier := &scheduleTestNotifier{fakeDesktopNotifier: fakeDesktopNotifier{grant: true}}
	app := &App{notifications: notifier}
	for _, kind := range []local.ScheduleKind{local.ScheduleWarning, local.ScheduleMissed, local.ScheduleIdle} {
		app.sendScheduleNotification(local.ScheduleEvent{ID: "schedule:test", Kind: kind, Title: "Reminder"})
	}
	if notifier.requests != 1 || len(notifier.sent) != 3 {
		t.Fatalf("notifications=%+v", notifier)
	}
	if notifier.categories[0].Actions[0].Title != "Snooze 1 hour" || notifier.categories[0].Actions[1].Title != "Keep running tonight" || notifier.categories[1].Actions[0].Title != "Stop" {
		t.Fatal("missing native actions")
	}
}
func TestScheduleBadPreferencesRefuseChanges(t *testing.T) {
	app := scheduleTestApp(t)
	app.initSchedule()
	if err := os.WriteFile(app.schedule.path, []byte("broken"), 0600); err != nil {
		if err = os.MkdirAll(filepath.Dir(app.schedule.path), 0700); err != nil {
			t.Fatal(err)
		}
		if err = os.WriteFile(app.schedule.path, []byte("broken"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	reopened := &App{}
	if _, err := reopened.GetScheduleSettings(); err == nil {
		t.Fatal("hid invalid preferences")
	}
	if err := reopened.SetScheduleSettings(local.DefaultScheduleSettings()); err == nil {
		t.Fatal("overwrote unreadable preferences")
	}
}
func TestScheduleClockSurvivesFrontendSettingsReads(t *testing.T) {
	app := scheduleTestApp(t)
	app.initSchedule()
	scheduler := app.schedule.scheduler
	scheduler.Connected("demo")
	_, _ = app.GetScheduleSettings()
	if scheduler != app.schedule.scheduler {
		t.Fatal("settings read replaced scheduler")
	}
}
