"""Idempotently replace and withdraw proven-corrupt TD05 firmware objects.

Runs in the release environment with explicit Cloudflare credentials. Every bad
object key is deleted and checked absent; replacement bytes are read back in
full and SHA-256 checked before the site build exposes download links.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import urllib.error
import urllib.request

receipt = json.loads(Path(__file__).with_suffix('.json').read_text())
replacements = receipt.get('replacements') or [receipt]
account = os.environ['CLOUDFLARE_ACCOUNT_ID']
token = os.environ['CLOUDFLARE_API_TOKEN']
base = f'https://api.cloudflare.com/client/v4/accounts/{account}/r2/buckets/freemkv-firmware/objects/'

def request(key, method='GET', body=None):
    req = urllib.request.Request(base+key, data=body, method=method,
        headers={'Authorization':'Bearer '+token, 'Content-Type':'application/x-tar'})
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return 404, b''
        raise RuntimeError(f'R2 {method} failed with HTTP {error.code}') from None

def digest(data):
    return hashlib.sha256(data).hexdigest()

for item in replacements:
    withdrawn = set(item['withdraw_keys'])
    withdrawn.add('fw/pioneer/'+item['bad_package_sha256']+'.tar')
    for bad_key in sorted(withdrawn):
        status, _ = request(bad_key, 'DELETE')
        assert status in (200, 204, 404), f'Could not remove {bad_key}: HTTP {status}'
        assert request(bad_key)[0] == 404, f'Corrupt object remains available: {bad_key}'
    print(f"Corrupt TD05 {item['replacement_filename'].split('_')[1]} objects removed and verified absent", flush=True)

    key = item['replacement_key']
    expected = item['replacement_sha256']
    status, data = request(key)
    if status != 200 or digest(data) != expected:
        with tempfile.TemporaryDirectory() as directory:
            subprocess.run(['gh','release','download',item['asset_tag'],
                '--repo',os.environ['GITHUB_REPOSITORY'],'--pattern',item['replacement_filename'],
                '--dir',directory],check=True)
            data=(Path(directory)/item['replacement_filename']).read_bytes()
            assert digest(data)==expected, 'replacement download hash mismatch'
            status, _ = request(key, 'PUT', data)
            assert status in (200,201,204), f'Upload failed: HTTP {status}'
    status, actual=request(key)
    assert status==200 and digest(actual)==expected, 'replacement full-object SHA-256 readback failed'
    print(f"Correct TD05 {item['replacement_filename'].split('_')[1]} object uploaded and full SHA-256 readback verified", flush=True)
