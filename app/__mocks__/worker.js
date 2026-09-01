const jobStatus = {};

function getDownloadUrl(file) {
  return Promise.resolve(`https://storage.example.com/${file}`);
}

module.exports = { jobStatus, getDownloadUrl };
