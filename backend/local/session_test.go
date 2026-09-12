package local

import (
	"os"
	"path/filepath"
	"testing"
)

// configFile writes a config the CLI can load, optionally carrying a
// credential. Callers point ACLOUDCONFIG at it, never at the real file.
func writeTestConfigFile(t *testing.T, token string) string {
	t.Helper()
	user := "{}"
	if token != "" {
		user = `{personal-access-token: {token: "` + token + `"}}`
	}
	body := `configVersion: v1
current-context: demo
contexts:
  - name: demo
    context: {api: demo-api, user: demo-user, organisation: avisi}
apis:
  - name: demo-api
    api: {endpoint: "https://example.invalid"}
users:
  - name: demo-user
    user: ` + user + "\n"

	path := filepath.Join(t.TempDir(), ".acloud.yaml")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatalf("write config: %v", err)
	}
	return path
}

// The login hand-off depends on this: `auth login` writes the credential from a
// terminal, and the GUI polls IsLoggedIn to notice.
func TestIsLoggedInSeesACredentialWrittenAfterStartup(t *testing.T) {
	path := writeTestConfigFile(t, "")
	t.Setenv("ACLOUDCONFIG", path)

	if IsLoggedIn() {
		t.Fatal("expected signed out while the config carries no token")
	}

	// What the terminal login does, from the GUI's point of view.
	withToken := writeTestConfigFile(t, "a-real-token")
	body, err := os.ReadFile(withToken)
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	if err := os.WriteFile(path, body, 0o600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	if !IsLoggedIn() {
		t.Fatal("a credential written after startup was not noticed")
	}
}

// A first-time user has no config file, and CurrentContext() would exit the
// process — for a desktop app, the window vanishing at launch.
func TestIsLoggedInSurvivesAMachineThatHasNeverRunAcloud(t *testing.T) {
	t.Setenv("ACLOUDCONFIG", filepath.Join(t.TempDir(), "does-not-exist.yaml"))

	if IsLoggedIn() {
		t.Fatal("expected signed out with no config file")
	}
}

// The same path, but for a config file that exists and names no context.
func TestIsLoggedInSurvivesAConfigWithNoCurrentContext(t *testing.T) {
	path := filepath.Join(t.TempDir(), ".acloud.yaml")
	if err := os.WriteFile(path, []byte("configVersion: v1\n"), 0o600); err != nil {
		t.Fatalf("write config: %v", err)
	}
	t.Setenv("ACLOUDCONFIG", path)

	if IsLoggedIn() {
		t.Fatal("expected signed out with no current context")
	}
}

// CachedPlayhouse has to follow the same file, because the user can switch
// playhouse from their terminal while the GUI is open.
func TestCachedPlayhouseReadsTheCurrentFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), ".acloud.yaml")
	t.Setenv("ACLOUDCONFIG", path)

	body := `configVersion: v1
current-context: demo
contexts:
  - name: demo
    context: {api: demo-api, user: demo-user, organisation: avisi}
apis:
  - name: demo-api
    api: {endpoint: "https://example.invalid"}
users:
  - name: demo-user
    user: {}
cache:
  last-playhouse:
    playhouse: playhouse-demo
`
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	if actual := CachedPlayhouse(); actual != "playhouse-demo" {
		t.Fatalf("CachedPlayhouse() = %q, want %q", actual, "playhouse-demo")
	}
}
