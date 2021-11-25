'use strict';

/**
 * ButtressJS - Realtime datastore for software
 *
 * @file app.js
 * @description
 * @module System
 * @author Chris Bates-Keegan
 *
 */

const Config = require('node-env-obj')({
	envPath: '../',
	configPath: '../src',
});

const Bootstrap = require('../src/bootstrap');
const Logging = require('../src/logging');

console.log(Config);
process.exit(1);

/**
 *
 */
Logging.init('REST');

Bootstrap.rest()
	.then((isMaster) => {
		if (isMaster) {
			Logging.log(`${Config.app.title}:${Config.app.code} REST Server Master v${Config.app.version} listening on port ` +
				`${Config.listenPorts.rest} in ${Config.env} mode.`);
			Logging.log(`Configured Main Endpoint: ${Config.app.protocol}://${Config.app.host}`);
		} else {
			Logging.log(`${Config.app.title}:${Config.app.code} REST Server Worker v${Config.app.version} ` +
				`in ${Config.env} mode.`);
		}
	})
	.catch(Logging.Promise.logError());
