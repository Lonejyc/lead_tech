const { z } = require('zod');
const { McpServer } = require('@modelcontextprotocol/server');
const photoModel = require('./photo_model');
const zip = require('./zip');
const worker = require('./worker');
const formValidator = require('./form_validator');

function createServer() {
  const server = new McpServer({ name: 'flickr-photo-app', version: '1.0.0' });

  server.registerTool(
    'get_flickr_photos',
    {
      title: 'Search Flickr photos',
      description: 'Search the Flickr public feed for photos matching tags',
      inputSchema: z.object({
        tags: z.string().describe('Comma-delimited list of tags'),
        tagmode: z.enum(['any', 'all']).describe('Match any or all tags')
      })
    },
    async ({ tags, tagmode }) => {
      if (!formValidator.hasValidFlickrAPIParams(tags, tagmode)) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Invalid tags or tagmode parameters' }]
        };
      }

      const photos = await photoModel.getFlickrPhotos(tags, tagmode);
      return {
        content: [{ type: 'text', text: JSON.stringify(photos) }]
      };
    }
  );

  server.registerTool(
    'list_photo_archives',
    {
      title: 'List photo archives',
      description: 'List zip archives previously created from photo search requests',
      inputSchema: z.object({})
    },
    async () => {
      const archives = await worker.listArchives();
      return {
        content: [{ type: 'text', text: JSON.stringify(archives) }]
      };
    }
  );

  server.registerTool(
    'get_archive_download_url',
    {
      title: 'Get archive download URL',
      description: 'Get a signed download URL for a previously created zip archive',
      inputSchema: z.object({
        file: z.string().describe('Storage path of the zip file, e.g. public/users/<uuid>.zip')
      })
    },
    async ({ file }) => {
      const url = await worker.getDownloadUrl(file);
      return {
        content: [{ type: 'text', text: JSON.stringify({ url }) }]
      };
    }
  );

  return server;
}

module.exports = { createServer };
