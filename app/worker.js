const { PubSub } = require('@google-cloud/pubsub');
const { Storage } = require('@google-cloud/storage');
const archiver = require('archiver');
const crypto = require('crypto');
const moment = require('moment');
const photoModel = require('./photo_model');

const pubSubClient = new PubSub({ projectId: process.env.GCP_PROJECT_ID });
const subscriptionName = process.env.TOPIC_NAME;
const bucketName = process.env.BUCKET;
const storage = new Storage();

// no DB in this experiment: job status kept in-process (worker runs in same instance as the API)
const jobStatus = {};

function downloadImage(url) {
  return fetch(url)
    .then(response => response.arrayBuffer())
    .then(arrayBuffer => Buffer.from(arrayBuffer));
}

function buildZipBuffer(urls) {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip');
    const chunks = [];

    archive.on('data', chunk => chunks.push(chunk));
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));

    Promise.all(urls.map(downloadImage))
      .then(buffers => {
        buffers.forEach((buffer, index) => {
          archive.append(buffer, { name: `image-${index}.jpg` });
        });
        archive.finalize();
      })
      .catch(reject);
  });
}

function uploadZip(buffer) {
  const filename = `${crypto.randomUUID()}.zip`;
  const file = storage.bucket(bucketName).file(`public/users/${filename}`);
  const stream = file.createWriteStream({
    metadata: {
      contentType: 'application/zip',
      cacheControl: 'private'
    },
    resumable: false
  });

  return new Promise((resolve, reject) => {
    stream.on('error', reject);
    stream.on('finish', () => resolve(filename));
    stream.end(buffer);
  });
}

// avoid `async` to keep compatibility with older ESLint parser configs
function handleZipRequest(tags) {
  return photoModel.getFlickrPhotos(tags, 'any')
    .then(photos => {
      const urls = photos.slice(0, 10).map(photo => photo.media.b);
      return buildZipBuffer(urls);
    })
    .then(zipBuffer => uploadZip(zipBuffer))
    .then(filename => {
      jobStatus[tags] = { status: 'successful', file: `public/users/${filename}` };
      return filename;
    });
}

function listenForMessages(subscriptionNameOrId) {
  const subscription = pubSubClient.subscription(subscriptionNameOrId);

  const messageHandler = message => {
    console.log(`Received message ${message.id}:`);
    const { tags } = JSON.parse(message.data.toString());

    handleZipRequest(tags)
      .then(filename => {
        console.log(`Zip ready for tags "${tags}": ${filename}`);
        message.ack();
      })
      .catch(error => {
        console.error(`Failed to build zip for tags "${tags}":`, error);
        jobStatus[tags] = { status: 'failed', error: error.message };
        message.nack();
      });
  };

  subscription.on('message', messageHandler);
}

function getDownloadUrl(file) {
  const options = {
    action: 'read',
    expires:
      moment()
        .add(2, 'days')
        .unix() * 1000
  };

  return storage
    .bucket(bucketName)
    .file(file)
    .getSignedUrl(options)
    .then(([signedUrl]) => signedUrl);
}

/* istanbul ignore next -- avoid opening a real streaming pull subscription while under test */
if (process.env.NODE_ENV !== 'test') {
  listenForMessages(subscriptionName);
}

module.exports = {
  jobStatus,
  getDownloadUrl,
  downloadImage,
  buildZipBuffer,
  uploadZip,
  handleZipRequest,
  listenForMessages
};
