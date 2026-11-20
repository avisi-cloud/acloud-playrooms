package tools

import (
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
)

var vsCodeCommandDirectories = []string{
	"/opt/homebrew/bin",
	"/usr/local/bin",
	"/opt/local/bin",
	"/Applications/Visual Studio Code.app/Contents/Resources/app/bin",
}

func vsCodeCommandDirectory(searchPath string) string {
	directories := append(filepath.SplitList(searchPath), vsCodeCommandDirectories...)
	if homeDirectory, err := os.UserHomeDir(); err == nil {
		directories = append(directories, filepath.Join(homeDirectory, "Applications", "Visual Studio Code.app", "Contents", "Resources", "app", "bin"))
	} else {
		log.Printf("Cannot search the user's Applications directory for VS Code: %v", err)
	}
	for _, directory := range directories {
		if !filepath.IsAbs(directory) {
			continue
		}
		info, err := os.Stat(filepath.Join(directory, "code"))
		if err == nil && !info.IsDir() && info.Mode().Perm()&0o111 != 0 {
			return directory
		}
	}
	return ""
}

// Finder-launched apps need to discover VS Code without changing the user's shell PATH.
func ConfigureVSCodeCommandEnvironment(command *exec.Cmd) {
	environment := command.Environ()
	pathIndex := -1
	searchPath := ""
	for index, entry := range environment {
		if commandPath, found := strings.CutPrefix(entry, "PATH="); found {
			pathIndex, searchPath = index, commandPath
			break
		}
	}
	directory := vsCodeCommandDirectory(searchPath)
	if directory == "" || slices.Contains(filepath.SplitList(searchPath), directory) {
		return
	}
	commandPath := directory
	if searchPath != "" {
		commandPath = searchPath + string(os.PathListSeparator) + directory
	}
	if pathIndex < 0 {
		environment = append(environment, "PATH="+commandPath)
	} else {
		environment[pathIndex] = "PATH=" + commandPath
	}
	command.Env = environment
	log.Printf("VS Code is not on this app's PATH; adding %q to the Acloud command PATH", directory)
}
