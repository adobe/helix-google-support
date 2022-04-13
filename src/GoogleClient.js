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
import { google } from 'googleapis';
import { editDistance, sanitizeName, splitByExtension } from '@adobe/helix-onedrive-support/utils';
import { GoogleTokenCache } from './GoogleTokenCache.js';
import cache from './cache.js';

/**
 * Google auth client
 */
export class GoogleClient {
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
    this.log = opts.log;
    this.auth = new google.auth.OAuth2(
      opts.clientId,
      opts.clientSecret,
      opts.redirectUri,
    );
    this.cachePlugin = opts.cachePlugin;
    this.cache = new GoogleTokenCache(opts.cachePlugin).withLog(opts.log);

    /// hack to capture tokens, since the emit handler is not awaited in the google client
    const originalRefreshTokenNoCache = this.auth.refreshTokenNoCache.bind(this.auth);
    this.auth.refreshTokenNoCache = async (...args) => {
      const ret = await originalRefreshTokenNoCache(...args);
      await this.cache.store(ret.tokens);
      return ret;
    };

    this.drive = google.drive({
      version: 'v3',
      auth: this.auth,
    });

    /**
     * Cached version of `getUncachedItemsFromPath`
     */
    this.getDriveItemsFromPath = cache(this.getUncachedItemsFromPath.bind(this), {
      hash: (fn, path, parentId) => `${parentId}:${path}`,
    });
  }

  async init() {
    await this.cache.load();
    this.auth.setCredentials(this.cache.tokens);
    return this;
  }

  async generateAuthUrl(...args) {
    return this.auth.generateAuthUrl(...args);
  }

  async setCredentials(tokens) {
    await this.cache.store(tokens);
    this.auth.setCredentials(tokens);
  }

  async getToken(code) {
    const resp = await this.auth.getToken(code);
    await this.cache.store(resp.tokens);
    return resp;
  }

  /**
   * @param {Drive} drive
   * @param {AdminContext} context
   * @param {string} path
   * @param {string} parentId
   * @param {string} parentPath
   * @returns {Promise<EditFolderInfo[]>}
   */
  async getUncachedItemsFromPath(path, parentId, parentPath) {
    const { log, drive } = this;
    const [name, ...rest] = path.split('/');
    const [baseName, ext] = splitByExtension(name);
    const sanitizedName = sanitizeName(baseName);

    const items = [];
    const opts = {
      q: [
        `'${parentId}' in parents`,
        'and trashed=false',
        // folder if path continues, sheet otherwise
        `and mimeType ${rest.length ? '=' : '!='} 'application/vnd.google-apps.folder'`,
      ].join(' '),
      fields: 'nextPageToken, files(id, name, modifiedTime)',
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
    const children = rest.length
      // eslint-disable-next-line no-use-before-define
      ? await this.getDriveItemsFromPath(rest.join('/'), item.id, itemPath)
      : [];

    if (!children) {
      return null;
    }

    const pathItem = {
      name,
      path: itemPath,
      id: item.id,
      lastModified: Date.parse(item.modifiedTime),
    };

    return [...children, pathItem];
  }

  /**
   * returns the items hierarchy for the given path and root id, starting with the given path.
   * @param context
   * @param path
   * @param rootId
   */
  async getItemsFromPath(path, rootId) {
    const result = await this.getDriveItemsFromPath(path, rootId, '');
    if (!result) {
      return null;
    }
    return [...result, {
      name: '',
      path: '/',
      id: rootId,
    }];
  }

  /**
   * returns the items hierarchy for the given item, starting with the given id
   * @param {AdminContext} context
   * @param {Drive} drive
   * @param {string} fileId
   * @param {object} roots
   * @returns {Promise<EditFolderInfo[]>}
   */
  async getItems(fileId, roots) {
    const { log } = this;
    log.debug(`getItems(${fileId})`);
    const { data } = (await this.drive.files.get({
      fileId,
      fields: [
        'name',
        'parents',
        'modifiedTime',
      ].join(','),
    }));

    const root = roots[fileId];
    if (root) {
      // stop at mount root
      return [{
        id: fileId,
        name: '',
        path: root,
        lastModified: Date.parse(data.modifiedTime),
      }];
    }

    const parentId = data.parents ? data.parents[0] : '';
    if (!parentId) {
      // outside mountpoint
      return [{
        id: fileId,
        name: data.name,
        path: `/root:/${data.name}`,
        lastModified: Date.parse(data.modifiedTime),
      }];
    }

    const ancestors = await this.getItems(data.parents[0], roots);
    const parentPath = ancestors[0].path.replace(/\/+$/, '');
    ancestors.unshift({
      id: fileId,
      name: data.name,
      path: `${parentPath}/${data.name}`,
      lastModified: Date.parse(data.modifiedTime),
    });
    return ancestors;
  }

  /**
   * @param {AdminContext} context
   * @param {string} fileId
   * @param {object} roots
   * @returns {Promise<EditFolderInfo[]>}
   */
  async getItemsFromId(fileId, roots) {
    const { log } = this;
    try {
      return await this.getItems(fileId, roots);
    } catch (e) {
      log.warn(`unable to get items for ${fileId}. ${e}`);
      return [];
    }
  }

  /**
   * @param {AdminContext} context
   * @param {string} fileId
   * @returns {string} file data
   */
  async getFile(fileId) {
    const res = await this.drive.files.get({
      fileId,
      alt: 'media',
    });
    return res.data;
  }
}
