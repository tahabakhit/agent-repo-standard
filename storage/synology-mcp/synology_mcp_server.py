#!/usr/bin/env python3
"""Read-only Synology DSM MCP wrapper around N4S4/synology-api.

The upstream synology-api repository is a Python client library, not an MCP server.
This wrapper intentionally exposes a small, read-only tool surface. Deployment
adapters supply credentials through the declared environment variables.
"""
from __future__ import annotations

import json
import os
import subprocess
from functools import lru_cache
from typing import Any, cast

import requests
from mcp.server.fastmcp import FastMCP

# synology-api does not set request timeouts. Prevent MCP tool calls from
# hanging indefinitely when the NAS/port is unreachable.
_ORIG_SESSION_REQUEST = requests.sessions.Session.request


def _session_request_with_timeout(self, method, url, **kwargs):
    kwargs.setdefault("timeout", float(os.environ.get("SYNOLOGY_REQUEST_TIMEOUT", "12")))
    return _ORIG_SESSION_REQUEST(self, method, url, **kwargs)


requests.sessions.Session.request = _session_request_with_timeout

from synology_api.base_api import BaseApi
from synology_api.core_package import Package
from synology_api.core_share import Share
from synology_api.core_storage import CoreStorage
from synology_api.core_sys_info import SysInfo
from synology_api.filestation import FileStation

mcp = FastMCP("synology")


def _bool(value: str | None, default: bool = False) -> bool:
    if value is None or value == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def _current_otp() -> str | None:
    """Resolve a fresh DSM TOTP only when an OTP-backed item is configured."""
    item = os.environ.get("SYNOLOGY_OP_ITEM")
    if not item:
        return os.environ.get("SYNOLOGY_OTP_CODE")
    vault = os.environ.get("SYNOLOGY_OP_VAULT")
    command = [os.environ.get("OP_CLI", "op"), "item", "get", item]
    if vault:
        command.extend(["--vault", vault])
    command.append("--otp")
    try:
        return subprocess.check_output(
            command,
            env=os.environ,
            text=True,
            stderr=subprocess.PIPE,
        ).strip()
    except (OSError, subprocess.CalledProcessError) as exc:
        raise RuntimeError("Unable to resolve current Synology OTP from 1Password") from exc


def _settings() -> dict[str, Any]:
    host = os.environ.get("SYNOLOGY_HOST") or os.environ.get("SYNOLOGY_NASRID_HOST") or os.environ.get("DSM_HOST")
    username = os.environ.get("SYNOLOGY_USERNAME") or os.environ.get("SYNOLOGY_NASRID_USERNAME") or os.environ.get("DSM_USERNAME")
    password = os.environ.get("SYNOLOGY_PASSWORD") or os.environ.get("SYNOLOGY_NASRID_PASSWORD") or os.environ.get("DSM_PASSWORD")
    port = os.environ.get("SYNOLOGY_PORT") or os.environ.get("SYNOLOGY_NASRID_PORT") or os.environ.get("DSM_PORT") or "5001"
    secure = _bool(os.environ.get("SYNOLOGY_USE_HTTPS") or os.environ.get("SYNOLOGY_NASRID_USE_HTTPS") or os.environ.get("DSM_USE_HTTPS"), True)
    cert_verify = _bool(os.environ.get("SYNOLOGY_CERT_VERIFY") or os.environ.get("DSM_CERT_VERIFY"), False)
    dsm_version = int(os.environ.get("SYNOLOGY_DSM_VERSION") or os.environ.get("DSM_VERSION") or "7")
    otp_code = _current_otp()
    missing = [k for k, v in {"host": host, "username": username, "password": password, "port": port}.items() if not v]
    if missing:
        raise RuntimeError("Missing Synology connection settings: " + ", ".join(missing))
    return {
        "ip_address": host,
        "port": str(port),
        "username": username,
        "password": password,
        "secure": secure,
        "cert_verify": cert_verify,
        "dsm_version": dsm_version,
        "otp_code": otp_code,
        "debug": False,
    }


@lru_cache(maxsize=8)
def _client(kind: str):
    # Clear stale shared sessions only if construction fails elsewhere; normal reuse is intentional.
    kwargs = _settings()
    if kind == "sysinfo":
        return SysInfo(**kwargs)
    if kind == "storage":
        return CoreStorage(**kwargs)
    if kind == "share":
        return Share(**kwargs)
    if kind == "filestation":
        return FileStation(**kwargs)
    if kind == "package":
        return Package(**kwargs)
    raise ValueError(f"unknown client kind: {kind}")


def _json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2, default=str)


def _redact(text: str) -> str:
    for value in (
        os.environ.get("SYNOLOGY_HOST"),
        os.environ.get("SYNOLOGY_NASRID_HOST"),
        os.environ.get("DSM_HOST"),
        os.environ.get("SYNOLOGY_USERNAME"),
        os.environ.get("SYNOLOGY_NASRID_USERNAME"),
        os.environ.get("DSM_USERNAME"),
        os.environ.get("SYNOLOGY_PASSWORD"),
        os.environ.get("SYNOLOGY_NASRID_PASSWORD"),
        os.environ.get("DSM_PASSWORD"),
        os.environ.get("SYNOLOGY_OTP_CODE"),
    ):
        if value:
            text = text.replace(value, "[REDACTED]")
    return text


def _safe_call(fn, *args, **kwargs) -> str:
    try:
        return _json(fn(*args, **kwargs))
    except Exception as exc:  # MCP should return useful errors instead of crashing the server.
        return _json({"success": False, "error_type": type(exc).__name__, "error": _redact(str(exc))})


def _storage_overview(storage: CoreStorage) -> Any:
    """Use DSM Storage Manager's read-only overview endpoint.

    DSM 7.3 rejects the older per-resource CoreStorage list endpoints used by
    synology-api. `storage_load_info` is the endpoint backing Storage Manager
    and returns disks, pools, volumes, and overview metadata in one response.
    """
    return storage.storage_load_info()


def _storage_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _storage_status(value: Any) -> str | None:
    return value.removeprefix("status_level_") if isinstance(value, str) else None


def _summarize_storage(raw: Any) -> dict[str, Any]:
    """Project DSM Storage Manager data into a compact, non-identifying schema."""
    payload = raw.get("data", {}) if isinstance(raw, dict) else {}
    overview = payload.get("overview_data", {}) if isinstance(payload, dict) else {}

    def size_value(item: dict[str, Any], key: str) -> int | None:
        size = item.get("size", {})
        return _storage_int(size.get(key) if isinstance(size, dict) else None)

    disks = [
        {"name": disk.get("name"), "slot": _storage_int(disk.get("slot_id")), "model": disk.get("model"),
         "capacity_bytes": _storage_int(disk.get("size_total")), "temperature_c": _storage_int(disk.get("temp")),
         "status": _storage_status(disk.get("summary_status"))}
        for disk in payload.get("disks", []) if isinstance(disk, dict)
    ]
    pools = [
        {"id": pool.get("id"), "raid_type": pool.get("device_type"), "capacity_bytes": size_value(pool, "total"),
         "used_bytes": size_value(pool, "used"), "status": _storage_status(pool.get("summary_status"))}
        for pool in payload.get("storagePools", []) if isinstance(pool, dict)
    ]
    volumes = [
        {"id": volume.get("id"), "path": volume.get("vol_path"), "filesystem": volume.get("fs_type"),
         "capacity_bytes": size_value(volume, "total"), "used_bytes": size_value(volume, "used"),
         "status": _storage_status(volume.get("summary_status"))}
        for volume in payload.get("volumes", []) if isinstance(volume, dict)
    ]
    return {"success": bool(raw.get("success", True)) if isinstance(raw, dict) else False,
            "status": _storage_status(overview.get("status_level") if isinstance(overview, dict) else None),
            "disks": disks, "pools": pools, "volumes": volumes}


@mcp.tool()
def synology_health_check() -> str:
    """Log in to DSM and return non-secret system identity/status information."""
    def run():
        sysinfo = _client("sysinfo")
        data = sysinfo.get_system_info()
        if isinstance(data, dict):
            payload = data.get("data", data)
            return {
                "success": data.get("success", True),
                "model": payload.get("model") or payload.get("model_name"),
                "serial_removed": bool(payload.get("serial")),
                "firmware": payload.get("firmware_ver") or payload.get("version"),
                "temperature": payload.get("sys_temp"),
                "base_url_reachable": True,
            }
        return data
    return _safe_call(run)


@mcp.tool()
def synology_system_info() -> str:
    """Return DSM system information from SYNO.Core.System/info."""
    return _safe_call(_client("sysinfo").get_system_info)


@mcp.tool()
def synology_utilization() -> str:
    """Return CPU/memory/disk/network utilization from SYNO.Core.System.Utilization."""
    return _safe_call(_client("sysinfo").get_all_system_utilization)


@mcp.tool()
def synology_network_status() -> str:
    """Return DSM network status/configuration."""
    return _safe_call(_client("sysinfo").network_status)


@mcp.tool()
def synology_services_status() -> str:
    """Return DSM core service status."""
    return _safe_call(_client("sysinfo").services_status)


@mcp.tool()
def synology_storage_summary() -> str:
    """Return storage disks, pools, and volumes. Read-only."""
    def run():
        storage = cast(CoreStorage, _client("storage"))
        return _summarize_storage(_storage_overview(storage))
    return _safe_call(run)


@mcp.tool()
def synology_shared_folders() -> str:
    """List shared folders. Read-only."""
    return _safe_call(_client("share").list_folders)


@mcp.tool()
def synology_filestation_info() -> str:
    """Return FileStation service capabilities and info."""
    return _safe_call(_client("filestation").get_info)


@mcp.tool()
def synology_file_list(folder_path: str, limit: int = 100, offset: int = 0, pattern: str | None = None, filetype: str | None = None) -> str:
    """List files/folders under a DSM folder path. Read-only; never downloads file contents."""
    limit = max(1, min(int(limit), 500))
    return _safe_call(
        _client("filestation").get_file_list,
        folder_path=folder_path,
        limit=limit,
        offset=max(0, int(offset)),
        pattern=pattern,
        filetype=filetype,
    )


@mcp.tool()
def synology_file_info(path: str) -> str:
    """Return metadata for one DSM file/folder path. Read-only; never downloads file contents."""
    return _safe_call(_client("filestation").get_file_info, path=path)


@mcp.tool()
def synology_installed_packages() -> str:
    """List installed DSM packages and status. Read-only."""
    return _safe_call(_client("package").list_installed, additional=["status", "installed_info", "available_operation"])


@mcp.tool()
def synology_api_catalog(filter_text: str | None = None, limit: int = 200) -> str:
    """List DSM API names exposed by the NAS; useful for deciding whether to add a new wrapper tool."""
    def run():
        client = _client("sysinfo")
        catalog = client.gen_list or {}
        items = []
        needle = (filter_text or "").lower()
        for name, info in catalog.items():
            if needle and needle not in name.lower():
                continue
            items.append({"name": name, "path": info.get("path"), "minVersion": info.get("minVersion"), "maxVersion": info.get("maxVersion")})
            if len(items) >= max(1, min(int(limit), 1000)):
                break
        return {"count": len(items), "items": items}
    return _safe_call(run)


if __name__ == "__main__":
    mcp.run()
