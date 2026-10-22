"""Regression checks for Finder's layout B-tree header."""

from pathlib import Path
import runpy
import tempfile
import unittest

from ds_store import DSStore, DSStoreEntry

layout = runpy.run_path(str(Path(__file__).with_name("dmg-layout.py")))
write_store = layout["write_store"]
verify_store_structure = layout["verify_store_structure"]


class LayoutStructureTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="acloud-layout-test-")
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / ".DS_Store"
        self.entries = [DSStoreEntry(".", "vSrn", "long", 1)]

    def test_leaf_root_has_zero_depth_on_disk(self):
        write_store(self.path, self.entries)
        with DSStore.open(str(self.path), "r") as store:
            with store._get_block(store._rootnode) as block:
                child, count = block.read(b">II")
            self.assertEqual(child, 0)
            self.assertEqual(count, 1)
            self.assertEqual(store._levels, 0)
            verify_store_structure(store)

    def test_rejects_library_header_despite_readable_entries(self):
        with DSStore.open(str(self.path), "w+", initial_entries=self.entries):
            pass
        with DSStore.open(str(self.path), "r") as store:
            self.assertEqual(store["."]["vSrn"], (b"long", 1))
            with self.assertRaisesRegex(AssertionError, "B-tree depth"):
                verify_store_structure(store)

    def test_multiple_pages_have_correct_depth_and_records(self):
        entries = [
            DSStoreEntry(f"item-{index}", "cmmt", "ustr", "layout" * 150)
            for index in range(8)
        ]
        write_store(self.path, entries)
        with DSStore.open(str(self.path), "r") as store:
            self.assertGreater(store._levels, 0)
            self.assertEqual(len(list(store)), len(entries))
            verify_store_structure(store)

    def test_rejects_incorrect_record_count(self):
        write_store(self.path, self.entries)
        with DSStore.open(str(self.path), "r+") as store:
            store._records += 1
            store._dirty = True
        with DSStore.open(str(self.path), "r") as store:
            with self.assertRaisesRegex(AssertionError, "record count"):
                verify_store_structure(store)


if __name__ == "__main__":
    unittest.main()
