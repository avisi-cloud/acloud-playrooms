package local

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/avisi-cloud/acloud-playrooms/backend/cli"
	"gopkg.in/yaml.v3"
)

type configFile struct {
	CurrentContext string          `yaml:"current-context"`
	Contexts       []contextRef    `yaml:"contexts"`
	Users          []userRef       `yaml:"users"`
	Cache          configFileCache `yaml:"cache"`
}

type configFileCache struct {
	LastPlayhouse lastPlayhouse `yaml:"last-playhouse"`
}

type lastPlayhouse struct {
	Playhouse string `yaml:"playhouse"`
}

type contextRef struct {
	Name    string `yaml:"name"`
	Context struct {
		User string `yaml:"user"`
	} `yaml:"context"`
}

type userRef struct {
	Name string `yaml:"name"`
	User struct {
		OIDC struct {
			Cache struct {
				AccessToken  string `yaml:"access-token"`
				RefreshToken string `yaml:"refresh-token"`
			} `yaml:"cache"`
		} `yaml:"oidc"`
		PersonalAccessToken struct {
			Token string `yaml:"token"`
		} `yaml:"personal-access-token"`
	} `yaml:"user"`
}

// CachedPlayhouse returns the last-used playhouse slug from acloud's config
// cache, so the GUI opens on whatever the user last worked in.
func CachedPlayhouse() string {
	config, err := readConfigFile()
	if err != nil {
		return ""
	}
	return config.Cache.LastPlayhouse.Playhouse
}

// CurrentUser returns the logged-in user's email when it can be read from the
// cached OIDC access token. For token-based users, it falls back to the user ref.
func CurrentUser() (string, error) {
	config, err := readConfigFile()
	if err != nil {
		return "", err
	}
	user, ok := config.currentUser()
	if !ok {
		return "", errors.New("no current acloud user in config")
	}
	if email, err := emailFromJWT(user.User.OIDC.Cache.AccessToken); err == nil && email != "" {
		return email, nil
	}
	if user.Name != "" {
		return user.Name, nil
	}
	return "", errors.New("current acloud user has no readable identity")
}

// IsLoggedIn reports whether the current context holds usable credentials.
func IsLoggedIn() bool {
	config, err := readConfigFile()
	if err != nil {
		return false
	}
	user, ok := config.currentUser()
	if !ok {
		return false
	}
	if user.User.PersonalAccessToken.Token != "" {
		return true
	}
	return user.User.OIDC.Cache.AccessToken != "" && user.User.OIDC.Cache.RefreshToken != ""
}

// AcloudVersion returns the installed acloud version. Empty means acloud is not
// installed, not on PATH, or printed an unrecognised version string.
func AcloudVersion() string {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	result, err := cli.Run(ctx, []string{"version"}, cli.Options{})
	if err != nil {
		return ""
	}
	return parseAcloudVersion(result.Stdout)
}

func readConfigFile() (configFile, error) {
	path, err := acloudConfigPath()
	if err != nil {
		return configFile{}, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return configFile{}, err
	}
	var config configFile
	if err := yaml.Unmarshal(data, &config); err != nil {
		return configFile{}, fmt.Errorf("parse acloud config: %w", err)
	}
	return config, nil
}

func acloudConfigPath() (string, error) {
	if path := os.Getenv("ACLOUDCONFIG"); path != "" {
		return path, nil
	}
	if path := os.Getenv("ACLOUD_CONFIG"); path != "" {
		return path, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".acloud.yaml"), nil
}

func (config configFile) currentUser() (userRef, bool) {
	if config.CurrentContext == "" {
		return userRef{}, false
	}
	userName := ""
	for _, context := range config.Contexts {
		if context.Name == config.CurrentContext {
			userName = context.Context.User
			break
		}
	}
	if userName == "" {
		return userRef{}, false
	}
	for _, user := range config.Users {
		if user.Name == userName {
			return user, true
		}
	}
	return userRef{}, false
}

func emailFromJWT(token string) (string, error) {
	parts := strings.Split(token, ".")
	if len(parts) < 2 {
		return "", errors.New("not a JWT")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", err
	}
	var claims struct {
		Email string `json:"email"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return "", err
	}
	if claims.Email == "" {
		return "", errors.New("JWT is missing email claim")
	}
	return claims.Email, nil
}

func parseAcloudVersion(output string) string {
	for _, field := range strings.Fields(output) {
		trimmed := strings.Trim(field, ",")
		if strings.HasPrefix(trimmed, "v") {
			trimmed = strings.TrimPrefix(trimmed, "v")
		}
		if looksLikeVersion(trimmed) {
			return trimmed
		}
	}
	return ""
}

func looksLikeVersion(value string) bool {
	parts := strings.Split(value, ".")
	if len(parts) < 2 {
		return false
	}
	for _, part := range parts {
		if part == "" {
			return false
		}
		for _, r := range part {
			if r < '0' || r > '9' {
				return false
			}
		}
	}
	return true
}
