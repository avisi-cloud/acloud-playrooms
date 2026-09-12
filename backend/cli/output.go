package cli

import (
	"bufio"
	"bytes"
	"io"
	"sync"
)

const (
	// maxCapture bounds how much of a stream we hold in memory.
	maxCapture = 4 << 20 // 4 MiB

	// maxLine is the longest single line the streaming scanner accepts.
	maxLine = 1 << 20 // 1 MiB
)

// boundedBuffer is a bounded io.Writer. It never returns an error: failing a
// command because of our own buffer limit would be worse than losing trailing
// output.
type boundedBuffer struct {
	mutex     sync.Mutex
	buffer    bytes.Buffer
	truncated bool
}

func (boundedBuffer *boundedBuffer) Write(data []byte) (int, error) {
	boundedBuffer.mutex.Lock()
	defer boundedBuffer.mutex.Unlock()
	switch room := maxCapture - boundedBuffer.buffer.Len(); {
	case room <= 0:
		boundedBuffer.truncated = len(data) > 0 || boundedBuffer.truncated
	case len(data) > room:
		boundedBuffer.buffer.Write(data[:room])
		boundedBuffer.truncated = true
	default:
		boundedBuffer.buffer.Write(data)
	}
	return len(data), nil
}

func (boundedBuffer *boundedBuffer) String() string {
	boundedBuffer.mutex.Lock()
	defer boundedBuffer.mutex.Unlock()
	return boundedBuffer.buffer.String()
}

// consume drains one output stream into sink: copied wholesale without an
// operationID so quick reads stay byte-exact, else emitted line by line with
// secrets blanked.
func (runner *Runner) consume(reader io.Reader, stream Stream, operationID string, secrets []string, sink *boundedBuffer) {
	if operationID == "" {
		_, _ = io.Copy(sink, reader)
		return
	}

	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 0, 64*1024), maxLine)
	for scanner.Scan() {
		line := scanner.Text()
		_, _ = sink.Write(append([]byte(line), '\n'))
		runner.emit(Event{Type: EventOutput, OperationID: operationID, Stream: stream, Line: redactWith(line, secrets)})
	}
	if scanner.Err() != nil {
		// A line longer than maxLine stops the scan; keep draining so the child
		// never blocks on a full pipe.
		_, _ = io.Copy(sink, reader)
	}
}
