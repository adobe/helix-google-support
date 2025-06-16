/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import { AuthPlus } from 'googleapis-common';
import googleDocs from 'googleapis/build/src/apis/docs/index.js';
import googleDrive from 'googleapis/build/src/apis/drive/index.js';
import googleSheets from 'googleapis/build/src/apis/sheets/index.js';
import googleOAuth2 from 'googleapis/build/src/apis/oauth2/index.js';

function apiVersion(api, opts) {
  const ctor = api.VERSIONS[opts.version];
  // eslint-disable-next-line no-param-reassign
  delete opts.version;
  // eslint-disable-next-line new-cap
  return new ctor(opts);
}

const google = {
  auth: new AuthPlus(),
  oauth2: (opts) => apiVersion(googleOAuth2, opts),
  docs: (opts) => apiVersion(googleDocs, opts),
  drive: (opts) => apiVersion(googleDrive, opts),
  sheets: (opts) => apiVersion(googleSheets, opts),
};

export { google };
