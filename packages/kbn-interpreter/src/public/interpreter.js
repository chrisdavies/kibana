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

import { socketInterpreterProvider } from '../common/interpreter/socket_interpret';
import { serializeProvider } from '../common/lib/serialize';
import { createHandlers } from './create_handlers';
import { batchedAjax } from './batched_ajax';

// Fetch the list of server-only functions.
function fetchServerFunctions(kbnVersion, basePath) {
  return fetch(`${basePath}/api/canvas/fns`, {
    headers: {
      'Content-Type': 'application/json',
      'kbn-version': kbnVersion,
    },
  }).then(async r => {
    const result = await r.json();
    if (!r.ok) {
      throw result;
    }
    return result;
  });
}

export async function initializeInterpreter(kbnVersion, basePath, typesRegistry, functionsRegistry) {
  const ajax = batchedAjax({
    batchUrl: `${basePath}/api/canvas/batch`,
    headers: {
      'kbn-version': kbnVersion,
    },
  });
  const serverFunctionList = await fetchServerFunctions(kbnVersion, basePath);

  // For every sever-side function, register a client-side
  // function that matches its definition, but which simply
  // calls the server-side function endpoint.
  Object.keys(serverFunctionList).forEach(functionName => {
    functionsRegistry.register(() => ({
      ...serverFunctionList[functionName],
      async fn(context, args) {
        const types = typesRegistry.toJS();
        const { serialize } = serializeProvider(types);
        return ajax({
          url: `/api/canvas/fns/${functionName}`,
          method: 'POST',
          data: {
            args,
            context: serialize(context),
          },
        });
      },
    }));
  });

  const interpretAst = async (ast, context, handlers) => {
    // Load plugins before attempting to get functions, otherwise this gets racey
    const interpretFn = await socketInterpreterProvider({
      types: typesRegistry.toJS(),
      handlers: { ...handlers, ...createHandlers() },
      functions: functionsRegistry.toJS(),
      referableFunctions: serverFunctionList,
    });
    return interpretFn(ast, context);
  };

  return { interpretAst };
}

