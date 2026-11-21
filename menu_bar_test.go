//go:build gui

package gui

import (
	"reflect"
	"strings"
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func labelsOf(items []menuBarItem) []string {
	labels := []string{}
	for _, item := range items {
		if item.Separator {
			labels = append(labels, "---")
			continue
		}
		labels = append(labels, item.Label)
	}
	return labels
}

func TestMenuBarListsRoomsWithTheActionsOfTheirRoomCard(t *testing.T) {
	items := describeMenuBar(MenuBarRooms{
		Playhouse: "playhouse-platform-dev",
		Loaded:    true,
		Rooms: []MenuBarRoom{
			{Name: "api", Status: MenuBarRoomReady, StatusLabel: "Ready"},
			{Name: "docs", Status: MenuBarRoomStopped, StatusLabel: "Stopped"},
			{Name: "web", Status: MenuBarRoomCreating, StatusLabel: "Creating"},
			{Name: "worker", Status: MenuBarRoomReady, StatusLabel: "Ready", PendingOperation: "Stopping"},
		},
	})

	want := []string{
		"playhouse-platform-dev",
		"api — Ready",
		"docs — Stopped",
		"web — Creating",
		"worker — Stopping…",
		"---",
		"Open Acloud Playrooms",
		"New Playroom",
		"---",
		"Quit Acloud Playrooms",
	}
	if got := labelsOf(items); !reflect.DeepEqual(got, want) {
		t.Fatalf("labels = %q, want %q", got, want)
	}
	if got := labelsOf(items[1].RoomActions); !reflect.DeepEqual(got, []string{"Connect", "Open in editor", "Stop"}) {
		t.Errorf("ready room actions = %q", got)
	}
	wantRequest := menuBarRequest{Action: menuBarConnect, Room: "api", Playhouse: "playhouse-platform-dev"}
	if got := *items[1].RoomActions[0].Request; got != wantRequest {
		t.Errorf("connect request = %+v, want %+v", got, wantRequest)
	}
	if got := labelsOf(items[2].RoomActions); !reflect.DeepEqual(got, []string{"Start"}) {
		t.Errorf("stopped room actions = %q", got)
	}
	for _, index := range []int{0, 3, 4} {
		if items[index].Request != nil || items[index].RoomActions != nil {
			t.Errorf("%q must be plain text", items[index].Label)
		}
	}
}

func TestMenuBarSaysWhyItHasNoRooms(t *testing.T) {
	for _, test := range []struct {
		rooms MenuBarRooms
		want  []string
	}{
		{MenuBarRooms{}, []string{"No playhouse selected"}},
		{MenuBarRooms{Playhouse: "playhouse-platform-dev"}, []string{"playhouse-platform-dev", "Playrooms not loaded yet"}},
		{MenuBarRooms{Playhouse: "playhouse-platform-dev", Loaded: true}, []string{"playhouse-platform-dev", "No playrooms"}},
	} {
		got := labelsOf(describeMenuBar(test.rooms))
		if !reflect.DeepEqual(got[:len(test.want)], test.want) || got[len(test.want)] != "---" {
			t.Errorf("%+v: labels = %q, want to start with %q", test.rooms, got, test.want)
		}
	}
}

func TestMenuBarRefusesAnUnknownRoomStatus(t *testing.T) {
	app := &App{menuBar: &recordingMenuBar{}}
	err := app.SetMenuBarRooms(MenuBarRooms{Playhouse: "playhouse-platform-dev", Loaded: true, Rooms: []MenuBarRoom{{Name: "api", Status: "running"}}})
	if err == nil || !strings.Contains(err.Error(), `"running"`) {
		t.Fatalf("error = %v, want the unknown status named", err)
	}
	if err := app.SetMenuBarRooms(MenuBarRooms{Rooms: []MenuBarRoom{{Status: MenuBarRoomReady}}}); err == nil {
		t.Fatal("a room without a name must be refused")
	}
	if len(app.menuBar.(*recordingMenuBar).shown) != 0 {
		t.Fatal("refused room lists must not reach the menu bar")
	}
}

func TestMenuBarShowsTheRoomListItIsGiven(t *testing.T) {
	menuBar := &recordingMenuBar{}
	app := &App{menuBar: menuBar}
	rooms := MenuBarRooms{Playhouse: "playhouse-platform-dev", Loaded: true, Rooms: []MenuBarRoom{{Name: "api", Status: MenuBarRoomReady, StatusLabel: "Ready"}}}
	if err := app.SetMenuBarRooms(rooms); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(menuBar.shown, []MenuBarRooms{rooms}) {
		t.Fatalf("shown = %+v", menuBar.shown)
	}
	if err := (&App{}).SetMenuBarRooms(rooms); err == nil {
		t.Fatal("a missing menu bar must be reported")
	}
}

func TestMenuBarRoutesWindowActionsNativelyAndRoomActionsToTheFrontend(t *testing.T) {
	var calls []string
	handlers := menuBarHandlers{
		showWindow:     func() { calls = append(calls, "show window") },
		emitMenuAction: func(action menuAction) { calls = append(calls, "menu "+string(action)) },
		quit:           func() { calls = append(calls, "quit") },
		sendToFrontend: func(request menuBarRequest) {
			calls = append(calls, "frontend "+string(request.Action)+" "+request.Room+" "+request.Playhouse)
		},
	}
	for _, test := range []struct {
		request menuBarRequest
		want    []string
	}{
		{menuBarRequest{Action: menuBarOpenWindow}, []string{"show window"}},
		{menuBarRequest{Action: menuBarNewPlayroom}, []string{"show window", "menu new-playroom"}},
		{menuBarRequest{Action: menuBarQuit}, []string{"quit"}},
		{menuBarRequest{Action: menuBarConnect, Room: "api", Playhouse: "ph"}, []string{"frontend connect api ph"}},
		{menuBarRequest{Action: menuBarOpenInEditor, Room: "api", Playhouse: "ph"}, []string{"frontend open-in-editor api ph"}},
		{menuBarRequest{Action: menuBarStart, Room: "api", Playhouse: "ph"}, []string{"frontend start api ph"}},
		{menuBarRequest{Action: menuBarStop, Room: "api", Playhouse: "ph"}, []string{"frontend stop api ph"}},
		{menuBarRequest{Action: "reboot"}, nil},
	} {
		calls = nil
		routeMenuBarRequest(test.request, handlers)
		if !reflect.DeepEqual(calls, test.want) {
			t.Errorf("%+v: calls = %q, want %q", test.request, calls, test.want)
		}
	}
}

func TestMenuBarRendersRoomsAsSubmenusAndTextAsDisabledRows(t *testing.T) {
	menu := application.NewMenu()
	defer menu.Destroy()
	var chosen []menuBarRequest
	renderMenuBar(menu, describeMenuBar(MenuBarRooms{
		Playhouse: "playhouse-platform-dev",
		Loaded:    true,
		Rooms:     []MenuBarRoom{{Name: "api", Status: MenuBarRoomReady, StatusLabel: "Ready"}},
	}), func(request menuBarRequest) { chosen = append(chosen, request) })

	if menu.FindByLabel("playhouse-platform-dev").Enabled() {
		t.Error("the playhouse heading must not be clickable")
	}
	room := menu.FindByLabel("api — Ready")
	if room == nil || room.GetSubmenu() == nil {
		t.Fatal("a room with actions must be a submenu")
	}
	for _, label := range []string{"Connect", "Open in editor", "Stop", "Open Acloud Playrooms", "New Playroom", "Quit Acloud Playrooms"} {
		if item := menu.FindByLabel(label); item == nil || !item.Enabled() {
			t.Errorf("missing enabled item %q", label)
		}
	}
}

func TestClosingTheWindowKeepsTheAppRunningOnlyWhenTheSettingIsOn(t *testing.T) {
	app := &App{}
	if app.keepRunningInMenuBar.Load() {
		t.Fatal("keep running in the menu bar must start off")
	}
	app.SetKeepRunningInMenuBar(true)
	if !app.keepRunningInMenuBar.Load() {
		t.Fatal("the setting was not stored")
	}
	app.SetKeepRunningInMenuBar(false)
	if app.keepRunningInMenuBar.Load() {
		t.Fatal("the setting was not cleared")
	}
}

func TestShowMainWindowReportsAMissingWindow(t *testing.T) {
	if err := (&App{}).ShowMainWindow(); err == nil {
		t.Fatal("a missing window must be reported")
	}
	shown := false
	if err := (&App{showMainWindow: func() { shown = true }}).ShowMainWindow(); err != nil || !shown {
		t.Fatalf("shown = %v, err = %v", shown, err)
	}
}

type recordingMenuBar struct {
	shown []MenuBarRooms
}

func (menuBar *recordingMenuBar) ShowRooms(rooms MenuBarRooms) {
	menuBar.shown = append(menuBar.shown, rooms)
}
