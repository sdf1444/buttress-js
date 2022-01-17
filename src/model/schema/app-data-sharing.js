'use strict';

/**
 * ButtressJS - Realtime datastore for software
 *
 * @file app-data-sharing.js
 * @description App Data Sharing model definition.
 * @module Model
 * @exports AppDataSharingSchemaModel
 * @author Tom Cahill
 */

const ObjectId = require('mongodb').ObjectId;

const SchemaModelMongoDB = require('../type/mongoDB');
const Schema = require('../../schema');
const Model = require('..');

/**
 * @class AppDataSharingSchemaModel
 */
class AppDataSharingSchemaModel extends SchemaModelMongoDB {
	constructor(MongoDb) {
		const schema = AppDataSharingSchemaModel.Schema;
		super(MongoDb, schema);

		this._localSchema = null;
	}

	static get Constants() {
		return {};
	}
	get Constants() {
		return AppDataSharingSchemaModel.Constants;
	}

	static get Schema() {
		return {
			name: 'appDataSharing',
			type: 'collection',
			collection: 'appDataSharing',
			extends: [],
			properties: {
				name: {
					__type: 'string',
					__required: true,
					__allowUpdate: false,
				},
				remoteApp: {
					endpoint: {
						__type: 'string',
						__default: null,
						__required: true,
						__allowUpdate: true,
					},
					apiPath: {
						__type: 'string',
						__default: null,
						__required: true,
						__allowUpdate: true,
					},
					token: {
						__type: 'string',
						__default: null,
						__required: true,
						__allowUpdate: true,
					},
				},
				dataSharing: {
					localApp: {
						__type: 'string',
						__default: null,
						__required: true,
						__allowUpdate: true,
					},
					remoteApp: {
						__type: 'string',
						__default: null,
						__required: true,
						__allowUpdate: true,
					},
				},
				_appId: {
					__type: 'id',
					__required: false,
					__allowUpdate: false,
				},
				_tokenId: {
					__type: 'id',
					__required: false,
					__allowUpdate: false,
				},
			},
		};
	}

	/**
	 * @param {Object} body - body passed through from a POST request
	 * @return {Promise} - fulfilled with App Object when the database request is completed
	 */
	add(body) {
		const appDataSharing = {
			id: new ObjectId(),
			name: body.name,

			remoteApp: {
				endpoint: body.remoteApp.endpoint,
				apiPath: body.remoteApp.apiPath,
				token: body.remoteApp.token,
			},

			dataSharing: {
				localApp: null,
				remoteApp: null,
			},

			_appId: null,
			_tokenId: null,
		};

		let _token = null;

		return Model.Token.add({
			type: Model.Token.Constants.Type.DATA_SHARING,
			authLevel: Model.Token.Constants.AuthLevel.USER,
			permissions: [{route: '*', permission: '*'}],
		}, {
			_app: new ObjectId(body.source.appId),
			_appDataSharingId: new ObjectId(appDataSharing.id),
		})
			.then((tokenCursor) => tokenCursor.next())
			.then((token) => {
				_token = token;

				return super.add(appDataSharing, {_tokenId: token._id});
			})
			.then((cursor) => cursor.next())
			.then((dataSharing) => {
				return Promise.resolve({dataSharing: dataSharing, token: _token});
			});
	}

	/**
	 * @param {ObjectId} appId - app id which needs to be updated
	 * @param {ObjectId} appDataSharingId - Data Sharing Id id which needs to be updated
	 * @param {String} type - data sharing type
	 * @param {Object} policy - policy object for the app
	 * @return {Promise} - resolves when save operation is completed
	 */
	updatePolicy(appId, appDataSharingId, type, policy) {
		policy = Schema.encode(policy);

		const update = {$set: {}};

		if (type === 'remote') {
			update.$set['remoteApp'] = policy;
		} else {
			update.$set['localApp'] = policy;
		}

		return new Promise((resolve) => {
			this.collection.updateOne({
				'_id': new ObjectId(appDataSharingId),
				'_appId': new ObjectId(appId),
			}, update, {}, (err, object) => {
				if (err) throw new Error(err);

				resolve(object);
			});
		});
	}
}

/**
 * Exports
 */
module.exports = AppDataSharingSchemaModel;
