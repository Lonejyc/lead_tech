const { PubSub } = require('@google-cloud/pubsub');

const pubsub = new PubSub({ projectId: process.env.GCP_PROJECT_ID });
const topicName = process.env.TOPIC_NAME;

function publishZipRequest(tags) {
  const data = Buffer.from(JSON.stringify({ tags }));
  return pubsub.topic(topicName).publishMessage({ data });
}

module.exports = { publishZipRequest };
