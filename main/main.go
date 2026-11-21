//go:build gui

package main

import (
	"log"
	"os"

	playrooms "github.com/avisi-cloud/acloud-playrooms"
)

// Release builds inject metadata; local launches use the configured development version.
var (
	version = ""
	commit  = "unknown"
	date    = "unknown"
	builtBy = "wails"
)

func main() {
	if version == "" {
		version = playrooms.DevelopmentVersion()
		log.Printf("App version not injected; using development version %s", version)
	}
	if err := playrooms.RunDesktopApplication(version); err != nil {
		log.Println("Error:", err.Error())
		os.Exit(1)
	}
}
