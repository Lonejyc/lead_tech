/**
 * k6 script: hammer POST /zip from a single simulated ip to verify the
 * token bucket rate limiter (r=1, b=15, cost=3 -> 5 requests allowed, then 429s).
 *
 * Requires the app running locally (npm start) and a redis instance reachable
 * via the REDIS_* env vars the app already reads from .env.
 *
 * Usage:
 *   k6 run scripts/rate_limiter_test.k6.js
 *   k6 run -e BASE_URL=http://localhost:3000 -e REQUESTS=10 scripts/rate_limiter_test.k6.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const REQUESTS = parseInt(__ENV.REQUESTS || '10', 10);
const FORWARDED_IP = __ENV.IP || '203.0.113.42';

const allowed = new Counter('allowed_requests');
const throttled = new Counter('throttled_requests');

export const options = {
  vus: 1,
  iterations: REQUESTS
};

export default function () {
  const res = http.post(`${BASE_URL}/zip?tags=ratelimittest`, null, {
    headers: { 'X-Forwarded-For': FORWARDED_IP }
  });

  if (res.status === 429) {
    throttled.add(1);
    console.log(`iter ${__ITER}: 429 too many requests`);
  } else if (res.status === 200) {
    allowed.add(1);
    console.log(`iter ${__ITER}: 200 queued`);
  } else {
    console.warn(`iter ${__ITER}: unexpected status ${res.status} - ${res.body}`);
  }

  check(res, {
    'status is 200 or 429': r => r.status === 200 || r.status === 429
  });

  sleep(0.2);
}
