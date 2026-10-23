package playroom

import (
	"encoding/json"
	"testing"
)

// Trimmed from `acloud playroom list -o json` (0.39.0): one room with
// forwarded ports, one with SSH only.
const playroomListJSON = `[
  {"name":"web","owner":"someone@example.com","status":"Ready","sshHost":"web","createdAt":"2026-10-23T09:00:00Z","diskSize":"10Gi","diskType":"persistent","system":"read-only","outdated":true,
   "capabilityProfile":"minimal","capabilityAdditions":["NET_RAW","SYS_PTRACE"],
   "ports":[{"port":3000,"targetPort":3000},{"port":80,"targetPort":8080}]},
  {"name":"plain","owner":"someone@example.com","status":"Stopped","createdAt":"2026-10-23T09:00:00Z","ports":null}
]`

func TestListingDecodesTheJSONPlayroomListPrints(t *testing.T) {
	var rows []Listing
	if err := json.Unmarshal([]byte(playroomListJSON), &rows); err != nil {
		t.Fatalf("decode playroom list: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("got %d rows, want 2", len(rows))
	}

	want := []PortForward{{Port: 3000, TargetPort: 3000}, {Port: 80, TargetPort: 8080}}
	if len(rows[0].Ports) != len(want) {
		t.Fatalf("got ports %+v, want %+v", rows[0].Ports, want)
	}
	for i := range want {
		if rows[0].Ports[i] != want[i] {
			t.Errorf("port %d: got %+v, want %+v", i, rows[0].Ports[i], want[i])
		}
	}
	if rows[0].Name != "web" || rows[0].DiskSize != "10Gi" {
		t.Errorf("lowercase keys must still fill the fields, got %+v", rows[0])
	}
	if !rows[0].Outdated || rows[1].Outdated {
		t.Errorf("outdated = %v / %v, want true / false", rows[0].Outdated, rows[1].Outdated)
	}
	if rows[0].CapabilityProfile != "minimal" || len(rows[0].CapabilityAdditions) != 2 {
		t.Errorf("capabilities = %q + %v, want minimal + 2 additions", rows[0].CapabilityProfile, rows[0].CapabilityAdditions)
	}
	if rows[1].Ports != nil {
		t.Errorf("SSH-only room: got ports %+v, want none", rows[1].Ports)
	}
}
