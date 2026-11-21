package local

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestTemplatesRoundTripAndPrivateStorage(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config", "templates.json")
	templates := []PlayroomTemplate{{Name: "Web", Options: PlayroomTemplateOptions{Image: "base", Env: []string{"TOKEN"}, Privileged: true, Ports: []string{"8080:80"}}}}
	if err := WritePlayroomTemplates(path, templates); err != nil {
		t.Fatal(err)
	}
	got, err := ReadPlayroomTemplates(path)
	if err != nil || len(got) != 1 || got[0].Options.Env[0] != "TOKEN" || !got[0].Options.Privileged {
		t.Fatalf("round trip: %+v %v", got, err)
	}
	info, _ := os.Stat(path)
	if info.Mode().Perm() != 0600 {
		t.Fatal("template file must be private")
	}
}

func TestTemplatesRejectInvalidFiles(t *testing.T) {
	for _, content := range []string{
		`{"version":2,"templates":[]}`,
		`{"version":1,"templates":[],"other":true}`,
		`{"version":1,"templates":[{"name":"Web","options":{"secret":"value"}}]}`,
		`{"version":1,"templates":[{"name":"Web","options":{"env":["TOKEN=value"]}}]}`,
		`{"version":1,"templates":[{"name":"Web","options":{"exposure":"public"}}]}`,
		`{"version":1,"templates":[{"name":"Web","options":{"capabilities":"all"}}]}`,
		`{"version":1,"templates":[{"name":"Web","options":{}},{"name":"Web","options":{}}]}`,
		`{"version":1,"templates":[{"name":" ","options":{}}]}`,
		`{"version":1,"templates":[]} {}`,
		`{"version":1}`,
		`{"version":1,"templates":[{"name":"Web","options":{"exposure":"nodeport","nodePortSSH":true}}]}`,
	} {
		if _, err := DecodePlayroomTemplates([]byte(content)); err == nil {
			t.Errorf("accepted %s", content)
		}
	}
}

func TestTemplatesMissingAndCorruptStorage(t *testing.T) {
	path := filepath.Join(t.TempDir(), "templates.json")
	if got, err := ReadPlayroomTemplates(path); err != nil || len(got) != 0 {
		t.Fatalf("missing: %v %v", got, err)
	}
	if err := os.WriteFile(path, []byte("broken"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := ReadPlayroomTemplates(path); err == nil || !strings.Contains(err.Error(), "invalid template file") {
		t.Fatal("corruption must be reported")
	}
	if err := WritePlayroomTemplates(path, []PlayroomTemplate{{Name: "Invalid", Options: PlayroomTemplateOptions{Env: []string{"TOKEN=value"}}}}); err == nil {
		t.Fatal("invalid writes must be refused")
	}
	content, _ := os.ReadFile(path)
	if string(content) != "broken" {
		t.Fatal("invalid write changed storage")
	}
}

func TestTemplateValidationUsesAllProvidedOptions(t *testing.T) {
	template := PlayroomTemplate{Name: "Web", Options: PlayroomTemplateOptions{Image: "base", Env: []string{"TOKEN"}}}
	content, err := EncodePlayroomTemplates([]PlayroomTemplate{template})
	if err != nil {
		t.Fatal(err)
	}
	for _, invalid := range []string{
		strings.Replace(string(content), `"TOKEN"`, `"TOKEN=value"`, 1),
		strings.Replace(string(content), `"exposure": ""`, `"exposure": "public"`, 1),
		strings.Replace(string(content), `"capabilities": ""`, `"capabilities": "all"`, 1),
		strings.Replace(string(content), `"privileged": false`, `"privileged": null`, 1),
		strings.Replace(string(content), `"privileged": false`, `"privileged": "yes"`, 1),
		strings.Replace(string(content), `"image": "base",`, ``, 1),
	} {
		if _, err := DecodePlayroomTemplates([]byte(invalid)); err == nil {
			t.Errorf("accepted invalid options: %s", invalid)
		}
	}
	for _, options := range []PlayroomTemplateOptions{
		{Env: []string{"TOKEN=value"}}, {Exposure: "public"}, {Capabilities: "all"}, {Exposure: TemplateExposureNodeport, NodePortSSH: true},
	} {
		if err := ValidatePlayroomTemplates([]PlayroomTemplate{{Name: "Web", Options: options}}); err == nil {
			t.Errorf("accepted %+v", options)
		}
	}
	if _, err := EncodePlayroomTemplates([]PlayroomTemplate{template, template}); err == nil {
		t.Fatal("accepted duplicate names")
	}
}
