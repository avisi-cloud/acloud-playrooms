package local

import "testing"

func TestListImagesCoversKnownAliases(t *testing.T) {
	entries := ListImages()
	if len(entries) != len(imageAliases) {
		t.Fatalf("ListImages() returned %d entries, want %d", len(entries), len(imageAliases))
	}
	seen := make(map[string]bool, len(entries))
	for _, entry := range entries {
		if imageAliases[entry.Name] != entry.Reference {
			t.Errorf("ListImages() returned %q -> %q", entry.Name, entry.Reference)
		}
		seen[entry.Name] = true
	}
	for alias := range imageAliases {
		if !seen[alias] {
			t.Errorf("ListImages() omitted %q", alias)
		}
	}
}

func TestListImagesPutsTheDefaultFirst(t *testing.T) {
	entries := ListImages()
	if len(entries) == 0 {
		t.Fatal("ListImages() returned nothing")
	}
	if entries[0].Name != defaultImage || !entries[0].IsDefault {
		t.Fatalf("default image = %#v, want %q first", entries[0], defaultImage)
	}
}

func TestListImagesIsStable(t *testing.T) {
	first := ListImages()
	for i := 0; i < 20; i++ {
		next := ListImages()
		if len(next) != len(first) {
			t.Fatalf("run %d length = %d, want %d", i, len(next), len(first))
		}
		for index := range first {
			if next[index] != first[index] {
				t.Fatalf("run %d entry %d = %#v, want %#v", i, index, next[index], first[index])
			}
		}
	}
}
