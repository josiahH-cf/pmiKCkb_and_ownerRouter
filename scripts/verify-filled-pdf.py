"""Independent pypdf comparison of generated synthetic download/transport bytes only."""
import hashlib
import json
from pathlib import Path
import sys

try:
    from pypdf import PdfReader
except ImportError:
    print("NOT RUN: isolated Python does not provide pypdf.")
    sys.exit(2)


def fields(path):
    result = {}
    for name, field in (PdfReader(path, strict=True).get_fields() or {}).items():
        kind, value = field.get("/FT"), field.get("/V")
        if kind == "/Sig":
            assert value is None, "A signature changed"
            value = None
        elif kind == "/Btn":
            if int(field.get("/Ff", 0)) & (1 << 15):
                if value is None or str(value) == "/Off":
                    value = ""
                else:
                    export = str(value).removeprefix("/")
                    options = field.get("/Opt", [])
                    assert export.isdigit() and int(export) < len(options), "Unsupported radio export"
                    value = str(options[int(export)])
            else:
                value = value is not None and str(value) != "/Off"
        elif isinstance(value, list):
            assert len(value) <= 1, "Unsupported multi-selection"
            value = str(value[0]) if value else ""
        else:
            value = str(value) if value is not None else ""
        result[name] = value
    return result


try:
    directory = Path(sys.argv[1])
    expected = json.loads((directory / "expected.json").read_text())
    assert expected.get("synthetic") is True, "Only synthetic acceptance output is allowed"
    original, downloaded, uploaded = [directory / name for name in ("original.pdf", "downloaded.pdf", "uploaded.pdf")]
    digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    assert downloaded.read_bytes() == uploaded.read_bytes(), "Downloaded and transported bytes differ"
    assert digest(downloaded) == expected["outputHash"], "Output hash differs"
    assert digest(original) == expected["originalHash"], "Original hash differs"
    assert fields(original) == expected["originalFields"], "Original field inventory/values differ"
    assert fields(downloaded) == expected["fields"], "Actual saved field inventory/values differ"
    assert fields(uploaded) == expected["fields"], "Actual transported field values differ"
    print(f"PASS: independent pypdf extraction compared all {len(expected['fields'])} fields; original immutable; downloaded and transported bytes identical.")
except Exception as error:
    print(f"FAIL: independent PDF acceptance ({type(error).__name__}).")
    sys.exit(1)
