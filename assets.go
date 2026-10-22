//go:build gui

package gui

import (
	"maps"
	"net/http"
	"path"
	"strings"
)

// serveAppIndexForAngularRoutes is needed because Wails answers only "/" with index.html, so a reload on /rooms showed a blank window.
func serveAppIndexForAngularRoutes(assetHandler http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if !couldBeAngularRoute(request.URL.Path) {
			assetHandler.ServeHTTP(writer, request)
			return
		}
		// Files first: under `make dev` the frontend server also answers extensionless paths such as /@vite/client.
		assetResponse := &notFoundInterceptor{writer: writer}
		assetHandler.ServeHTTP(assetResponse, request)
		if assetResponse.notFound {
			assetHandler.ServeHTTP(writer, requestForAppIndex(request))
		}
	})
}

// couldBeAngularRoute leaves files and the Wails runtime alone: a missing script must stay a 404, never become HTML.
func couldBeAngularRoute(requestPath string) bool {
	return path.Ext(requestPath) == "" && !strings.HasPrefix(requestPath, "/wails/")
}

func requestForAppIndex(request *http.Request) *http.Request {
	appIndexRequest := request.Clone(request.Context())
	appIndexRequest.URL.Path = "/"
	appIndexRequest.URL.RawPath = ""
	return appIndexRequest
}

// notFoundInterceptor drops a 404 response, headers included, so index.html can be sent in its place.
type notFoundInterceptor struct {
	writer        http.ResponseWriter
	header        http.Header
	headerWritten bool
	notFound      bool
}

func (notFoundInterceptor *notFoundInterceptor) Header() http.Header {
	if notFoundInterceptor.header == nil {
		notFoundInterceptor.header = notFoundInterceptor.writer.Header().Clone()
	}
	return notFoundInterceptor.header
}

func (notFoundInterceptor *notFoundInterceptor) WriteHeader(statusCode int) {
	if notFoundInterceptor.headerWritten {
		return
	}
	notFoundInterceptor.headerWritten = true
	if statusCode == http.StatusNotFound {
		notFoundInterceptor.notFound = true
		return
	}
	if notFoundInterceptor.header != nil {
		maps.Copy(notFoundInterceptor.writer.Header(), notFoundInterceptor.header)
	}
	notFoundInterceptor.header = notFoundInterceptor.writer.Header()
	notFoundInterceptor.writer.WriteHeader(statusCode)
}

func (notFoundInterceptor *notFoundInterceptor) Write(body []byte) (int, error) {
	if !notFoundInterceptor.headerWritten {
		notFoundInterceptor.WriteHeader(http.StatusOK)
	}
	if notFoundInterceptor.notFound {
		return len(body), nil
	}
	return notFoundInterceptor.writer.Write(body)
}
