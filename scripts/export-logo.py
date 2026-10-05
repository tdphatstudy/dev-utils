"""Compatibility entry point for the repository's vector branding export."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
subprocess.run(["node", str(ROOT / "scripts" / "export-brand.mjs")], cwd=ROOT, check=True)
subprocess.run([sys.executable, str(ROOT / "scripts" / "fix-icons.py")], cwd=ROOT, check=True)
