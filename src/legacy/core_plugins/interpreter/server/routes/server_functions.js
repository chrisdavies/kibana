/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import Boom from 'boom';
import { serializeProvider } from '@kbn/interpreter/common';
import { API_ROUTE } from '../../common/constants';
import { createHandlers } from '../lib/create_handlers';

export function registerServerFunctions(server) {
  // Execute functions, kind of RPC like.
  server.route({
    method: 'POST',
    path: `${API_ROUTE}/fns/{functionName}`,
    async handler(req) {
      const types = server.plugins.interpreter.types.toJS();
      const { deserialize } = serializeProvider(types);
      const { functionName } = req.params;
      const { args, context } = req.payload;
      const fnDef = server.plugins.interpreter.serverFunctions.toJS()[functionName];

      if (!fnDef) {
        throw Boom.notFound(`Function "${functionName}" could not be found.`);
      }

      const handlers = await createHandlers(req, server);
      const result = await fnDef.fn(deserialize(context), args, handlers);

      return result;
    },
  });

  // Give the client the list of server-functions.
  server.route({
    method: 'GET',
    path: `${API_ROUTE}/fns`,
    handler() {
      return server.plugins.interpreter.serverFunctions.toJS();
    },
  });

  // The magic, /api/canvas/batch endpoint. Send it an array of requests,
  // and it will run each API handler and "stream" the result back
  // to the client.
  server.route({
    method: 'POST',
    path: `${API_ROUTE}/batch`,
    handler: async (req, h) => {
      // Grab the raw Node request.
      const res = req.raw.res;

      // Tell Hapi not to manage the request https://github.com/hapijs/hapi/issues/3884
      req._isReplied = true;

      // Send the initial headers
      res.writeHead(200, {
        'Content-Type': 'text/plain',
        'Connection': 'keep-alive',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
      });

      // Route each request to the appropriate Hapi route handler and
      // wait for them all to complete. Each will stream its response.
      await Promise.all(
        req.payload.requests.map(r => handleBatchOperation(r, req, h))
      );

      // All the responses have been written, so we
      // just gracefully close the response.
      res.end();
    },
  });


  /**
   * Given one of the requests from a bach of requests, route
   * the request through Hapi, and send the result back as part
   * of the batch response.
   *
   * @param opts - The batch request options { id, method, url, data }
   * @param req - The Hapi request object
   * @param h - The Hapi h object
   */
  async function handleBatchOperation(opts, req, h) {
    const { id, method, url, data } = opts;
    const res = req.raw.res;

    try {
    // HACK: We're accessing the private _core property of the hapi server
    // because it seems to be the only way to get access to the underlying
    // router and actually parse individual requests.
      const match = server._core.router.route(method.toLowerCase(), url);

      // No route matched the request
      if (!match) {
        return batchResponse(res, 404, id, {
          err: `No route ${method} ${url}`,
        });
      }

      // Pass the request through the Hapi route handler and wait for the result
      const payload = await match.route.public.settings.handler({
        ...req,
        params: match.params,
        payload: data,
      }, h);

      // Write the response back as part of the batch response stream
      return batchResponse(res, 200, id, payload);
    } catch (err) {
    // Treat Boom errors as first-class citizens.
      if (Boom.isBoom(err)) {
        return batchResponse(res, err.statusCode, id, {
          err: err.output.payload
        });
      }

      // All other errors result in a generic message and a 500.
      return batchResponse(res, 500, id, {
        err: 'See server logs for details.',
      });
    }
  }


  /**
   * Send a response back over the wire. This will be called N times
   * per batch, where N is the number of requests in the batch.
   *
   * @param res - The raw Node response
   * @param status - An HTTP status code (e.g. 200)
   * @param id - The id of the batched request
   * @param payload - The response payload to be sent as JSON
   */
  function batchResponse(res, status, id, payload) {
    const result = JSON.stringify({ id, status, payload });
    const fullResult = `${result}${padding(result)}`;
    const message = `${fullResult.length}:${fullResult}`;

    res.write(message);
  }


  // Chrome seems to not process chunks until a certain (1KB) boundary
  // has been hits, so we artificially pad smaller responses.
  function padding(payload) {
    const len = (1024) - payload.length;
    if (len <= 0) {
      return '';
    }

    return new Array(len).fill(' ').join('');
  }
}
