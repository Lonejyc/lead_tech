const formValidator = require('./form_validator');
const photoModel = require('./photo_model');
const zip = require('./zip');
const worker = require('./worker');
const { rateLimiter } = require('./rate-limiter');
const { NodeStreamableHTTPServerTransport } = require('@modelcontextprotocol/node');
const mcpServer = require('./mcp_server');

function route(app) {
  app.get('/', (req, res) => {
    const tags = req.query.tags;
    const tagmode = req.query.tagmode;

    const ejsLocalVariables = {
      tagsParameter: tags || '',
      tagmodeParameter: tagmode || '',
      photos: [],
      searchResults: false,
      invalidParameters: false,
      downloadUrl: null
    };

    // if no input params are passed in then render the view with out querying the api
    if (!tags && !tagmode) {
      return res.render('index', ejsLocalVariables);
    }

    // validate query parameters
    if (!formValidator.hasValidFlickrAPIParams(tags, tagmode)) {
      ejsLocalVariables.invalidParameters = true;
      return res.render('index', ejsLocalVariables);
    }

    // if a zip job already finished for these tags, generate a download link for it
    const job = worker.jobStatus[tags];
    const downloadUrlPromise =
      job && job.status === 'successful'
        ? worker.getDownloadUrl(job.file)
        : Promise.resolve(null);

    // get photos from flickr public feed api
    return Promise.all([photoModel.getFlickrPhotos(tags, tagmode), downloadUrlPromise])
      .then(([photos, downloadUrl]) => {
        ejsLocalVariables.photos = photos;
        ejsLocalVariables.searchResults = true;
        ejsLocalVariables.downloadUrl = downloadUrl;
        return res.render('index', ejsLocalVariables);
      })
      .catch(error => {
        console.log('error', error);
        return res.status(500).send({ error });
      });
  });

  app.post('/zip', rateLimiter, (req, res) => {
    let tags = req.query.tags;

    return zip
      .publishZipRequest(tags)
      .then(messageId => {
        console.log(`Message ${messageId} published.`);
        return res.status(200).send({ status: 'queued', messageId, tags });
      })
      .catch(error => res.status(500).send({ error }));
  });

  app.post('/mcp', (req, res) => {
    const authHeader = req.headers && req.headers.authorization ? req.headers.authorization : '';

    const expectedToken = process.env.MCP_BEARER_TOKEN || '';

    const bearerPrefix = 'Bearer ';
    const hasBearer = authHeader.startsWith(bearerPrefix);
    const token = hasBearer ? authHeader.slice(bearerPrefix.length) : null;
    
    console.log(token, '===', expectedToken);

    if (!token || !expectedToken || token !== expectedToken) {
      return res.status(401).send({ error: 'Unauthorized' });
    }

    console.log('MCP request authorized, processing...');

    const server = mcpServer.createServer();
    const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on('close', () => {
      transport.close();
      server.close();
    });

    return server
      .connect(transport)
      .then(() => transport.handleRequest(req, res, req.body))
      .catch(error => {
        console.log('mcp error', error);
        if (!res.headersSent) {
          res.status(500).send({ error: 'Internal server error' });
        }
      });
  });
}

module.exports = route;
