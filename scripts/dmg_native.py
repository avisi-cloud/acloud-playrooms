"""Resolve Finder bookmarks through macOS without accessing Finder itself."""

import ctypes as c
from pathlib import Path


def _framework():
    cf = c.CDLL(
        "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation"
    )
    signatures = {
        "CFDataCreate": ([c.c_void_p, c.c_void_p, c.c_long], c.c_void_p),
        "CFDataGetLength": ([c.c_void_p], c.c_long),
        "CFDataGetBytePtr": ([c.c_void_p], c.c_void_p),
        "CFURLCreateFromFileSystemRepresentation": (
            [c.c_void_p, c.c_void_p, c.c_long, c.c_bool], c.c_void_p
        ),
        "CFURLCreateBookmarkData": (
            [c.c_void_p, c.c_void_p, c.c_ulong, c.c_void_p, c.c_void_p,
             c.c_void_p], c.c_void_p
        ),
        "CFURLCreateByResolvingBookmarkData": (
            [c.c_void_p, c.c_void_p, c.c_ulong, c.c_void_p, c.c_void_p,
             c.c_void_p, c.c_void_p],
            c.c_void_p,
        ),
        "CFURLGetFileSystemRepresentation": (
            [c.c_void_p, c.c_bool, c.c_void_p, c.c_long], c.c_bool
        ),
        "CFRelease": ([c.c_void_p], None),
    }
    for name, (arguments, result) in signatures.items():
        function = getattr(cf, name)
        function.argtypes = arguments
        function.restype = result
    return cf


def create_bookmark(path):
    cf = _framework()
    encoded = str(path).encode()
    url = cf.CFURLCreateFromFileSystemRepresentation(None, encoded, len(encoded), False)
    data = None
    error = c.c_void_p()
    try:
        # Omit unrelated resource properties so the Finder record stays compact.
        minimal = 1 << 9
        data = cf.CFURLCreateBookmarkData(None, url, minimal, None, None, c.byref(error))
        if not data:
            raise ValueError("macOS could not create the installer background bookmark")
        return c.string_at(cf.CFDataGetBytePtr(data), cf.CFDataGetLength(data))
    finally:
        for reference in [error.value, data, url]:
            if reference:
                cf.CFRelease(reference)


def resolve_bookmark(raw):
    cf = _framework()

    data = cf.CFDataCreate(None, raw, len(raw))
    url = None
    error = c.c_void_p()
    try:
        # Never show dialogs or mount another volume while checking a reference.
        options = (1 << 8) | (1 << 9)
        url = cf.CFURLCreateByResolvingBookmarkData(
            None, data, options, None, None, None, c.byref(error)
        )
        if not url:
            raise ValueError("macOS could not resolve the installer background bookmark")
        buffer = c.create_string_buffer(4096)
        if not cf.CFURLGetFileSystemRepresentation(url, True, buffer, len(buffer)):
            raise ValueError("macOS returned an invalid background path")
        return Path(buffer.value.decode())
    finally:
        for reference in [error.value, url, data]:
            if reference:
                cf.CFRelease(reference)
