import sys
import unittest
from pathlib import Path
from typing import cast

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import synology_mcp_server as server


class FakeStorage:
    def __init__(self):
        self.calls = 0

    def storage_load_info(self):
        self.calls += 1
        return {"success": True, "data": {"disks": [], "detected_pools": [], "volumes": []}}


class StorageRequestTests(unittest.TestCase):
    def test_storage_overview_uses_storage_manager_endpoint(self):
        storage = FakeStorage()

        result = server._storage_overview(cast(server.CoreStorage, storage))

        self.assertTrue(result["success"])
        self.assertEqual(storage.calls, 1)

    def test_storage_summary_returns_compact_non_identifying_records(self):
        raw = {
            "success": True,
            "data": {
                "overview_data": {"status_level": "status_level_normal"},
                "disks": [{
                    "name": "Drive 1", "slot_id": 1, "model": "Example Disk",
                    "size_total": "1000", "temp": 31, "summary_status": "normal",
                    "serial": "must-not-leak", "device": "/dev/sata1",
                }],
                "storagePools": [{
                    "id": "pool_1", "device_type": "shr", "summary_status": "normal",
                    "size": {"total": "900", "used": "300"}, "uuid": "must-not-leak",
                }],
                "volumes": [{
                    "id": "volume_1", "vol_path": "/volume1", "fs_type": "btrfs",
                    "summary_status": "normal", "size": {"total": "800", "used": "200"},
                    "uuid": "must-not-leak",
                }],
            },
        }

        result = server._summarize_storage(raw)

        self.assertEqual(result, {
            "success": True,
            "status": "normal",
            "disks": [{"name": "Drive 1", "slot": 1, "model": "Example Disk", "capacity_bytes": 1000, "temperature_c": 31, "status": "normal"}],
            "pools": [{"id": "pool_1", "raid_type": "shr", "capacity_bytes": 900, "used_bytes": 300, "status": "normal"}],
            "volumes": [{"id": "volume_1", "path": "/volume1", "filesystem": "btrfs", "capacity_bytes": 800, "used_bytes": 200, "status": "normal"}],
        })


if __name__ == "__main__":
    unittest.main()
