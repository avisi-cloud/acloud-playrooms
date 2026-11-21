package local

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/avisi-cloud/acloud-playrooms/backend/cli"
	"github.com/avisi-cloud/acloud-playrooms/backend/terminal"
	"github.com/avisi-cloud/acloud-playrooms/backend/tools"
)

// HealthCheckKey names one check on the health check screen.
type HealthCheckKey string

const (
	HealthCheckAcloud    HealthCheckKey = "acloud"
	HealthCheckSignIn    HealthCheckKey = "sign-in"
	HealthCheckSSHKey    HealthCheckKey = "ssh-key"
	HealthCheckTailscale HealthCheckKey = "tailscale"
	HealthCheckTerminal  HealthCheckKey = "terminal"
	HealthCheckEditor    HealthCheckKey = "editor"
)

// HealthStatus is the outcome of one check. Unknown means the check could not tell.
type HealthStatus string

const (
	HealthPassed  HealthStatus = "passed"
	HealthWarning HealthStatus = "warning"
	HealthFailed  HealthStatus = "failed"
	HealthUnknown HealthStatus = "unknown"
	HealthSkipped HealthStatus = "skipped"
)

// HealthAction is a fix the screen can start itself, next to the copyable command.
type HealthAction string

const (
	HealthActionNone         HealthAction = ""
	HealthActionOpenSettings HealthAction = "open-settings"
	HealthActionSignIn       HealthAction = "sign-in"
)

// Editor is an `acloud playroom open --editor` value.
type Editor string

const (
	EditorVSCode   Editor = "vscode"
	EditorIntelliJ Editor = "intellij"
	EditorWebStorm Editor = "webstorm"
)

// HealthCheckInput is what the health check needs to know about the user's choices.
type HealthCheckInput struct {
	Terminal terminal.Emulator
	Editor   Editor
	// CheckTailscale is false when the playhouse is known not to use Tailscale.
	CheckTailscale bool
}

// HealthCheck is the result of one check: what was found and, when it failed, what to do.
type HealthCheck struct {
	Key         HealthCheckKey
	Name        string
	Status      HealthStatus
	Explanation string
	// Fix is empty when there is nothing to do.
	Fix string
	// Command is a command the user can copy to fix it, empty when there is none.
	Command string
	Action  HealthAction
}

// Each check only reads, and every command it runs has its own limit.
const (
	tailscaleStatusTimeout     = 5 * time.Second
	vsCodeExtensionListTimeout = 15 * time.Second
	healthCommandWaitDelay     = time.Second
)

const vsCodeRemoteSSHExtension = "ms-vscode-remote.remote-ssh"

// applicationDirectories are where macOS apps are installed; a variable so tests can search a temporary one.
var applicationDirectories = []string{"/Applications", "/System/Applications", "/System/Applications/Utilities"}

// CheckHealth runs every check at the same time and returns them in screen order.
func CheckHealth(ctx context.Context, input HealthCheckInput) []HealthCheck {
	directories := applicationDirectoriesWithHome()
	checks := []func() HealthCheck{
		func() HealthCheck { return checkAcloud(cli.DescribeBinary()) },
		checkSignIn,
		func() HealthCheck { return checkSSHKey(homeDirectory()) },
		func() HealthCheck {
			if !input.CheckTailscale {
				return skippedTailscaleCheck()
			}
			return checkTailscale(ctx, tools.DescribeTailscaleBinary())
		},
		func() HealthCheck { return checkTerminal(input.Terminal, directories) },
		func() HealthCheck { return checkEditor(ctx, input.Editor, tools.FindVSCodeCommand(), directories) },
	}
	results := make([]HealthCheck, len(checks))
	var group sync.WaitGroup
	for index, check := range checks {
		group.Add(1)
		go func() {
			defer group.Done()
			results[index] = check()
		}()
	}
	group.Wait()
	return results
}

func checkAcloud(binary cli.BinaryStatus) HealthCheck {
	check := HealthCheck{Key: HealthCheckAcloud, Name: "acloud"}
	if !binary.Found {
		check.Status = HealthFailed
		check.Explanation = binary.Message
		check.Fix = "Install acloud, or set its path in Settings."
		check.Command = "brew install --cask avisi-cloud/tools/acloud"
		check.Action = HealthActionOpenSettings
		return check
	}
	compatibility := describeAcloudCompatibility(binary.Version)
	switch {
	case compatibility.RunningVersionIsOlderThanMinimum:
		check.Status = HealthFailed
		check.Explanation = fmt.Sprintf("acloud %s is older than %s, which this app needs.", binary.Version, MinimumAcloudVersion)
		check.Fix = "Upgrade acloud."
		check.Command = "brew upgrade --cask acloud"
	case compatibility.RunningVersionIsNewerThanVerified:
		check.Status = HealthWarning
		check.Explanation = compatibility.Explanation
	default:
		check.Status = HealthPassed
		check.Explanation = fmt.Sprintf("acloud %s at %s.", binary.Version, binary.Path)
	}
	return check
}

func checkSignIn() HealthCheck {
	check := HealthCheck{Key: HealthCheckSignIn, Name: "Signed in to Acloud"}
	if !IsLoggedIn() {
		check.Status = HealthFailed
		check.Explanation = "The current acloud context has no stored credentials."
		check.Fix = "Sign in."
		check.Command = "acloud auth login"
		check.Action = HealthActionSignIn
		return check
	}
	check.Status = HealthPassed
	check.Explanation = "Signed in."
	if user, err := CurrentUser(); err == nil {
		check.Explanation = "Signed in as " + user + "."
	}
	return check
}

// checkSSHKey looks for the keys acloud offers by default.
func checkSSHKey(home string) HealthCheck {
	check := HealthCheck{Key: HealthCheckSSHKey, Name: "SSH public key"}
	if home == "" {
		check.Status = HealthUnknown
		check.Explanation = "Cannot find your home folder."
		return check
	}
	keys, err := filepath.Glob(filepath.Join(home, ".ssh", "id_*.pub"))
	if err != nil {
		check.Status = HealthUnknown
		check.Explanation = fmt.Sprintf("Cannot read ~/.ssh: %v", err)
		return check
	}
	if len(keys) == 0 {
		check.Status = HealthFailed
		check.Explanation = "No ~/.ssh/id_*.pub found. acloud uses one by default."
		check.Fix = "Create an SSH key."
		check.Command = "ssh-keygen -t ed25519"
		return check
	}
	names := make([]string, 0, len(keys))
	for _, key := range keys {
		names = append(names, "~/.ssh/"+filepath.Base(key))
	}
	check.Status = HealthPassed
	check.Explanation = "Found " + strings.Join(names, ", ") + "."
	return check
}

func skippedTailscaleCheck() HealthCheck {
	return HealthCheck{
		Key:         HealthCheckTailscale,
		Name:        "Tailscale",
		Status:      HealthSkipped,
		Explanation: "Not needed: this playhouse does not use Tailscale.",
	}
}

// checkTailscale reads `tailscale status --json`, which only reports.
func checkTailscale(ctx context.Context, binary tools.TailscaleBinaryStatus) HealthCheck {
	check := HealthCheck{Key: HealthCheckTailscale, Name: "Tailscale"}
	if !binary.Found {
		check.Status = HealthFailed
		check.Explanation = binary.Message
		check.Fix = "Install Tailscale, or set its path in Settings."
		check.Action = HealthActionOpenSettings
		return check
	}
	statusContext, cancel := context.WithTimeout(ctx, tailscaleStatusTimeout)
	defer cancel()
	command := exec.CommandContext(statusContext, binary.Path, "status", "--json")
	command.WaitDelay = healthCommandWaitDelay
	// A stopped or logged-out Tailscale exits non-zero but still prints its state.
	output, _ := command.Output()
	if errors.Is(statusContext.Err(), context.DeadlineExceeded) {
		check.Status = HealthUnknown
		check.Explanation = "Tailscale did not report its state within " + tailscaleStatusTimeout.String() + "."
		return check
	}
	var state struct{ BackendState string }
	if err := json.Unmarshal(output, &state); err != nil || state.BackendState == "" {
		check.Status = HealthUnknown
		check.Explanation = "Tailscale did not report its state."
		return check
	}
	switch state.BackendState {
	case "Running":
		check.Status = HealthPassed
		check.Explanation = fmt.Sprintf("Tailscale %s is logged in.", binary.Version)
	case "NeedsLogin":
		check.Status = HealthFailed
		check.Explanation = "Tailscale is installed but not logged in."
		check.Fix = "Log in to Tailscale."
		check.Command = "tailscale up"
	case "NeedsMachineAuth":
		check.Status = HealthFailed
		check.Explanation = "Tailscale is waiting for an admin to approve this device."
		check.Fix = "Ask your Tailscale admin to approve this device."
	case "Stopped":
		check.Status = HealthFailed
		check.Explanation = "Tailscale is turned off."
		check.Fix = "Turn Tailscale on."
		check.Command = "tailscale up"
	default:
		check.Status = HealthUnknown
		check.Explanation = fmt.Sprintf("Tailscale reports %q.", state.BackendState)
	}
	return check
}

// terminalApplications are the bundles `open -a` launches for each emulator.
var terminalApplications = map[terminal.Emulator]struct{ label, bundle string }{
	terminal.Default:     {label: "Terminal", bundle: "Terminal.app"},
	terminal.TerminalApp: {label: "Terminal", bundle: "Terminal.app"},
	terminal.ITerm:       {label: "iTerm2", bundle: "iTerm.app"},
	terminal.Ghostty:     {label: "Ghostty", bundle: "Ghostty.app"},
}

func checkTerminal(emulator terminal.Emulator, directories []string) HealthCheck {
	check := HealthCheck{Key: HealthCheckTerminal, Name: "Terminal app"}
	application, known := terminalApplications[emulator]
	if !known {
		check.Status = HealthUnknown
		check.Explanation = fmt.Sprintf("%q is not a terminal this app knows.", emulator)
		return check
	}
	if path := findApplication(directories, application.bundle); path != "" {
		check.Status = HealthPassed
		check.Explanation = fmt.Sprintf("%s at %s.", application.label, path)
		return check
	}
	check.Status = HealthFailed
	check.Explanation = application.label + " is not in Applications."
	check.Fix = "Install " + application.label + ", or choose another terminal when you connect."
	return check
}

// jetBrainsLinkHandlers are the apps that open the jetbrains:// link acloud uses for IntelliJ and WebStorm.
var jetBrainsLinkHandlers = []string{"JetBrains Gateway.app", "JetBrains Toolbox.app"}

func checkEditor(ctx context.Context, editor Editor, vsCodeCommand string, directories []string) HealthCheck {
	check := HealthCheck{Key: HealthCheckEditor, Name: "Editor"}
	switch editor {
	case EditorVSCode:
		return checkVSCode(ctx, check, vsCodeCommand)
	case EditorIntelliJ, EditorWebStorm:
		label := map[Editor]string{EditorIntelliJ: "IntelliJ", EditorWebStorm: "WebStorm"}[editor]
		for _, handler := range jetBrainsLinkHandlers {
			if path := findApplication(directories, handler); path != "" {
				check.Status = HealthPassed
				check.Explanation = fmt.Sprintf("%s opens through %s.", label, path)
				return check
			}
		}
		check.Status = HealthWarning
		check.Explanation = fmt.Sprintf("No JetBrains Gateway or Toolbox App in Applications. %s opens playrooms through them.", label)
		check.Fix = "Install JetBrains Gateway or the Toolbox App."
		return check
	}
	check.Status = HealthUnknown
	check.Explanation = fmt.Sprintf("%q is not an editor this app knows.", editor)
	return check
}

func checkVSCode(ctx context.Context, check HealthCheck, vsCodeCommand string) HealthCheck {
	if vsCodeCommand == "" {
		check.Status = HealthFailed
		check.Explanation = "Cannot find VS Code or its code command."
		check.Fix = "Install VS Code in Applications."
		return check
	}
	listContext, cancel := context.WithTimeout(ctx, vsCodeExtensionListTimeout)
	defer cancel()
	command := exec.CommandContext(listContext, vsCodeCommand, "--list-extensions")
	command.WaitDelay = healthCommandWaitDelay
	output, err := command.Output()
	if errors.Is(listContext.Err(), context.DeadlineExceeded) {
		check.Status = HealthUnknown
		check.Explanation = "VS Code did not list its extensions within " + vsCodeExtensionListTimeout.String() + "."
		return check
	}
	if err != nil {
		check.Status = HealthUnknown
		check.Explanation = fmt.Sprintf("VS Code could not list its extensions: %v", err)
		return check
	}
	for _, extension := range strings.Fields(string(output)) {
		if strings.EqualFold(extension, vsCodeRemoteSSHExtension) {
			check.Status = HealthPassed
			check.Explanation = "VS Code at " + vsCodeCommand + " has the Remote - SSH extension."
			return check
		}
	}
	check.Status = HealthFailed
	check.Explanation = "VS Code is installed, but the Remote - SSH extension is not."
	check.Fix = "Install the Remote - SSH extension."
	check.Command = "code --install-extension " + vsCodeRemoteSSHExtension
	return check
}

func findApplication(directories []string, bundle string) string {
	for _, directory := range directories {
		path := filepath.Join(directory, bundle)
		if info, err := os.Stat(path); err == nil && info.IsDir() {
			return path
		}
	}
	return ""
}

func applicationDirectoriesWithHome() []string {
	directories := append([]string(nil), applicationDirectories...)
	if home := homeDirectory(); home != "" {
		directories = append(directories, filepath.Join(home, "Applications"))
	} else {
		log.Printf("Health check cannot search the user's Applications folder: no home folder")
	}
	return directories
}

func homeDirectory() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return home
}
