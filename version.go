//go:build gui

package gui

import (
	_ "embed"
	"strings"

	"gopkg.in/yaml.v3"
)

//go:embed build/config.yml
var embeddedBuildConfiguration []byte

// DevelopmentVersion adds development metadata to the configured application version.
func DevelopmentVersion() string {
	return developmentVersionFromConfiguration(embeddedBuildConfiguration)
}

func developmentVersionFromConfiguration(configuration []byte) string {
	var buildConfiguration struct {
		Info struct {
			Version string `yaml:"version"`
		} `yaml:"info"`
	}
	if err := yaml.Unmarshal(configuration, &buildConfiguration); err == nil {
		if version := strings.TrimSpace(buildConfiguration.Info.Version); version != "" {
			return version + "+dev"
		}
	}
	return "0.0.0+dev"
}
