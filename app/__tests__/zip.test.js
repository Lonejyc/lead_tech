let zip;

beforeEach(() => {
  jest.resetModules();
});

describe('publishZipRequest(tags)', () => {
  test('should publish a message with the given tags and resolve the message id', () => {
    const publishMessage = jest.fn(() => Promise.resolve('published-message-id'));

    jest.doMock('@google-cloud/pubsub', () => ({
      PubSub: jest.fn().mockImplementation(() => ({
        topic: jest.fn(() => ({ publishMessage }))
      }))
    }));

    zip = require('../zip');

    return zip.publishZipRequest('california').then(messageId => {
      expect(messageId).toBe('published-message-id');
      const [{ data }] = publishMessage.mock.calls[0];
      expect(JSON.parse(data.toString())).toEqual({ tags: 'california' });
    });
  });

  test('should reject when publishing fails', () => {
    jest.doMock('@google-cloud/pubsub', () => ({
      PubSub: jest.fn().mockImplementation(() => ({
        topic: jest.fn(() => ({
          publishMessage: jest.fn(() => Promise.reject(new Error('publish failed')))
        }))
      }))
    }));

    zip = require('../zip');

    return zip.publishZipRequest('error').catch(error => {
      expect(error.message).toMatch(/publish failed/);
    });
  });
});
