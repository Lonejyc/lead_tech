function publishZipRequest(tags) {
  if (tags === 'error') {
    return Promise.reject('Internal server error');
  }

  return Promise.resolve('mock-message-id');
}

module.exports = { publishZipRequest };
