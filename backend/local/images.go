package local

import "sort"

const defaultImage = "opencode"

// imageAlias is what the GUI knows about one alias acloud accepts for --image.
type imageAlias struct {
	reference          string
	description        string
	requiresPrivileged bool
}

var imageAliases = map[string]imageAlias{
	"opencode": {
		reference:   "registry.avisi.cloud/library/playrooms/opencode:latest",
		description: "OpenCode.",
	},
	"claude-code": {
		reference:   "registry.avisi.cloud/library/playrooms/claude-code:latest",
		description: "Claude Code. Without sudo in an ordinary playroom, with sudo in a privileged one.",
	},
	"claude-code-rootless": {
		reference:   "registry.avisi.cloud/library/playrooms/claude-code-rootless:latest",
		description: "Claude Code without sudo, also in a privileged playroom.",
	},
	"claude-code-dind": {
		reference:          "registry.avisi.cloud/library/playrooms/claude-code-dind:latest",
		description:        "Claude Code with a Docker daemon. Needs a privileged playroom.",
		requiresPrivileged: true,
	},
}

// ImageEntry is a published playroom image: Name is the alias sent as --image,
// Reference the full registry path shown beside it.
type ImageEntry struct {
	Name        string
	Reference   string
	Description string
	IsDefault   bool
	// RequiresPrivileged is set for an image acloud refuses outside a privileged playroom.
	RequiresPrivileged bool
}

// ListImages returns the image aliases this GUI knows about. The CLI accepts
// custom registry references too, so this catalog is only a picker convenience.
func ListImages() []ImageEntry {
	names := make([]string, 0, len(imageAliases))
	for name := range imageAliases {
		names = append(names, name)
	}
	sort.Slice(names, func(i, j int) bool {
		if isDefault, other := names[i] == defaultImage, names[j] == defaultImage; isDefault != other {
			return isDefault
		}
		return names[i] < names[j]
	})

	entries := make([]ImageEntry, 0, len(names))
	for _, name := range names {
		alias := imageAliases[name]
		entries = append(entries, ImageEntry{
			Name:               name,
			Reference:          alias.reference,
			Description:        alias.description,
			IsDefault:          name == defaultImage,
			RequiresPrivileged: alias.requiresPrivileged,
		})
	}
	return entries
}
