const { EventEmitter } = require('events');

let worker;

function toArrayBuffer(text) {
  return new TextEncoder().encode(text).buffer;
}

function createFakeWriteStream(shouldError) {
  const stream = new EventEmitter();
  stream.write = jest.fn(() => true);
  stream.end = jest.fn(() => {
    process.nextTick(() => {
      if (shouldError) {
        stream.emit('error', new Error('upload failed'));
      } else {
        stream.emit('finish');
      }
    });
  });
  return stream;
}

function mockPubSub(onSubscription) {
  jest.doMock('@google-cloud/pubsub', () => ({
    PubSub: jest.fn().mockImplementation(() => ({
      subscription: jest.fn(() => ({
        on: onSubscription || jest.fn()
      }))
    }))
  }));
}

function mockPhotoModel(getFlickrPhotos) {
  jest.doMock('../photo_model', () => ({
    getFlickrPhotos: getFlickrPhotos || jest.fn(() => Promise.resolve([]))
  }));
}

function mockFirebaseAdmin(setMock) {
  jest.doMock('firebase-admin/app', () => ({
    initializeApp: jest.fn(),
    applicationDefault: jest.fn()
  }));
  jest.doMock('firebase-admin/database', () => ({
    getDatabase: jest.fn(() => ({
      ref: jest.fn(() => ({
        set: setMock || jest.fn(() => Promise.resolve())
      }))
    }))
  }));
}

function mockStorage(bucketMock) {
  jest.doMock('@google-cloud/storage', () => ({
    Storage: jest.fn().mockImplementation(() => ({
      bucket: jest.fn(() => bucketMock)
    }))
  }));
}

function waitUntil(assertion) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const tick = () => {
      try {
        assertion();
        resolve();
      } catch (error) {
        attempts += 1;
        if (attempts > 20) {
          reject(error);
          return;
        }
        setTimeout(tick, 5);
      }
    };

    tick();
  });
}

beforeEach(() => {
  jest.resetModules();
});

describe('downloadImage(url)', () => {
  test('should download a url into a Buffer', () => {
    mockPubSub();
    mockFirebaseAdmin();
    mockPhotoModel();
    global.fetch = jest.fn(() =>
      Promise.resolve({
        arrayBuffer: () => Promise.resolve(toArrayBuffer('image-bytes'))
      })
    );

    worker = require('../worker');

    return worker.downloadImage('http://example.com/photo.jpg').then(buffer => {
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.toString()).toBe('image-bytes');
    });
  });
});

describe('streamZip(urls)', () => {
  test('should stream downloaded images into the upload and resolve with the filename', () => {
    mockPubSub();
    mockFirebaseAdmin();
    mockPhotoModel();
    global.fetch = jest.fn(url =>
      Promise.resolve({
        arrayBuffer: () => Promise.resolve(toArrayBuffer(url))
      })
    );
    const fakeStream = createFakeWriteStream(false);
    const fileMock = { createWriteStream: jest.fn(() => fakeStream) };
    mockStorage({ file: jest.fn(() => fileMock) });

    worker = require('../worker');

    return worker
      .streamZip(['http://example.com/1.jpg', 'http://example.com/2.jpg'])
      .then(filename => {
        expect(filename).toMatch(/\.zip$/);
        expect(fakeStream.write).toHaveBeenCalled();
      });
  });

  test('should reject when a download fails', () => {
    mockPubSub();
    mockFirebaseAdmin();
    mockPhotoModel();
    global.fetch = jest.fn(() => Promise.reject(new Error('network error')));
    const fakeStream = createFakeWriteStream(false);
    const fileMock = { createWriteStream: jest.fn(() => fakeStream) };
    mockStorage({ file: jest.fn(() => fileMock) });

    worker = require('../worker');

    return worker.streamZip(['http://example.com/1.jpg']).catch(error => {
      expect(error.message).toMatch(/network error/);
    });
  });

  test('should reject when the upload stream errors', () => {
    mockPubSub();
    mockFirebaseAdmin();
    mockPhotoModel();
    global.fetch = jest.fn(url =>
      Promise.resolve({
        arrayBuffer: () => Promise.resolve(toArrayBuffer(url))
      })
    );
    const fakeStream = createFakeWriteStream(true);
    const fileMock = { createWriteStream: jest.fn(() => fakeStream) };
    mockStorage({ file: jest.fn(() => fileMock) });

    worker = require('../worker');

    return worker.streamZip(['http://example.com/1.jpg']).catch(error => {
      expect(error.message).toMatch(/upload failed/);
    });
  });
});

describe('getDownloadUrl(file)', () => {
  test('should resolve with a signed url', () => {
    mockPubSub();
    mockFirebaseAdmin();
    mockPhotoModel();
    const fileMock = {
      getSignedUrl: jest.fn(() =>
        Promise.resolve(['https://signed.example.com/public/users/x.zip'])
      )
    };
    mockStorage({ file: jest.fn(() => fileMock) });

    worker = require('../worker');

    return worker.getDownloadUrl('public/users/x.zip').then(url => {
      expect(url).toBe('https://signed.example.com/public/users/x.zip');
    });
  });
});

describe('handleZipRequest(tags)', () => {
  test('should download, zip, upload, and record a successful job', () => {
    mockPubSub();
    mockFirebaseAdmin();
    mockPhotoModel(
      jest.fn(() =>
        Promise.resolve(
          Array.from({ length: 12 }, (_, index) => ({
            media: { b: `http://example.com/${index}.jpg` }
          }))
        )
      )
    );

    global.fetch = jest.fn(url =>
      Promise.resolve({
        arrayBuffer: () => Promise.resolve(toArrayBuffer(url))
      })
    );

    const fakeStream = createFakeWriteStream(false);
    const fileMock = {
      createWriteStream: jest.fn(() => fakeStream),
      getSignedUrl: jest.fn(() =>
        Promise.resolve(['https://signed.example.com/public/users/x.zip'])
      )
    };
    mockStorage({ file: jest.fn(() => fileMock) });

    worker = require('../worker');

    return worker.handleZipRequest('dogs').then(filename => {
      expect(filename).toMatch(/\.zip$/);
      expect(worker.jobStatus.dogs).toEqual({
        status: 'successful',
        file: `public/users/${filename}`
      });
    });
  });
});

describe('listenForMessages(subscriptionNameOrId)', () => {
  test('should ack the message and record success', () => {
    let messageHandler;
    mockPubSub(jest.fn((event, handler) => {
      messageHandler = handler;
    }));
    mockFirebaseAdmin();
    mockPhotoModel(
      jest.fn(() =>
        Promise.resolve([{ media: { b: 'http://example.com/0.jpg' } }])
      )
    );

    global.fetch = jest.fn(url =>
      Promise.resolve({
        arrayBuffer: () => Promise.resolve(toArrayBuffer(url))
      })
    );

    const fakeStream = createFakeWriteStream(false);
    const fileMock = {
      createWriteStream: jest.fn(() => fakeStream),
      getSignedUrl: jest.fn(() =>
        Promise.resolve(['https://signed.example.com/public/users/x.zip'])
      )
    };
    mockStorage({ file: jest.fn(() => fileMock) });

    worker = require('../worker');
    worker.listenForMessages('test-subscription');

    const message = {
      id: '1',
      data: Buffer.from(JSON.stringify({ tags: 'cats' })),
      ack: jest.fn(),
      nack: jest.fn()
    };

    messageHandler(message);

    return waitUntil(() => {
      expect(message.ack).toHaveBeenCalled();
      expect(worker.jobStatus.cats.status).toBe('successful');
    });
  });

  test('should nack the message and record failure', () => {
    let messageHandler;
    mockPubSub(jest.fn((event, handler) => {
      messageHandler = handler;
    }));
    mockFirebaseAdmin();
    mockPhotoModel(jest.fn(() => Promise.reject(new Error('flickr down'))));

    worker = require('../worker');
    worker.listenForMessages('test-subscription');

    const message = {
      id: '2',
      data: Buffer.from(JSON.stringify({ tags: 'birds' })),
      ack: jest.fn(),
      nack: jest.fn()
    };

    messageHandler(message);

    return waitUntil(() => {
      expect(message.nack).toHaveBeenCalled();
      expect(worker.jobStatus.birds.status).toBe('failed');
    });
  });
});
