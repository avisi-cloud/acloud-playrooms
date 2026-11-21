package local

import (
	"testing"
	"time"
)

func scheduleFixture(t *testing.T) (*Scheduler, *time.Time, []ScheduleRoom) {
	t.Helper()
	now := time.Date(2026, 11, 23, 21, 49, 0, 0, time.FixedZone("local", 3600))
	scheduler := NewScheduler(func() time.Time { return now })
	settings := DefaultScheduleSettings()
	settings.Enabled = true
	scheduler.Configure(settings)
	rooms := []ScheduleRoom{{Key: "one", Name: "demo", Playhouse: "playhouse-platform-dev"}, {Key: "two", Name: "docs", Playhouse: "playhouse-platform-dev"}}
	scheduler.Tick(rooms)
	return scheduler, &now, rooms
}
func advanceSchedule(scheduler *Scheduler, now *time.Time, rooms []ScheduleRoom, minutes int) []ScheduleEvent {
	events := []ScheduleEvent{}
	for range minutes {
		*now = now.Add(time.Minute)
		events = append(events, scheduler.Tick(rooms)...)
	}
	return events
}
func TestScheduleWarnsThenStopsOnceAndKeepsOptOut(t *testing.T) {
	scheduler, now, rooms := scheduleFixture(t)
	scheduler.KeepRunning("two", true)
	events := advanceSchedule(scheduler, now, rooms, 1)
	if len(events) != 1 || events[0].Kind != ScheduleWarning || len(events[0].Rooms) != 1 {
		t.Fatalf("warning: %+v", events)
	}
	events = advanceSchedule(scheduler, now, rooms, 10)
	if len(events) != 1 || events[0].Kind != ScheduleDue || events[0].Rooms[0].Key != "one" {
		t.Fatalf("due: %+v", events)
	}
	if len(advanceSchedule(scheduler, now, rooms, 1)) != 0 {
		t.Fatal("repeated stop")
	}
}
func TestScheduleSnoozeAndKeepTonight(t *testing.T) {
	scheduler, now, rooms := scheduleFixture(t)
	warning := advanceSchedule(scheduler, now, rooms, 1)[0]
	scheduler.Act(warning.ID, ScheduleSnooze)
	if len(advanceSchedule(scheduler, now, rooms, 59)) != 0 {
		t.Fatal("stopped before snooze expired")
	}
	warning = advanceSchedule(scheduler, now, rooms, 1)[0]
	if warning.Kind != ScheduleWarning {
		t.Fatal(warning)
	}
	scheduler.Act(warning.ID, ScheduleKeepTonight)
	if len(advanceSchedule(scheduler, now, rooms, 11)) != 0 {
		t.Fatal("did not keep running tonight")
	}
}
func TestScheduleMissedStopNeverCatchesUp(t *testing.T) {
	scheduler, now, rooms := scheduleFixture(t)
	*now = now.Add(2 * time.Hour)
	events := scheduler.Tick(rooms)
	if len(events) != 1 || events[0].Kind != ScheduleMissed {
		t.Fatalf("missed: %+v", events)
	}
	if len(scheduler.Tick(rooms)) != 0 {
		t.Fatal("repeated missed stop")
	}
	if len(scheduler.Act(events[0].ID, ScheduleStop)) != 2 {
		t.Fatal("Stop action lost rooms")
	}
	if len(scheduler.Act(events[0].ID, ScheduleStop)) != 0 {
		t.Fatal("replayed Stop action")
	}
}
func TestScheduleIdleConnectionAndRunningObservation(t *testing.T) {
	scheduler, now, rooms := scheduleFixture(t)
	settings := scheduler.Settings()
	settings.Enabled = false
	scheduler.Configure(settings)
	*now = now.Add(3 * time.Hour)
	scheduler.Connected("one")
	scheduler.Tick(rooms)
	*now = now.Add(time.Hour)
	events := scheduler.Tick(rooms)
	if len(events) != 1 || events[0].Kind != ScheduleIdle || events[0].Rooms[0].Key != "two" {
		t.Fatalf("idle: %+v", events)
	}
	*now = now.Add(3 * time.Hour)
	events = scheduler.Tick(rooms)
	if len(events) != 1 || events[0].Rooms[0].Key != "one" {
		t.Fatalf("connection reset: %+v", events)
	}
	scheduler.Tick(nil)
	scheduler.Tick(rooms)
	if len(scheduler.Tick(rooms)) != 0 {
		t.Fatal("new run inherited idle time")
	}
}
func TestScheduleWeekendDisabledAndValidation(t *testing.T) {
	scheduler, now, rooms := scheduleFixture(t)
	*now = time.Date(2026, 11, 28, 21, 49, 0, 0, now.Location())
	scheduler.Tick(rooms)
	if len(advanceSchedule(scheduler, now, rooms, 11)) != 0 {
		t.Fatal("weekday schedule ran on Saturday")
	}
	for _, settings := range []ScheduleSettings{{Time: "bad", Days: ScheduleWeekdays, IdleHours: 4}, {Time: "22:00", Days: "unknown", IdleHours: 4}, {Time: "22:00", Days: ScheduleWeekdays}} {
		if settings.Validate() == nil {
			t.Fatal("accepted invalid settings")
		}
	}
}
func TestScheduleMissedOvernightAndSnoozeAcrossMidnight(t *testing.T) {
	scheduler, now, rooms := scheduleFixture(t)
	*now = now.Add(12 * time.Hour)
	events := scheduler.Tick(rooms)
	found := false
	for _, event := range events {
		if event.Kind == ScheduleDue {
			t.Fatal("automatically caught up")
		}
		if event.Kind == ScheduleMissed {
			found = true
		}
	}
	if !found {
		t.Fatalf("missed overnight stop not reported: %+v", events)
	}
	scheduler, now, rooms = scheduleFixture(t)
	settings := scheduler.Settings()
	settings.Time = "23:30"
	scheduler.Configure(settings)
	*now = time.Date(2026, 11, 23, 23, 19, 0, 0, now.Location())
	scheduler.Tick(rooms)
	warning := advanceSchedule(scheduler, now, rooms, 1)[0]
	scheduler.Act(warning.ID, ScheduleSnooze)
	events = advanceSchedule(scheduler, now, rooms, 70)
	due := 0
	for _, event := range events {
		if event.Kind == ScheduleDue {
			due++
		}
	}
	if due != 1 {
		t.Fatalf("midnight snooze lost deadline: %+v", events)
	}
}
func TestScheduleIgnoresStaleActionsAndSettingsDoNotCatchUp(t *testing.T) {
	scheduler, now, rooms := scheduleFixture(t)
	warning := advanceSchedule(scheduler, now, rooms, 1)[0]
	settings := scheduler.Settings()
	settings.Enabled = false
	scheduler.Configure(settings)
	scheduler.Act(warning.ID, ScheduleSnooze)
	*now = now.Add(time.Hour)
	settings.Enabled = true
	scheduler.Configure(settings)
	if len(scheduler.Tick(rooms)) != 0 {
		t.Fatal("enabling after deadline caught up")
	}
}
func TestScheduleFridaySnoozeStillRunsAfterMidnight(t *testing.T) {
	scheduler, now, rooms := scheduleFixture(t)
	*now = time.Date(2026, 11, 27, 23, 19, 0, 0, now.Location())
	settings := scheduler.Settings()
	settings.Time = "23:30"
	scheduler.Configure(settings)
	scheduler.Tick(rooms)
	warning := advanceSchedule(scheduler, now, rooms, 1)[0]
	scheduler.Act(warning.ID, ScheduleSnooze)
	events := advanceSchedule(scheduler, now, rooms, 70)
	due := 0
	for _, event := range events {
		if event.Kind == ScheduleDue {
			due++
		}
	}
	if due != 1 {
		t.Fatalf("Friday snooze skipped Saturday deadline: %+v", events)
	}
}

func TestScheduleWarningNamesRoomsAndActualStopTime(t *testing.T) {
	scheduler, now, rooms := scheduleFixture(t)
	warning := advanceSchedule(scheduler, now, rooms, 1)[0]
	if warning.Title != "demo and 1 more stop at 22:00" {
		t.Fatal(warning.Title)
	}
	scheduler.Act(warning.ID, ScheduleSnooze)
	events := advanceSchedule(scheduler, now, rooms, 60)
	if len(events) != 1 || events[0].Title != "demo and 1 more stop at 23:00" {
		t.Fatalf("snoozed warning: %+v", events)
	}
	scheduler, now, rooms = scheduleFixture(t)
	scheduler.KeepRunning("two", true)
	warning = advanceSchedule(scheduler, now, rooms, 1)[0]
	if warning.Title != "demo stops at 22:00" {
		t.Fatal(warning.Title)
	}
}
