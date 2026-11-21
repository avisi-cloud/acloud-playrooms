//go:build gui

package gui

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/avisi-cloud/acloud-playrooms/backend/local"
	"github.com/avisi-cloud/acloud-playrooms/backend/playroom"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/services/notifications"
)

type schedulePreferences struct {
	Settings    local.ScheduleSettings
	KeepRunning []string
}
type appSchedule struct {
	once        sync.Once
	mutex       sync.Mutex
	run         sync.Mutex
	scheduler   *local.Scheduler
	preferences schedulePreferences
	path        string
	loadError   error
	playhouse   string
	scope       string
}

func (app *App) initSchedule() {
	app.schedule.once.Do(func() {
		app.schedule.scheduler = local.NewScheduler(time.Now)
		app.schedule.preferences.Settings = local.DefaultScheduleSettings()
		dir, err := os.UserConfigDir()
		if err != nil {
			app.schedule.loadError = err
			return
		}
		app.schedule.path = filepath.Join(dir, "acloud", "gui-schedule.json")
		data, err := os.ReadFile(app.schedule.path)
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			app.schedule.loadError = err
			return
		}
		if err == nil {
			if err = json.Unmarshal(data, &app.schedule.preferences); err != nil {
				app.schedule.loadError = err
				return
			}
			if err = app.schedule.preferences.Settings.Validate(); err != nil {
				app.schedule.loadError = err
				return
			}
		}
		app.schedule.scheduler.Configure(app.schedule.preferences.Settings)
		for _, key := range app.schedule.preferences.KeepRunning {
			app.schedule.scheduler.KeepRunning(key, true)
		}
	})
}
func (app *App) GetScheduleSettings() (local.ScheduleSettings, error) {
	app.initSchedule()
	return app.schedule.scheduler.Settings(), app.schedule.loadError
}
func (app *App) SetScheduleSettings(settings local.ScheduleSettings) error {
	if err := settings.Validate(); err != nil {
		return err
	}
	app.initSchedule()
	app.schedule.run.Lock()
	defer app.schedule.run.Unlock()
	app.schedule.mutex.Lock()
	defer app.schedule.mutex.Unlock()
	next := app.schedule.preferences
	next.Settings = settings
	if err := app.saveSchedule(next); err != nil {
		return err
	}
	app.schedule.scheduler.Configure(settings)
	return nil
}
func (app *App) saveSchedule(preferences schedulePreferences) error {
	if app.schedule.loadError != nil {
		return fmt.Errorf("could not load evening stop settings: %w", app.schedule.loadError)
	}
	data, err := json.Marshal(preferences)
	if err != nil {
		return err
	}
	if err = os.MkdirAll(filepath.Dir(app.schedule.path), 0700); err != nil {
		return err
	}
	temporary, err := os.CreateTemp(filepath.Dir(app.schedule.path), "gui-schedule-*")
	if err != nil {
		return err
	}
	defer os.Remove(temporary.Name())
	if _, err = temporary.Write(data); err != nil {
		_ = temporary.Close()
		return err
	}
	if err = temporary.Close(); err != nil {
		return err
	}
	if err = os.Rename(temporary.Name(), app.schedule.path); err != nil {
		return err
	}
	app.schedule.preferences = preferences
	return nil
}
func (app *App) scheduleScope() (string, error) {
	context, err := app.GetCurrentContext()
	if err != nil {
		return "", err
	}
	organisation, err := app.GetCurrentOrganisation()
	if err != nil {
		return "", err
	}
	user, err := local.CurrentUser()
	if err != nil {
		return "", err
	}
	encoded, _ := json.Marshal([]string{context, organisation, user})
	return string(encoded), nil
}
func scheduleRoomKey(scope, playhouse, name string) string {
	encoded, _ := json.Marshal([]string{scope, playhouse, name})
	return string(encoded)
}
func (app *App) GetRoomKeepRunning(playhouse, name string) (bool, error) {
	app.initSchedule()
	scope, err := app.scheduleScope()
	if err != nil {
		return false, err
	}
	key := scheduleRoomKey(scope, playhouse, name)
	app.schedule.mutex.Lock()
	defer app.schedule.mutex.Unlock()
	for _, kept := range app.schedule.preferences.KeepRunning {
		if kept == key {
			return true, nil
		}
	}
	return false, app.schedule.loadError
}
func (app *App) SetRoomKeepRunning(playhouse, name string, keepRunning bool) error {
	app.initSchedule()
	scope, err := app.scheduleScope()
	if err != nil {
		return err
	}
	key := scheduleRoomKey(scope, playhouse, name)
	app.schedule.mutex.Lock()
	defer app.schedule.mutex.Unlock()
	next := schedulePreferences{Settings: app.schedule.preferences.Settings, KeepRunning: []string{}}
	for _, kept := range app.schedule.preferences.KeepRunning {
		if kept != key {
			next.KeepRunning = append(next.KeepRunning, kept)
		}
	}
	if keepRunning {
		next.KeepRunning = append(next.KeepRunning, key)
	}
	if err = app.saveSchedule(next); err != nil {
		return err
	}
	app.schedule.scheduler.KeepRunning(key, keepRunning)
	return nil
}
func (app *App) recordScheduleConnection(playhouse, name string) {
	app.initSchedule()
	scope, err := app.scheduleScope()
	if err != nil {
		log.Printf("Could not remember app connection: %v", err)
		return
	}
	app.schedule.scheduler.Connected(scheduleRoomKey(scope, playhouse, name))
}
func (app *App) scheduleRooms(playhouse string) ([]local.ScheduleRoom, error) {
	scope, err := app.scheduleScope()
	if err != nil {
		return nil, err
	}
	user, err := local.CurrentUser()
	if err != nil {
		return nil, err
	}
	rooms, err := app.ListPlayrooms(playroom.ListInput{Playhouse: playhouse, Mine: true})
	if err != nil {
		return nil, err
	}
	after, err := app.scheduleScope()
	if err != nil {
		return nil, err
	}
	if scope != after {
		return nil, fmt.Errorf("scope changed while checking scheduled rooms")
	}
	result := []local.ScheduleRoom{}
	for _, room := range rooms {
		if room.Owner == user && room.Status == "Ready" {
			result = append(result, local.ScheduleRoom{Key: scheduleRoomKey(scope, playhouse, room.Name), Name: room.Name, Playhouse: playhouse})
		}
	}
	return result, nil
}
func (app *App) runSchedule() {
	app.initSchedule()
	if app.schedule.loadError != nil {
		log.Printf("Evening stop disabled because settings could not be loaded: %v", app.schedule.loadError)
		return
	}
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-app.commandContext().Done():
			return
		case <-ticker.C:
			app.schedule.run.Lock()
			playhouse := app.schedule.playhouse
			if playhouse != "" {
				rooms, err := app.scheduleRooms(playhouse)
				if len(rooms) > 0 && rooms[0].Key != scheduleRoomKey(app.schedule.scope, playhouse, rooms[0].Name) {
					err = fmt.Errorf("scope changed since the playhouse was selected")
				}
				if err != nil {
					log.Printf("Could not check evening stop: %v", err)
				} else {
					for _, event := range app.schedule.scheduler.Tick(rooms) {
						if event.Kind == local.ScheduleDue {
							app.stopScheduledRooms(event.Rooms, true)
						} else {
							app.sendScheduleNotification(event)
						}
					}
				}
			}
			app.schedule.run.Unlock()
		}
	}
}
func (app *App) stopScheduledRooms(rooms []local.ScheduleRoom, respectKeepRunning bool) {
	for _, target := range rooms {
		if target.Playhouse != app.schedule.playhouse {
			continue
		}
		current, err := app.scheduleRooms(target.Playhouse)
		if err != nil {
			log.Printf("Could not check room before evening stop: %v", err)
			continue
		}
		for _, room := range current {
			if room.Key != target.Key {
				continue
			}
			kept, err := app.GetRoomKeepRunning(room.Playhouse, room.Name)
			if err != nil || (respectKeepRunning && kept) {
				continue
			}
			if err = app.StopPlayroom("schedule-"+rand.Text(), playroom.StopInput{Name: room.Name, Playhouse: room.Playhouse}); err != nil {
				log.Printf("Evening stop failed: %v", err)
			}
		}
	}
}
func (app *App) RunScheduleAction(id string, action local.ScheduleAction) {
	app.initSchedule()
	app.schedule.run.Lock()
	defer app.schedule.run.Unlock()
	rooms := app.schedule.scheduler.Act(id, action)
	app.stopScheduledRooms(rooms, false)
}

type scheduleNotifier interface {
	RegisterNotificationCategory(notifications.NotificationCategory) error
	SendNotificationWithActions(notifications.NotificationOptions) error
}

func (app *App) sendScheduleNotification(event local.ScheduleEvent) {
	if native := application.Get(); native != nil {
		native.Event.EmitEvent(&application.CustomEvent{Name: "schedule:notice", Data: event})
	}
	app.notificationLock.Lock()
	defer app.notificationLock.Unlock()
	notifier, ok := app.notifications.(scheduleNotifier)
	if !ok {
		return
	}
	allowed, err := app.notifications.CheckNotificationAuthorization()
	if err == nil && !allowed && !app.notificationPermissionAsked {
		app.notificationPermissionAsked = true
		allowed, err = app.notifications.RequestNotificationAuthorization()
	}
	if err != nil || !allowed {
		log.Printf("Schedule notification unavailable: allowed=%t error=%v", allowed, err)
		return
	}
	category := notifications.NotificationCategory{ID: "schedule-stop", Actions: []notifications.NotificationAction{{ID: string(local.ScheduleStop), Title: "Stop"}}}
	if event.Kind == local.ScheduleWarning {
		category = notifications.NotificationCategory{ID: "schedule-warning", Actions: []notifications.NotificationAction{{ID: string(local.ScheduleSnooze), Title: "Snooze 1 hour"}, {ID: string(local.ScheduleKeepTonight), Title: "Keep running tonight"}}}
	}
	if err = notifier.RegisterNotificationCategory(category); err == nil {
		err = notifier.SendNotificationWithActions(notifications.NotificationOptions{ID: event.ID, Title: event.Title, CategoryID: category.ID})
	}
	if err != nil {
		log.Printf("Could not send schedule notification: %v", err)
	}
}

func (app *App) GetScheduleNotices() []local.ScheduleEvent {
	app.initSchedule()
	return app.schedule.scheduler.Notices()
}

// SetSchedulePlayhouse retains the visible selection across webview reloads.
func (app *App) SetSchedulePlayhouse(playhouse string) error {
	app.initSchedule()
	app.schedule.run.Lock()
	defer app.schedule.run.Unlock()
	if playhouse == "" {
		app.schedule.playhouse = ""
		app.schedule.scope = ""
		return nil
	}
	scope, err := app.scheduleScope()
	if err != nil {
		return err
	}
	app.schedule.playhouse = playhouse
	app.schedule.scope = scope
	return nil
}
