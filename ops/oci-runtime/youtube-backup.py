"""Read migration credentials only for the duration of a host-owned backup."""
import json
from pathlib import Path
import runpy
import sys

try:
    directory = Path(__file__).resolve().parent
    values = runpy.run_path(str(directory / 'youtube-redis-acl.py'))['secret']('youtube-migration')
    result = runpy.run_path(str(directory / 'youtube-database.py'))['execute']({
        'mode': 'backup', 'user': values['DB_USER'], 'password': values['DB_PASSWORD']})
    if not result.get('ok'): raise RuntimeError()
    print(json.dumps(result))
except Exception:
    print(json.dumps({'ok': False, 'code': 'YOUTUBE_BACKUP_FAILED'}))
    sys.exit(1)
