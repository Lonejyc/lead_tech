/**
 * Mints an OAuth2 access token from the app's service account, for use with
 * the Firebase Realtime Database REST API (Authorization: Bearer <token>).
 *
 * Usage: node scripts/get_firebase_token.js
 */
require('dotenv').config({ quiet: true });
const { initializeApp, applicationDefault } = require('firebase-admin/app');

const app = initializeApp({
  credential: applicationDefault()
});

app.options.credential
  .getAccessToken()
  .then(({ access_token }) => {
    process.stdout.write(access_token);
  })
  .catch(error => {
    console.error('Failed to mint access token:', error);
    process.exit(1);
  });
