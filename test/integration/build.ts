import * as path from 'path';
import * as fs from 'fs';
import * as browserstack from 'browserstack-local';
import * as webdriver from 'selenium-webdriver';
import { checkImage } from '../lib/utils/checkImage';
import { prepareScriptBundle, startServer } from '../lib/script/server';

const DEFAULT_CAPABILITIES = {
  'build': process.env.BROWSERSTACK_BUILD_NAME,
  'project': process.env.BROWSERSTACK_PROJECT_NAME,
  'browserstack.local': true,
  os: 'windows',
  os_version: '11',
  browserName: 'chrome',
  browser_version: 'latest'
}

const username = process.env.BROWSERSTACK_USERNAME;
const accessKey = process.env.BROWSERSTACK_ACCESS_KEY;
const serverURL = `http://${username}:${accessKey}@hub-cloud.browserstack.com/wd/hub`;

const JEST_TIMEOUT = 60 * 1000;
jest.setTimeout(JEST_TIMEOUT); // 60 seconds timeout

const startBsLocal = (bsLocal) => new Promise(resolve => {
  bsLocal.start({
    'key': process.env.BROWSERSTACK_ACCESS_KEY,
    'force': true,
    'onlyAutomate': 'true',
    'forceLocal': 'true',
  }, resolve);
});

describe('Builds', () => {
  let server;
  let bsLocal;
  let driver;

  const PORT = 8099;

  const before = async (port: number) => {
    const start = new Date().getTime();
    const startBrowserStack = async () => {
      bsLocal = new browserstack.Local();
      await startBsLocal(bsLocal);
    };

    const startServerWrapper = async () => {
      await prepareScriptBundle();
      server = await startServer(port);
    };

    await Promise.all([
      startBrowserStack(),
      startServerWrapper(),
    ]);

      driver = new webdriver.Builder()
        .usingServer(serverURL)
        .withCapabilities(DEFAULT_CAPABILITIES)
        .build();

    const end = new Date().getTime();
    console.log(`Completed pre-test scaffolding in ${Math.round((end - start) / 1000)} seconds`);
  }

  afterEach(async function afterEach(done) {
    const start = new Date().getTime();
    const stopBrowserstack = () => new Promise(resolve => {
      if (bsLocal && bsLocal.isRunning()) {
        bsLocal.stop(resolve);
      }
    });

    const stopServer = () => new Promise((resolve) => {
      if (server) {
        server.close(resolve);
      } else {
        console.warn('No server found')
        resolve();
      }
    });
    await Promise.all([
      stopBrowserstack(),
      stopServer(),
      driver.quit(),
    ]);
    const end = new Date().getTime();
    console.log(`Completed post-test clean up in ${Math.round((end - start) / 1000)} seconds`);
    done();
  });

  it("upscales using a UMD build via a script tag", async () => {
    await before(PORT);
    await driver.get(`http://localhost:${PORT}`);
    const result = await driver.executeScript(() => {
      console.log(window['foo']);
      const Upscaler = window['Upscaler'];
      console.log(Upscaler);
      const upscaler = new Upscaler();
      return upscaler.upscale(document.getElementById('flower'));
    });
    checkImage(result, "upscaled-4x.png", 'diff.png');
  });

});