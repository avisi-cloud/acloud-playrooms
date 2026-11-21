package local

import (
	"crypto/rand"
	"fmt"
	"sync"
	"time"
)

type ScheduleDays string

const (
	ScheduleWeekdays ScheduleDays = "weekdays"
	ScheduleEveryDay ScheduleDays = "every-day"
)

type ScheduleAction string

const (
	ScheduleSnooze      ScheduleAction = "snooze"
	ScheduleKeepTonight ScheduleAction = "keep-tonight"
	ScheduleStop        ScheduleAction = "stop"
)

type ScheduleKind string

const (
	ScheduleWarning ScheduleKind = "warning"
	ScheduleMissed  ScheduleKind = "missed"
	ScheduleIdle    ScheduleKind = "idle"
	ScheduleDue     ScheduleKind = "due"
)

type ScheduleSettings struct {
	Enabled   bool
	Time      string
	Days      ScheduleDays
	IdleHours int
}

func DefaultScheduleSettings() ScheduleSettings {
	return ScheduleSettings{Time: "22:00", Days: ScheduleWeekdays, IdleHours: 4}
}
func (settings ScheduleSettings) Validate() error {
	if _, err := time.Parse("15:04", settings.Time); err != nil {
		return fmt.Errorf("choose an evening stop time in HH:MM format")
	}
	if settings.Days != ScheduleWeekdays && settings.Days != ScheduleEveryDay {
		return fmt.Errorf("choose weekdays or every day")
	}
	if settings.IdleHours < 1 || settings.IdleHours > 168 {
		return fmt.Errorf("idle reminder hours must be between 1 and 168")
	}
	return nil
}

type ScheduleRoom struct {
	Key       string
	Name      string
	Playhouse string
}
type ScheduleEvent struct {
	ID    string
	Kind  ScheduleKind
	Title string
	Rooms []ScheduleRoom
}
type scheduleObservation struct {
	Since    time.Time
	Reminded bool
}
type scheduleNotice struct {
	Event ScheduleEvent
	Date  string
}

// Scheduler uses wall time so a suspended Mac cannot turn a late tick into an automatic stop.
type Scheduler struct {
	mutex        sync.Mutex
	now          func() time.Time
	settings     ScheduleSettings
	lastTick     time.Time
	date         string
	due          time.Time
	warned       bool
	handled      bool
	observations map[string]scheduleObservation
	notices      map[string]scheduleNotice
	keepRunning  map[string]bool
}

func NewScheduler(now func() time.Time) *Scheduler {
	return &Scheduler{now: now, settings: DefaultScheduleSettings(), lastTick: now(), observations: map[string]scheduleObservation{}, notices: map[string]scheduleNotice{}, keepRunning: map[string]bool{}}
}
func (scheduler *Scheduler) Settings() ScheduleSettings {
	scheduler.mutex.Lock()
	defer scheduler.mutex.Unlock()
	return scheduler.settings
}
func (scheduler *Scheduler) Configure(settings ScheduleSettings) {
	scheduler.mutex.Lock()
	defer scheduler.mutex.Unlock()
	if settings.Enabled != scheduler.settings.Enabled || settings.Time != scheduler.settings.Time || settings.Days != scheduler.settings.Days {
		scheduler.date = ""
		scheduler.lastTick = scheduler.now()
		scheduler.notices = map[string]scheduleNotice{}
	}
	scheduler.settings = settings
}
func (scheduler *Scheduler) KeepRunning(key string, keep bool) {
	scheduler.mutex.Lock()
	defer scheduler.mutex.Unlock()
	if keep {
		scheduler.keepRunning[key] = true
	} else {
		delete(scheduler.keepRunning, key)
	}
}
func (scheduler *Scheduler) Connected(key string) {
	scheduler.mutex.Lock()
	defer scheduler.mutex.Unlock()
	scheduler.observations[key] = scheduleObservation{Since: scheduler.now()}
}
func (scheduler *Scheduler) notice(kind ScheduleKind, title string, rooms []ScheduleRoom, now time.Time) ScheduleEvent {
	event := ScheduleEvent{ID: "schedule:" + rand.Text(), Kind: kind, Title: title, Rooms: rooms}
	if kind != ScheduleDue {
		scheduler.notices[event.ID] = scheduleNotice{Event: event, Date: now.Format("2006-01-02")}
	}
	return event
}
func (scheduler *Scheduler) Tick(rooms []ScheduleRoom) []ScheduleEvent {
	scheduler.mutex.Lock()
	defer scheduler.mutex.Unlock()
	now := scheduler.now()
	previous := scheduler.lastTick
	scheduler.lastTick = now
	date := now.Format("2006-01-02")
	midnight := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	cycleDay, _ := time.ParseInLocation("2006-01-02", scheduler.date, now.Location())
	dueWeekday := cycleDay.Weekday() != time.Saturday && cycleDay.Weekday() != time.Sunday
	missedOvernight := scheduler.date != "" && !scheduler.handled && scheduler.due.Before(midnight) && scheduler.settings.Enabled && (scheduler.settings.Days == ScheduleEveryDay || dueWeekday)
	if scheduler.date != date && (scheduler.date == "" || scheduler.handled || scheduler.due.Before(time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()))) {
		scheduler.date = date
		parsed, _ := time.Parse("15:04", scheduler.settings.Time)
		scheduler.due = time.Date(now.Year(), now.Month(), now.Day(), parsed.Hour(), parsed.Minute(), 0, 0, now.Location())
		scheduler.warned = false
		scheduler.handled = !previous.Before(scheduler.due)
		scheduler.notices = map[string]scheduleNotice{}
	}
	events := []ScheduleEvent{}
	eligible := []ScheduleRoom{}
	seen := map[string]bool{}
	for _, room := range rooms {
		seen[room.Key] = true
		observation, exists := scheduler.observations[room.Key]
		if !exists {
			observation = scheduleObservation{Since: now}
		}
		if !observation.Reminded && now.Sub(observation.Since) >= time.Duration(scheduler.settings.IdleHours)*time.Hour {
			events = append(events, scheduler.notice(ScheduleIdle, fmt.Sprintf("%s: No connection from this app for %d hours", room.Name, scheduler.settings.IdleHours), []ScheduleRoom{room}, now))
			observation.Reminded = true
		}
		scheduler.observations[room.Key] = observation
		if !scheduler.keepRunning[room.Key] {
			eligible = append(eligible, room)
		}
	}
	for key := range scheduler.observations {
		if !seen[key] {
			delete(scheduler.observations, key)
		}
	}
	for id, notice := range scheduler.notices {
		if notice.Date != date && notice.Event.Kind != ScheduleWarning {
			delete(scheduler.notices, id)
		}
	}
	if missedOvernight && len(eligible) > 0 {
		events = append(events, scheduler.notice(ScheduleMissed, "Evening stop was missed", eligible, now))
	}
	cycleDay, _ = time.ParseInLocation("2006-01-02", scheduler.date, now.Location())
	weekday := cycleDay.Weekday() != time.Saturday && cycleDay.Weekday() != time.Sunday
	if !scheduler.settings.Enabled || (scheduler.settings.Days == ScheduleWeekdays && !weekday) || scheduler.handled {
		return events
	}
	if !now.Before(scheduler.due) {
		scheduler.handled = true
		if len(eligible) > 0 {
			kind, title := ScheduleDue, "Evening stop"
			if now.UnixNano()-previous.UnixNano() > int64(90*time.Second) {
				kind, title = ScheduleMissed, "Evening stop was missed"
			}
			events = append(events, scheduler.notice(kind, title, eligible, now))
		}
	} else if !scheduler.warned && !now.Before(scheduler.due.Add(-10*time.Minute)) {
		if len(eligible) > 0 {
			scheduler.warned = true
			events = append(events, scheduler.notice(ScheduleWarning, scheduleWarningTitle(eligible, scheduler.due), eligible, now))
		}
	}
	return events
}
func (scheduler *Scheduler) Act(id string, action ScheduleAction) []ScheduleRoom {
	scheduler.mutex.Lock()
	defer scheduler.mutex.Unlock()
	notice, exists := scheduler.notices[id]
	now := scheduler.now()
	if !exists || (notice.Date != now.Format("2006-01-02") && notice.Event.Kind != ScheduleWarning) {
		return nil
	}
	if notice.Event.Kind == ScheduleWarning {
		if !now.Before(scheduler.due) || scheduler.handled {
			return nil
		}
		switch action {
		case ScheduleSnooze:
			scheduler.due = scheduler.due.Add(time.Hour)
			scheduler.warned = false
		case ScheduleKeepTonight:
			scheduler.handled = true
		default:
			return nil
		}
	} else if action != ScheduleStop {
		return nil
	}
	delete(scheduler.notices, id)
	if action == ScheduleStop {
		return notice.Event.Rooms
	}
	return nil
}

func (scheduler *Scheduler) Notices() []ScheduleEvent {
	scheduler.mutex.Lock()
	defer scheduler.mutex.Unlock()
	result := []ScheduleEvent{}
	now := scheduler.now()
	for _, notice := range scheduler.notices {
		if notice.Event.Kind == ScheduleWarning {
			if scheduler.handled || !now.Before(scheduler.due) {
				continue
			}
		} else if notice.Date != now.Format("2006-01-02") {
			continue
		}
		result = append(result, notice.Event)
	}
	return result
}

func scheduleWarningTitle(rooms []ScheduleRoom, due time.Time) string {
	if len(rooms) == 1 {
		return fmt.Sprintf("%s stops at %s", rooms[0].Name, due.Format("15:04"))
	}
	return fmt.Sprintf("%s and %d more stop at %s", rooms[0].Name, len(rooms)-1, due.Format("15:04"))
}
