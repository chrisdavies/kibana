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

// Create a promise and allow its resolve / reject to
// be called externally.
function createFuture() {
  let resolve;
  let reject;

  return {
    resolve(val) { return resolve(val); },
    reject(val) { return reject(val); },
    promise: new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    }),
  };
}

// Create a function which, when successively passed streaming response text,
// resolves the appropriate AJAX requests.
function batchResponseHandler(requests) {
  let index = 0;

  return (text) => {
    while (index < text.length) {
      const delim = ':';
      const delimIndex = text.indexOf(delim, index);
      const payloadStart = delimIndex + delim.length;

      if (delimIndex < 0) {
        return;
      }

      const payloadLen = parseInt(text.slice(index, delimIndex), 10);
      const payloadEnd = payloadStart + payloadLen;

      if (text.length < payloadEnd) {
        return;
      }

      const { id, payload } = JSON.parse(text.slice(payloadStart, payloadEnd));
      const { future } = requests[id];

      if (payload.err) {
        future.reject(payload.err);
      } else {
        future.resolve(payload);
      }

      index = payloadEnd;
    }
  };
}

// Manages a batch of HTTP requests, sending them all to the /api/batch
// endpoint for bulk processing. Deduplicates GET reqeusts.
class BatchedOperation {
  constructor(batchUrl, headers) {
    this.id = 0;
    this.requests = {};
    this.batchUrl = batchUrl;
    this.headers = headers;
  }

  // Send the batched requests to the server, handle responses as they
  // stream in, routing the responses to the appropriate callers.
  run() {
    const req = new XMLHttpRequest();
    const batchHandler = batchResponseHandler(this.requests);

    // Not all browsers support `onprogress`, so we'll also attempt
    // to process incoming data from onreadystatechange, which is
    // more broadly supported. batchHandler safely handles redundant calls.
    req.onreadystatechange = () => batchHandler(req.responseText);
    req.onprogress = () => batchHandler(req.responseText);

    // Send a request that looks something like:
    // { requests: [{ id: 1, url: '/api/foo', method: 'POST', data: {}}]}
    req.open('POST', this.batchUrl, true);
    req.setRequestHeader('Content-Type', 'application/json');
    Object.keys(this.headers).forEach(header => {
      req.setRequestHeader(header, this.headers[header]);
    });
    req.send(JSON.stringify({
      requests: Object.keys(this.requests).map(id => ({
        id,
        ...this.requests[id].request,
      }))
    }));
  }

  // Generate and return the next id, used to uniquely identify requests
  // within a batch.
  nextId() {
    return ++this.id;
  }

  // Find a duplicate request.
  findDuplicate(request) {
    // It should be safe to de-duplicate GET requests, but POST / PUT, etc
    // are not so clear, so we won't attempt those.
    if (request.method !== 'GET') {
      return;
    }

    return Object.values(this.requests)
      .find((r) => r.request.method === 'GET' && r.request.url === request.url);
  }

  // Push a new request onto the batch.
  push(request) {
    const duplicateRequest = this.findDuplicate(request);

    if (duplicateRequest) {
      return duplicateRequest.future.promise;
    }

    const future = createFuture();
    const id = this.nextId();

    this.requests[id] = {
      future,
      request,
    };

    return future.promise;
  }
}

// Create an async function which batches ajax requests,
// and is called like so:
//
// ajax({ method: 'POST', url: '/api/foo', data: {stuff: 'here'}})
// ajax({ method: 'GET', url: '/api/bar' });
export function batchedAjax({ batchUrl, ms = 25, headers = {} } = {}) {
  let batch = new BatchedOperation(batchUrl, headers);
  let timeout;

  function runBatchOperation() {
    batch.run();

    timeout = undefined;
    batch = new BatchedOperation(batchUrl, headers);
  }

  return function (request) {
    if (!timeout) {
      timeout = setTimeout(runBatchOperation, ms);
    }

    return batch.push(request);
  };
}
