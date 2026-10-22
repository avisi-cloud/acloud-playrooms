//go:build gui

package gui

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/wailsapp/wails/v3/pkg/application"
)

const (
	appIndexBody   = "<!doctype html><html><body><app-root></app-root></body></html>"
	mainScriptBody = "console.log('main');"
	viteClientBody = "console.log('vite client');"
)

// A reload asks for the current route, so every Angular route must get the app
// back from the same Wails file server the window uses.
func TestReloadOnAnAngularRouteServesTheAppIndex(t *testing.T) {
	// A set FRONTEND_DEVSERVER_URL would turn the Wails file server into a proxy.
	t.Setenv("FRONTEND_DEVSERVER_URL", "")
	handler := serveAppIndexForAngularRoutes(application.BundledAssetFileServer(fstest.MapFS{
		"index.html":     {Data: []byte(appIndexBody)},
		"main-ABC123.js": {Data: []byte(mainScriptBody)},
	}))

	tests := []struct {
		name       string
		path       string
		wantStatus int
		wantBody   string
	}{
		{name: "the start page", path: "/", wantStatus: http.StatusOK, wantBody: appIndexBody},
		{name: "the room list", path: "/rooms", wantStatus: http.StatusOK, wantBody: appIndexBody},
		{name: "a room, whose DNS-1123 name has no dot to look like a file", path: "/rooms/demo", wantStatus: http.StatusOK, wantBody: appIndexBody},
		{name: "the playhouse selection", path: "/playhouse", wantStatus: http.StatusOK, wantBody: appIndexBody},
		{name: "the settings", path: "/settings", wantStatus: http.StatusOK, wantBody: appIndexBody},
		{name: "a script is served as itself", path: "/main-ABC123.js", wantStatus: http.StatusOK, wantBody: mainScriptBody},
		{name: "a missing script stays a 404 instead of becoming HTML", path: "/missing.js", wantStatus: http.StatusNotFound, wantBody: ""},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, testCase.path, nil))
			if recorder.Code != testCase.wantStatus || recorder.Body.String() != testCase.wantBody {
				t.Errorf("GET %s = %d %q, want %d %q", testCase.path, recorder.Code, recorder.Body.String(), testCase.wantStatus, testCase.wantBody)
			}
		})
	}
}

// Under `make dev` Wails proxies to the frontend server, which answers paths the
// built files do not have; only a real 404 may be replaced by the app index.
func TestServeAppIndexForAngularRoutesReplacesOnlyANotFound(t *testing.T) {
	frontendServer := http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/":
			// No Content-Type, so one left behind by the 404 would show.
			_, _ = writer.Write([]byte(appIndexBody))
		case "/@vite/client":
			writer.Header().Set("Content-Type", "text/javascript")
			_, _ = writer.Write([]byte(viteClientBody))
		default:
			http.NotFound(writer, request)
		}
	})
	handler := serveAppIndexForAngularRoutes(frontendServer)

	tests := []struct {
		name            string
		path            string
		wantStatus      int
		wantContentType string
		wantBody        string
	}{
		{name: "an extensionless file the server has is served as itself", path: "/@vite/client", wantStatus: http.StatusOK, wantContentType: "text/javascript", wantBody: viteClientBody},
		{name: "a route gets the app index without the 404's headers", path: "/rooms", wantStatus: http.StatusOK, wantContentType: "text/html; charset=utf-8", wantBody: appIndexBody},
		{name: "an unknown Wails runtime path stays a 404", path: "/wails/unknown", wantStatus: http.StatusNotFound, wantContentType: "text/plain; charset=utf-8", wantBody: "404 page not found\n"},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, testCase.path, nil))
			gotContentType := recorder.Header().Get("Content-Type")
			if recorder.Code != testCase.wantStatus || gotContentType != testCase.wantContentType || recorder.Body.String() != testCase.wantBody {
				t.Errorf("GET %s = %d %q %q, want %d %q %q", testCase.path, recorder.Code, gotContentType, recorder.Body.String(), testCase.wantStatus, testCase.wantContentType, testCase.wantBody)
			}
		})
	}
}
