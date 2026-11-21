package local

import (
	"context"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type updateTransport func(*http.Request) (*http.Response, error)

func (transport updateTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	return transport(request)
}

func TestUpdateVersionComparison(t *testing.T) {
	for _, test := range []struct {
		candidate, current string
		newer              bool
	}{
		{"v1.10.0", "1.9.9", true}, {"2.0.0", "1.99.99", true}, {"1.0.1", "1.0.0", true},
		{"1.0.0", "1.0.0", false}, {"1.0.0", "1.1.0", false}, {"1.0.0+build", "1.0.0+dev", false},
		{"1.0.0", "1.0.0-rc.1", true}, {"1.0.0-rc.1", "1.0.0", false}, {"1.0.0-rc.10", "1.0.0-rc.2", true},
		{"1.0.0-beta", "1.0.0-alpha", true}, {"1.0.0-1", "1.0.0-alpha", false}, {"1.0.0-alpha.1", "1.0.0-alpha", true},
		{"bad", "1.0.0", false}, {"1.0.0", "dev", false}, {"1.2", "1.0.0", false}, {"01.2.3", "1.0.0", false},
		{"1.1.0-alpha..1", "1.0.0", false}, {"1.1.0-01", "1.0.0", false}, {"1.1.0+foo..bar", "1.0.0", false},
		{"1.0.0-99999999999999999999", "1.0.0-9999999999999999999", true},
	} {
		t.Run(test.candidate+"_"+test.current, func(t *testing.T) {
			if got := isUpdateVersionNewer(test.candidate, test.current); got != test.newer {
				t.Fatalf("got %v, want %v", got, test.newer)
			}
		})
	}
}

func TestUpdateDailyLimitPersistsAcrossLaunchesAndDisabledChecks(t *testing.T) {
	now := time.Date(2026, 11, 20, 12, 0, 0, 0, time.UTC)
	appCalls, brewCalls := 0, 0
	checker := updateChecker{
		path: filepath.Join(t.TempDir(), "updates.json"), now: func() time.Time { return now },
		client: &http.Client{Transport: updateTransport(func(request *http.Request) (*http.Response, error) {
			appCalls++
			if request.URL.String() != latestReleaseAPI || request.Method != http.MethodGet || request.Body != nil || request.URL.RawQuery != "" {
				t.Fatal("request must carry no user data")
			}
			if request.Header.Get("User-Agent") != "desktop-version-check" || request.Header.Get("Authorization") != "" || request.Header.Get("Cookie") != "" || len(request.Header) != 2 {
				t.Fatalf("unexpected headers: %v", request.Header)
			}
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"tag_name":"v1.1.0"}`))}, nil
		})},
		brew: func(context.Context) string { brewCalls++; return "0.41.0" },
	}
	if got := checker.check(context.Background(), "1.0.0", false); got.AppVersion != "" || appCalls != 0 {
		t.Fatal("disabled app check contacted GitHub")
	}
	if got := checker.check(context.Background(), "1.0.0", true); got.AppVersion != "1.1.0" || got.AcloudVersion != "0.41.0" {
		t.Fatalf("%+v", got)
	}
	checker.loaded = false
	checker.cache = updateCache{}
	now = now.Add(24*time.Hour - time.Second)
	checker.check(context.Background(), "1.0.0", true)
	if appCalls != 1 || brewCalls != 1 {
		t.Fatal("checked again within a day or lost persisted cache")
	}
	now = now.Add(time.Second)
	checker.check(context.Background(), "1.1.0", true)
	if appCalls != 2 || brewCalls != 2 {
		t.Fatal("did not check after a day")
	}
	if got := checker.check(context.Background(), "1.1.0", true); got.AppVersion != "" {
		t.Fatal("updated app should not see old notice")
	}
}

func TestFailedReleaseChecksAreCachedAndQuiet(t *testing.T) {
	for _, response := range []string{"network", "status", "invalid", `{"tag_name":"v2.0.0","prerelease":true}`, `{"tag_name":"v2.0.0","draft":true}`, `{"tag_name":"bad"}`} {
		t.Run(response, func(t *testing.T) {
			calls := 0
			checker := updateChecker{loaded: true, now: time.Now, brew: func(context.Context) string { return "" }, client: &http.Client{Transport: updateTransport(func(_ *http.Request) (*http.Response, error) {
				calls++
				if response == "network" {
					return nil, errors.New("offline")
				}
				status := 200
				if response == "status" {
					status = 403
				}
				return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(response))}, nil
			})}}
			for range 2 {
				if got := checker.check(context.Background(), "1.0.0", true); got.AppVersion != "" {
					t.Fatalf("%+v", got)
				}
			}
			if calls != 1 {
				t.Fatal("retried failed release check within a day")
			}
		})
	}
}

func TestParseHomebrewUpdate(t *testing.T) {
	for _, test := range []struct{ output, version string }{
		{`{"casks":[{"name":"acloud","installed_versions":["0.40.0"],"current_version":"0.41.0"}]}`, "0.41.0"},
		{`{"casks":[{"full_token":"avisi-cloud/tools/acloud","installed_versions":["0.40.0"],"current_version":"0.41.0"}]}`, "0.41.0"},
		{`{"casks":[]}`, ""}, {`{"formulae":[],"casks":[{"name":"other","installed_versions":["1.0.0"],"current_version":"2.0.0"}]}`, ""},
		{`{"casks":[{"name":"acloud","installed_versions":["0.41.0"],"current_version":"0.41.0"}]}`, ""},
		{`{"casks":[{"name":"acloud","installed_versions":["unknown"],"current_version":"0.41.0"}]}`, ""}, {`broken`, ""},
	} {
		if got := parseHomebrewUpdate([]byte(test.output)); got != test.version {
			t.Fatalf("parse %s: got %q, want %q", test.output, got, test.version)
		}
	}
}

func TestHomebrewCheckOnlyRunsForCaskInstallation(t *testing.T) {
	directory := t.TempDir()
	brew := filepath.Join(directory, "brew")
	script := "#!/bin/sh\n[ \"$*\" = 'outdated --cask --json=v2 avisi-cloud/tools/acloud' ] || exit 2\n[ \"$HOMEBREW_NO_AUTO_UPDATE\" = 1 ] || exit 2\n[ \"$HOMEBREW_NO_ANALYTICS\" = 1 ] || exit 2\nprintf '%s' '{\"casks\":[{\"name\":\"acloud\",\"installed_versions\":[\"0.40.0\"],\"current_version\":\"0.41.0\"}]}'\n"
	if err := os.WriteFile(brew, []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", directory)
	for _, cask := range []bool{false, true} {
		path := filepath.Join(directory, "acloud")
		if cask {
			path = filepath.Join(directory, "Caskroom", "acloud", "0.40.0", "acloud")
		}
		if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte("#!/bin/sh\nprintf 'Version: 0.40.0\\n'\n"), 0o700); err != nil {
			t.Fatal(err)
		}
		t.Setenv("ACLOUD_BINARY", path)
		got := checkHomebrewUpdate(context.Background())
		if cask && got != "0.41.0" || !cask && got != "" {
			t.Fatalf("cask=%v: %q", cask, got)
		}
	}
}

func TestUpdateHTTPClientIsBoundedAndRefusesRedirects(t *testing.T) {
	if updates.client.Timeout != 5*time.Second {
		t.Fatal("release request must time out after five seconds")
	}
	if err := updates.client.CheckRedirect(nil, nil); err != http.ErrUseLastResponse {
		t.Fatal("release request must not follow redirects")
	}
}
