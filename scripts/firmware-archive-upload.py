"""Retain one full release archive and verify every byte with bounded R2 reads."""
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor


class VerificationError(ValueError):
    """The object identity, range or complete digest did not agree."""


def verify_archive(client, bucket, key, size, digest, chunk_size=16*1024*1024, attempts=3):
    head = client.head_object(Bucket=bucket, Key=key)
    if head['ContentLength'] != size or not head.get('ETag'):
        raise VerificationError('Latest archive size or identity mismatch')
    etag = head['ETag']

    def read_range(start):
        end = min(start+chunk_size, size)-1
        length = end-start+1
        for attempt in range(attempts):
            body = None
            try:
                obj = client.get_object(Bucket=bucket, Key=key,
                    Range=f'bytes={start}-{end}', IfMatch=etag)
                body = obj['Body']
                if (obj.get('ETag') != etag or obj['ContentLength'] != length
                        or obj.get('ContentRange') != f'bytes {start}-{end}/{size}'):
                    raise VerificationError('Latest archive changed or returned an invalid range')
                data = body.read(length+1)
                if len(data) != length:
                    raise IOError('Truncated archive verification range')
                return data
            except VerificationError:
                raise
            except Exception:
                # SDK retries do not resume an interrupted streaming body.
                # Retry only this bounded, immutable range; hash it once complete.
                if attempt+1 == attempts:
                    raise
                time.sleep(2**attempt)
            finally:
                if body is not None:
                    body.close()
        raise AssertionError('verification attempts must be positive')

    actual = hashlib.sha256()
    with ThreadPoolExecutor(max_workers=4) as pool:
        # At most four ranges are retained, even if an early request stalls.
        for batch in range(0, size, chunk_size*4):
            futures = [pool.submit(read_range, start)
                       for start in range(batch, min(batch+chunk_size*4, size), chunk_size)]
            for future in futures:
                actual.update(future.result())
    if actual.hexdigest() != digest:
        raise VerificationError('Latest archive SHA-256 mismatch')


def main(filename):
    import boto3
    from boto3.s3.transfer import TransferConfig

    account = os.environ['CLOUDFLARE_ACCOUNT_ID']
    token = os.environ['CLOUDFLARE_API_TOKEN']
    token_id = None
    for endpoint in [f'accounts/{account}/tokens/verify', 'user/tokens/verify']:
        request = urllib.request.Request(f'https://api.cloudflare.com/client/v4/{endpoint}',
                                         headers={'Authorization': f'Bearer {token}'})
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
    with open(filename, 'rb') as source:
        digest = hashlib.file_digest(source, 'sha256').hexdigest()
    size = os.path.getsize(filename)
    bucket, key = 'freemkv-firmware', 'releases/latest.tar.gz'
    s3.upload_file(filename, bucket, key,
        ExtraArgs={'ContentType': 'application/gzip', 'Metadata': {'sha256': digest}},
        Config=TransferConfig(multipart_threshold=16*1024*1024,
                              multipart_chunksize=16*1024*1024, max_concurrency=4))
    verify_archive(s3, bucket, key, size, digest)
    print(f'Verified latest archive: {size} bytes, SHA-256 {digest}')


if __name__ == '__main__':
    main(sys.argv[1])
