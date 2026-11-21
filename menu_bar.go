//go:build gui

package gui

import (
	_ "embed"
	"fmt"
	"log"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed assets/menu-bar-icon.png
var menuBarIcon []byte

// MenuBarRoomStatus is the frontend's room status key.
type MenuBarRoomStatus string

const (
	MenuBarRoomReady    MenuBarRoomStatus = "ready"
	MenuBarRoomCreating MenuBarRoomStatus = "creating"
	MenuBarRoomStarting MenuBarRoomStatus = "starting"
	MenuBarRoomNoHost   MenuBarRoomStatus = "no-host"
	MenuBarRoomStopped  MenuBarRoomStatus = "stopped"
	MenuBarRoomDeleting MenuBarRoomStatus = "deleting"
	MenuBarRoomFailed   MenuBarRoomStatus = "failed"
	MenuBarRoomUnknown  MenuBarRoomStatus = "unknown"
)

func (status MenuBarRoomStatus) validate() error {
	switch status {
	case MenuBarRoomReady, MenuBarRoomCreating, MenuBarRoomStarting, MenuBarRoomNoHost,
		MenuBarRoomStopped, MenuBarRoomDeleting, MenuBarRoomFailed, MenuBarRoomUnknown:
		return nil
	}
	return fmt.Errorf("unknown room status %q for the menu bar", status)
}

// MenuBarRoom is one room as the room list shows it.
type MenuBarRoom struct {
	Name   string
	Status MenuBarRoomStatus
	// StatusLabel is the status text the room card shows.
	StatusLabel string
	// PendingOperation is the running task, such as "Starting"; blank when none.
	PendingOperation string
}

// MenuBarRooms is the frontend's room list for the current playhouse.
type MenuBarRooms struct {
	Playhouse string
	// Loaded is false until a room list for Playhouse has come back.
	Loaded bool
	Rooms  []MenuBarRoom
}

func (rooms MenuBarRooms) validate() error {
	for _, room := range rooms.Rooms {
		if room.Name == "" {
			return fmt.Errorf("a menu bar room has no name")
		}
		if err := room.Status.validate(); err != nil {
			return err
		}
	}
	return nil
}

type menuBarAction string

const (
	menuBarConnect      menuBarAction = "connect"
	menuBarOpenInEditor menuBarAction = "open-in-editor"
	menuBarStart        menuBarAction = "start"
	menuBarStop         menuBarAction = "stop"
	menuBarOpenWindow   menuBarAction = "open-window"
	menuBarNewPlayroom  menuBarAction = "new-playroom"
	menuBarQuit         menuBarAction = "quit"
)

// menuBarRequest is what a click asks for; room actions travel to the frontend as is.
type menuBarRequest struct {
	Action    menuBarAction `json:"action"`
	Room      string        `json:"room,omitempty"`
	Playhouse string        `json:"playhouse,omitempty"`
}

// menuBarItem is a separator, a command (Request), a room (RoomActions) or else disabled text.
type menuBarItem struct {
	Label       string
	Separator   bool
	Request     *menuBarRequest
	RoomActions []menuBarItem
}

// describeMenuBar turns the room list into rows, so the native menu holds no decisions.
func describeMenuBar(rooms MenuBarRooms) []menuBarItem {
	items := []menuBarItem{}
	switch {
	case rooms.Playhouse == "":
		items = append(items, menuBarItem{Label: "No playhouse selected"})
	case !rooms.Loaded:
		items = append(items, menuBarItem{Label: rooms.Playhouse}, menuBarItem{Label: "Playrooms not loaded yet"})
	case len(rooms.Rooms) == 0:
		items = append(items, menuBarItem{Label: rooms.Playhouse}, menuBarItem{Label: "No playrooms"})
	default:
		items = append(items, menuBarItem{Label: rooms.Playhouse})
		for _, room := range rooms.Rooms {
			items = append(items, describeMenuBarRoom(rooms.Playhouse, room))
		}
	}
	return append(items,
		menuBarItem{Separator: true},
		menuBarItem{Label: "Open Acloud Playrooms", Request: &menuBarRequest{Action: menuBarOpenWindow}},
		menuBarItem{Label: "New Playroom", Request: &menuBarRequest{Action: menuBarNewPlayroom}},
		menuBarItem{Separator: true},
		menuBarItem{Label: "Quit Acloud Playrooms", Request: &menuBarRequest{Action: menuBarQuit}},
	)
}

// describeMenuBarRoom offers the same actions as the room card's buttons.
func describeMenuBarRoom(playhouse string, room MenuBarRoom) menuBarItem {
	if room.PendingOperation != "" {
		return menuBarItem{Label: room.Name + " — " + room.PendingOperation + "…"}
	}
	label := room.Name + " — " + room.StatusLabel
	action := func(actionLabel string, action menuBarAction) menuBarItem {
		return menuBarItem{Label: actionLabel, Request: &menuBarRequest{Action: action, Room: room.Name, Playhouse: playhouse}}
	}
	switch room.Status {
	case MenuBarRoomReady:
		return menuBarItem{Label: label, RoomActions: []menuBarItem{
			action("Connect", menuBarConnect),
			action("Open in editor", menuBarOpenInEditor),
			action("Stop", menuBarStop),
		}}
	case MenuBarRoomStopped:
		return menuBarItem{Label: label, RoomActions: []menuBarItem{action("Start", menuBarStart)}}
	}
	return menuBarItem{Label: label}
}

func renderMenuBar(menu *application.Menu, items []menuBarItem, choose func(menuBarRequest)) {
	for _, item := range items {
		switch {
		case item.Separator:
			menu.AddSeparator()
		case item.RoomActions != nil:
			renderMenuBar(menu.AddSubmenu(item.Label), item.RoomActions, choose)
		case item.Request != nil:
			request := *item.Request
			menu.Add(item.Label).OnClick(func(_ *application.Context) { choose(request) })
		default:
			menu.Add(item.Label).SetEnabled(false)
		}
	}
}

type menuBarHandlers struct {
	showWindow     func()
	emitMenuAction func(menuAction)
	quit           func()
	sendToFrontend func(menuBarRequest)
}

// routeMenuBarRequest handles window and quit natively; room actions run in the frontend.
func routeMenuBarRequest(request menuBarRequest, handlers menuBarHandlers) {
	switch request.Action {
	case menuBarOpenWindow:
		handlers.showWindow()
	case menuBarNewPlayroom:
		handlers.showWindow()
		handlers.emitMenuAction(menuNewPlayroom)
	case menuBarQuit:
		handlers.quit()
	case menuBarConnect, menuBarOpenInEditor, menuBarStart, menuBarStop:
		handlers.sendToFrontend(request)
	default:
		log.Printf("menu bar: ignoring unknown action %q", request.Action)
	}
}

// menuBar keeps one tray menu and rebuilds its rows when the room list changes.
type menuBar struct {
	mutex  sync.Mutex
	menu   *application.Menu
	choose func(menuBarRequest)
}

func startMenuBar(app *application.App, choose func(menuBarRequest)) *menuBar {
	bar := &menuBar{menu: application.NewMenu(), choose: choose}
	renderMenuBar(bar.menu, describeMenuBar(MenuBarRooms{}), choose)
	tray := app.SystemTray.New()
	tray.SetTemplateIcon(menuBarIcon)
	tray.SetTooltip("Acloud Playrooms")
	tray.SetMenu(bar.menu)
	return bar
}

func (bar *menuBar) ShowRooms(rooms MenuBarRooms) {
	bar.mutex.Lock()
	defer bar.mutex.Unlock()
	bar.menu.Clear()
	renderMenuBar(bar.menu, describeMenuBar(rooms), bar.choose)
	bar.menu.Update()
}
