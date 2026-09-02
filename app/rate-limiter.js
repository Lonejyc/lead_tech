const { createClient } = require('redis');

const REFILL_RATE = 1; // tokens per second
const BUCKET_SIZE = 15; // max tokens
const REQUEST_COST = 3; // tokens per request

const client = createClient({
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT)
  }
});

client.on('error', error => console.error('Redis client error', error));

/* istanbul ignore next -- no real redis connection under test */
if (process.env.NODE_ENV !== 'test') {
  client.connect();
}

function getIp(req) {
  return req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
}

function bucketKey(ip) {
  return `token-bucket:${ip}`;
}

// consumes REQUEST_COST tokens for ip, refilling based on elapsed time since last visit
// bucket is stored in redis as a hash: { tokens, lastRefill } keyed by ip
// avoid `async` to keep compatibility with older ESLint parser configs
function consume(ip) {
  const key = bucketKey(ip);
  const now = Date.now();

  return client.hGetAll(key).then(bucket => {
    let tokens = BUCKET_SIZE;

    if (bucket && bucket.tokens !== undefined) {
      const lastRefill = Number(bucket.lastRefill);
      const elapsedSeconds = (now - lastRefill) / 1000;
      tokens = Math.min(BUCKET_SIZE, Number(bucket.tokens) + elapsedSeconds * REFILL_RATE);
    }

    if (tokens < REQUEST_COST) {
      return client.hSet(key, { tokens, lastRefill: now }).then(() => false);
    }

    tokens -= REQUEST_COST;
    return client.hSet(key, { tokens, lastRefill: now }).then(() => true);
  });
}

function rateLimiter(req, res, next) {
  const ip = getIp(req);

  if (!ip) {
    return res.status(400).send({ error: 'unable to identify client ip' });
  }

  return consume(ip)
    .then(allowed => {
      if (!allowed) {
        return res.status(429).send({ error: 'too many requests' });
      }

      return next();
    })
    .catch(error => res.status(500).send({ error: error.message }));
}

module.exports = {
  rateLimiter,
  getIp,
  client,
  REFILL_RATE,
  BUCKET_SIZE,
  REQUEST_COST
};
