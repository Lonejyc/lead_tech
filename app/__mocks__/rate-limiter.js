function rateLimiter(req, res, next) {
  return next();
}

module.exports = {
  rateLimiter,
  getIp: () => '127.0.0.1',
  REFILL_RATE: 1,
  BUCKET_SIZE: 15,
  REQUEST_COST: 3
};
