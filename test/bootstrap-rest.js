const assert = require('assert');
const BootstrapRest = require('../src/bootstrap-rest');

describe('class:BootstrapRest', () => {
	context('constructor', () => {
		it('should be able to create an instance', async () => {
			const instance = await new BootstrapRest();

			assert.equal(instance, true);
		});
	});
});
