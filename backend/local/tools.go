package local

import (
	"context"
	"errors"
	"os/exec"
	"strings"
	"time"
)

// ToolStatus reports whether an external tool a playroom depends on is usable.
type ToolStatus struct {
	Name    string
	Command string
	State   string // "installed" | "missing" | "unknown"
	Path    string
	Message string
}

type toolCheck struct {
	name      string
	command   string
	arguments []string
}

// requiredTools are the binaries playroom connectivity depends on.
var requiredTools = []toolCheck{
	{name: "Tailscale", command: "tailscale", arguments: []string{"version"}},
	{name: "SSH", command: "ssh", arguments: []string{"-V"}},
}

// ToolStatuses probes each required tool.
func ToolStatuses() []ToolStatus {
	statuses := make([]ToolStatus, 0, len(requiredTools))
	for _, tool := range requiredTools {
		statuses = append(statuses, checkTool(tool))
	}
	return statuses
}

func checkTool(tool toolCheck) ToolStatus {
	path, err := exec.LookPath(tool.command)
	if err != nil {
		return ToolStatus{
			Name:    tool.name,
			Command: tool.command,
			State:   "missing",
			Message: tool.command + " not found",
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	output, err := exec.CommandContext(ctx, path, tool.arguments...).CombinedOutput()
	if err != nil {
		message := tool.command + " check failed"
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			message = tool.command + " check timed out"
		} else if trimmed := strings.TrimSpace(string(output)); trimmed != "" {
			message = trimmed
		}
		return ToolStatus{
			Name:    tool.name,
			Command: tool.command,
			State:   "unknown",
			Path:    path,
			Message: message,
		}
	}

	return ToolStatus{
		Name:    tool.name,
		Command: tool.command,
		State:   "installed",
		Path:    path,
		Message: tool.command + " found",
	}
}
