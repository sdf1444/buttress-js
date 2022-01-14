'use strict';

/**
 * ButtressJS - Realtime datastore for software
 *
 * @file index.js
 * @description Model management
 * @module Model
 * @author Chris Bates-Keegan
 *
 */

const path = require('path');
const fs = require('fs');
const Logging = require('../logging');
const Sugar = require('sugar');
const Schema = require('../schema');
const shortId = require('../helpers').shortId;

const SchemaModelButtress = require('./type/buttress');
const SchemaModelMongoDB = require('./type/mongoDB');

/**
 * @param {string} model - name of the model to load
 * @private
 */

/**
 * @class Model
 */
class Model {
	constructor() {
		this.models = {};
		this.Schema = {};
		this.Constants = {};
		this.mongoDb = null;
		this.app = false;
		this.appMetadataChanged = false;
	}

	init(db) {
		this.mongoDb = db;

		// Core Models
		return this.initCoreModels()
			.then(() => this.initSchema());
	}

	initCoreModels(db) {
		return new Promise((resolve) => {
			if (db) this.mongoDb = db;
			// Core Models
			const models = _getModels();
			Logging.log(models, Logging.Constants.LogLevel.SILLY);
			for (let x = 0; x < models.length; x++) {
				this._initCoreModel(models[x]);
			}
			resolve();
		});
	}

	initSchema(db) {
		if (db) this.mongoDb = db;

		return this.models.App.findAll().toArray()
			.then((apps) => {
				apps.forEach((app) => {
					if (app.__schema) {
						Schema.buildCollections(Schema.decode(app.__schema)).forEach((schemaData) => {
							this._initSchemaModel(app, schemaData);
						});
					}
				});
			});
	}

	initModel(modelName) {
		return this[modelName];
	}

	/**
	 * @param {string} model - demand loads the schema
	 * @return {object} SchemaModel - initiated schema model built from passed schema object
	 * @private
	 */
	_initCoreModel(model) {
		const name = Sugar.String.camelize(model);
		const CoreSchemaModel = require(`./schema/${model.toLowerCase()}`);

		if (!this.models[name]) {
			this.models[name] = new CoreSchemaModel(this.mongoDb);
		}

		this.__defineGetter__(name, () => this.models[name]);
		return this.models[name];
	}

	/**
	 * @param {object} app - application container
	 * @param {object} schemaData - schema data object
	 * @return {object} SchemaModel - initiated schema model built from passed schema object
	 * @private
	 */
	_initSchemaModel(app, schemaData) {
		let name = `${schemaData.collection}`;
		const appShortId = (app) ? shortId(app._id) : null;

		name = (appShortId) ? `${appShortId}-${schemaData.collection}` : name;

		// Is relationship
		if (!this.models[name]) {
			if (schemaData.$relationship) {
				const [relationship, collection] = schemaData.$relationship.split('.');

				if (!relationship || !collection) {
					Logging.logWarn(`Invalid Schema relationship descriptor (${relationship}.${collection})`);
					return;
				}

				return this.AppRelationship.findOne({
					'type': 'destination',
					'name': relationship,
					'destination.appId': app._id,
				})
					.then((relationship) => {
						this.models[name] = new SchemaModelButtress(schemaData, app, relationship);

						this.__defineGetter__(name, () => this.models[name]);
						return this.models[name];
					});
			} else {
				this.models[name] = new SchemaModelMongoDB(this.mongoDb, schemaData, app);
			}
		}

		this.__defineGetter__(name, () => this.models[name]);
		return this.models[name];
	}
}

/**
 * @private
 * @return {array} - list of files containing schemas
 */
function _getModels() {
	const filenames = fs.readdirSync(`${__dirname}/schema`);

	const files = [];
	for (let x = 0; x < filenames.length; x++) {
		const file = filenames[x];
		if (path.extname(file) === '.js') {
			files.push(path.basename(file, '.js'));
		}
	}
	return files;
}

module.exports = new Model();
