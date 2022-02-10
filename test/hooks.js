require('node-env-obj')({
	envFile: `.test.env`,
	envPath: '../',
	configPath: '../src',
});

const Logging = require('../src/logging');

exports.mochaHooks = {
	beforeAll() {
		Logging.init('TEST');
		Logging.captureOutput(true);
	},
	afterAll() {
		// Logging.captureOutput(false);
	},
	beforeEach() {
		Logging.clean();
	},
	afterEach() {
		if (this.currentTest.state !== 'passed') Logging.flush();
	},
};
