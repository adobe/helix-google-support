/*
 * Copyright 2023 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/* eslint-disable no-console */

import { config } from 'dotenv';
import { FSCachePlugin } from '@adobe/helix-shared-tokencache';
import { GoogleClient } from '../../src/GoogleClient.js';

config();

/**
 * Gets item from path. Your `.env` file should contain:
 * - GOOGLE_HELIX_SERVICE_CLIENT_ID
 * - GOOGLE_HELIX_SERVICE_CLIENT_SECRET
 *
 * and download and decrypt a S3 `auth-google-content.json`
 * and store it in this folder as `.auth.json`.
 *
 * @param {String[]} args
 * @returns
 */
async function run([id, path]) {
  const client = await new GoogleClient({
    log: console,
    clientId: process.env.GOOGLE_HELIX_SERVICE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_HELIX_SERVICE_CLIENT_SECRET,
    cachePlugin: new FSCachePlugin({ log: console, filePath: '.auth.json' }),
  }).init();
  const item = await client.getItemFromPath(id, path);
  return item;
}

run(process.argv.slice(2)).then(console.log).catch(console.error);
