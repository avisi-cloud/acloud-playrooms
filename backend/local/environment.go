package local

import (
	"bytes"
	"context"
	"errors"
	"log"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

const environmentTimeout = 3 * time.Second

var environmentKey = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

type EnvironmentPresence struct {
	Key string
	Set bool
}

type Environment struct {
	Presence []EnvironmentPresence
	values   []string
}

func (environment Environment) ChildEnvironment() []string { return environment.values }

func ResolveEnvironment(ctx context.Context, entries []string, readVariablesFromLoginShell bool) (Environment, error) {
	return resolveEnvironment(ctx, entries, readVariablesFromLoginShell, os.Getenv("SHELL"), environmentTimeout)
}

func resolveEnvironment(ctx context.Context, entries []string, readVariablesFromLoginShell bool, shell string, timeout time.Duration) (Environment, error) {
	keys := []string{}
	for _, entry := range entries {
		key := strings.TrimSpace(entry)
		if key == "" || strings.Contains(key, "=") {
			continue
		}
		if !environmentKey.MatchString(key) {
			return Environment{}, errors.New("Invalid environment variable name")
		}
		keys = append(keys, key)
	}
	environment := Environment{Presence: []EnvironmentPresence{}}
	if len(keys) == 0 {
		return environment, nil
	}
	values := os.Environ()
	if readVariablesFromLoginShell {
		if shell == "" {
			log.Print("Reading variables from login shell failed; SHELL is not configured")
			return Environment{}, errors.New("Login shell is not configured; set SHELL or turn off reading variables from your login shell")
		}
		shellContext, cancel := context.WithTimeout(ctx, timeout)
		defer cancel()
		command := exec.CommandContext(shellContext, shell, "-l", "-c", "env -0")
		command.WaitDelay = 100 * time.Millisecond
		var output bytes.Buffer
		command.Stdout = &output
		if err := command.Run(); err != nil {
			log.Print("Reading variables from login shell failed; no shell output is logged")
			return Environment{}, errors.New("Could not read variables from your login shell; check your shell configuration or turn off reading variables from your login shell")
		}
		values = strings.Split(output.String(), "\x00")
	}
	for _, key := range keys {
		value, set := "", false
		for _, assignment := range values {
			name, candidate, found := strings.Cut(assignment, "=")
			if found && name == key {
				value, set = candidate, true
			}
		}
		environment.Presence = append(environment.Presence, EnvironmentPresence{Key: key, Set: set})
		if set {
			environment.values = append(environment.values, key+"="+value)
		}
	}
	return environment, nil
}
