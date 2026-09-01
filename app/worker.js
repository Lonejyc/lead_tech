const { PubSub } = require('@google-cloud/pubsub');
const { Storage } = require('@google-cloud/storage');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const archiver = require('archiver');
const crypto = require('crypto');
const moment = require('moment');
const photoModel = require('./photo_model');

const pubSubClient = new PubSub({ projectId: process.env.GCP_PROJECT_ID });
const subscriptionName = process.env.TOPIC_NAME;
const bucketName = process.env.BUCKET;
const storage = new Storage();

initializeApp({
  credential: applicationDefault(),
  databaseURL: process.env.DATABASE_URL
});

const db = getDatabase();

// no DB in this experiment: job status kept in-process (worker runs in same instance as the API)
const jobStatus = {};

function downloadImage(url) {
  return fetch(url)
    .then(response => response.arrayBuffer())
    .then(arrayBuffer => Buffer.from(arrayBuffer));
}

function streamZip(urls) {
  const filename = `${crypto.randomUUID()}.zip`;
  const file = storage.bucket(bucketName).file(`public/users/${filename}`);
  const uploadStream = file.createWriteStream({
    metadata: {
      contentType: 'application/zip',
      cacheControl: 'private'
    },
    resumable: false
  });

  const archive = archiver('zip');

  return new Promise((resolve, reject) => {
    archive.on('error', reject);
    uploadStream.on('error', reject);
    uploadStream.on('finish', () => resolve(filename));

    archive.pipe(uploadStream);

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

// avoid `async` to keep compatibility with older ESLint parser configs
function handleZipRequest(tags) {
  return photoModel.getFlickrPhotos(tags, 'any')
    .then(photos => {
      const urls = photos.slice(0, 10).map(photo => photo.media.b);
      return streamZip(urls);
    })
    .then(filename => {
      jobStatus[tags] = { status: 'successful', file: `public/users/${filename}` };

      // Stocker le zip sur Firebase Realtime Database
      return getDownloadUrl(`public/users/${filename}`)
        .then(signedUrl => {
          const heureduzippage = moment().unix();
          const filenameKey = filename.replace(/\./g, '_');
          const firebasePath = `jocelyn/${heureduzippage}/${filenameKey}`;
          return db.ref(firebasePath).set({
            status: 'successful',
            filename: filename,
            file: `public/users/${filename}`,
            publicUrl: signedUrl,
            tags: tags,
            createdAt: moment().toISOString()
          });
        })
        .then(() => filename);
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
  streamZip,
  handleZipRequest,
  listenForMessages
};
