package local

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
)

type TemplateExposure string

const (
	TemplateExposureDefault     TemplateExposure = ""
	TemplateExposureTailscale   TemplateExposure = "tailscale"
	TemplateExposureNodeport    TemplateExposure = "nodeport"
	TemplateExposurePortforward TemplateExposure = "portforward"
)

type TemplateCapabilities string

const (
	TemplateCapabilitiesDefault  TemplateCapabilities = ""
	TemplateCapabilitiesMinimal  TemplateCapabilities = "minimal"
	TemplateCapabilitiesStandard TemplateCapabilities = "standard"
)

type PlayroomTemplateOptions struct {
	Image              string               `json:"image"`
	Storage            string               `json:"storage"`
	CpuReq             string               `json:"cpuReq"`
	CpuLim             string               `json:"cpuLim"`
	MemReq             string               `json:"memReq"`
	MemLim             string               `json:"memLim"`
	Env                []string             `json:"env"`
	Git                []string             `json:"git"`
	Copy               []string             `json:"copy"`
	Ports              []string             `json:"ports"`
	ProxyGroup         string               `json:"proxyGroup"`
	Exposure           TemplateExposure     `json:"exposure"`
	NodePortSSH        bool                 `json:"nodePortSSH"`
	Capabilities       TemplateCapabilities `json:"capabilities"`
	CapAdd             []string             `json:"capAdd"`
	Ephemeral          bool                 `json:"ephemeral"`
	ReadOnly           bool                 `json:"readOnly"`
	Privileged         bool                 `json:"privileged"`
	WorkspaceNamespace bool                 `json:"workspaceNamespace"`
	NoWait             bool                 `json:"noWait"`
	WaitTimeout        string               `json:"waitTimeout"`
	ForceInstall       bool                 `json:"forceInstall"`
}

type PlayroomTemplate struct {
	Name    string                  `json:"name"`
	Options PlayroomTemplateOptions `json:"options"`
}

type PlayroomTemplateFile struct {
	Version   int                `json:"version"`
	Templates []PlayroomTemplate `json:"templates"`
}

var templateEnvironmentKey = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

func ValidatePlayroomTemplates(templates []PlayroomTemplate) error {
	names := map[string]bool{}
	for _, template := range templates {
		if strings.TrimSpace(template.Name) == "" || template.Name != strings.TrimSpace(template.Name) {
			return fmt.Errorf("template name must not be blank or have surrounding spaces")
		}
		if names[template.Name] {
			return fmt.Errorf("template %q already exists; rename it before importing", template.Name)
		}
		names[template.Name] = true
		for _, key := range template.Options.Env {
			if !templateEnvironmentKey.MatchString(key) {
				return fmt.Errorf("template %q: environment entries must be keys, never values", template.Name)
			}
		}
		switch template.Options.Exposure {
		case TemplateExposureDefault, TemplateExposureTailscale, TemplateExposureNodeport, TemplateExposurePortforward:
		default:
			return fmt.Errorf("template %q: unknown exposure %q", template.Name, template.Options.Exposure)
		}
		switch template.Options.Capabilities {
		case TemplateCapabilitiesDefault, TemplateCapabilitiesMinimal, TemplateCapabilitiesStandard:
		default:
			return fmt.Errorf("template %q: unknown capabilities %q", template.Name, template.Options.Capabilities)
		}
		if template.Options.NodePortSSH && template.Options.Exposure == TemplateExposureNodeport {
			return fmt.Errorf("template %q: NodePort SSH cannot be combined with NodePort exposure", template.Name)
		}
	}
	return nil
}

func DecodePlayroomTemplates(content []byte) ([]PlayroomTemplate, error) {
	var file PlayroomTemplateFile
	decoder := json.NewDecoder(bytes.NewReader(content))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&file); err != nil {
		return nil, fmt.Errorf("invalid template file: %w", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return nil, fmt.Errorf("template file must contain one JSON object")
	}
	var required struct {
		Templates []struct {
			Options map[string]json.RawMessage `json:"options"`
		} `json:"templates"`
	}
	if err := json.Unmarshal(content, &required); err != nil {
		return nil, err
	}
	optionFields := reflect.TypeFor[PlayroomTemplateOptions]()
	for _, template := range required.Templates {
		for i := 0; i < optionFields.NumField(); i++ {
			key := optionFields.Field(i).Tag.Get("json")
			value, present := template.Options[key]
			if !present || bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
				return nil, fmt.Errorf("template option %q is required and cannot be null", key)
			}
		}
	}
	if file.Version != 1 {
		return nil, fmt.Errorf("unsupported template version %d; expected version 1", file.Version)
	}
	if file.Templates == nil {
		return nil, fmt.Errorf("template file must contain a templates array")
	}
	if err := ValidatePlayroomTemplates(file.Templates); err != nil {
		return nil, err
	}
	return file.Templates, nil
}

func EncodePlayroomTemplates(templates []PlayroomTemplate) ([]byte, error) {
	if err := ValidatePlayroomTemplates(templates); err != nil {
		return nil, err
	}
	if templates == nil {
		templates = []PlayroomTemplate{}
	}
	templates = append([]PlayroomTemplate{}, templates...)
	for i := range templates {
		if templates[i].Options.Env == nil {
			templates[i].Options.Env = []string{}
		}
		if templates[i].Options.Git == nil {
			templates[i].Options.Git = []string{}
		}
		if templates[i].Options.Copy == nil {
			templates[i].Options.Copy = []string{}
		}
		if templates[i].Options.Ports == nil {
			templates[i].Options.Ports = []string{}
		}
		if templates[i].Options.CapAdd == nil {
			templates[i].Options.CapAdd = []string{}
		}
	}
	return json.MarshalIndent(PlayroomTemplateFile{Version: 1, Templates: templates}, "", "  ")
}

func PlayroomTemplatesPath() (string, error) {
	directory, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(directory, "acloud", "gui-templates.json"), nil
}

func ReadPlayroomTemplates(path string) ([]PlayroomTemplate, error) {
	content, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return []PlayroomTemplate{}, nil
	}
	if err != nil {
		return nil, err
	}
	return DecodePlayroomTemplates(content)
}

func WritePlayroomTemplates(path string, templates []PlayroomTemplate) error {
	content, err := EncodePlayroomTemplates(templates)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".templates-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if _, err := file.Write(content); err != nil {
		file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	return os.Rename(file.Name(), path)
}
