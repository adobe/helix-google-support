/*
 * Copyright 2022 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import { Buffer } from 'node:buffer';

declare interface ICachePlugin {}

declare interface DriveItemInfo {}

declare interface GoogleClientOptions {
  log:Console;
  clientId:string;
  clientSecret:string;
  redirectUri:string;
  cachePlugin?:ICachePlugin;
}

/**
 * Google client
 */
declare class GoogleClient {
  /**
   * Mimetype for documents
   * @value 'application/vnd.google-apps.document'
   */
  static TYPE_DOCUMENT:string;

  /**
   * Mimetype for spreadsheet
   * @value 'application/vnd.google-apps.spreadsheet'
   */
  static TYPE_SPREADSHEET:string;

  /**
   * Sets the global item cache options. It internally creates a new LRU
   * with the given options
   *
   * @param opts
   */
  static setItemCacheOptions(opts:object);

  /**
   * Returns a url for a google drive id.
   * @param {string} id
   * @returns {string}
   */
  static id2Url(id:string):string;

  constructor(opts:GoogleClientOptions);

  init():Promise<GoogleClient>;

  generateAuthUrl(...args):Promise<string>;

  /**
   * Sets the credentials
   * @param tokens
   * @returns {Promise<void>}
   */
  setCredentials(tokens:object):Promise<void>;

  /**
   * Returns the token for the given code
   * @param {string} code
   * @returns {Promise<*>}
   */
  getToken(code:string):Promise<object>;

  /**
   * @param {string} parentId
   * @param {string[]} pathSegments
   * @param {string} parentPath
   * @param {string} [type] optional file mimetype filter.
   * @returns {Promise<DriveItemInfo[]>|null}
   */
  getUncachedItemsFromSegments(parentId:string, pathSegments:string[], parentPath:string, type?:string):Promise<DriveItemInfo[]>;

  /**
   * @param {string} parentId
   * @param {string} pathSegments
   * @param {string} parentPath
   * @param {string} [type] optional file mimetype filter.
   * @returns {Promise<DriveItemInfo[]>|null}
   */
  getDriveItemsFromSegments(parentId:string, pathSegments:string[], parentPath:string, type?:string):Promise<DriveItemInfo[]>;

  /**
   * returns the items hierarchy for the given path and root id, starting with the given path.
   * @param {string} parentId
   * @param {string} path
   * @param {string} [type] optional file mimetype filter.
   * @return {Promise<DriveItemInfo[]>}
   */
  getDriveItemsFromSegments(parentId:string, path:string, type?:string):Promise<DriveItemInfo[]>;

  /**
   * returns the items hierarchy for the given item, starting with the given id
   * @param {string} fileId
   * @param {object} roots
   * @returns {Promise<DriveItemInfo[]>}
   */
  getItemsFromId(fileId:string, roots:object):Promise<DriveItemInfo[]>;

  /**
   * Returns the (cached) item for the given path or {@code null} if the item cannot be found.
   * The item will contains a `invalidate()` method which can be used to remove it from the cache.
   *
   * @param {string} parentId
   * @param {string} path
   * @param {string} [type] optional file mimetype filter.
   * @returns {Promise<DriveItemInfo>}
   */
  getItemFromPath(parentId:string, path:string, type?:string):Promise<DriveItemInfo>;

  /**
   * Returns an (uncached) file directly via the google api
   * @param {string} fileId
   * @returns {Promise<Buffer>} file data
   */
  getFile(fileId:string):Promise<Buffer>;

  /**
   * Fetches the file data from the give path. If the file with the internal id could not be
   * fetched, the item cache is invalidated and the operation is retried. this is to support
   * moved items.
   * @param {string} parentId
   * @param {string} path
   * @param {boolean} noRetry {@code true} to avoid retry
   * @param {string} [type] optional file mimetype filter.
   * @returns {Promise<Buffer>|null} The data of the file or {@code null} if the file does not exist
   */
  getFileFromPath(parentId:string, path:string, noRetry:boolean, type?:string):Promise<Buffer>;

  /**
   * Returns an (uncached) document directly via the google docs api
   * @param {string} documentId
   * @returns {Promise<object>} document
   */
  getDocument(documentId:string):Promise<object>;

  /**
   * Fetches the document from the give path. If the document with the internal id could not be
   * fetched, the item cache is invalidated and the operation is retried. this is to support
   * moved items.
   * @param {string} parentId
   * @param {string} path
   * @param {boolean} noRetry {@code true} to avoid retry
   * @returns {Promise<object>|null} The document or {@code null} if the document does not exist
   */
  getDocumentFromPath(parentId:string, path:string, noRetry:boolean):Promise<object>;
}
