//go:build gui

package gui

import "testing"

func TestDevelopmentVersionFromConfiguration(t *testing.T) {
	for _, test := range []struct {
		name, configuration, expected string
	}{
		{"application version, not task version", "version: \"3\"\ninfo:\n  version: '0.28.0'\n", "0.28.0+dev"},
		{"unquoted version", "info:\n  version: 0.29.0\n", "0.29.0+dev"},
		{"whitespace", "info:\n  version: ' 0.29.0 '\n", "0.29.0+dev"},
		{"missing application version", "version: \"3\"\n", "0.0.0+dev"},
		{"empty application version", "info:\n  version: ''\n", "0.0.0+dev"},
		{"invalid YAML", "info: [", "0.0.0+dev"},
	} {
		t.Run(test.name, func(t *testing.T) {
			if actual := developmentVersionFromConfiguration([]byte(test.configuration)); actual != test.expected {
				t.Fatalf("version = %q, want %q", actual, test.expected)
			}
		})
	}
}
