const formValidator = require('./form_validator');
const photoModel = require('./photo_model');
const zip = require('./zip');
const worker = require('./worker');

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
        console.log('aspdfonaposd', error)
        return res.status(500).send({ error });
      });
  });

  app.post('/zip', (req, res) => {
    let tags = req.query.tags;
    return zip
      .publishZipRequest(tags)
      .then(messageId => {
        console.log(`Message ${messageId} published.`);
        return res.status(200).send({ status: 'queued', messageId, tags });
      })
      .catch(error => res.status(500).send({ error }));

  });
}

module.exports = route;
