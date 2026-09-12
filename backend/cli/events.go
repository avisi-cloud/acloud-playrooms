package cli

// Stream names which of a command's two output streams a line came from, so
// the console pane can tell diagnostics apart from real output.
type Stream string

const (
	StreamStdout Stream = "stdout"
	StreamStderr Stream = "stderr"
)

// EventType names the three moments in a command's life the UI cares about.
// The values double as the Wails event names the frontend subscribes to.
type EventType string

const (
	EventStarted EventType = "cli:started"
	EventOutput  EventType = "cli:output"
	EventDone    EventType = "cli:done"
)

// Event is what the UI receives while a command runs. Type decides which
// fields are set.
type Event struct {
	Type        EventType `json:"type"`
	OperationID string    `json:"operationId"`
	Command     []string  `json:"command,omitempty"`
	Stream      Stream    `json:"stream,omitempty"`
	Line        string    `json:"line,omitempty"`
	ExitCode    int       `json:"exitCode"`
	Error       string    `json:"error,omitempty"`
}

// Emitter delivers events to the UI. It stays an injected function so this
// package never imports Wails; gui supplies the real one at startup.
type Emitter func(Event)
