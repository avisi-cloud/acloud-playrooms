"""Write or verify the installer layout without sending Apple events to Finder."""

import argparse
import hashlib
from pathlib import Path
import plistlib
import re
import subprocess

from ds_store import DSStore, DSStoreEntry
from ds_store.store import ILocCodec
from mac_alias import Alias
from mac_alias.bookmark import kBookmarkVolumeUUID
from dmg_native import create_bookmark, resolve_bookmark


ARTWORK_SIZE = (720, 480)
TITLE_BAR_HEIGHT = 32

WINDOW = {
    "WindowBounds": "{{200, 120}, {720, 512}}",
    "ShowStatusBar": False,
    "ShowToolbar": False,
    "ShowPathbar": False,
    "ShowSidebar": False,
    "ContainerShowSidebar": False,
    "ShowTabView": False,
    "PreviewPaneVisibility": False,
    "SidebarWidth": 0,
}
ICONS = {"Acloud Playrooms.app": (190, 283), "Applications": (530, 283)}
ICON_VIEW = {
    "viewOptionsVersion": 1,
    "backgroundType": 2,
    # Finder expects the complete background colour triplet even when using a
    # picture. Omitting it can make Finder discard this entire icon-view record,
    # including iconSize, while still applying bwsp and individual icon positions.
    "backgroundColorRed": 1.0,
    "backgroundColorGreen": 1.0,
    "backgroundColorBlue": 1.0,
    "iconSize": 144.0,
    "textSize": 14.0,
    "gridSpacing": 100.0,
    "gridOffsetX": 0.0,
    "gridOffsetY": 0.0,
    "arrangeBy": "none",
    "labelOnBottom": True,
    "showIconPreview": True,
    "showItemInfo": False,
    "scrollPositionX": 0.0,
    "scrollPositionY": 0.0,
}


def verify_store_structure(store):
    """Check the actual B-tree, rather than trusting the library's header."""
    visited = set()
    records = 0

    def walk(node):
        nonlocal records
        assert node not in visited, "Layout B-tree contains a repeated node"
        visited.add(node)
        with store._get_block(node) as block:
            right_child, count = block.read(b">II")
            records += count
            heights = []
            for _ in range(count):
                if right_child:
                    heights.append(walk(block.read(b">I")[0]))
                DSStoreEntry.read(block)
            if right_child:
                heights.append(walk(right_child))
            assert block.tell() <= store._page_size, "Layout node exceeds its page size"
        if heights:
            assert len(set(heights)) == 1, "Layout B-tree has uneven leaf depths"
            return heights[0] + 1
        return 0

    height = walk(store._rootnode)
    assert store._levels == height, (
        f"Invalid layout B-tree depth: header={store._levels}, actual={height}"
    )
    assert store._nodes == len(visited), "Incorrect layout node count"
    assert store._records == records, "Incorrect layout record count"


def write_store(path, entries):
    with DSStore.open(str(path), "w+", initial_entries=entries) as store:
        # ds-store 1.3.3's bulk constructor writes len(levels), but the on-disk
        # header requires the zero-based tree height. Finder rejects the bad
        # header even though ds-store can read its own entries back successfully.
        if entries:
            store._levels -= 1
            store._dirty = True
        verify_store_structure(store)


def write_layout(volume):
    background = volume / ".background/background.tiff"
    settings = dict(
        ICON_VIEW, backgroundImageAlias=Alias.for_file(str(background)).to_bytes()
    )
    entries = [
        DSStoreEntry(".", "vSrn", "long", 1),
        DSStoreEntry(".", "icvl", "type", b"icnv"),
        DSStoreEntry(".", "bwsp", "blob", plistlib.dumps(WINDOW, fmt=plistlib.FMT_BINARY)),
        DSStoreEntry(".", "icvp", "blob", plistlib.dumps(settings, fmt=plistlib.FMT_BINARY)),
        # The native bookmark includes a volume UUID, unlike a Carbon alias.
        DSStoreEntry(".", "pBBk", "blob", create_bookmark(background)),
    ]
    entries.extend(
        DSStoreEntry(name, "Iloc", "blob", ILocCodec.encode(position))
        for name, position in ICONS.items()
    )
    # Bulk construction handles the larger bookmark without incremental B-tree
    # splits, which ds-store 1.3.3 cannot reliably perform for this record mix.
    write_store(volume / ".DS_Store", entries)
    # Leave the signed bundle untouched. Setting its FinderInfo "hide extension"
    # flag would cause strict codesign verification to reject the installed app.


def verify_layout(volume):
    with DSStore.open(str(volume / ".DS_Store"), "r") as store:
        verify_store_structure(store)
        assert store["."]["icvl"] == (b"type", b"icnv"), "Installer must open in icon view"
        window = store["."]["bwsp"]
        for key, value in WINDOW.items():
            assert window[key] == value, f"Incorrect window setting: {key}"
        settings = store["."]["icvp"]
        for key, value in ICON_VIEW.items():
            assert settings[key] == value, f"Incorrect icon view setting: {key}"
        alias = Alias.from_bytes(settings["backgroundImageAlias"])
        assert alias.target.filename == "background.tiff", "Incorrect background alias"
        assert (
            alias.target.posix_path.lstrip("/") == ".background/background.tiff"
        ), "Background must resolve inside the image"
        info = plistlib.loads(
            subprocess.check_output(["diskutil", "info", "-plist", str(volume)])
        )
        assert (
            alias.volume.name == info["VolumeName"]
        ), "Background alias references another volume"
        assert (
            alias.target.cnid == (volume / ".background/background.tiff").stat().st_ino
        ), "Background alias references another file"
        bookmark = store["."]["pBBk"]
        assert (
            str(bookmark[kBookmarkVolumeUUID]).upper() == info["VolumeUUID"].upper()
        ), "Background bookmark references another disk image"
        background = volume / ".background/background.tiff"
        resolved = resolve_bookmark(bookmark.to_bytes())
        assert resolved.samefile(background), (
            f"Background resolves to another image: {resolved}. Expected {background}"
        )
        source = Path(__file__).resolve().parent.parent / "build/darwin/dmg/background.tiff"
        assert hashlib.sha256(background.read_bytes()).digest() == hashlib.sha256(
            source.read_bytes()
        ).digest(), "Packaged artwork is stale; rebuild the DMG"
        dimensions = subprocess.check_output(
            ["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(background)],
            text=True,
        )
        width = int(re.search(r"pixelWidth: (\d+)", dimensions).group(1))
        height = int(re.search(r"pixelHeight: (\d+)", dimensions).group(1))
        assert (width, height) == ARTWORK_SIZE, (
            f"Artwork size {(width, height)} does not match {ARTWORK_SIZE}; "
            "run swift scripts/render-dmg-background.swift"
        )
        frame = tuple(map(int, re.findall(r"\d+", WINDOW["WindowBounds"])[-2:]))
        assert frame == (width, height + TITLE_BAR_HEIGHT), (
            "Window must fit the artwork plus the Finder title bar"
        )
        for name, position in ICONS.items():
            assert store[name]["Iloc"] == position, f"Incorrect icon position: {name}"
    print("Verified installer window, native background bookmark, artwork, and icon positions")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["write", "verify"])
    parser.add_argument("volume", type=Path)
    arguments = parser.parse_args()
    if arguments.operation == "write":
        write_layout(arguments.volume)
    verify_layout(arguments.volume)
