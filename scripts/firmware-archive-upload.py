"""Retain one verified full release archive using R2 multipart upload."""
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request

import boto3
from boto3.s3.transfer import TransferConfig

account = os.environ['CLOUDFLARE_ACCOUNT_ID']
token = os.environ['CLOUDFLARE_API_TOKEN']
token_id = None
for endpoint in [f'accounts/{account}/tokens/verify', 'user/tokens/verify']:
    request = urllib.request.Request(f'https://api.cloudflare.com/client/v4/{endpoint}', headers={'Authorization': f'Bearer {token}'})
    try:
        with urllib.request.urlopen(request) as response:
            result = json.load(response)
        if result.get('success') and result.get('result', {}).get('status') == 'active':
            token_id = result['result']['id']
            break
    except urllib.error.HTTPError:
        continue
if not token_id:
    raise SystemExit('Cannot identify active Cloudflare token for archive upload')
s3 = boto3.client('s3', endpoint_url=f'https://{account}.r2.cloudflarestorage.com', region_name='auto',
                  aws_access_key_id=token_id, aws_secret_access_key=hashlib.sha256(token.encode()).hexdigest())
filename = sys.argv[1]
with open(filename, 'rb') as source:
    digest = hashlib.file_digest(source, 'sha256').hexdigest()
size = os.path.getsize(filename)
bucket, key = 'freemkv-firmware', 'releases/latest.tar.gz'
s3.upload_file(filename, bucket, key,
    ExtraArgs={'ContentType': 'application/gzip', 'Metadata': {'sha256': digest}},
    Config=TransferConfig(multipart_threshold=16*1024*1024, multipart_chunksize=16*1024*1024, max_concurrency=4))
obj = s3.get_object(Bucket=bucket, Key=key)
actual = hashlib.sha256()
for chunk in obj['Body'].iter_chunks(chunk_size=4*1024*1024):
    actual.update(chunk)
obj['Body'].close()
if obj['ContentLength'] != size or actual.hexdigest() != digest:
    raise SystemExit('Latest archive verification failed')
print(f'Verified latest archive: {size} bytes, SHA-256 {digest}')
