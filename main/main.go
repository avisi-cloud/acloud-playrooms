//go:build gui

package main

import (
	"log"
	"os"

	playrooms "github.com/avisi-cloud/acloud-playrooms"
)

// Release builds inject this metadata. The standalone app currently uses
// build/config.yml for its own version and reads the installed acloud version
// from `acloud version`.
var (
	version = ""
	commit  = "unknown"
	date    = "unknown"
	builtBy = "wails"
)

func main() {
	if err := playrooms.RunDesktopApplication(); err != nil {
		log.Println("Error:", err.Error())
		os.Exit(1)
	}
}
