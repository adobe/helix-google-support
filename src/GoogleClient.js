/*
 * Copyright 2021 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import { LRUCache } from 'lru-cache';
import { google } from 'googleapis';
import {
  editDistance, sanitizeName, splitByExtension,
} from '@adobe/helix-onedrive-support/utils';
import { StatusCodeError } from '@adobe/helix-onedrive-support';
import { GoogleTokenCache } from './GoogleTokenCache.js';

let lru = new LRUCache({ max: 1000, ttl: 60000 });

/**
 * @typedef DriveItemInfo {
 * @property {string} id
 * @property {string} name
 * @property {string} url
 * @property {string} path
 * @property {string} mimeType
 * @property {number} lastModified
 */

/**
 * Adds the last modified property and mimeType and size if defined in item
 * @param {DriveItemInfo} itemInfo
 * @param item
 * @returns {DriveItemInfo}
 */
function addFields(itemInfo, item) {
  if (item.modifiedTime) {
    // eslint-disable-next-line no-param-reassign
    itemInfo.lastModified = Date.parse(item.modifiedTime);
  }
  if (item.mimeType) {
    // eslint-disable-next-line no-param-reassign
    itemInfo.mimeType = item.mimeType;
  }
  if (item.size) {
    // eslint-disable-next-line no-param-reassign
    itemInfo.size = item.size;
  }
  return itemInfo;
}

function createPathSegments(path) {
  const pathSegments = path.split('/');
  if (!pathSegments[0]) {
    // if path starts with '/' the first segment is empty
    pathSegments.shift();
  }
  return pathSegments;
}

function getCacheKey(parentId, pathSegments, type = 'file') {
  return `${parentId}:${pathSegments.join('/')}:${type}`;
}

/**
 * Google auth client
 */
export class GoogleClient {
  /**
   * Sets the global item cache options. It internally creates a new LRU
   * with the given options
   *
   * @param opts
   */
  static setItemCacheOptions(opts) {
    lru = new LRUCache(opts);
  }

  /**
   * Returns a url for a google drive id.
   * @param {string} id
   * @returns {string}
   */
  static id2Url(id) {
    if (!id || id.startsWith('gdrive:')) {
      return id;
    }
    return `gdrive:${id}`;
  }

  /**
   *
   * @param {ICachePlugin} plugin
   */
  constructor(opts) {
    let auth;
    if (opts.token) {
      auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: `${opts.token}` });
    } else {
      auth = new google.auth.OAuth2(
        opts.clientId,
        opts.clientSecret,
        opts.redirectUri,
      );
    }
    Object.assign(this, {
      log: opts.log,
      auth,
    });

    if (opts.cachePlugin) {
      this.cachePlugin = opts.cachePlugin;
      this.cache = new GoogleTokenCache(opts.cachePlugin).withLog(opts.log);
      /// hack to capture tokens, since the emit handler is not awaited in the google client
      const originalRefreshTokenNoCache = this.auth.refreshTokenNoCache.bind(this.auth);
      this.auth.refreshTokenNoCache = async (...args) => {
        const ret = await originalRefreshTokenNoCache(...args);
        await this.cache.store({
          refresh_token: this.auth.credentials.refresh_token,
          ...ret.tokens,
        });
        return ret;
      };
    }

    this.drive = google.drive({
      version: 'v3',
      auth: this.auth,
    });
  }

  async init() {
    if (this.cache) {
      await this.cache.load();
      this.auth.setCredentials(this.cache.tokens);
    }
    return this;
  }

  async generateAuthUrl(...args) {
    return this.auth.generateAuthUrl(...args);
  }

  /**
   * Sets the credentials
   * @param tokens
   * @returns {Promise<void>}
   */
  async setCredentials(tokens) {
    if (this.cache) {
      await this.cache.store(tokens);
    }
    this.auth.setCredentials(tokens);
  }

  /**
   * Returns the token for the given code
   * @param {string} code
   * @returns {Promise<*>}
   */
  async getToken(code) {
    const { tokens } = await this.auth.getToken(code);
    if (this.cache) {
      await this.cache.store(tokens);
    }
    return tokens;
  }

  /**
   * @param {string} parentId
   * @param {string[]} pathSegments
   * @param {string} parentPath
   * @param {string} [type] optional file mimetype
   * @returns {Promise<DriveItemInfo[]>|null}
   */
  async getUncachedItemsFromSegments(parentId, pathSegments, parentPath, type) {
    const { log, drive } = this;
    const name = pathSegments.shift();
    const [baseName, ext] = splitByExtension(name);
    const sanitizedName = sanitizeName(baseName);

    const items = [];
    let mimeTypeFilter;
    // filter for folder if path continues
    if (pathSegments.length) {
      mimeTypeFilter = 'and mimeType = \'application/vnd.google-apps.folder\'';
    } else {
      mimeTypeFilter = type
        ? `and mimeType = '${type}'`
        : 'and mimeType != \'application/vnd.google-apps.folder\'';
    }

    const opts = {
      q: [
        `'${parentId}' in parents`,
        'and trashed=false',
        mimeTypeFilter,
      ].join(' '),
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size)',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      pageSize: 1000,
    };

    do {
      // eslint-disable-next-line no-await-in-loop
      const { data } = await drive.files.list(opts);
      if (data.nextPageToken) {
        opts.pageToken = data.nextPageToken;
      } else {
        opts.pageToken = null;
      }
      log.debug(`fetched ${data.files.length} items below ${parentId}. nextPageToken=${opts.pageToken ? '****' : 'null'}`);

      // find fuzzy match
      data.files.forEach((item) => {
        const [itemName, itemExt] = splitByExtension(item.name);
        // remember extension
        // eslint-disable-next-line no-param-reassign
        item.extension = itemExt;
        /* c8 ignore next 4 */
        if (ext && ext !== itemExt) {
          // only match extension if given via relPath
          return;
        }
        const sanitizedItemName = sanitizeName(itemName);
        if (sanitizedItemName !== sanitizedName) {
          return;
        }
        // compute edit distance
        // eslint-disable-next-line no-param-reassign
        item.fuzzyDistance = editDistance(baseName, itemName);
        items.push(item);
      });
    } while (opts.pageToken);

    // sort items by edit distance first and 2nd by item name
    items.sort((i0, i1) => {
      let c = i0.fuzzyDistance - i1.fuzzyDistance;
      /* c8 ignore next 3 */
      if (c === 0) {
        c = i0.name.localeCompare(i1.name);
      }
      return c;
    });

    const [item] = items;

    if (!item) {
      return null;
    }

    const itemPath = `${parentPath}/${sanitizedName}`;
    const children = pathSegments.length
      // eslint-disable-next-line no-use-before-define
      ? await this.getDriveItemsFromSegments(item.id, pathSegments, itemPath, type)
      : [];

    if (!children) {
      return null;
    }
    const pathItem = addFields({
      name,
      path: itemPath,
      id: item.id,
    }, item);

    if (children.length) {
      // add parent references not-enumerable to avoid deep structures during serialization
      Object.defineProperty(children[children.length - 1], 'parent', {
        enumerable: false,
        value: pathItem,
      });
    }

    return [...children, pathItem];
  }

  /**
   * @param {string} parentId
   * @param {string} pathSegments
   * @param {string} parentPath
   * @param {string} [type] optional file mimetype
   * @returns {Promise<DriveItemInfo[]>|null}
   */
  async getDriveItemsFromSegments(parentId, pathSegments, parentPath, type) {
    const key = getCacheKey(parentId, pathSegments, type);
    let items = lru.get(key);
    if (items) {
      return items;
    }
    items = await this.getUncachedItemsFromSegments(parentId, pathSegments, parentPath, type);
    if (items) {
      lru.set(key, items);
      // add invalidation function as not-enumerable to keep compatible objects
      Object.defineProperty(items[items.length - 1], 'invalidate', {
        enumerable: false,
        value() {
          lru.delete(key);
          this.parent?.invalidate();
        },
      });
    }
    return items;
  }

  /**
   * returns the items hierarchy for the given path and root id, starting with the given path.
   * @param {string} parentId
   * @param {string} path
   * @param {string} [type] optional file mimetype
   * @return {Promise<DriveItemInfo[]>}
   */
  async getItemsFromPath(parentId, path, type) {
    const segs = createPathSegments(path);
    const result = await this.getDriveItemsFromSegments(parentId, segs, '', type);
    if (!result) {
      return [];
    }
    return [...result, {
      name: '',
      path: '/',
      id: parentId,
      mimeType: 'application/vnd.google-apps.folder',
    }];
  }

  /**
   * returns the items hierarchy for the given item, starting with the given id
   * @param {string} fileId
   * @param {object} roots
   * @private
   * @returns {Promise<DriveItemInfo[]>}
   */
  async getItems(fileId, roots) {
    const { log } = this;
    log.debug(`getItems(${fileId})`);
    const { data } = (await this.drive.files.get({
      fileId,
      fields: [
        'name',
        'parents',
        'mimeType',
        'modifiedTime',
      ].join(','),
      supportsAllDrives: true,
    }));

    const root = roots[fileId];
    if (root) {
      // stop at mount root
      return [addFields({
        id: fileId,
        name: '',
        path: root,
      }, data)];
    }

    const parentId = data.parents ? data.parents[0] : '';
    if (!parentId) {
      // outside mountpoint
      return [addFields({
        id: fileId,
        name: data.name,
        path: `/root:/${data.name}`,
      }, data)];
    }

    const ancestors = await this.getItems(data.parents[0], roots);
    const parentPath = ancestors[0].path.replace(/\/+$/, '');
    ancestors.unshift(addFields({
      id: fileId,
      name: data.name,
      path: `${parentPath}/${data.name}`,
    }, data));
    return ancestors;
  }

  /**
   * @param {string} fileId
   * @param {object} roots
   * @returns {Promise<DriveItemInfo[]>}
   */
  async getItemsFromId(fileId, roots) {
    const { log } = this;
    try {
      return await this.getItems(fileId, roots);
    } catch (e) {
      if (e.response && e.response.status === 404) {
        log.info(`unable to get items for ${fileId}. Not found`);
        return [];
      }
      log.warn(`unable to get items for ${fileId}. ${e}`);
      throw e;
    }
  }

  /**
   * Returns the (cached) item for the given path or {@code null} if the item cannot be found.
   * The item will contains a `invalidate()` method which can be used to remove it from the cache.
   *
   * @param {string} parentId the parent id or the id of the item itself, if the path is missing
   * @param {string} [path]
   * @param {string} [type] optional file mimetype
   * @returns {Promise<DriveItemInfo>}
   */
  async getItemFromPath(parentId, path, type) {
    if (!path) {
      try {
        let item = lru.get(parentId);
        if (!item) {
          const { data } = (await this.drive.files.get({
            fileId: parentId,
            fields: [
              'name',
              'parents',
              'mimeType',
              'modifiedTime',
            ].join(','),
            supportsAllDrives: true,
          }));
          item = addFields({
            id: parentId,
            path: `/${data.name}`,
          }, data);
          // todo: extend caching to all items ?
          Object.defineProperty(item, 'invalidate', {
            enumerable: false,
            value() {
              lru.delete(parentId);
            },
          });
          lru.set(parentId, item);
        }
        return item;
      } catch (e) {
        if (e.response && e.response.status === 404) {
          return null;
        }
        throw e;
      }
    }

    const segs = createPathSegments(path);
    const items = await this.getDriveItemsFromSegments(parentId, segs, '', type);
    const item = items?.[0];
    if (!item) {
      return null;
    }
    return item;
  }

  /**
   * Returns an (uncached) file directly via the google api
   * @param {string} fileId
   * @returns {Promise<Buffer>} file data
   */
  async getFile(fileId) {
    try {
      const res = await this.drive.files.get({
        fileId,
        alt: 'media',
        supportsAllDrives: true,
      }, { responseType: 'arraybuffer' });
      return Buffer.from(res.data);
    } catch (e) {
      if (e.response && e.response.status === 404) {
        throw new StatusCodeError(`Not Found: ${fileId}`, 404);
      }
      // convert message to string
      /* c8 ignore next 3 */
      if (e.message instanceof ArrayBuffer) {
        e.message = Buffer.from(e.message).toString('utf-8');
      }
      throw e;
    }
  }

  /**
   * Fetches the file data from the give path. If the file with the internal id could not be
   * fetched, the item cache is invalidated and the operation is retried. this is to support
   * moved items.
   * @param {string} parentId
   * @param {string} path
   * @param {boolean} noRetry {@code true} to avoid retry
   * @param {string} [type] optional file mimetype
   * @returns {Promise<Buffer>|null} The data of the file or {@code null} if the file does not exist
   */
  async getFileFromPath(parentId, path, noRetry, type) {
    const item = await this.getItemFromPath(parentId, path, type);
    if (!item) {
      return null;
    }
    try {
      // noinspection ES6RedundantAwait (need to catch exception)
      return await this.getFile(item.id);
    } catch (e) {
      if (e.statusCode === 404) {
        if (noRetry) {
          return null;
        }
        this.log.info(`file ${item.id} does not exist - invalidating cache and retry`);
        item.invalidate();
        return this.getFileFromPath(parentId, path, true);
      } else {
        throw e;
      }
    }
  }

  /**
   * Returns an (uncached) document directly via the google docs api
   * @param {string} documentId
   * @returns {Promise<object>} document
   */
  async getDocument(documentId) {
    const docs = google.docs({
      version: 'v1',
      auth: this.auth,
    });
    try {
      const res = await docs.documents.get({ documentId });
      return res.data;
    } catch (e) {
      if (e.response && e.response.status === 404) {
        throw new StatusCodeError(`Not Found: ${documentId}`, 404);
      }
      throw e;
    }
  }

  /**
   * Fetches the document from the give path. If the document with the internal id could not be
   * fetched, the item cache is invalidated and the operation is retried. this is to support
   * moved items.
   * @param {string} parentId
   * @param {string} path
   * @param {boolean} noRetry {@code true} to avoid retry
   * @returns {Promise<object>|null} The document or {@code null} if the document does not exist
   */
  async getDocumentFromPath(parentId, path, noRetry) {
    const item = await this.getItemFromPath(parentId, path, GoogleClient.TYPE_DOCUMENT);
    if (!item) {
      return null;
    }
    try {
      // noinspection ES6RedundantAwait (need to catch exception)
      return await this.getDocument(item.id);
    } catch (e) {
      if (e.statusCode === 404) {
        if (noRetry) {
          return null;
        }
        this.log.info(`document ${item.id} does not exist - invalidating cache and retry`);
        item.invalidate();
        return this.getDocumentFromPath(parentId, path, true);
      } else {
        throw e;
      }
    }
  }

  /**
   *
   * @param {string} parentId
   * @param {string} name
   * @param {string} mimeType one of GoogleClient.TYPE_DOCUMENT or GoogleClient.TYPE_SPREADSHEET
   * @returns {Promise<object>} file object
   */
  async createBlankDocOrSheet(parentId, name, mimeType) {
    try {
      if (
        mimeType !== GoogleClient.TYPE_DOCUMENT
        && mimeType !== GoogleClient.TYPE_SPREADSHEET
      ) {
        throw new Error(`Invalid mimeType ${mimeType}`);
      }
      const requestBody = {
        name,
        mimeType,
      };

      if (parentId) {
        requestBody.parents = [parentId];
      }

      const response = await this.drive.files.create({
        requestBody,
      });

      return response.data;
    } catch (e) {
      this.log.info(`Error creating file ${name}`);
      throw e;
    }
  }

  /**
   *
   * @param {string} spreadsheetId
   * @param {string} sheetName
   * @param {object} worksheetData
   * @returns {string} sheetId
   */
  async createOrUpdateGSheet(spreadsheetId, sheetName, worksheetData) {
    try {
      const sheets = google.sheets({
        version: 'v4',
        auth: this.auth,
      });

      // Check if the sheet already exists
      const spreadsheetInfo = await sheets.spreadsheets.get({ spreadsheetId });

      const sheetExists = spreadsheetInfo.data.sheets.some(
        (sheet) => sheet.properties.title === sheetName,
      );
      let sheetId;

      if (!sheetExists) {
        // Create a new sheet if it doesn't exist
        const createResponse = await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: sheetName,
                  },
                },
              },
            ],
          },
        });

        // Get the sheet ID of the newly created sheet
        sheetId = createResponse.data.replies[0].addSheet.properties.sheetId;
      } else {
        // Get the sheet ID of the existing sheet
        const sheetInfo = spreadsheetInfo.data.sheets.find(
          (sheet) => sheet.properties.title === sheetName,
        );
        sheetId = sheetInfo.properties.sheetId;
      }

      if (Array.isArray(worksheetData) && Array.isArray(worksheetData[0])) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `'${sheetName}'`,
          valueInputOption: 'RAW',
          resource: {
            values: worksheetData,
          },
        });
      }
      return sheetId;
    } catch (error) {
      this.log.info(`Error creating or updating sheet: ${error.message}`);
      throw error;
    }
  }

  /**
   *
   * @param {string} spreadsheetId
   * @param {string} sheetName
   *
   * @returns void
   */
  async deleteGSheet(spreadsheetId, sheetName) {
    try {
      const sheets = google.sheets({
        version: 'v4',
        auth: this.auth,
      });

      const sheetsResponse = await sheets.spreadsheets.get({
        spreadsheetId,
        ranges: [sheetName],
        fields: 'sheets.properties.sheetId',
      });

      const existingSheetId = sheetsResponse.data.sheets[0].properties.sheetId;
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              deleteSheet: {
                sheetId: existingSheetId,
              },
            },
          ],
        },
      });
    } catch (error) {
      this.log.info(`Error deleting sheet from spreadsheet: ${error.message}`);
      throw error;
    }
  }
}

Object.assign(GoogleClient, {
  TYPE_DOCUMENT: 'application/vnd.google-apps.document',
  TYPE_SPREADSHEET: 'application/vnd.google-apps.spreadsheet',
});
