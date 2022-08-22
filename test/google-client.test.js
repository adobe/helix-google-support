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
/* eslint-env mocha */
import assert from 'assert';
import { decode } from 'querystring';
import { MemCachePlugin } from '@adobe/helix-onedrive-support';
import { GoogleClient } from '../src/index.js';
import { Nock } from './utils.js';

describe('GoogleClient tests', () => {
  const DEFAULT_LIST_OPTS = {
    fields: 'nextPageToken, files(id, name, mimeType, modifiedTime)',
    pageSize: 1000,
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
  };

  let nock;
  let cachePlugin;
  beforeEach(() => {
    // clear cache for tests
    GoogleClient.setItemCacheOptions({ max: 1000 });
    nock = new Nock();

    cachePlugin = new MemCachePlugin({
      caches: new Map(),
      key: 'foobar',
    });
    cachePlugin.caches.set('foobar', JSON.stringify({
      access_token: 'ya29.A0ARrdaM-cBXd7X7jeaqOuP64EGDikBVwYRCXIIsmEqhSAV4u9FI5tbiDqpf2FMPgFD4pzG-mdywvwDZqZzOSmVdXQ5bIJbEtd87CHQ0JEXzFQr0drpl3qWru0JLnI6DARxFF8E3cQfmMiAV6id-Vw-aLBLdge',
      refresh_token: '1//03wHPAPWzJYftCgYIARAAGAMSNwF-L9IrSgxfQ5Q1CqzvvxSdrsHzjYkoLIP-9MGgLctew1i30g_3eNSKtbFcuRec1kcDG4mxgmU',
      scope: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/documents openid',
      token_type: 'Bearer',
      id_token: 'eyJhbGciOiJSUzI1NiIsImtpZCI6ImYxMzM4Y2EyNjgzNTg2M2Y2NzE0MDhmNDE3MzhhN2I0OWU3NDBmYzAiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJhenAiOiI1ODMyMjk4MjM4ODktaTJuc3Y2YTU2NWw0cmpvYnNtNjUxNm91YzQwYXJyZXUuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJhdWQiOiI1ODMyMjk4MjM4ODktaTJuc3Y2YTU2NWw0cmpvYnNtNjUxNm91YzQwYXJyZXUuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJzdWIiOiIxMDczMjczNjE1MDM5NzI2OTA3OTIiLCJoZCI6ImFkb2JlLmNvbSIsImVtYWlsIjoidHJpcG9kQGFkb2JlLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJhdF9oYXNoIjoiUVpEd1doNVF4MzdTS0hCb3JzcGQ5ZyIsIm5hbWUiOiJUb2JpYXMgQm9jYW5lZ3JhIiwicGljdHVyZSI6Imh0dHBzOi8vbGgzLmdvb2dsZXVzZXJjb250ZW50LmNvbS9hL0FBVFhBSnp4VFRZSFBQRkJuZ0FXSHg1U2VEZ1Z2YjdDREliOXNHZjk2YXVYPXM5Ni1jIiwiZ2l2ZW5fbmFtZSI6IlRvYmlhcyIsImZhbWlseV9uYW1lIjoiQm9jYW5lZ3JhIiwibG9jYWxlIjoiZW4iLCJpYXQiOjE2NDk2ODkxNDUsImV4cCI6MTY0OTY5Mjc0NX0.XD4BHQjsPxeifGluWm4xn24yRTnPr4oZYsOCwpDO2hdUan2RxIHWJJrGuFhi_11p-Cq249mwsYKoNvsOhML27Wp-MQ2vx0t192em7GrnmlNhiwpTQq0lmtYFSyPnjmrurMnDW45bSJn43jEBq_kfv_BBefI82mBpQOIeEXQKsEAUO-RQCvv6herfwOomSmTmdhqxbeP-otabUSFhjIGvFGel2vulDlqs4wFQjs8puIkEIElaqpzlceBGwhd74e8nb3pm3Zt83Kr96l16gosaXfqEIkPAvkU6vjxNVbsk4oQnV14AEkR8zAiE02dZTusZv7MrMDwe3SSyOKoJGMSxFQ',
      expiry_date: Date.now() + 60 * 1000,
    }));
  });

  afterEach(() => {
    nock.done();
  });

  it('properly maps id to url', async () => {
    assert.strictEqual(GoogleClient.id2Url(''), '');
    assert.strictEqual(GoogleClient.id2Url(undefined), undefined);
    assert.strictEqual(GoogleClient.id2Url('1234'), 'gdrive:1234');
    assert.strictEqual(GoogleClient.id2Url('gdrive:foobar'), 'gdrive:foobar');
  });

  describe('getItemsFromPath tests', () => {
    it('getItemsFromPath returns item hierarchy', async () => {
      nock.loginGoogle(4);
      nock('https://www.googleapis.com')
        .get('/drive/v3/files')
        .query({
          q: '\'1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP\' in parents and trashed=false and mimeType = \'application/vnd.google-apps.folder\'',
          ...DEFAULT_LIST_OPTS,
        })
        .reply(200, {
          files: [{
            mimeType: 'application/vnd.google-apps.folder',
            name: 'deeply',
            id: 123,
          }],
        })
        .get('/drive/v3/files')
        .query({
          q: '\'123\' in parents and trashed=false and mimeType = \'application/vnd.google-apps.folder\'',
          ...DEFAULT_LIST_OPTS,
        })
        .reply(200, {
          files: [{
            mimeType: 'application/vnd.google-apps.folder',
            name: 'nested',
            id: 124,
          }, {
            mimeType: 'application/vnd.google-apps.folder',
            name: 'other',
            id: 125,
          }],
        })
        .get('/drive/v3/files')
        .query({
          q: '\'124\' in parents and trashed=false and mimeType != \'application/vnd.google-apps.folder\'',
          ...DEFAULT_LIST_OPTS,
        })
        .reply(200, {
          files: [{
            mimeType: 'application/vnd.google-apps.sheets',
            name: 'structure',
            id: '1jXZBaOHP9x9-2NiYPbeyiWOHbmDRKobIeb11JdCVyUw',
            modifiedTime: 'Sat, 15 Feb 2031 06:59:41 GMT',
          }],
          nextPageToken: 'fake-next-token',
        })
        .get('/drive/v3/files')
        .query({
          q: '\'124\' in parents and trashed=false and mimeType != \'application/vnd.google-apps.folder\'',
          ...DEFAULT_LIST_OPTS,
          pageToken: 'fake-next-token',
        })
        .reply(200, {
          files: [{
            mimeType: 'application/vnd.google-apps.sheets',
            name: 'Structure',
            id: '1jXZBaOHP9x9-2NiYPbeyiWOHbmDRKobIeb11JdCVyUx',
          }],
        });

      const client = await new GoogleClient({
        log: console,
        clientId: 'fake',
        clientSecret: 'fake',
        cachePlugin,
      }).init();

      const hierarchy = await client.getItemsFromPath('1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP', '/deeply/nested/structure');
      assert.deepStrictEqual(hierarchy, [
        {
          id: '1jXZBaOHP9x9-2NiYPbeyiWOHbmDRKobIeb11JdCVyUw',
          lastModified: 1928905181000,
          name: 'structure',
          path: '/deeply/nested/structure',
          mimeType: 'application/vnd.google-apps.sheets',
        },
        {
          id: 124,
          name: 'nested',
          path: '/deeply/nested',
          mimeType: 'application/vnd.google-apps.folder',
        },
        {
          id: 123,
          name: 'deeply',
          path: '/deeply',
          mimeType: 'application/vnd.google-apps.folder',
        },
        {
          id: '1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP',
          name: '',
          path: '/',
          mimeType: 'application/vnd.google-apps.folder',
        },
      ]);
    });

    it('getItemsFromPath returns empty list', async () => {
      nock.loginGoogle(2);
      nock('https://www.googleapis.com')
        .get('/drive/v3/files')
        .query({
          q: '\'1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP\' in parents and trashed=false and mimeType = \'application/vnd.google-apps.folder\'',
          ...DEFAULT_LIST_OPTS,
        })
        .reply(200, {
          files: [{
            mimeType: 'application/vnd.google-apps.folder',
            name: 'deeply',
            id: 123,
          }],
        })
        .get('/drive/v3/files')
        .query({
          q: '\'123\' in parents and trashed=false and mimeType = \'application/vnd.google-apps.folder\'',
          ...DEFAULT_LIST_OPTS,
        })
        .reply(200, {
          files: [],
        });

      const client = await new GoogleClient({
        log: console,
        clientId: 'fake',
        clientSecret: 'fake',
        cachePlugin,
      }).init();

      const hierarchy = await client.getItemsFromPath('1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP', '/deeply/nested/missing');
      assert.deepStrictEqual(hierarchy, []);
    });

    it('getItemsFromPath handles google api error', async () => {
      nock('https://oauth2.googleapis.com')
        .post('/token')
        .reply(403, 'rate limit exceeded.');

      const client = await new GoogleClient({
        log: console,
        clientId: 'fake',
        clientSecret: 'fake',
        cachePlugin,
      }).init();

      await assert.rejects(client.getItemsFromPath('1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP', '/deeply/nested/missing'), new Error('Could not refresh access token: rate limit exceeded.'));
    });
  });

  describe('getItemFromPath tests', () => {
    it('getItemFromPath returns item', async () => {
      nock.loginGoogle(8);
      nock('https://www.googleapis.com')
        .get('/drive/v3/files')
        .twice() // second time after item was removed from the cache
        .query({
          q: '\'1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP\' in parents and trashed=false and mimeType = \'application/vnd.google-apps.folder\'',
          ...DEFAULT_LIST_OPTS,
        })
        .reply(200, {
          files: [{
            mimeType: 'application/vnd.google-apps.folder',
            name: 'deeply',
            id: 123,
          }],
        })
        .get('/drive/v3/files')
        .twice() // second time after item was removed from the cache
        .query({
          q: '\'123\' in parents and trashed=false and mimeType = \'application/vnd.google-apps.folder\'',
          ...DEFAULT_LIST_OPTS,
        })
        .reply(200, {
          files: [{
            mimeType: 'application/vnd.google-apps.folder',
            name: 'nested',
            id: 124,
          }, {
            mimeType: 'application/vnd.google-apps.folder',
            name: 'other',
            id: 125,
          }],
        })
        .get('/drive/v3/files')
        .twice() // second time after item was removed from the cache
        .query({
          q: '\'124\' in parents and trashed=false and mimeType != \'application/vnd.google-apps.folder\'',
          ...DEFAULT_LIST_OPTS,
        })
        .reply(200, {
          files: [{
            mimeType: 'application/vnd.google-apps.sheets',
            name: 'structure',
            id: '1jXZBaOHP9x9-2NiYPbeyiWOHbmDRKobIeb11JdCVyUw',
            modifiedTime: 'Sat, 15 Feb 2031 06:59:41 GMT',
          }],
          nextPageToken: 'fake-next-token',
        })
        .get('/drive/v3/files')
        .twice() // second time after item was removed from the cache
        .query({
          q: '\'124\' in parents and trashed=false and mimeType != \'application/vnd.google-apps.folder\'',
          ...DEFAULT_LIST_OPTS,
          pageToken: 'fake-next-token',
        })
        .reply(200, {
          files: [{
            mimeType: 'application/vnd.google-apps.sheets',
            name: 'Structure',
            id: '1jXZBaOHP9x9-2NiYPbeyiWOHbmDRKobIeb11JdCVyUx',
          }],
        });

      const client = await new GoogleClient({
        log: console,
        clientId: 'fake',
        clientSecret: 'fake',
        cachePlugin,
      }).init();

      const item = await client.getItemFromPath('1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP', '/deeply/nested/structure');
      const {
        lastModified,
        ...actual
      } = item;
      assert.ok(lastModified);
      assert.deepStrictEqual(actual, {
        id: '1jXZBaOHP9x9-2NiYPbeyiWOHbmDRKobIeb11JdCVyUw',
        name: 'structure',
        path: '/deeply/nested/structure',
        mimeType: 'application/vnd.google-apps.sheets',
      });

      // fetch again (from cache)
      const item2 = await client.getItemFromPath('1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP', '/deeply/nested/structure');
      assert.strictEqual(item, item2);

      // invalidate
      item.invalidate();

      const item3 = await client.getItemFromPath('1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP', '/deeply/nested/structure');
      assert.deepEqual(item, item3);
      assert.notStrictEqual(item, item3);
    });

    it('getItemFromPath return null for not existing', async () => {
      nock.loginGoogle(2);
      nock('https://www.googleapis.com')
        .get('/drive/v3/files')
        .query({
          q: '\'1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP\' in parents and trashed=false and mimeType = \'application/vnd.google-apps.folder\'',
          ...DEFAULT_LIST_OPTS,
        })
        .reply(200, {
          files: [{
            mimeType: 'application/vnd.google-apps.folder',
            name: 'deeply',
            id: 123,
          }],
        })
        .get('/drive/v3/files')
        .query({
          q: '\'123\' in parents and trashed=false and mimeType = \'application/vnd.google-apps.folder\'',
          ...DEFAULT_LIST_OPTS,
        })
        .reply(200, {
          files: [],
        });

      const client = await new GoogleClient({
        log: console,
        clientId: 'fake',
        clientSecret: 'fake',
        cachePlugin,
      }).init();

      const item = await client.getItemFromPath('1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP', '/deeply/nested/missing');
      assert.deepStrictEqual(item, null);
    });

    it('getItemFromPath returns item for no path', async () => {
      nock.loginGoogle(1);
      nock('https://www.googleapis.com')
        .get('/drive/v3/files/1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP')
        .query({
          fields: 'name,parents,mimeType,modifiedTime',
        })
        .reply(200, {
          id: '1ZJWJwL9szyTq6B-W0_Y7bFL1Tk1vyym4RyQ7AKXS7Ys',
          name: 'helix-hackathon-part-v',
          modifiedTime: 'Mon, 14 Jun 2021 03:37:28 GMT',
          parents: [
            '1BHM3lyqi0bEeaBZho8UD328oFsmsisyJ',
          ],
        });

      const client = await new GoogleClient({
        log: console,
        clientId: 'fake',
        clientSecret: 'fake',
        cachePlugin,
      }).init();

      const item = await client.getItemFromPath('1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP');
      assert.deepStrictEqual(item, {
        id: '1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP',
        lastModified: 1623641848000,
        path: '/helix-hackathon-part-v',
      });
    });

    it('getItemFromPath returns item for no path is cached can be invalidated', async () => {
      nock.loginGoogle(2);
      nock('https://www.googleapis.com')
        .get('/drive/v3/files/1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP')
        .twice()
        .query({
          fields: 'name,parents,mimeType,modifiedTime',
        })
        .reply(200, {
          id: '1ZJWJwL9szyTq6B-W0_Y7bFL1Tk1vyym4RyQ7AKXS7Ys',
          name: 'helix-hackathon-part-v',
          modifiedTime: 'Mon, 14 Jun 2021 03:37:28 GMT',
          parents: [
            '1BHM3lyqi0bEeaBZho8UD328oFsmsisyJ',
          ],
        });

      const client = await new GoogleClient({
        log: console,
        clientId: 'fake',
        clientSecret: 'fake',
        cachePlugin,
      }).init();

      const item = await client.getItemFromPath('1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP');
      assert.deepStrictEqual(item, {
        id: '1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP',
        lastModified: 1623641848000,
        path: '/helix-hackathon-part-v',
      });
      const item1 = await client.getItemFromPath('1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP');
      assert.strictEqual(item, item1);

      item.invalidate();
      const item2 = await client.getItemFromPath('1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP');
      assert.deepStrictEqual(item, item2);
      assert.notStrictEqual(item, item2);
    });

    it('getItemFromPath returns null for no path and not found', async () => {
      nock.loginGoogle(1);
      nock('https://www.googleapis.com')
        .get('/drive/v3/files/1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP')
        .query({
          fields: 'name,parents,mimeType,modifiedTime',
        })
        .reply(404);

      const client = await new GoogleClient({
        log: console,
        clientId: 'fake',
        clientSecret: 'fake',
        cachePlugin,
      }).init();

      const item = await client.getItemFromPath('1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP');
      assert.deepStrictEqual(item, null);
    });

    it('getItemFromPath handles error for no path', async () => {
      nock.loginGoogle(1);
      nock('https://www.googleapis.com')
        .get('/drive/v3/files/1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP')
        .query({
          fields: 'name,parents,mimeType,modifiedTime',
        })
        .reply(401);

      const client = await new GoogleClient({
        log: console,
        clientId: 'fake',
        clientSecret: 'fake',
        cachePlugin,
      }).init();

      await assert.rejects(client.getItemFromPath('1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP'), new Error(''));
    });
  });

  it('generateAuthUrl correctly', async () => {
    const client = await new GoogleClient({
      log: console,
      clientId: 'fake',
      clientSecret: 'fake',
      cachePlugin,
      redirectUri: 'https://localhost:8000',
    }).init();

    assert.strictEqual(await client.generateAuthUrl({
      state: '1234',
    }), 'https://accounts.google.com/o/oauth2/v2/auth?state=1234&response_type=code&client_id=fake&redirect_uri=https%3A%2F%2Flocalhost%3A8000');
  });

  it('getToken works and is cached', async () => {
    nock('https://oauth2.googleapis.com')
      .post('/token')
      .reply((uri, body) => {
        assert.deepStrictEqual({ ...decode(body) }, {
          code: '1234',
          client_id: 'fake',
          client_secret: 'fake',
          redirect_uri: 'https://localhost:8000',
          grant_type: 'authorization_code',
          code_verifier: '',
        });
        return [200, {
          access_token: 'dummy-access',
          refresh_token: 'dummy-refresh',
          expiry_date: 1651662977126,
        }];
      });

    const client = await new GoogleClient({
      log: console,
      clientId: 'fake',
      clientSecret: 'fake',
      cachePlugin,
      redirectUri: 'https://localhost:8000',
    }).init();

    assert.deepStrictEqual(await client.getToken('1234'), {
      refresh_token: 'dummy-refresh',
      access_token: 'dummy-access',
      expiry_date: 1651662977126,
    });
    assert.deepStrictEqual(JSON.parse(cachePlugin.caches.get('foobar')), {
      refresh_token: 'dummy-refresh',
      access_token: 'dummy-access',
      expiry_date: 1651662977126,
    });
  });

  it('token is refreshed', async () => {
    const nowOld = Date.now() - 60 * 1000;
    const nowNew = Date.now() + 60 * 1000;

    nock('https://oauth2.googleapis.com')
      .post('/token')
      .reply((uri, body) => {
        assert.deepStrictEqual({ ...decode(body) }, {
          client_id: 'fake',
          client_secret: 'fake',
          grant_type: 'refresh_token',
          refresh_token: 'dummy-refresh',
        });
        return [200, {
          access_token: 'dummy-access-new',
          expiry_date: nowNew,
        }];
      });

    cachePlugin.caches.set('foobar', JSON.stringify({
      access_token: 'dummy-access-old',
      refresh_token: 'dummy-refresh',
      expiry_date: nowOld,
    }));

    const client = await new GoogleClient({
      log: console,
      clientId: 'fake',
      clientSecret: 'fake',
      cachePlugin,
      redirectUri: 'https://localhost:8000',
    }).init();

    const { token } = await client.auth.getAccessToken();
    assert.deepStrictEqual(token, 'dummy-access-new');
    assert.deepStrictEqual(JSON.parse(cachePlugin.caches.get('foobar')), {
      refresh_token: 'dummy-refresh',
      access_token: 'dummy-access-new',
      expiry_date: nowNew,
    });
  });

  it('setCredentials are cached', async () => {
    const client = await new GoogleClient({
      log: console,
      clientId: 'fake',
      clientSecret: 'fake',
      cachePlugin,
      redirectUri: 'https://localhost:8000',
    }).init();

    client.setCredentials({
      access_token: 'dummy',
    });
    assert.strictEqual(cachePlugin.caches.get('foobar'), '{"access_token":"dummy"}');
  });

  describe('getItemsFromId tests', () => {
    it('getItemsFromId returns hierarchy', async () => {
      nock.loginGoogle(3);
      nock('https://www.googleapis.com')
        .get('/drive/v3/files/1ZJWJwL9szyTq6B-W0_Y7bFL1Tk1vyym4RyQ7AKXS7Ys')
        .query({
          fields: 'name,parents,mimeType,modifiedTime',
        })
        .reply(200, {
          id: '1ZJWJwL9szyTq6B-W0_Y7bFL1Tk1vyym4RyQ7AKXS7Ys',
          name: 'helix-hackathon-part-v',
          modifiedTime: 'Mon, 14 Jun 2021 03:37:28 GMT',
          parents: [
            '1BHM3lyqi0bEeaBZho8UD328oFsmsisyJ',
          ],
        })
        .get('/drive/v3/files/1BHM3lyqi0bEeaBZho8UD328oFsmsisyJ')
        .query({
          fields: 'name,parents,mimeType,modifiedTime',
        })
        .reply(200, {
          id: '1BHM3lyqi0bEeaBZho8UD328oFsmsisyJ',
          name: 'subfolder',
          modifiedTime: 'Mon, 14 Jun 2021 03:37:28 GMT',
          parents: [
            '1vjng4ahZWph-9oeaMae16P9Kbb3xg4Cg',
          ],
        })
        .get('/drive/v3/files/1vjng4ahZWph-9oeaMae16P9Kbb3xg4Cg')
        .query({
          fields: 'name,parents,mimeType,modifiedTime',
        })
        .reply(200, {
          id: '1vjng4ahZWph-9oeaMae16P9Kbb3xg4Cg',
          name: 'gdocs',
          parents: [],
        });

      const client = await new GoogleClient({
        log: console,
        clientId: 'fake',
        clientSecret: 'fake',
        cachePlugin,
      }).init();

      const result = await client.getItemsFromId('1ZJWJwL9szyTq6B-W0_Y7bFL1Tk1vyym4RyQ7AKXS7Ys', {
        '1vjng4ahZWph-9oeaMae16P9Kbb3xg4Cg': '/root',
      });

      assert.deepStrictEqual(result, [{
        id: '1ZJWJwL9szyTq6B-W0_Y7bFL1Tk1vyym4RyQ7AKXS7Ys',
        lastModified: 1623641848000,
        name: 'helix-hackathon-part-v',
        path: '/root/subfolder/helix-hackathon-part-v',
      },
      {
        id: '1BHM3lyqi0bEeaBZho8UD328oFsmsisyJ',
        lastModified: 1623641848000,
        name: 'subfolder',
        path: '/root/subfolder',
      },
      {
        id: '1vjng4ahZWph-9oeaMae16P9Kbb3xg4Cg',
        name: '',
        path: '/root',
      },
      ]);
    });

    it('getItemsFromId returns hierarchy with no matching root', async () => {
      nock.loginGoogle(3);
      nock('https://www.googleapis.com')
        .get('/drive/v3/files/1ZJWJwL9szyTq6B-W0_Y7bFL1Tk1vyym4RyQ7AKXS7Ys')
        .query({
          fields: 'name,parents,mimeType,modifiedTime',
        })
        .reply(200, {
          id: '1ZJWJwL9szyTq6B-W0_Y7bFL1Tk1vyym4RyQ7AKXS7Ys',
          name: 'helix-hackathon-part-v',
          modifiedTime: 'Mon, 14 Jun 2021 03:37:28 GMT',
          parents: [
            '1BHM3lyqi0bEeaBZho8UD328oFsmsisyJ',
          ],
        })
        .get('/drive/v3/files/1BHM3lyqi0bEeaBZho8UD328oFsmsisyJ')
        .query({
          fields: 'name,parents,mimeType,modifiedTime',
        })
        .reply(200, {
          id: '1BHM3lyqi0bEeaBZho8UD328oFsmsisyJ',
          name: 'subfolder',
          modifiedTime: 'Mon, 14 Jun 2021 03:37:28 GMT',
          parents: [
            '1vjng4ahZWph-9oeaMae16P9Kbb3xg4Cg',
          ],
        })
        .get('/drive/v3/files/1vjng4ahZWph-9oeaMae16P9Kbb3xg4Cg')
        .query({
          fields: 'name,parents,mimeType,modifiedTime',
        })
        .reply(200, {
          id: '1vjng4ahZWph-9oeaMae16P9Kbb3xg4Cg',
          name: 'gdocs',
        });

      const client = await new GoogleClient({
        log: console,
        clientId: 'fake',
        clientSecret: 'fake',
        cachePlugin,
      }).init();

      const result = await client.getItemsFromId('1ZJWJwL9szyTq6B-W0_Y7bFL1Tk1vyym4RyQ7AKXS7Ys', {});

      assert.deepStrictEqual(result, [
        {
          id: '1ZJWJwL9szyTq6B-W0_Y7bFL1Tk1vyym4RyQ7AKXS7Ys',
          lastModified: 1623641848000,
          name: 'helix-hackathon-part-v',
          path: '/root:/gdocs/subfolder/helix-hackathon-part-v',
        },
        {
          id: '1BHM3lyqi0bEeaBZho8UD328oFsmsisyJ',
          lastModified: 1623641848000,
          name: 'subfolder',
          path: '/root:/gdocs/subfolder',
        },
        {
          id: '1vjng4ahZWph-9oeaMae16P9Kbb3xg4Cg',
          name: 'gdocs',
          path: '/root:/gdocs',
        },
      ]);
    });

    it('getItemsFromId handles 404', async () => {
      nock.loginGoogle(1);
      nock('https://www.googleapis.com')
        .get('/drive/v3/files/1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP')
        .query({
          fields: 'name,parents,mimeType,modifiedTime',
        })
        .reply(404);

      const client = await new GoogleClient({
        log: console,
        clientId: 'fake',
        clientSecret: 'fake',
        cachePlugin,
      }).init();

      assert.deepStrictEqual(await client.getItemsFromId('1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP', {}), []);
    });

    it('getItemsFromId handles google api error', async () => {
      nock('https://oauth2.googleapis.com')
        .post('/token')
        .reply(403, 'rate limit exceeded.');

      const client = await new GoogleClient({
        log: console,
        clientId: 'fake',
        clientSecret: 'fake',
        cachePlugin,
      }).init();

      await assert.rejects(client.getItemsFromId('1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP', {}), new Error('Could not refresh access token: rate limit exceeded.'));
    });
  });

  describe('getFile tests', () => {
    it('getFile returns file', async () => {
      nock.loginGoogle(1);
      nock('https://www.googleapis.com')
        .get('/drive/v3/files/1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP?alt=media')
        .reply(200, 'hello');

      const client = await new GoogleClient({
        log: console,
        clientId: 'fake',
        clientSecret: 'fake',
        cachePlugin,
      }).init();

      const actual = await client.getFile('1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP');
      assert.strictEqual(actual.toString('utf-8'), 'hello');
    });

    it('getFile handles 404', async () => {
      nock.loginGoogle(1);
      nock('https://www.googleapis.com')
        .get('/drive/v3/files/1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP?alt=media')
        .reply(404);

      const client = await new GoogleClient({
        log: console,
        clientId: 'fake',
        clientSecret: 'fake',
        cachePlugin,
      }).init();

      await assert.rejects(client.getFile('1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP'), new Error('Not Found: 1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP'));
    });

    it('getFile handles api error', async () => {
      nock('https://oauth2.googleapis.com')
        .post('/token')
        .reply(403, 'rate limit exceeded.');

      const client = await new GoogleClient({
        log: console,
        clientId: 'fake',
        clientSecret: 'fake',
        cachePlugin,
      }).init();

      await assert.rejects(client.getFile('1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP'), new Error('Could not refresh access token: rate limit exceeded.'));
    });
  });

  describe('getFileFromPath tests', () => {
    it('getFileFromPath returns file', async () => {
      nock.loginGoogle(2);
      nock('https://www.googleapis.com')
        .get('/drive/v3/files')
        .query({
          q: '\'1\' in parents and trashed=false and mimeType != \'application/vnd.google-apps.folder\'',
          ...DEFAULT_LIST_OPTS,
        })
        .reply(200, {
          files: [{
            mimeType: 'application/vnd.google-apps.document',
            name: 'document1',
            id: '1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP',
          }],
        });

      nock('https://www.googleapis.com')
        .get('/drive/v3/files/1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP?alt=media')
        .reply(200, 'hello');

      const client = await new GoogleClient({
        log: console,
        clientId: 'fake',
        clientSecret: 'fake',
        cachePlugin,
      }).init();

      const actual = await client.getFileFromPath('1', '/document1');
      assert.strictEqual(actual.toString('utf-8'), 'hello');
    });

    it('getFileFromPath returns null if not found', async () => {
      nock.loginGoogle(1);
      nock('https://www.googleapis.com')
        .get('/drive/v3/files')
        .query({
          q: '\'1\' in parents and trashed=false and mimeType != \'application/vnd.google-apps.folder\'',
          ...DEFAULT_LIST_OPTS,
        })
        .reply(200, {
          files: [],
        });

      const client = await new GoogleClient({
        log: console,
        clientId: 'fake',
        clientSecret: 'fake',
        cachePlugin,
      }).init();

      assert.strictEqual(await client.getFileFromPath('1', '/document1'), null);
    });

    it('getFileFromPath re-fetches the file if not found', async () => {
      nock.loginGoogle(4);
      nock('https://www.googleapis.com')
        // first time for the cache
        .get('/drive/v3/files')
        .query({
          q: '\'1\' in parents and trashed=false and mimeType != \'application/vnd.google-apps.folder\'',
          ...DEFAULT_LIST_OPTS,
        })
        .reply(200, {
          files: [{
            mimeType: 'application/vnd.google-apps.document',
            name: 'document1',
            id: 'oldid',
          }],
        })
        // 2nd time with correct ID
        .get('/drive/v3/files')
        .query({
          q: '\'1\' in parents and trashed=false and mimeType != \'application/vnd.google-apps.folder\'',
          ...DEFAULT_LIST_OPTS,
        })
        .reply(200, {
          files: [{
            mimeType: 'application/vnd.google-apps.document',
            name: 'document1',
            id: 'newid',
          }],
        });

      nock('https://www.googleapis.com')
        .get('/drive/v3/files/oldid?alt=media')
        .reply(404)
        .get('/drive/v3/files/newid?alt=media')
        .reply(200, 'hello');

      const client = await new GoogleClient({
        log: console,
        clientId: 'fake',
        clientSecret: 'fake',
        cachePlugin,
      }).init();

      await client.getItemsFromPath('1', '/document1'); // fill the cache
      const actual = await client.getFileFromPath('1', '/document1');
      assert.strictEqual(actual.toString('utf-8'), 'hello');
    });

    it('getFileFromPath guards against endless recursion', async () => {
      nock.loginGoogle(4);
      nock('https://www.googleapis.com')
        .get('/drive/v3/files')
        .twice()
        .query({
          q: '\'1\' in parents and trashed=false and mimeType != \'application/vnd.google-apps.folder\'',
          ...DEFAULT_LIST_OPTS,
        })
        .reply(200, {
          files: [{
            mimeType: 'application/vnd.google-apps.document',
            name: 'document1',
            id: 'oldid',
          }],
        });

      nock('https://www.googleapis.com')
        .get('/drive/v3/files/oldid?alt=media')
        .twice()
        .reply(404);

      const client = await new GoogleClient({
        log: console,
        clientId: 'fake',
        clientSecret: 'fake',
        cachePlugin,
      }).init();

      assert.strictEqual(await client.getFileFromPath('1', '/document1'), null);
    });

    it('getFileFromPath handles errors', async () => {
      nock.loginGoogle(2);
      nock('https://www.googleapis.com')
        .get('/drive/v3/files')
        .query({
          q: '\'1\' in parents and trashed=false and mimeType != \'application/vnd.google-apps.folder\'',
          ...DEFAULT_LIST_OPTS,
        })
        .reply(200, {
          files: [{
            mimeType: 'application/vnd.google-apps.document',
            name: 'document1',
            id: 'oldid',
          }],
        });

      nock('https://www.googleapis.com')
        .get('/drive/v3/files/oldid?alt=media')
        .reply(401);

      const client = await new GoogleClient({
        log: console,
        clientId: 'fake',
        clientSecret: 'fake',
        cachePlugin,
      }).init();

      await assert.rejects(client.getFileFromPath('1', '/document1'), new Error(''));
    });
  });

  describe('getDocumentFromPath tests', () => {
    it('getDocumentFromPath returns document', async () => {
      nock.loginGoogle(2);
      nock('https://www.googleapis.com')
        .get('/drive/v3/files')
        .query({
          q: '\'1\' in parents and trashed=false and mimeType = \'application/vnd.google-apps.document\'',
          ...DEFAULT_LIST_OPTS,
        })
        .reply(200, {
          files: [{
            mimeType: 'application/vnd.google-apps.document',
            name: 'document1',
            id: '1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP',
          }],
        });

      nock('https://docs.googleapis.com')
        .get('/v1/documents/1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP')
        .reply(200, 'hello');

      const client = await new GoogleClient({
        log: console,
        clientId: 'fake',
        clientSecret: 'fake',
        cachePlugin,
      }).init();

      assert.strictEqual(await client.getDocumentFromPath('1', '/document1'), 'hello');
    });

    it('getDocumentFromPath returns null if not found', async () => {
      nock.loginGoogle(1);
      nock('https://www.googleapis.com')
        .get('/drive/v3/files')
        .query({
          q: '\'1\' in parents and trashed=false and mimeType = \'application/vnd.google-apps.document\'',
          ...DEFAULT_LIST_OPTS,
        })
        .reply(200, {
          files: [],
        });

      const client = await new GoogleClient({
        log: console,
        clientId: 'fake',
        clientSecret: 'fake',
        cachePlugin,
      }).init();

      assert.strictEqual(await client.getDocumentFromPath('1', '/document1'), null);
    });

    it('getDocumentFromPath re-fetches the file if not found', async () => {
      nock.loginGoogle(4);
      nock('https://www.googleapis.com')
        // first time for the cache
        .get('/drive/v3/files')
        .query({
          q: '\'1\' in parents and trashed=false and mimeType = \'application/vnd.google-apps.document\'',
          ...DEFAULT_LIST_OPTS,
        })
        .reply(200, {
          files: [{
            mimeType: 'application/vnd.google-apps.document',
            name: 'document1',
            id: 'oldid',
          }],
        })
        // 2nd time with correct ID
        .get('/drive/v3/files')
        .query({
          q: '\'1\' in parents and trashed=false and mimeType = \'application/vnd.google-apps.document\'',
          ...DEFAULT_LIST_OPTS,
        })
        .reply(200, {
          files: [{
            mimeType: 'application/vnd.google-apps.document',
            name: 'document1',
            id: 'newid',
          }],
        });

      nock('https://docs.googleapis.com')
        .get('/v1/documents/oldid')
        .reply(404)
        .get('/v1/documents/newid')
        .reply(200, 'hello');

      const client = await new GoogleClient({
        log: console,
        clientId: 'fake',
        clientSecret: 'fake',
        cachePlugin,
      }).init();

      await client.getItemsFromPath('1', '/document1', GoogleClient.TYPE_DOCUMENT); // fill the cache
      assert.strictEqual(await client.getDocumentFromPath('1', '/document1'), 'hello');
    });

    it('getDocumentFromPath guards against endless recursion', async () => {
      nock.loginGoogle(4);
      nock('https://www.googleapis.com')
        .get('/drive/v3/files')
        .twice()
        .query({
          q: '\'1\' in parents and trashed=false and mimeType = \'application/vnd.google-apps.document\'',
          ...DEFAULT_LIST_OPTS,
        })
        .reply(200, {
          files: [{
            mimeType: 'application/vnd.google-apps.document',
            name: 'document1',
            id: 'oldid',
          }],
        });

      nock('https://docs.googleapis.com')
        .get('/v1/documents/oldid')
        .twice()
        .reply(404);

      const client = await new GoogleClient({
        log: console,
        clientId: 'fake',
        clientSecret: 'fake',
        cachePlugin,
      }).init();

      assert.strictEqual(await client.getDocumentFromPath('1', '/document1'), null);
    });

    it('getDocumentFromPath handles errors', async () => {
      nock.loginGoogle(2);
      nock('https://www.googleapis.com')
        .get('/drive/v3/files')
        .query({
          q: '\'1\' in parents and trashed=false and mimeType = \'application/vnd.google-apps.document\'',
          ...DEFAULT_LIST_OPTS,
        })
        .reply(200, {
          files: [{
            mimeType: 'application/vnd.google-apps.document',
            name: 'document1',
            id: 'oldid',
          }],
        });

      nock('https://docs.googleapis.com')
        .get('/v1/documents/oldid')
        .reply(401);

      const client = await new GoogleClient({
        log: console,
        clientId: 'fake',
        clientSecret: 'fake',
        cachePlugin,
      }).init();

      await assert.rejects(client.getDocumentFromPath('1', '/document1'), new Error(''));
    });
  });

  describe('getDocument tests', () => {
    it('getDocument returns document', async () => {
      nock.loginGoogle(1);
      nock('https://docs.googleapis.com')
        .get('/v1/documents/1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP')
        .reply(200, 'hello');

      const client = await new GoogleClient({
        log: console,
        clientId: 'fake',
        clientSecret: 'fake',
        cachePlugin,
      }).init();

      assert.strictEqual(await client.getDocument('1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP'), 'hello');
    });

    it('getDocument handles 404', async () => {
      nock.loginGoogle(1);
      nock('https://docs.googleapis.com')
        .get('/v1/documents/1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP')
        .reply(404);

      const client = await new GoogleClient({
        log: console,
        clientId: 'fake',
        clientSecret: 'fake',
        cachePlugin,
      }).init();

      await assert.rejects(client.getDocument('1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP'), new Error('Not Found: 1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP'));
    });

    it('getDocument handles api error', async () => {
      nock('https://oauth2.googleapis.com')
        .post('/token')
        .reply(403, 'rate limit exceeded.');

      const client = await new GoogleClient({
        log: console,
        clientId: 'fake',
        clientSecret: 'fake',
        cachePlugin,
      }).init();

      await assert.rejects(client.getDocument('1bH7_28a1-Q3QEEvFhT9eTmR-D7_9F4xP'), new Error('Could not refresh access token: rate limit exceeded.'));
    });
  });
});
