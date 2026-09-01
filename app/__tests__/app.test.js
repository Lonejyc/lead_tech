const request = require('supertest');

jest.mock('../../app/photo_model');
jest.mock('../../app/worker');
jest.mock('../../app/zip');
const worker = require('../../app/worker');
const app = require('../../app/server');

describe('index route', () => {
  afterEach(() => {
    app.server.close();
    for (const key of Object.keys(worker.jobStatus)) {
      delete worker.jobStatus[key];
    }
  });

  test('should respond with a 200 with no query parameters', () => {
    return request(app)
      .get('/')
      .expect('Content-Type', /html/)
      .expect(200)
      .then(response => {
        expect(response.text).toMatch(
          /<title>Express App Testing Demo<\/title>/
        );
      });
  });

  test('should respond with a 200 with valid query parameters', () => {
    return request(app)
      .get('/?tags=california&tagmode=all')
      .expect('Content-Type', /html/)
      .expect(200)
      .then(response => {
        expect(response.text).toMatch(
          /<div class="panel panel-default search-results">/
        );
      });
  });

  test('should respond with a 200 with invalid query parameters', () => {
    return request(app)
      .get('/?tags=california123&tagmode=all')
      .expect('Content-Type', /html/)
      .expect(200)
      .then(response => {
        expect(response.text).toMatch(/<div class="alert alert-danger">/);
      });
  });

  test('should respond with a 500 error due to bad jsonp data', () => {
    return request(app)
      .get('/?tags=error&tagmode=all')
      .expect('Content-Type', /json/)
      .expect(500)
      .then(response => {
        expect(response.body).toEqual({ error: 'Internal server error' });
      });
  });

  test('should include a download link when a zip job already finished for these tags', () => {
    worker.jobStatus.california = {
      status: 'successful',
      file: 'public/users/abc123.zip'
    };

    return request(app)
      .get('/?tags=california&tagmode=all')
      .expect('Content-Type', /html/)
      .expect(200)
      .then(response => {
        expect(response.text).toMatch(
          /https:\/\/storage\.example\.com\/public\/users\/abc123\.zip/
        );
      });
  });
});

describe('POST /zip', () => {
  afterEach(() => {
    app.server.close();
  });

  test('should respond with a 200 and queue the zip job', () => {
    return request(app)
      .post('/zip?tags=california')
      .expect(200)
      .then(response => {
        expect(response.body).toEqual({
          status: 'queued',
          messageId: 'mock-message-id',
          tags: 'california'
        });
      });
  });

  test('should respond with a 500 when publishing the zip request fails', () => {
    return request(app)
      .post('/zip?tags=error')
      .expect(500)
      .then(response => {
        expect(response.body).toEqual({ error: 'Internal server error' });
      });
  });
});
