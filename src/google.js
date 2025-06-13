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
import googleDocs from 'googleapis/build/src/apis/docs/v1.js';
import googleDrive from 'googleapis/build/src/apis/drive/v3.js';
import googleSheets from 'googleapis/build/src/apis/sheets/v4.js';

const google = {
  auth: new AuthPlus(),
  docs: (opts) => new googleDocs.docs_v1.Docs(opts),
  drive: (opts) => new googleDrive.drive_v3.Drive(opts),
  sheets: (opts) => new googleSheets.sheets_v4.Sheets(opts),
};

export { google };
