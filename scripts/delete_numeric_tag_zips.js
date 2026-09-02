/**
 * Deletes ALL zip entries (RTDB entry + GCS file) under a given target path.
 * No filtering - every entry under TARGET is deleted.
 *
 * Dry-run by default: prints what would be deleted. Pass -e CONFIRM=1 to
 * actually delete.
 *
 * Deletions run CONCURRENCY at a time (default 20) instead of one by one.
 *
 * Usage:
 *   node scripts/delete_numeric_tag_zips.js
 *   TARGET=pierrelouis node scripts/delete_numeric_tag_zips.js
 *   CONFIRM=1 node scripts/delete_numeric_tag_zips.js
 *   CONFIRM=1 CONCURRENCY=50 node scripts/delete_numeric_tag_zips.js
 */
require('dotenv').config({ quiet: true });
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { Storage } = require('@google-cloud/storage');

const TARGET = process.env.TARGET || 'jocelyn';
const CONFIRM = process.env.CONFIRM === '1';
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '20', 10);
const bucketName = process.env.BUCKET;

initializeApp({
  credential: applicationDefault(),
  databaseURL: process.env.DATABASE_URL
});

const db = getDatabase();
const storage = new Storage();

function collectMatches(snapshotValue) {
  const matches = [];

  Object.entries(snapshotValue || {}).forEach(([timestamp, files]) => {
    Object.entries(files || {}).forEach(([key, entry]) => {
      matches.push({ path: `${TARGET}/${timestamp}/${key}`, entry });
    });
  });

  return matches;
}

function deleteEntry({ path, entry }) {
  return deleteGcsFile(entry.file)
    .then(() => db.ref(path).remove())
    .then(() => console.log(`  deleted rtdb entry: ${path} (tags: ${entry.tags})`));
}

// runs `deleteEntry` over `items` with at most `limit` in flight at once
function runWithConcurrency(items, limit) {
  return new Promise(resolve => {
    let nextIndex = 0;
    let active = 0;
    let done = 0;

    function launchNext() {
      if (done === items.length) {
        resolve();
        return;
      }

      while (active < limit && nextIndex < items.length) {
        const item = items[nextIndex];
        nextIndex += 1;
        active += 1;

        deleteEntry(item)
          .catch(error => console.warn(`  failed to delete ${item.path}: ${error.message}`))
          .then(() => {
            active -= 1;
            done += 1;
            launchNext();
          });
      }
    }

    if (items.length === 0) {
      resolve();
    } else {
      launchNext();
    }
  });
}

function deleteGcsFile(filePath) {
  if (!filePath) {
    return Promise.resolve();
  }

  return storage
    .bucket(bucketName)
    .file(filePath)
    .delete()
    .then(() => console.log(`  deleted gcs file: ${filePath}`))
    .catch(error => console.warn(`  failed to delete gcs file ${filePath}: ${error.message}`));
}

db.ref(TARGET)
  .once('value')
  .then(snapshot => {
    const matches = collectMatches(snapshot.val());

    console.log(`Found ${matches.length} entries under "${TARGET}".`);

    if (!CONFIRM) {
      matches.forEach(({ path, entry }) => console.log(`[dry-run] would delete ${path} (tags: ${entry.tags})`));
      console.log('Dry run only. Re-run with -e CONFIRM=1 to actually delete.');
      return null;
    }

    return runWithConcurrency(matches, CONCURRENCY);
  })
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Failed to clean up entries:', error);
    process.exit(1);
  });
