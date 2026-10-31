"""Archive verification must survive truncated streams without accepting gaps."""
import hashlib
import importlib.util
import io
from pathlib import Path
import threading
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('archive_upload', Path(__file__).with_name('firmware-archive-upload.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Storage:
    def __init__(self, failure=None):
        self.data = bytes(range(103))
        self.etag = '"same-object"'
        self.failure = failure
        self.requests = []
        self.bodies = []
        self.lock = threading.Lock()

    def head_object(self, **kwargs):
        return {'ContentLength': len(self.data), 'ETag': self.etag}

    def get_object(self, **kwargs):
        start, end = map(int, kwargs['Range'].removeprefix('bytes=').split('-'))
        assert kwargs['IfMatch'] == self.etag
        with self.lock:
            count = self.requests.count(start)
            self.requests.append(start)
        value = self.data[start:end+1]
        if self.failure == 'truncate' and start == 16 and count == 0:
            value = value[:3]
        elif self.failure == 'corrupt' and start == 16:
            value = bytes([value[0] ^ 1])+value[1:]
        elif self.failure == 'always_truncate' and start == 16:
            value = value[:3]
        if self.failure == 'stream_error' and start == 16 and count == 0:
            class BrokenBody(io.BytesIO):
                def read(self, size=-1):
                    raise ConnectionResetError('stream closed')
            body = BrokenBody(value)
        else:
            body = io.BytesIO(value)
        self.bodies.append(body)
        return {'Body': body, 'ETag': '"other-object"' if self.failure == 'changed' else self.etag,
                'ContentLength': end-start+1,
                'ContentRange': 'wrong' if self.failure == 'wrong_range' else f'bytes {start}-{end}/{len(self.data)}'}


class VerificationTests(unittest.TestCase):
    def verify(self, store):
        module.verify_archive(store, 'bucket', 'key', len(store.data), hashlib.sha256(store.data).hexdigest(), chunk_size=16)

    def test_complete_ranges_cover_every_byte_and_close_bodies(self):
        store = Storage()
        self.verify(store)
        self.assertEqual(sorted(store.requests), list(range(0, 103, 16)))
        self.assertTrue(all(body.closed for body in store.bodies))

    @patch.object(module.time, 'sleep')
    def test_truncated_stream_retries_only_its_range(self, sleep):
        store = Storage('truncate')
        self.verify(store)
        self.assertEqual(store.requests.count(16), 2)
        self.assertEqual(len(store.requests), 8)
        sleep.assert_called_once_with(1)
        self.assertTrue(all(body.closed for body in store.bodies))

    @patch.object(module.time, 'sleep')
    def test_stream_exception_retries_and_closes_the_failed_body(self, sleep):
        store = Storage('stream_error')
        self.verify(store)
        self.assertEqual(store.requests.count(16), 2)
        self.assertTrue(all(body.closed for body in store.bodies))

    @patch.object(module.time, 'sleep')
    def test_persistent_truncation_fails_after_bounded_attempts(self, sleep):
        store = Storage('always_truncate')
        with self.assertRaises(IOError):
            self.verify(store)
        self.assertEqual(store.requests.count(16), 3)
        self.assertTrue(all(body.closed for body in store.bodies))

    def test_corruption_identity_changes_and_wrong_ranges_never_pass(self):
        for failure in ['corrupt', 'changed', 'wrong_range']:
            with self.subTest(failure=failure):
                store = Storage(failure)
                with self.assertRaises(module.VerificationError):
                    self.verify(store)
                self.assertTrue(all(body.closed for body in store.bodies))


if __name__ == '__main__':
    unittest.main()
