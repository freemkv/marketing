"""Idempotent emergency replacement of the proven-corrupt TD05 object.

Runs only in the release environment with explicit Cloudflare credentials.
Verifies complete uploaded/read-back bytes before the site build exposes links.
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

bad_key = 'fw/pioneer/'+receipt['bad_package_sha256']+'.tar'
status, _ = request(bad_key, 'DELETE')
assert status in (200, 204, 404), status
assert request(bad_key)[0] == 404, 'corrupt object remains available'
print('Corrupt content-addressed TD05 object removed', flush=True)
status, data = request(receipt['replacement_key'])
if status != 200 or digest(data) != receipt['replacement_sha256']:
    with tempfile.TemporaryDirectory() as directory:
        subprocess.run(['gh','release','download',receipt['asset_tag'],
            '--repo',os.environ['GITHUB_REPOSITORY'],'--pattern',receipt['replacement_filename'],
            '--dir',directory],check=True)
        data=(Path(directory)/receipt['replacement_filename']).read_bytes()
        assert digest(data)==receipt['replacement_sha256'], 'replacement download hash mismatch'
        status, _ = request(receipt['replacement_key'], 'PUT', data)
        assert status in (200,201,204), status
status, actual=request(receipt['replacement_key'])
assert status==200 and digest(actual)==receipt['replacement_sha256'], 'replacement readback hash mismatch'
print('Correct TD05 2.02 object uploaded and full SHA-256 readback verified', flush=True)
