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
/**
 * Onedrive cache plugin adapter to be used with google tokens
 */
export class GoogleTokenCache {
  /**
   *
   * @param {ICachePlugin} plugin
   */
  constructor(plugin) {
    this.plugin = plugin;
    this.log = console;
    this.tokens = {};
    this.context = {
      cacheHasChanged: false,
      tokenCache: this,
    };
  }

  withLog(log) {
    this.log = log;
    return this;
  }

  serialize() {
    return JSON.stringify(this.tokens);
  }

  deserialize(str) {
    this.tokens = JSON.parse(str);
  }

  async load() {
    return this.plugin.beforeCacheAccess(this.context);
  }

  async store(tokens) {
    this.tokens = tokens;
    this.context.cacheHasChanged = true;
    try {
      await this.plugin.afterCacheAccess(this.context);
    } finally {
      this.context.cacheHasChanged = false;
    }
  }
}
