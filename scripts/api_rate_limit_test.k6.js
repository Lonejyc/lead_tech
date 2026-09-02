/**
 * k6 script: stress-test the Firebase Realtime Database REST API
 * on a given /<TARGET> path to find its rate-limiting threshold.
 *
 * Requires an OAuth2 access token (RTDB rules require auth to write):
 *   export TOKEN=$(node scripts/get_firebase_token.js)
 *
 * Usage:
 *   k6 run -e TOKEN=$TOKEN scripts/api_rate_limit_test.k6.js
 *   k6 run -e TOKEN=$TOKEN -e TARGET=pierrelouis -e VUS=20 -e DURATION=30s scripts/api_rate_limit_test.k6.js
 *   k6 run -e TOKEN=$TOKEN -e TARGET=someoneelse -e DATABASE_URL=https://other-project-default-rtdb.firebaseio.com scripts/api_rate_limit_test.k6.js
 *   k6 run -e TOKEN=$TOKEN -e REQUESTS=100 scripts/api_rate_limit_test.k6.js   # fixed request count instead of a duration
 *   k6 run -e TOKEN=$TOKEN -e REQUESTS=500 -e VUS=100 scripts/api_rate_limit_test.k6.js   # more parallelism
 *
 * In REQUESTS mode there's no sleep and VUS defaults to min(REQUESTS, 50) so it runs as fast as possible.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const DATABASE_URL =
  __ENV.DATABASE_URL || 'https://ecni2-2026-default-rtdb.firebaseio.com';
const TARGET = __ENV.TARGET || 'pierrelouis';
const TOKEN = __ENV.TOKEN || '';
const VUS = parseInt(__ENV.VUS || '10', 10);
const DURATION = __ENV.DURATION || '30s';
const REQUESTS = __ENV.REQUESTS ? parseInt(__ENV.REQUESTS, 10) : null;

// pubsub topic differs per target account; override with -e TOPIC_NAME=...
const DEFAULT_TOPIC_BY_TARGET = {
  anthony: 'ecni2-1',
  theo: 'ecni2-2',
  emmanuel: 'ecni2-3',
  ethan: 'ecni2-4',
  tom: 'ecni2-5',
  mathieu: 'ecni2-6',
  jocelyn: 'ecni2-7',
  pierrelouis: 'ecni2-8',
  thibaud: 'ecni2-9',
  maxime: 'ecni2-10'
};
const TOPIC_NAME = __ENV.TOPIC_NAME || DEFAULT_TOPIC_BY_TARGET[TARGET] || 'ecni2-7';

if (!TOKEN) {
  throw new Error(
    'Missing TOKEN. Run: export TOKEN=$(node scripts/get_firebase_token.js)'
  );
}

const throttled = new Counter('throttled_requests');
const errors = new Counter('failed_requests');

export const options = REQUESTS
  ? {
      vus: Math.min(REQUESTS, VUS === 10 ? 50 : VUS),
      iterations: REQUESTS,
      thresholds: {
        throttled_requests: ['count>=0']
      }
    }
  : {
      vus: VUS,
      duration: DURATION,
      thresholds: {
        throttled_requests: ['count>=0']
      }
    };

export function setup() {
  console.log(`Spamming ${DATABASE_URL}/${TARGET}/<heure>/<filename>.json (topic: ${TOPIC_NAME})`);
}

export default function () {
  const heureduzippage = Math.floor(Date.now() / 1000);
  const filenameKey = `${__VU}_${__ITER}`;
  const url = `${DATABASE_URL}/${TARGET}/${heureduzippage}/${filenameKey}.json`;

  const payload = JSON.stringify({
    status: 'successful',
    filename: `${filenameKey}.zip`,
    tags: `${Math.floor(Math.random() * 100001)}`,
    createdAt: Date.now(),
    downloadUrl: `https://storage.example.com/public/users/${filenameKey}.zip`
  });

  const res = http.put(url, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`
    }
  });

  const ok = check(res, {
    'status is 200': r => r.status === 200
  });

  if (res.status === 429) {
    throttled.add(1);
    console.warn(`[${new Date().toISOString()}] Throttled (429) at VU ${__VU} iter ${__ITER}`);
  } else if (!ok) {
    errors.add(1);
    console.warn(`[${new Date().toISOString()}] Unexpected status ${res.status} at VU ${__VU} iter ${__ITER}`);
  }

  if (!REQUESTS) {
    sleep(0.1);
  }
}
