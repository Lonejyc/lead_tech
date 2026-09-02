const REFILL_RATE = 1; // tokens per second
const BUCKET_SIZE = 15; // max tokens
const REQUEST_COST = 3; // tokens per request

const buckets = new Map();

function getIp(req) {
  return req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
}

function refill(bucket, now) {
  const elapsedSeconds = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(BUCKET_SIZE, bucket.tokens + elapsedSeconds * REFILL_RATE);
  bucket.lastRefill = now;
}

function consume(ip) {
  const now = Date.now();
  let bucket = buckets.get(ip);

  if (!bucket) {
    bucket = { tokens: BUCKET_SIZE, lastRefill: now };
    buckets.set(ip, bucket);
  } else {
    refill(bucket, now);
  }

  if (bucket.tokens < REQUEST_COST) {
    return false;
  }

  bucket.tokens -= REQUEST_COST;
  return true;
}

function rateLimiter(req, res, next) {
  const ip = getIp(req);

  if (!ip) {
    return res.status(400).send({ error: 'unable to identify client ip' });
  }

  if (!consume(ip)) {
    return res.status(429).send({ error: 'too many requests' });
  }

  return next();
}

module.exports = {
  rateLimiter,
  getIp,
  buckets,
  REFILL_RATE,
  BUCKET_SIZE,
  REQUEST_COST
};
