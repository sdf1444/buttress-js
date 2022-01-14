'use strict';

/**
 * ButtressJS - Realtime datastore for software
 *
 * @file buttress.js
 * @description A default model for schemas
 * @module Model
 * @exports model, schema, constants
 * @author Lighten
 *
 */

const Buttress = require('buttress-js-api');

const SchemaModel = require('../schemaModel');

/* ********************************************************************************
 *
 * LOCALS
 *
 **********************************************************************************/

class SchemaModelButtress extends SchemaModel {
	constructor(schemaData, app, relationship) {
		super(schemaData, app);

		const [_, collection] = schemaData.$relationship.split('.');

		this.endpoint = relationship.source.endpoint;

		this.token = relationship.destination.sourceToken;

		this.buttress = Buttress.new();

		this.buttress.init({
			buttressUrl: this.endpoint,
			appToken: this.token,
			apiPath: relationship.source.apiPath,
			allowUnauthorized: true, // WUT!?
		})
			.then(() => {
				this.collection = this.buttress.getCollection(collection);
			});
	}

	/**
	 * @param {object} body
	 * @return {Promise}
	 */
	add(body) {
		return this.collection.save(body);
	}

	/**
	 * @param {object} details
	 * @param {string} id
	 * @return {Promise}
	 */
	update(details, id) {
		return this.collection.update(id, details);
	}

	/**
	 * @param {string} id
	 * @return {Boolean}
	 */
	exists(id) {
		return this.collection.get(id)
			.then((res) => (res) ? true : false);
	}

	/**
	 * @param {object} details
	 * @throws Error
	 */
	isDuplicate(details) {
		throw new Error('not yet implemented');
	}

	/**
	 * @param {object} entity
	 * @return {Promise}
	 */
	rm(entity) {
		return this.collection.remove(entity._id);
	}

	/**
	 * @param {array} ids
	 * @return {Promise}
	 */
	rmBulk(ids) {
		return this.collection.bulkRemove(ids);
	}

	/**
	 * @param {object} query
	 * @return {Promise}
	 */
	rmAll(query) {
		return this.collection.removeAll(query);
	}

	/**
	 * @param {string} id
	 * @return {Promise}
	 */
	findById(id) {
		return this.collection.get(id);
	}

	/**
	 * @param {Object} query - mongoDB query
	 * @param {Object} excludes - mongoDB query excludes
	 * @param {Boolean} stream - should return a stream
	 * @param {Int} limit - should return a stream
	 * @param {Int} skip - should return a stream
	 * @param {Object} sort - mongoDB sort object
	 * @param {Boolean} project - mongoDB project ids
	 * @return {Promise} - resolves to an array of docs
	 */
	find(query, excludes = {}, stream = false, limit = 0, skip = 0, sort, project = null) {
		// Logging.logSilly(`find: ${this.collectionName} ${query}`);

		// Stream this?
		return this.collection.search(query, limit, skip, sort, {project});
	}

	/**
	 * @return {Promise}
	 */
	findAll() {
		return this.collection.getAll();
	}

	/**
	 * @param {Array} ids - mongoDB query
	 * @return {Promise}
	 */
	findAllById(ids) {
		return this.collection.bulkGet(ids);
	}

	/**
	 * @param {Object} query - mongoDB query
	 * @return {Promise}
	 */
	count(query) {
		return this.collection.count(query);
	}
}

module.exports = SchemaModelButtress;
