package playhouse

import (
	"encoding/json"
	"testing"
)

// Trimmed from `acloud playhouse list -o json` (0.39.0).
const playhouseListJSON = `[
  {"identity":"a1","slug":"playhouse-demo","status":"running","region":"fsn1","version":"1.33.4","layoutVersion":3,"layoutStatus":"outdated"},
  {"identity":"b2","slug":"playhouse-old","status":"running","layoutVersion":null,"layoutStatus":"unknown"}
]`

func TestPlayhouseEntryDecodesTheLayout(t *testing.T) {
	var entries []PlayhouseEntry
	if err := json.Unmarshal([]byte(playhouseListJSON), &entries); err != nil {
		t.Fatalf("decode playhouse list: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("got %d entries, want 2", len(entries))
	}
	if entries[0].LayoutVersion == nil || *entries[0].LayoutVersion != 3 {
		t.Errorf("layoutVersion = %v, want 3", entries[0].LayoutVersion)
	}
	if entries[0].LayoutStatus != LayoutOutdated {
		t.Errorf("layoutStatus = %q, want %q", entries[0].LayoutStatus, LayoutOutdated)
	}
	// An unread version stays unknown instead of reading as layout 0.
	if entries[1].LayoutVersion != nil || entries[1].LayoutStatus != LayoutUnknown {
		t.Errorf("unread layout = %v / %q, want nil / %q", entries[1].LayoutVersion, entries[1].LayoutStatus, LayoutUnknown)
	}
}
