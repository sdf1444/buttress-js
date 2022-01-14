'use strict';

/**
 * ButtressJS - Realtime datastore for software
 *
 * @file app-relationship.js
 * @description App Relationship model definition.
 * @module Model
 * @exports AppRelationshipSchemaModel
 * @author Tom Cahill
 */

const ObjectId = require('mongodb').ObjectId;

const SchemaModelMongoDB = require('../type/mongoDB');
const Schema = require('../../schema');
const Model = require('../');

/**
 * Constants
*/
const type = ['source', 'destination'];
const Type = {
	SOURCE: type[0],
	DESTINATION: type[1],
};

class AppRelationshipSchemaModel extends SchemaModelMongoDB {
	constructor(MongoDb) {
		const schema = AppRelationshipSchemaModel.Schema;
		super(MongoDb, schema);

		this._localSchema = null;
	}

	static get Constants() {
		return {
			Type: Type,
		};
	}
	get Constants() {
		return AppRelationshipSchemaModel.Constants;
	}

	static get Schema() {
		return {
			name: 'appRelationship',
			type: 'collection',
			collection: 'appRelationships',
			extends: [],
			properties: {
				type: {
					__type: 'string',
					__enum: type,
					__required: true,
					__allowUpdate: false,
				},
				name: {
					__type: 'string',
					__required: true,
					__allowUpdate: false,
				},
				source: {
					appId: {
						__type: 'id',
						__required: true,
						__allowUpdate: false,
					},
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
					policy: {
						__type: 'string',
						__default: null,
						__required: true,
						__allowUpdate: true,
					},
				},
				destination: {
					appId: {
						__type: 'id',
						__required: true,
						__allowUpdate: false,
					},
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
					sourceToken: {
						__type: 'string',
						__default: null,
						__required: true,
						__allowUpdate: true,
					},
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
		const relationship = {
			id: new ObjectId(),
			name: body.name,
			type: body.type,
			source: {
				appId: body.source.appId,
				endpoint: body.source.endpoint,
				apiPath: body.source.apiPath,
				policy: body.source.policy,
			},
			destination: {
				appId: body.destination.appId,
				endpoint: body.destination.endpoint,
				apiPath: body.destination.apiPath,
				sourceToken: body.destination.sourceToken,
			},
			_tokenId: null,
		};

		// If we're dealing as the source we need to create a token for the destination
		if (relationship.type === AppRelationshipSchemaModel.Constants.Type.SOURCE) {
			let _token = null;

			return Model.Token.add({
				type: Model.Token.Constants.Type.RELATIONSHIP,
				authLevel: Model.Token.Constants.AuthLevel.USER,
				permissions: [{route: '*', permission: '*'}],
			}, {
				_app: new ObjectId(body.source.appId),
				_relationshipId: new ObjectId(relationship.id),
			})
				.then((tokenCursor) => tokenCursor.next())
				.then((token) => {
					_token = token;

					return super.add(relationship, {_tokenId: token._id});
				})
				.then((appCursor) => appCursor.next())
				.then((relationship) => {
					return Promise.resolve({relationship: relationship, token: _token});
				});
		}

		return super.add(relationship)
			.then((cursor) => cursor.next());
	}

	/**
	 * @param {ObjectId} appId - app id which needs to be updated
	 * @param {ObjectId} relationshipId - relationship id which needs to be updated
	 * @param {object} relationshipPolicy - policy object for the app
	 * @return {Promise} - resolves when save operation is completed
	 */
	updatePolicy(appId, relationshipId, relationshipPolicy) {
		relationshipPolicy = Schema.encode(relationshipPolicy);

		return new Promise((resolve, reject) => {
			this.collection.updateOne({
				'_id': new ObjectId(relationshipId),
				'source.appId': new ObjectId(appId),
			}, {$set: {'source.policy': relationshipPolicy}}, {}, (err, object) => {
				if (err) throw new Error(err);

				resolve(object);
			});
		});
	}
}

/**
 * Exports
 */
module.exports = AppRelationshipSchemaModel;
