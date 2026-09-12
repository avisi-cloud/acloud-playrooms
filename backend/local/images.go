package local

import "sort"

const defaultImage = "opencode"

var imageAliases = map[string]string{
	"opencode":    "registry.avisi.cloud/library/playrooms/opencode:latest",
	"claude-code": "registry.avisi.cloud/library/playrooms/claude-code:latest",
}

// ImageEntry is a published playroom image: Name is the alias sent as --image,
// Reference the full registry path shown beside it.
type ImageEntry struct {
	Name      string
	Reference string
	IsDefault bool
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
		entries = append(entries, ImageEntry{
			Name:      name,
			Reference: imageAliases[name],
			IsDefault: name == defaultImage,
		})
	}
	return entries
}
